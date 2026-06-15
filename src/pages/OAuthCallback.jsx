// ============================================================================
// SK8 ↔ Base44 connector — OAuth callback page
// Logic is FROZEN. Styling below is cosmetic — restyle freely, keep the logic.
// ============================================================================
import { useEffect, useState } from "react";
import { expectedState, getPkceVerifier, clearOauthTransients, storeTokens } from "@/lib/sk8Client";

export default function OAuthCallback() {
  const [lines, setLines] = useState(["Mounting..."]);
  const log = (m) => { console.log("[OAuthCallback]", m); setLines((p) => [...p, m]); };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code"), error = params.get("error"), returnedState = params.get("state");

    if (error) { log("ABORT: error=" + error); return; }
    if (!code)  { log("ABORT: no code in URL"); return; }

    const expected = expectedState();
    const verifier = getPkceVerifier();
    clearOauthTransients();
    if (!expected || returnedState !== expected) { log("ABORT: state mismatch (possible CSRF)"); return; }
    if (!verifier) { log("ABORT: missing PKCE verifier"); return; }
    log("state + PKCE OK — exchanging code...");

    fetch("/functions/sk8OAuth", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "exchange",
        code,
        redirectUri: window.location.origin + "/oauth/callback",
        codeVerifier: verifier,
      }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok)            { log("ERROR: " + (data.error || "unknown")); return; }
        if (!data.access_token) { log("NO access_token in response"); return; }
        storeTokens(data);
        log("GOT TOKEN ✓");
        setTimeout(() => { window.location.href = "/"; }, 800);
      })
      .catch((err) => log("FETCH ERROR: " + err.message));
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="bg-card border rounded-xl p-6 w-full max-w-lg">
        <h2 className="font-bold mb-3">Authenticating…</h2>
        <div className="space-y-1 font-mono text-xs">
          {lines.map((l, i) => (
            <p key={i} className={
              l.includes("ERROR") || l.startsWith("ABORT") ? "text-red-500" :
              l.includes("✓") ? "text-green-600 font-bold" : "text-foreground"
            }>{l}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
