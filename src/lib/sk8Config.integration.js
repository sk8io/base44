// ============================================================================
// SK8 ↔ Base44 connector — INTEGRATION config provider (runtime fetch)
// ----------------------------------------------------------------------------
// Used when CONFIG_MODE === "integration" in sk8Config.js.
// Fetches the NON-SECRET config from the "sk8-connector-config" custom
// integration (operation: GET /functions/configPublic). Nothing to fill here.
//
// The client secret is NEVER fetched in the browser — it is read only by the
// backend sk8OAuth function (via the configSecret operation). This provider
// returns only public values.
//
// Prerequisite: a workspace admin must have registered the custom integration
// named exactly "sk8-connector-config" with the X-Config-Key header. Base44
// injects that header server-side, so the key is never exposed to the browser.
// ============================================================================
import { base44 } from "@/api/base44Client";

const INTEGRATION = "sk8-connector-config";

export async function loadConfig() {
  const res = await base44.integrations.custom.call(
    INTEGRATION,
    "get:/functions/configPublic",
    {},
  );
  if (!res.success) throw new Error(`SK8 config load failed (${res.status_code})`);
  const d = res.data;
  return {
    ISSUER:        d.issuer,
    CLIENT_ID:     d.client_id,
    RESOURCE_MODE: d.resource_mode || "audience",
    AUDIENCE:      d.audience || "",
    API_SCOPES:    d.api_scopes || [],
    MCP_URL:       d.mcp_url,
    BASE_SCOPES:   d.base_scopes || ["openid", "profile", "email", "offline_access"],
  };
}
