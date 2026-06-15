// ============================================================================
// SK8 ↔ Base44 connector — per-deployment configuration
// Everything here is plain, non-secret config. Edit the marked values only.
// The ONLY secret is SK8_CLIENT_SECRET (set as an env var; see sk8OAuth/entry.ts).
// ============================================================================
export const SK8_CONFIG = {
  // ---- Fill per deployment (see README → "IdP matrix") --------------------
  ISSUER:        "https://<YOUR-IDP-ISSUER>/", // OIDC issuer, e.g. https://dev-xxxx.us.auth0.com/
  CLIENT_ID:     "<YOUR-CLIENT-ID>",
  RESOURCE_MODE: "audience",                   // "audience" (Auth0/Okta) | "scope" (Entra/Keycloak)
  AUDIENCE:      "https://<YOUR-SK8-URL>/",     // used when RESOURCE_MODE === "audience"
  API_SCOPES:    [],                           // e.g. ["api://<app-id>/access"] when RESOURCE_MODE === "scope"

  // ---- Stable; do not change ----------------------------------------------
  BASE_SCOPES:   ["openid", "profile", "email", "offline_access"],
  REDIRECT_PATH: "/oauth/callback",
};
