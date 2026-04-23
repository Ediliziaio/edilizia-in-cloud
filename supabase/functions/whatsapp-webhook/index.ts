// MP01 — whatsapp-webhook entry point (refactored).
// Responsabilità: verify HMAC, parse body, delega al router.ts.
// Restituisce SEMPRE 200 per gli errori applicativi (così Meta non sospende
// il webhook). Solo HMAC invalido → 401. Solo errori DB transitori → 500
// per triggerare retry Meta (15m → 1h → 6h → 24h).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { getMetaCredentials } from "../_shared/getMetaCredentials.ts";
import { corsHeaders } from "../_shared/headers.ts";
import { verifyHmacSha256 } from "../_shared/webhookSecurity.ts";
import { routeIncoming } from "./router.ts";
import { logRoutingError } from "./errors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // ── GET: verifica challenge Meta ──────────────────────────────────────────
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const VERIFY_TOKEN = await getPlatformSetting(
      "whatsapp_verify_token",
      "WHATSAPP_VERIFY_TOKEN",
    );
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log(
        JSON.stringify({
          level: "info",
          fn: "whatsapp-webhook",
          msg: "verified challenge",
        }),
      );
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // ── POST: inbound message ─────────────────────────────────────────────────
  const bodyText = await req.text();
  const signature = req.headers.get("x-hub-signature-256") ?? "";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { metaAppSecret } = await getMetaCredentials();
  // Se META_APP_SECRET è vuoto, verifyHmac calcolerebbe HMAC con chiave
  // vuota → firma forgiabile. Rifiutiamo sempre.
  if (!metaAppSecret || metaAppSecret.trim() === "") {
    console.error(
      JSON.stringify({
        level: "error",
        fn: "whatsapp-webhook",
        msg: "META_APP_SECRET not configured",
      }),
    );
    return new Response("Webhook secret not configured on server", {
      status: 503,
    });
  }

  if (!(await verifyHmacSha256(bodyText, signature, metaAppSecret))) {
    await logRoutingError(supabase, {
      error_kind: "hmac_invalid",
      payload_excerpt: bodyText.substring(0, 500),
      error_detail: "HMAC signature mismatch",
    });
    return new Response("Unauthorized", { status: 401 });
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let payload: unknown;
  try {
    payload = JSON.parse(bodyText);
  } catch (e) {
    await logRoutingError(supabase, {
      error_kind: "payload_malformed",
      payload_excerpt: bodyText.substring(0, 500),
      error_detail: `JSON parse error: ${String(e)}`,
    });
    // 200 a Meta: Meta sospende webhook con troppi 4xx.
    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  // ── Route ─────────────────────────────────────────────────────────────────
  try {
    await routeIncoming(supabase, payload as never);
  } catch (err) {
    // Errori transitori (DB down, network) → 500 così Meta ritenta.
    // Gli errori applicativi (phone_id unknown, company disabled) sono già
    // catturati dentro routeIncoming e loggati, quindi qui arrivano solo
    // eccezioni veramente inaspettate.
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(
      JSON.stringify({
        level: "error",
        fn: "whatsapp-webhook",
        msg: "route threw — Meta will retry",
        error: errorMsg,
      }),
    );
    await logRoutingError(supabase, {
      error_kind: "payload_malformed",
      payload_excerpt: bodyText.substring(0, 500),
      error_detail: errorMsg,
    });
    return new Response(
      JSON.stringify({ ok: false, error: errorMsg }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  return new Response("OK", { status: 200, headers: corsHeaders });
});
