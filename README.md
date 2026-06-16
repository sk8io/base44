# SK8 ↔ Base44 Connector

Canonical, frozen code for authenticating a Base44 app to a **SK8 MCP server** (OpenID
Connect + PKCE, with refresh and stateful MCP session handling) and querying SK8 datasets.

**Point your Base44 builder at this repo and copy the files verbatim. Do not regenerate the
auth or query logic — it is already correct and battle-tested.** Only a handful of config
values change per deployment, and only one of them is a secret.

---

## 🔀 Two ways to supply the config — pick one

The connector reads the same handful of per-deployment values either way; the mode — **where
they come from** — is captured by a single switch (`CONFIG_MODE`), which the Base44 builder
sets for you by detecting whether the `sk8-connector-config` integration exists (see the
prompt below):

| Mode | Where values live | Use when |
|------|-------------------|----------|
| **`static`** | Filled into the connector files at build time | One-off app, or you want everything self-contained in the app |
| **`integration`** | Fetched at runtime from the **`sk8-connector-config`** custom integration | You manage many apps and want one central place to change issuer / client id / MCP URL / secret |

In **integration** mode the values (including the client secret) are managed once, centrally,
and every app inherits them — change them in one place and all apps follow. In **static** mode
each app holds its own copy. Both modes are otherwise identical: same auth, same data API.

> The switch lives in three places and they must all agree: `src/lib/sk8Config.js`,
> `base44/functions/sk8OAuth/entry.ts`, and `base44/functions/sk8Query/entry.ts`
> (each has a `CONFIG_MODE` constant at the top).

---

## 📋 Copy this into your Base44 prompt

You don't pick the mode — the builder infers it by checking whether the
**`sk8-connector-config`** custom integration already exists in your workspace. Paste this
single block:

```text
Build my app using the SK8 ↔ Base44 connector at https://github.com/sk8io/base44.
Copy ALL connector files verbatim into the same paths, then choose the config mode AUTOMATICALLY:

- If a workspace custom integration named exactly "sk8-connector-config" already exists,
  use INTEGRATION mode: set CONFIG_MODE = "integration" in src/lib/sk8Config.js,
  base44/functions/sk8OAuth/entry.ts, and base44/functions/sk8Query/entry.ts. Fill nothing —
  the values load from that integration at runtime.

- Otherwise use STATIC mode: set CONFIG_MODE = "static" in the same three files and ASK ME for
  ISSUER, CLIENT_ID, RESOURCE_MODE, AUDIENCE (if audience mode) or API_SCOPES (if scope mode),
  MCP_URL, and the client secret. Put the non-secret values in src/lib/sk8Config.static.js,
  mirror ISSUER/CLIENT_ID into sk8OAuth/entry.ts (STATIC_ISSUER / STATIC_CLIENT_ID) and MCP_URL
  into sk8Query/entry.ts (STATIC_MCP_URL), and set SK8_CLIENT_SECRET in
  Dashboard → Settings → Environment Variables (omit it for public/SPA clients).

Do NOT invent values or leave any <...> placeholder. If you cannot determine whether the
integration exists, ASK ME which mode to use rather than guessing.

Then merge the /oauth/callback guard into src/App.jsx exactly as the repo README shows, and
register <my-app-origin>/oauth/callback as an allowed redirect URI in the IdP.
```

> The inference happens **once, at build time**, and the result is written explicitly into the
> three `CONFIG_MODE` constants — there's no runtime auto-detect, so a transient integration
> outage can never silently fall back to placeholder values. The "ASK ME rather than guess"
> clause is the guardrail if the builder can't see the workspace's integrations.

---

## Files to copy (both modes)

| From this repo | To the app |
|----------------|------------|
| `src/lib/sk8Config.js` | `src/lib/sk8Config.js` |
| `src/lib/sk8Config.static.js` | `src/lib/sk8Config.static.js` |
| `src/lib/sk8Config.integration.js` | `src/lib/sk8Config.integration.js` |
| `src/lib/sk8Client.js` | `src/lib/sk8Client.js` |
| `src/pages/OAuthCallback.jsx` | `src/pages/OAuthCallback.jsx` |
| `base44/functions/sk8OAuth/entry.ts` | `base44/functions/sk8OAuth/entry.ts` |
| `base44/functions/sk8Query/entry.ts` | `base44/functions/sk8Query/entry.ts` |

Copy all of them regardless of mode — the unused provider is inert. Then set `CONFIG_MODE`
and (static only) fill the marked values. Do **not** edit `sk8Client.js`, the bodies of the
backend functions, or the callback logic.

---

## Configuration — the only things that change per deployment

All non-secret except the client secret.

### Static mode

| Where | Value | Notes |
|-------|-------|-------|
| `src/lib/sk8Config.static.js` → `ISSUER` | OIDC issuer URL | trailing slash optional (stripped before discovery) |
| `src/lib/sk8Config.static.js` → `CLIENT_ID` | IdP client id | public |
| `src/lib/sk8Config.static.js` → `RESOURCE_MODE` | `"audience"` or `"scope"` | see IdP matrix |
| `src/lib/sk8Config.static.js` → `AUDIENCE` | SK8 API identifier | when `RESOURCE_MODE = "audience"` |
| `src/lib/sk8Config.static.js` → `API_SCOPES` | `["api://<app-id>/access"]` | when `RESOURCE_MODE = "scope"` |
| `src/lib/sk8Config.static.js` → `MCP_URL` | SK8 MCP endpoint | e.g. `https://<sk8-host>/api-gateway/v1/mcp` |
| `sk8OAuth/entry.ts` → `STATIC_ISSUER`, `STATIC_CLIENT_ID` | same as above | duplicated because backend can't import frontend config |
| `sk8Query/entry.ts` → `STATIC_MCP_URL` | same as `MCP_URL` | duplicated for the same reason |
| env var `SK8_CLIENT_SECRET` | IdP client secret | **the only secret**; omit for public clients |

### Integration mode

Nothing to fill in the app. A workspace admin registers the **`sk8-connector-config`** custom
integration once (Settings → Integrations → New Integration), pointing at the SK8 config
service, with the **`X-Config-Key`** header set to the service's key. The service exposes:

| Operation | Returns | Called by |
|-----------|---------|-----------|
| `GET /functions/configPublic` | `issuer`, `client_id`, `resource_mode`, `audience`, `api_scopes`, `mcp_url` | frontend config load + `sk8Query` (for `mcp_url`) + `sk8OAuth` |
| `GET /functions/configSecret` | `client_secret` (only) | `sk8OAuth` backend only |

The client secret is fetched **only** by the backend `sk8OAuth` function (via `configSecret`)
and never reaches the browser. Base44 injects `X-Config-Key` server-side, so the key is never
exposed to the browser either.

### IdP matrix

| IdP | `ISSUER` | `RESOURCE_MODE` |
|-----|----------|-----------------|
| Auth0 | `https://<domain>/` | `audience` |
| Okta | `https://<org>.okta.com/oauth2/<authServerId>` | `audience` |
| Microsoft Entra ID | `https://login.microsoftonline.com/<tenant>/v2.0` | `scope` (`API_SCOPES = ["api://<app-id>/<scope>"]`) |
| Keycloak | `https://<host>/realms/<realm>` | `scope` |

The authoritative issuer is always the `issuer` field of the IdP's
`/.well-known/openid-configuration`. SK8 must be configured to trust this issuer and to accept
the `aud`/scope requested.

---

## App wiring (merge into `src/App.jsx`)

The `/oauth/callback` route **must render before the auth provider mounts**, or Base44
redirects away before the authorization code is captured. Add this as the first statement in
the `App()` body:

```jsx
import OAuthCallback from "./pages/OAuthCallback";

function App() {
  if (window.location.pathname === "/oauth/callback") {
    return (
      <Router>
        <Routes>
          <Route path="/oauth/callback" element={<OAuthCallback />} />
        </Routes>
      </Router>
    );
  }
  // ...existing App body (AuthProvider, routes, etc.)
}
```

## Sign-in gate (any page)

```jsx
import { getToken, getLoginUrl, clearTokens } from "@/lib/sk8Client";

const [token] = useState(() => getToken());
if (!token) {
  return (
    <button onClick={async () => { window.location.href = await getLoginUrl(); }}>
      Sign in with SK8
    </button>
  );
}
// signed in — call listDatasets() / queryDataset() / fetchRows()
// sign out: clearTokens(); window.location.reload();
```

## Using the data API

```js
import { listTools, listDatasets, queryDataset, fetchRows } from "@/lib/sk8Client";

const tools    = await listTools();              // { tools: [...] }
const datasets = await listDatasets();
const rows     = await fetchRows("customers", { take: 200, skip: 0 });
const page     = await queryDataset("orders", { take: 50, skip: 0 });
```

SK8 MCP currently filters server-side with `eq` only — do text search client-side over a
bounded fetch and treat it as non-scaling until a `contains` filter is available.

---

## How it works (so you don't need to re-derive it)

- **Config:** the connector reads every per-deployment value through `getSk8Config()`
  (frontend) / `loadConfig()` (backend). `CONFIG_MODE` picks the provider — static consts or
  the `sk8-connector-config` integration — and everything downstream is identical. Static
  mode resolves instantly (no network), so login latency is unchanged.
- **Auth:** OIDC authorization-code flow with **PKCE always on**; the client secret is sent
  only when present, so the same code serves confidential (Web) and public (SPA) IdP clients.
  Endpoints come from OIDC discovery, so no IdP-specific URLs are hardcoded.
- **Tokens:** access + refresh tokens held in the browser; refresh happens proactively (expiry
  margin) and reactively (on a `SK8_TOKEN_EXPIRED` signal), and is rotation-safe.
- **MCP:** the proxy performs the stateful `initialize` → `notifications/initialized` handshake,
  the client caches and replays the `mcp-session-id`, and the backend re-inits and retries once
  on a stale (404) session. Both JSON and SSE responses are handled.
- **Secrets:** the client secret never leaves the backend. The backend functions are stateless
  proxies that persist nothing.

## Gotchas

| Issue | Resolution |
|-------|-----------|
| Which mode? | Set `CONFIG_MODE` to the **same** value in all three files (`sk8Config.js`, `sk8OAuth/entry.ts`, `sk8Query/entry.ts`). |
| Integration mode 401 on config load | The `sk8-connector-config` integration isn't registered, or its `X-Config-Key` header is missing/wrong. |
| Integration name mismatch | The custom integration must be named exactly `sk8-connector-config`. |
| Endpoints differ per IdP | Resolved from `<ISSUER>/.well-known/openid-configuration`; never hardcode. Discovery is cached **per issuer**, so a config change re-discovers. |
| Targeting the SK8 API | Auth0/Okta use the `audience` param; Entra/Keycloak use a resource scope. Set `RESOURCE_MODE`. |
| Token endpoint format | Form-encoded; JSON is rejected by Okta/Entra/Keycloak. (Handled — don't change.) |
| Public vs confidential client | PKCE always; secret sent only if present. Omit `SK8_CLIENT_SECRET` / return `{}` from `configSecret` for SPA clients. |
| No refresh token | Enable **offline access** on the IdP API; the `offline_access` scope alone isn't enough. |
| Issuer mismatch | SK8's expected issuer must equal the token `iss` (e.g. Entra v1 `sts.windows.net` vs v2 `…/v2.0`). |
| Base44 auth intercept | `/oauth/callback` must render outside the auth provider (App wiring). |
| Per-app redirect URI | Register each app's `origin/oauth/callback` in the IdP. |
| Cloud → SK8 reachability | Base44 functions must reach the IdP token endpoint and the SK8 MCP URL. |

---

## Pinning (for bulletproof reuse)

Tag releases (e.g. `v4.0.0`) and point Base44 at a specific tag or commit rather than the
moving branch, so every app builds against an identical, verified connector. (`v4` introduces
the `CONFIG_MODE` switch and the integration provider; pre-`v4` tags are static-only.)

For multi-user deployments, move token custody server-side: persist the IdP tokens keyed to the
authenticated Base44 user and have `sk8Query` look them up, so bearer tokens never reach the
client. The browser-held model here is intended for a single signed-in operator.

## License

MIT — see `LICENSE`.
