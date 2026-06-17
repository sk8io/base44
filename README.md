# SK8 ↔ Base44 Connector

Frozen code to authenticate a Base44 app to a **SK8 MCP server** (OIDC + PKCE, public client — no
secret) and query SK8 datasets. Build new apps against a pinned tag, e.g.
`https://github.com/sk8io/base44/tree/v4.2.1`.

Config is centralized: the `sk8-connector-config` Base44 integration serves `configPublic`
(issuer, client_id, mcp_url, …), so a new app needs **zero SK8 configuration** — it just copies the
connector files.

## Build prompt

Paste this into your Base44 builder:

```text
Build my app using the SK8 ↔ Base44 connector at https://github.com/sk8io/base44/tree/v4.2.1
(use this EXACT tag, not the default branch).

Copy these files verbatim into the same paths:
  src/lib/sk8Config.js, src/lib/sk8Config.static.js, src/lib/sk8Config.integration.js,
  src/lib/sk8Client.js, src/pages/OAuthCallback.jsx,
  base44/functions/sk8OAuth/entry.ts, base44/functions/sk8Query/entry.ts

The two backend functions are PLAIN JAVASCRIPT with NO imports — do not rewrite them, do not add
TypeScript types, do not add an npm import. Create them by their exact names: sk8OAuth and sk8Query.

Leave CONFIG_MODE = "integration" (the default) — config loads automatically from the
sk8-connector-config integration. Fill nothing.

Add the /oauth/callback guard to src/App.jsx (below), and register
<app-origin>/oauth/callback as an allowed callback URL in the IdP.

When displaying data: you cannot see the dataset schema at build time, so for each attribute you need
(name, value, segment, active flag, last-purchase date, …) resolve the field with a small
case-insensitive resolver that tries candidate key patterns against the row's actual keys — do NOT
hardcode one guessed key — and log the resolved field name + a sample value to the console so
mismatches are obvious. Numeric and id columns come back as STRINGS (e.g. "13.37") — coerce with
Number() before any arithmetic or aggregation. Query results are { rows, page: { cursor, has_more } };
timestamps are ISO strings.

Verify after building: /functions/sk8OAuth and /functions/sk8Query both return non-404, and
queryDataset returns rows.
```

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

## Reading dataset results

- Queries return `{ rows: [...], page: { cursor, has_more } }`. `fetchRows()` returns the `rows`
  array directly; `queryDataset()` returns the envelope (read `.rows`; paginate via `page.cursor`).
- **Numeric and id columns arrive as strings** (e.g. `lifetime_value: "13.37"`, `id: "1"`) — coerce
  with `Number(...)` before any arithmetic or aggregation. Timestamps are ISO strings (`new Date(...)`).
- The builder has **no schema access at build time**, so for each attribute resolve it with a small
  **case-insensitive field resolver** that tries candidate key patterns against the row's actual keys,
  rather than hardcoding one guessed name — and log resolved names/values during development so
  mismatches surface immediately.

## Don't break these

- Backend functions stay **plain JS with no imports**, named `sk8OAuth` / `sk8Query` at
  `base44/functions/<name>/entry.ts`. An npm import or TypeScript syntax makes them fail to deploy
  ("function not found or not deployed"). They take all config from the frontend — no per-app edits.
- **Frozen** (don't rewrite while debugging): `sk8Client.js`, both function bodies, `OAuthCallback.jsx`.
- A working sign-in does **not** prove `sk8Query` works — verify a data query separately.

## Static mode (optional)

Set `CONFIG_MODE = "static"` in `src/lib/sk8Config.js` and fill `src/lib/sk8Config.static.js`
(`ISSUER`, `CLIENT_ID`, `RESOURCE_MODE`, `AUDIENCE` or `API_SCOPES`, `MCP_URL`) to hardcode config
instead of using the integration. Public/PKCE only — no secret in either mode.

## License

MIT — see `LICENSE`.
