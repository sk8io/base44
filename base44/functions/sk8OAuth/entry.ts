// ============================================================================
// SK8 ↔ Base44 connector — backend OAuth function (Deno)
// Base44 function path: base44/functions/sk8OAuth/entry.ts
// Logic is FROZEN. Edit only the two marked config consts below.
// ============================================================================

// ---- Fill to match src/lib/sk8Config.js (non-secret) ----------------------
const ISSUER    = "https://<YOUR-IDP-ISSUER>/";
const CLIENT_ID = "<YOUR-CLIENT-ID>";
// ---- The ONLY secret. Set in Dashboard → Settings → Environment Variables.
// ---- Omit entirely for public/SPA clients (PKCE-only, no secret issued).
const CLIENT_SECRET = Deno.env.get("SK8_CLIENT_SECRET");

let _meta = null;
async function oidcMeta() {
  if (_meta) return _meta;
  const res = await fetch(`${ISSUER.replace(/\/$/, "")}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`OIDC discovery failed: ${res.status}`);
  _meta = await res.json();
  return _meta;
}

async function tokenRequest(extra) {
  const { token_endpoint } = await oidcMeta();
  const payload = { client_id: CLIENT_ID, ...(CLIENT_SECRET ? { client_secret: CLIENT_SECRET } : {}), ...extra };
  const res = await fetch(token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" }, // required by Okta/Entra/Keycloak
    body: new URLSearchParams(payload),
  });
  return { ok: res.ok, data: await res.json() };
}

Deno.serve(async (req) => {
  try {
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
    return Response.json({ error: error.message }, { status: 500 });
  }
});
