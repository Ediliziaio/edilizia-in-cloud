import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";
import { getMetaCredentials } from "../_shared/getMetaCredentials.ts";
import { encrypt, decrypt, getEncryptionKey } from "../_shared/encryption.ts";

// Soglia: rinnova token che scadono entro 15 giorni
const REFRESH_THRESHOLD_DAYS = 15;

function verifyCronOrAuth(req: Request): void {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const reqSecret = req.headers.get("x-cron-secret");
  if (cronSecret && reqSecret === cronSecret) return;
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) return;
  throw new Error("Unauthorized: missing cron secret or JWT");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    verifyCronOrAuth(req);
  } catch {
    console.error("meta-token-refresh: accesso non autorizzato");
    return errorResponse("Unauthorized", 401);
  }

  try {
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { metaAppId, metaAppSecret } = await getMetaCredentials();
    const encKey = getEncryptionKey();
    const apiVersion = Deno.env.get("META_API_VERSION") || "v21.0";

    // Trova credenziali che scadono entro la soglia
    const thresholdDate = new Date(
      Date.now() + REFRESH_THRESHOLD_DAYS * 86400000
    ).toISOString();

    const { data: expiringCreds, error: fetchErr } = await adminClient
      .from("integration_credentials")
      .select("id, integration_id, access_token_encrypted, expires_at")
      .lt("expires_at", thresholdDate)
      .gt("expires_at", new Date().toISOString());

    if (fetchErr) throw fetchErr;

    let refreshed = 0;
    let failed = 0;

    for (const cred of expiringCreds || []) {
      try {
        const currentToken = await decrypt(cred.access_token_encrypted, encKey);

        const res = await fetch(
          `https://graph.facebook.com/${apiVersion}/oauth/access_token?` +
          `grant_type=fb_exchange_token&client_id=${metaAppId}` +
          `&client_secret=${metaAppSecret}&fb_exchange_token=${currentToken}`
        );
        const data = await res.json();

        if (data.error) throw new Error(data.error.message);

        const newExpiry = new Date(
          Date.now() + (data.expires_in || 5184000) * 1000
        ).toISOString();

        await adminClient
          .from("integration_credentials")
          .update({
            access_token_encrypted: await encrypt(data.access_token, encKey),
            expires_at: newExpiry,
            updated_at: new Date().toISOString(),
          })
          .eq("id", cred.id);

        await adminClient
          .from("integrations")
          .update({ health: "ok", last_error_message: null })
          .eq("id", cred.integration_id);

        await adminClient.from("integration_audit_log").insert({
          action: "token_refreshed",
          entity_type: "integration",
          entity_id: cred.integration_id,
          metadata: { old_expiry: cred.expires_at, new_expiry: newExpiry },
        });

        refreshed++;
      } catch (err: any) {
        console.error(`Token refresh failed for ${cred.integration_id}:`, err.message);

        await adminClient
          .from("integrations")
          .update({
            health: "warn",
            last_error_message: `Token refresh fallito: ${err.message}`,
          })
          .eq("id", cred.integration_id);

        failed++;
      }
    }

    return jsonResponse({
      refreshed,
      failed,
      checked: (expiringCreds || []).length,
    });
  } catch (error: any) {
    console.error("meta-token-refresh error:", error.message);
    return errorResponse(error.message, 500);
  }
});
