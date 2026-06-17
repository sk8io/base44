// ============================================================================
// SK8 ↔ Base44 connector — STATIC config provider (build-time values)
// ----------------------------------------------------------------------------
// Used when CONFIG_MODE === "static" in sk8Config.js.
// Fill the marked values per deployment. Public/PKCE only — no client secret.
// The backend functions need NO per-app edits: the frontend passes issuer /
// clientId / mcpUrl to them at runtime.
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
