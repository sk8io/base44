# SK8 ↔ Base44 Connector

Frozen code to authenticate a Base44 app to a **SK8 MCP server** (OIDC + PKCE) and query SK8
datasets. Build new apps against a pinned tag, e.g. `https://github.com/sk8io/base44/tree/v4.1.0`.

## Build prompt

Paste this into your Base44 builder:

```text
Build my app using the SK8 ↔ Base44 connector at https://github.com/sk8io/base44/tree/v4.1.0
(use this EXACT tag, not the default branch).

Copy these files verbatim into the same paths:
  src/lib/sk8Config.js, src/lib/sk8Config.static.js, src/lib/sk8Config.integration.js,
  src/lib/sk8Client.js, src/pages/OAuthCallback.jsx,
  base44/functions/sk8OAuth/entry.ts, base44/functions/sk8Query/entry.ts

The two backend functions are PLAIN JAVASCRIPT — no TypeScript type annotations, and NO top-level
npm import. Do not rewrite them. Create them by their exact names: sk8OAuth and sk8Query.

Set CONFIG_MODE = "static" in sk8Config.js, sk8OAuth/entry.ts and sk8Query/entry.ts, then ask me for
ISSUER, CLIENT_ID, AUDIENCE and MCP_URL. Put them in sk8Config.static.js (RESOURCE_MODE = "audience"),
mirror ISSUER/CLIENT_ID into sk8OAuth/entry.ts and MCP_URL into sk8Query/entry.ts. Leave the client
secret empty (public PKCE client).

Add the /oauth/callback guard to src/App.jsx (below), and register
<app-origin>/oauth/callback as an allowed callback URL in the IdP.

Verify after building: /functions/sk8OAuth and /functions/sk8Query both return non-404, and
queryDataset returns rows.
```

## Config

| Value | Notes |
|-------|-------|
| `ISSUER` | OIDC issuer, e.g. `https://<domain>/` |
| `CLIENT_ID` | public client id (no secret) |
| `AUDIENCE` | SK8 API audience, e.g. `sk8-api-gateway` |
| `MCP_URL` | `https://<sk8-host>/api-gateway/v1/mcp` |

`RESOURCE_MODE = "audience"` for Auth0/Okta; `"scope"` (set `API_SCOPES`) for Entra/Keycloak.

## App wiring — `src/App.jsx`

`/oauth/callback` must render before the auth provider mounts:

```jsx
import OAuthCallback from "./pages/OAuthCallback";

function App() {
  if (window.location.pathname === "/oauth/callback") {
    return (
      <Router><Routes>
        <Route path="/oauth/callback" element={<OAuthCallback />} />
      </Routes></Router>
    );
  }
  // ...existing App body
}
```

## Usage — `src/lib/sk8Client.js`

```js
import { getToken, getLoginUrl, clearTokens, listDatasets, queryDataset, fetchRows } from "@/lib/sk8Client";

if (!getToken()) window.location.href = await getLoginUrl();   // sign in
const datasets = await listDatasets();
const rows = await fetchRows("customers", { take: 200, skip: 0 });
clearTokens();                                                  // sign out
```

## Don't break these

- Backend functions stay **plain JS** with **no top-level `npm:` import**, named `sk8OAuth` / `sk8Query`
  at `base44/functions/<name>/entry.ts`. A top-level npm import or TS syntax makes them fail to deploy
  ("function not found or not deployed").
- **Frozen** (don't rewrite while debugging): `sk8Client.js`, both function bodies, `OAuthCallback.jsx`.
- A working sign-in does **not** prove `sk8Query` works — verify a data query separately.

## Central config (optional)

`CONFIG_MODE = "integration"` fetches ISSUER / CLIENT_ID / MCP_URL (and, for confidential clients, the
secret) at runtime from the `sk8-connector-config` Base44 integration instead of static values. Public
PKCE clients don't need it — use static mode.

## License

MIT — see `LICENSE`.
