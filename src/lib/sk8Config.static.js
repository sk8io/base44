// ============================================================================
// SK8 ↔ Base44 connector — STATIC config provider (build-time values)
// ----------------------------------------------------------------------------
// Used when CONFIG_MODE === "static" in sk8Config.js.
// Fill the marked values per deployment (see README → "IdP matrix").
// The ONLY secret (client secret) is NEVER here — it is set as the
// SK8_CLIENT_SECRET env var on the backend (see sk8OAuth/entry.ts).
//
// In static mode you must also set the matching backend consts:
//   • sk8OAuth/entry.ts → STATIC_ISSUER, STATIC_CLIENT_ID   (= ISSUER, CLIENT_ID)
//   • sk8Query/entry.ts → STATIC_MCP_URL                     (= MCP_URL)
// (Backend functions can't import this frontend file, hence the duplication.)
// ============================================================================
export async function loadConfig() {
  return {
    // ---- Fill per deployment ------------------------------------------------
    ISSUER:        "https://<YOUR-IDP-ISSUER>/", // OIDC issuer, e.g. https://dev-xxxx.us.auth0.com/
    CLIENT_ID:     "<YOUR-CLIENT-ID>",
    RESOURCE_MODE: "audience",                   // "audience" (Auth0/Okta) | "scope" (Entra/Keycloak)
    AUDIENCE:      "https://<YOUR-SK8-URL>/",     // used when RESOURCE_MODE === "audience"
    API_SCOPES:    [],                           // e.g. ["api://<app-id>/access"] when RESOURCE_MODE === "scope"
    MCP_URL:       "https://<YOUR-SK8-URL>/api-gateway/v1/mcp",

    // ---- Stable; do not change ----------------------------------------------
    BASE_SCOPES:   ["openid", "profile", "email", "offline_access"],
  };
}
