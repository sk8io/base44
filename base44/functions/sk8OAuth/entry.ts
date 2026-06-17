// ============================================================================
// SK8 ↔ Base44 connector — backend OAuth function (Deno)
// Base44 function path: base44/functions/sk8OAuth/entry.ts
// ----------------------------------------------------------------------------
// FROZEN logic. A thin, DEPENDENCY-FREE PKCE token-exchange proxy. The frontend
// (sk8Client.js) resolves the per-deployment config via getSk8Config() — from the
// sk8-connector-config integration's configPublic, or static consts — and passes
// `issuer` and `clientId` on each request. PUBLIC / PKCE client only: there is NO
// client secret anywhere. This file has NO imports and makes NO integration call,
// which is why it deploys reliably. (A top-level `npm:` import or TypeScript syntax
// makes the function fail to deploy — "Backend function 'sk8OAuth' not found or not
// deployed".)
//
// PLAIN JAVASCRIPT only — no TypeScript type annotations.
// ============================================================================

// ---- OIDC discovery (cached, keyed by issuer) -----------------------------
let _meta = null, _metaIssuer = null;
async function oidcMeta(issuer) {
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
    const { action, code, redirectUri, codeVerifier, refreshToken, issuer, clientId } = await req.json();
    if (!issuer || !clientId)
      return Response.json({ error: "issuer and clientId are required (sent by the frontend)" }, { status: 400 });

    async function tokenRequest(extra) {
      const { token_endpoint } = await oidcMeta(issuer);
      const res = await fetch(token_endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" }, // required by Okta/Entra/Keycloak
        body: new URLSearchParams({ client_id: clientId, ...extra }),
      });
      return { ok: res.ok, data: await res.json() };
    }

    if (action === "exchange") {
      if (!code || !redirectUri || !codeVerifier)
        return Response.json({ error: "code, redirectUri and codeVerifier are required" }, { status: 400 });
      const { ok, data } = await tokenRequest({
        grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: codeVerifier,
      });
      if (!ok) {
        console.error("exchange failed", JSON.stringify(data));
        return Response.json({ error: data.error_description || data.error || "token exchange failed" }, { status: 400 });
      }
      return Response.json({ access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in });
    }

    if (action === "refresh") {
      if (!refreshToken) return Response.json({ error: "refreshToken is required" }, { status: 400 });
      const { ok, data } = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });
      if (!ok) {
        console.error("refresh failed", JSON.stringify(data));
        return Response.json({ error: data.error_description || data.error || "refresh failed" }, { status: 401 });
      }
      return Response.json({ access_token: data.access_token, refresh_token: data.refresh_token, expires_in: data.expires_in });
    }

    return Response.json({ error: "unknown action" }, { status: 400 });
  } catch (error) {
    console.error("sk8OAuth error", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
