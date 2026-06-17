// ============================================================================
// SK8 ↔ Base44 connector — backend MCP proxy (Deno)
// Base44 function path: base44/functions/sk8Query/entry.ts
// ----------------------------------------------------------------------------
// FROZEN logic. This function is a thin, DEPENDENCY-FREE proxy: the frontend
// (sk8Client.js) resolves the MCP URL via getSk8Config() — from the
// sk8-connector-config integration's configPublic, or static consts — and passes
// it as `mcpUrl` on each request. So this file has NO imports and makes NO
// integration call; it never needs @base44/sdk, which is why it deploys reliably.
// (A top-level `npm:` import or TypeScript syntax makes the function fail to
// deploy — "Backend function 'sk8Query' not found or not deployed".)
//
// PLAIN JAVASCRIPT only — no TypeScript type annotations.
// ============================================================================

const PROTOCOL_VERSION = "2024-11-05";

function parseSse(text) {
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const json = line.slice(5).trim(); if (!json) continue;
    let p; try { p = JSON.parse(json); } catch { continue; }
    if (p.error) throw new Error(`MCP error: ${p.error.message || JSON.stringify(p.error)}`);
    if (p.result !== undefined) return p.result;
  }
  throw new Error(`No result in SSE: ${text.slice(0, 200)}`);
}

function makeRpc(mcpUrl) {
  return (token, sessionId, msg) =>
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

async function mcpInit(rpc, token) {
  const res = await rpc(token, null, {
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "sk8-base44", version: "3.0" } },
  });
  if (res.status === 401) { const e = new Error("SK8 rejected the access token"); e.sk8Unauthorized = true; throw e; }
  if (!res.ok) throw new Error(`MCP init failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const sessionId = res.headers.get("mcp-session-id");
  await rpc(token, sessionId, { jsonrpc: "2.0", method: "notifications/initialized", params: {} })
    .catch((e) => console.error("initialized notification failed (continuing)", e.message));
  return sessionId;
}

async function mcpCall(rpc, token, sessionId, method, params) {
  const res = await rpc(token, sessionId, { jsonrpc: "2.0", id: 2, method, params });
  const text = await res.text();
  if (res.status === 401) { const e = new Error("SK8 rejected the access token"); e.sk8Unauthorized = true; throw e; }
  if (res.status === 404) { const e = new Error("MCP session not found"); e.sessionStale = true; throw e; }
  if (!res.ok) throw new Error(`MCP ${method} failed: ${res.status} ${text.slice(0, 200)}`);
  if ((res.headers.get("content-type") || "").includes("text/event-stream")) return parseSse(text);
  const data = JSON.parse(text);
  if (data.error) throw new Error(`MCP error: ${data.error.message || JSON.stringify(data.error)}`);
  return data.result;
}

Deno.serve(async (req) => {
  try {
    const body = await req.json();
    const { tool, toolArguments, action, sk8Token, mcpUrl } = body;
    let { sessionId } = body;

    if (!sk8Token) return Response.json({ error: "sk8Token is required" }, { status: 400 });
    if (!mcpUrl)   return Response.json({ error: "mcpUrl is required (sent by the frontend)" }, { status: 400 });

    const rpc = makeRpc(mcpUrl);

    let fresh = false;
    if (!sessionId) { sessionId = await mcpInit(rpc, sk8Token); fresh = true; }

    const method = action === "list_tools" ? "tools/list" : "tools/call";
    const params = action === "list_tools" ? {} : { name: tool, arguments: toolArguments || {} };

    let result;
    try {
      result = await mcpCall(rpc, sk8Token, sessionId, method, params);
    } catch (e) {
      if (e.sessionStale && !fresh) {
        sessionId = await mcpInit(rpc, sk8Token);
        result = await mcpCall(rpc, sk8Token, sessionId, method, params);
      } else {
        throw e;
      }
    }

    return Response.json({ result, sessionId }); // echo sessionId so the client can reuse it
  } catch (error) {
    console.error("sk8Query error", error);
    if (error.sk8Unauthorized) return Response.json({ error: error.message, code: "SK8_TOKEN_EXPIRED" }, { status: 401 });
    return Response.json({ error: error.message }, { status: 500 });
  }
});
