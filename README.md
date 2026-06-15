# SK8 ↔ Base44 Connector

Canonical, frozen code for authenticating a Base44 app to a **SK8 MCP server** (OpenID
Connect + PKCE, with refresh and stateful MCP session handling) and querying SK8 datasets.

**Point your Base44 builder at this repo and copy the files verbatim. Do not regenerate the
auth or query logic — it is already correct and battle-tested.** Only a handful of config
values change per deployment, and only one of them is a secret.

---

## ⚙️ For the Base44 agent — do exactly this

1. **Copy these files verbatim** to the same paths in the target app:

   | From this repo | To the app |
   |----------------|------------|
   | `src/lib/sk8Client.js` | `src/lib/sk8Client.js` |
   | `src/lib/sk8Config.js` | `src/lib/sk8Config.js` |
   | `src/pages/OAuthCallback.jsx` | `src/pages/OAuthCallback.jsx` |
   | `base44/functions/sk8OAuth/entry.ts` | `base44/functions/sk8OAuth/entry.ts` |
   | `base44/functions/sk8Query/entry.ts` | `base44/functions/sk8Query/entry.ts` |

2. **Fill only the marked config values** (table below). Do **not** edit `sk8Client.js`, the
   bodies of the backend functions, or the callback logic.

3. **Merge the App.jsx guard** (see *App wiring* below) so `/oauth/callback` renders before
   the auth provider mounts.

4. **Set `SK8_CLIENT_SECRET`** in Dashboard → Settings → Environment Variables — only if the
   IdP issued a client secret. Omit it for public/SPA clients.

5. **Register `<app-origin>/oauth/callback`** as an allowed redirect URI in the IdP.

That is the entire integration. The data API is `listTools()`, `listDatasets()`,
`queryDataset(dataset, body)`, and `fetchRows(dataset, { take, skip })` from `@/lib/sk8Client`.

---

## Configuration — the only things that change per deployment

All non-secret except `SK8_CLIENT_SECRET`.

| Where | Value | Notes |
|-------|-------|-------|
| `src/lib/sk8Config.js` → `ISSUER` | OIDC issuer URL | trailing slash as the IdP publishes it |
| `src/lib/sk8Config.js` → `CLIENT_ID` | IdP client id | public |
| `src/lib/sk8Config.js` → `RESOURCE_MODE` | `"audience"` or `"scope"` | see IdP matrix |
| `src/lib/sk8Config.js` → `AUDIENCE` | SK8 API identifier | when `RESOURCE_MODE = "audience"` |
| `src/lib/sk8Config.js` → `API_SCOPES` | `["api://<app-id>/access"]` | when `RESOURCE_MODE = "scope"` |
| `base44/functions/sk8OAuth/entry.ts` → `ISSUER`, `CLIENT_ID` | same as sk8Config | duplicated because backend can't import frontend config |
| `base44/functions/sk8Query/entry.ts` → `MCP_URL` | SK8 MCP endpoint | e.g. `https://<sk8-host>/api-gateway/v1/mcp` |
| env var `SK8_CLIENT_SECRET` | IdP client secret | **the only secret**; omit for public clients |

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
| Endpoints differ per IdP | Resolved from `<ISSUER>/.well-known/openid-configuration`; never hardcode. |
| Targeting the SK8 API | Auth0/Okta use the `audience` param; Entra/Keycloak use a resource scope. Set `RESOURCE_MODE`. |
| Token endpoint format | Form-encoded; JSON is rejected by Okta/Entra/Keycloak. (Handled — don't change.) |
| Public vs confidential client | PKCE always; secret sent only if `SK8_CLIENT_SECRET` is set. Omit it for SPA clients. |
| No refresh token | Enable **offline access** on the IdP API; the `offline_access` scope alone isn't enough. |
| Issuer mismatch | SK8's expected issuer must equal the token `iss` (e.g. Entra v1 `sts.windows.net` vs v2 `…/v2.0`). |
| Base44 auth intercept | `/oauth/callback` must render outside the auth provider (App wiring). |
| Per-app redirect URI | Register each app's `origin/oauth/callback` in the IdP. |
| Cloud → SK8 reachability | Base44 functions must reach the IdP token endpoint and the SK8 MCP URL. |

---

## Pinning (for bulletproof reuse)

Tag releases (e.g. `v3.0.0`) and point Base44 at a specific tag or commit rather than the
moving branch, so every app builds against an identical, verified connector.

For multi-user deployments, move token custody server-side: persist the IdP tokens keyed to the
authenticated Base44 user and have `sk8Query` look them up, so bearer tokens never reach the
client. The browser-held model here is intended for a single signed-in operator.

## License

MIT — see `LICENSE`.
