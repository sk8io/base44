// ============================================================================
// SK8 ↔ Base44 connector — frontend client
// FROZEN: do not modify. Identical in both config modes — it only ever reads
// per-deployment values through getSk8Config() (see sk8Config.js).
// ============================================================================
import { getSk8Config, REDIRECT_PATH } from "@/lib/sk8Config";

const TOKEN_KEY = "sk8_token", REFRESH_KEY = "sk8_refresh", EXPIRY_KEY = "sk8_expiry";
const STATE_KEY = "sk8_oauth_state", VERIFIER_KEY = "sk8_pkce_verifier";

// ---- OIDC discovery (cached, keyed by issuer) -----------------------------
// Keyed by issuer so a config change (e.g. integration mode pointing at a new
// IdP) re-discovers instead of serving stale endpoints. Caches the resolved
// value, not the promise, so a transient failure isn't cached permanently.
let _discovery = null, _discoveryIssuer = null;
async function oidc() {
  const { ISSUER } = await getSk8Config();
  const issuer = ISSUER.replace(/\/$/, "");
  if (_discovery && _discoveryIssuer === issuer) return _discovery;
  const r = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!r.ok) throw new Error(`OIDC discovery failed: ${r.status}`);
  _discovery = await r.json();
  _discoveryIssuer = issuer;
  return _discovery;
}

// ---- PKCE + state ----------------------------------------------------------
const b64url = (bytes) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const randomB64 = (len) => { const a = new Uint8Array(len); crypto.getRandomValues(a); return b64url(a); };
async function challengeOf(verifier) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(d));
}

export async function getLoginUrl() {
  const cfg = await getSk8Config();
  const { authorization_endpoint } = await oidc();
  const state = randomB64(16);
  const verifier = randomB64(32);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(VERIFIER_KEY, verifier);

  const scope = [
    ...cfg.BASE_SCOPES,
    ...(cfg.RESOURCE_MODE === "scope" ? cfg.API_SCOPES : []),
  ].join(" ");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: cfg.CLIENT_ID,
    redirect_uri: window.location.origin + REDIRECT_PATH,
    scope,
    state,
    code_challenge: await challengeOf(verifier),
    code_challenge_method: "S256",
  });
  if (cfg.RESOURCE_MODE === "audience") params.set("audience", cfg.AUDIENCE);
  return `${authorization_endpoint}?${params.toString()}`;
}

export const expectedState   = () => sessionStorage.getItem(STATE_KEY);
export const getPkceVerifier = () => sessionStorage.getItem(VERIFIER_KEY);
export const clearOauthTransients = () => {
  sessionStorage.removeItem(STATE_KEY); sessionStorage.removeItem(VERIFIER_KEY);
};

// ---- Token storage ---------------------------------------------------------
export function storeTokens({ access_token, refresh_token, expires_in }) {
  if (access_token)  localStorage.setItem(TOKEN_KEY, access_token);
  if (refresh_token) localStorage.setItem(REFRESH_KEY, refresh_token);
  if (expires_in)    localStorage.setItem(EXPIRY_KEY, String(Date.now() + expires_in * 1000));
}
export const getToken        = () => localStorage.getItem(TOKEN_KEY);
export const getRefreshToken = () => localStorage.getItem(REFRESH_KEY);
export const clearTokens = () =>
  [TOKEN_KEY, REFRESH_KEY, EXPIRY_KEY].forEach((k) => localStorage.removeItem(k));
const expiringSoon = () => {
  const exp = Number(localStorage.getItem(EXPIRY_KEY) || 0);
  return exp && Date.now() > exp - 60_000;
};

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) { clearTokens(); throw new Error("session expired — please sign in again"); }
  const res = await fetch("/functions/sk8OAuth", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "refresh", refreshToken }),
  });
  const data = await res.json();
  if (!res.ok) { clearTokens(); throw new Error(data.error || "session expired — please sign in again"); }
  storeTokens(data);
  return data.access_token;
}

async function ensureToken() {
  if (!getToken()) throw new Error("not authenticated");
  if (expiringSoon() && getRefreshToken()) return refreshAccessToken();
  return getToken();
}

// ---- MCP calls -------------------------------------------------------------
let cachedSession = null;

async function sk8Call(tool, toolArguments, action = null, _retried = false) {
  const token = await ensureToken();
  const res = await fetch("/functions/sk8Query", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sk8Token: token, sessionId: cachedSession, tool, toolArguments, action }),
  });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401 && data?.code === "SK8_TOKEN_EXPIRED" && getRefreshToken() && !_retried) {
    await refreshAccessToken(); cachedSession = null;
    return sk8Call(tool, toolArguments, action, true);
  }
  if (!res.ok) throw new Error(data.error || `sk8 error ${res.status}`);
  if (data.sessionId) cachedSession = data.sessionId;

  const result = data.result;
  if (result?.isError) throw new Error(result.content?.[0]?.text || "sk8 tool error");
  return result?.structuredContent ?? result;
}

// ---- Public API ------------------------------------------------------------
export const listTools    = () => sk8Call(null, {}, "list_tools");
export const listDatasets = () => sk8Call("list_datasets", {});
export const queryDataset = (dataset, body = {}) => sk8Call("query_dataset", { dataset, body });

export async function fetchRows(dataset, { take = 50, skip = 0 } = {}) {
  const r = await queryDataset(dataset, { take, skip });
  return Array.isArray(r) ? r : r?.rows ?? r?.data ?? [];
}
