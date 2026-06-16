// ============================================================================
// SK8 ↔ Base44 connector — backend MCP proxy (Deno)
// Base44 function path: base44/functions/sk8Query/entry.ts
// ----------------------------------------------------------------------------
// FROZEN logic. The MCP URL comes from getMcpUrl(); choose its source with
// CONFIG_MODE below (must match src/lib/sk8Config.js).
//   "static"      → uses STATIC_MCP_URL
//   "integration" → fetches mcp_url from configPublic (sk8-connector-config)
// No secret is needed here in either mode.
// ============================================================================
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

// ▼▼▼ THE ONLY SWITCH ▼▼▼  ("static" | "integration")
const CONFIG_MODE = "integration";
// ▲▲▲

// ---- STATIC mode: fill this (ignored when CONFIG_MODE === "integration") ----
// Must match src/lib/sk8Config.static.js → MCP_URL.
const STATIC_MCP_URL = "https://<YOUR-SK8-URL>/api-gateway/v1/mcp";

const INTEGRATION = "sk8-connector-config";
const PROTOCOL_VERSION = "2024-11-05";

async function getMcpUrl(req: Request): Promise<string> {
  if (CONFIG_MODE === "static") {
    if (!STATIC_MCP_URL || STATIC_MCP_URL.includes("<"))
      throw new Error("STATIC_MCP_URL is not configured");
    return STATIC_MCP_URL;
  }
  const base44 = createClientFromRequest(req);
  const res = await base44.asServiceRole.integrations.custom.call(INTEGRATION, "get:/functions/configPublic", {});
  if (!res.success) throw new Error(`SK8 config load failed (${res.status_code})`);
  const url = res.data.mcp_url;
  if (!url) throw new Error("mcp_url missing from sk8-connector-config");
  return url;
}

function parseSse(text: string) {
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const json = line.slice(5).trim(); if (!json) continue;
    let p; try { p = JSON.parse(json); } catch { continue; }
    if (p.error) throw new Error(`MCP error: ${p.error.message || JSON.stringify(p.error)}`);
    if (p.result !== undefined) return p.result;
  }
  throw new Error(`No result in SSE: ${text.slice(0, 200)}`);
}

function makeRpc(mcpUrl: string) {
  return (token: string, sessionId: string | null, msg: unknown) =>
    fetch(mcpUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
        "Authorization": `Bearer ${token}`,
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
      },
      body: JSON.stringify(msg),
    });
}

async function mcpInit(rpc: ReturnType<typeof makeRpc>, token: string) {
  const res = await rpc(token, null, {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "sk8-base44", version: "3.0" } },
  });
  if (res.status === 401) { const e: any = new Error("SK8 rejected the access token"); e.sk8Unauthorized = true; throw e; }
  if (!res.ok) throw new Error(`MCP init failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const sessionId = res.headers.get("mcp-session-id");
  await rpc(token, sessionId, { jsonrpc: "2.0", method: "notifications/initialized", params: {} })
    .catch((e) => console.error("initialized notification failed (continuing)", e.message));
  return sessionId;
}

async function mcpCall(rpc: ReturnType<typeof makeRpc>, token: string, sessionId: string | null, method: string, params: unknown) {
  const res = await rpc(token, sessionId, { jsonrpc: "2.0", id: 2, method, params });
  const text = await res.text();
  if (res.status === 401) { const e: any = new Error("SK8 rejected the access token"); e.sk8Unauthorized = true; throw e; }
  if (res.status === 404) { const e: any = new Error("MCP session not found"); e.sessionStale = true; throw e; }
  if (!res.ok) throw new Error(`MCP ${method} failed: ${res.status} ${text.slice(0, 200)}`);
  if ((res.headers.get("content-type") || "").includes("text/event-stream")) return parseSse(text);
  const data = JSON.parse(text);
  if (data.error) throw new Error(`MCP error: ${data.error.message || JSON.stringify(data.error)}`);
  return data.result;
}

Deno.serve(async (req) => {
  try {
    const mcpUrl = await getMcpUrl(req);
    const rpc = makeRpc(mcpUrl);

    const body = await req.json();
    const { tool, toolArguments, action, sk8Token } = body;
    let { sessionId } = body;

    if (!sk8Token) return Response.json({ error: "sk8Token is required" }, { status: 400 });

    let fresh = false;
    if (!sessionId) { sessionId = await mcpInit(rpc, sk8Token); fresh = true; }

    const method = action === "list_tools" ? "tools/list" : "tools/call";
    const params = action === "list_tools" ? {} : { name: tool, arguments: toolArguments || {} };

    let result;
    try {
      result = await mcpCall(rpc, sk8Token, sessionId, method, params);
    } catch (e: any) {
      if (e.sessionStale && !fresh) {
        sessionId = await mcpInit(rpc, sk8Token);
        result = await mcpCall(rpc, sk8Token, sessionId, method, params);
      } else {
        throw e;
      }
    }

    return Response.json({ result, sessionId }); // echo sessionId so the client can reuse it
  } catch (error: any) {
    console.error("sk8Query error", error);
    if (error.sk8Unauthorized) return Response.json({ error: error.message, code: "SK8_TOKEN_EXPIRED" }, { status: 401 });
    return Response.json({ error: error.message }, { status: 500 });
  }
});
