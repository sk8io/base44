// ============================================================================
// SK8 ↔ Base44 connector — backend OAuth function (Deno)
// Base44 function path: base44/functions/sk8OAuth/entry.ts
// ----------------------------------------------------------------------------
// FROZEN logic. Per-deployment config comes from loadConfig(); choose its
// source with CONFIG_MODE below (must match src/lib/sk8Config.js).
//   "static"      → uses the STATIC_* consts + SK8_CLIENT_SECRET env var
//   "integration" → fetches issuer/client_id from configPublic and the secret
//                   from configSecret (sk8-connector-config custom integration)
// The client secret never leaves this backend in either mode.
// ============================================================================
import { createClientFromRequest } from "npm:@base44/sdk@0.8.31";

// ▼▼▼ THE ONLY SWITCH ▼▼▼  ("static" | "integration")
const CONFIG_MODE = "integration";
// ▲▲▲

// ---- STATIC mode: fill these (ignored when CONFIG_MODE === "integration") ---
// Must match src/lib/sk8Config.static.js → ISSUER, CLIENT_ID.
const STATIC_ISSUER    = "https://<YOUR-IDP-ISSUER>/";
const STATIC_CLIENT_ID = "<YOUR-CLIENT-ID>";

// The ONLY secret. Set in Dashboard → Settings → Environment Variables.
// Used directly in static mode; used as a fallback in integration mode.
// Omit entirely for public/SPA clients (PKCE-only, no secret issued).
const ENV_CLIENT_SECRET = Deno.env.get("SK8_CLIENT_SECRET");

const INTEGRATION = "sk8-connector-config";

async function loadConfig(req: Request) {
  if (CONFIG_MODE === "static") {
    return { ISSUER: STATIC_ISSUER, CLIENT_ID: STATIC_CLIENT_ID, CLIENT_SECRET: ENV_CLIENT_SECRET };
  }
  const base44 = createClientFromRequest(req);
  const [pub, sec] = await Promise.all([
    base44.asServiceRole.integrations.custom.call(INTEGRATION, "get:/functions/configPublic", {}),
    base44.asServiceRole.integrations.custom.call(INTEGRATION, "get:/functions/configSecret", {}),
  ]);
  if (!pub.success) throw new Error(`public config load failed (${pub.status_code})`);
  if (!sec.success) throw new Error(`secret config load failed (${sec.status_code})`);
  return {
    ISSUER:        pub.data.issuer,
    CLIENT_ID:     pub.data.client_id,
    CLIENT_SECRET: sec.data.client_secret ?? ENV_CLIENT_SECRET,
  };
}

// ---- OIDC discovery (cached, keyed by issuer) -----------------------------
let _meta: any = null, _metaIssuer: string | null = null;
async function oidcMeta(issuer: string) {
  const iss = issuer.replace(/\/$/, "");
  if (_meta && _metaIssuer === iss) return _meta;
  const res = await fetch(`${iss}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
  _meta = await res.json();
  _metaIssuer = iss;
  return _meta;
}

Deno.serve(async (req) => {
  try {
    const cfg = await loadConfig(req);

    async function tokenRequest(extra: Record<string, string>) {
      const { token_endpoint } = await oidcMeta(cfg.ISSUER);
      const payload = {
        client_id: cfg.CLIENT_ID,
        ...(cfg.CLIENT_SECRET ? { client_secret: cfg.CLIENT_SECRET } : {}),
        ...extra,
      };
      const res = await fetch(token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, // required by Okta/Entra/Keycloak
        body: new URLSearchParams(payload),
      });
      return { ok: res.ok, data: await res.json() };
    }

    const { action, code, redirectUri, codeVerifier, refreshToken } = await req.json();

    if (action === "exchange") {
      if (!code || !redirectUri || !codeVerifier)
        return Response.json({ error: "code, redirectUri and codeVerifier are required" }, { status: 400 });
      const { ok, data } = await tokenRequest({
        grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: codeVerifier,
      });
      if (!ok) { console.error("exchange failed", data); return Response.json({ error: data.error_description || "token exchange failed" }, { status: 400 }); }
      return Response.json({ access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in });
    }

    if (action === "refresh") {
      if (!refreshToken) return Response.json({ error: "refreshToken is required" }, { status: 400 });
      const { ok, data } = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
      if (!ok) { console.error("refresh failed", data); return Response.json({ error: data.error_description || "refresh failed" }, { status: 401 }); }
      return Response.json({ access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in });
    }

    return Response.json({ error: "unknown action" }, { status: 400 });
  } catch (error) {
    console.error("sk8OAuth error", error);
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
});
