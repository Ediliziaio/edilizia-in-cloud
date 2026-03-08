import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMetaCredentials } from "../_shared/getMetaCredentials.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // GET - Meta webhook verification handshake
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const verifyToken = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const expectedToken = Deno.env.get("WHATSAPP_VERIFY_TOKEN"); // reuse same verify token

    if (mode === "subscribe" && verifyToken === expectedToken) {
      console.log("Webhook verified successfully");
      return new Response(challenge, { status: 200 });
    }

    return new Response("Verification failed", { status: 403 });
  }

  // POST - Receive webhook events
  if (req.method === "POST") {
    try {
      const body = await req.text();

      // Validate X-Hub-Signature-256
      const signature = req.headers.get("x-hub-signature-256");
      const { metaAppSecret: appSecret } = await getMetaCredentials();

      if (appSecret && signature) {
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
          "raw", encoder.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
        );
        const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
        const hexSig = "sha256=" + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
        if (signature !== hexSig) {
          console.error("Invalid webhook signature");
          return new Response("Invalid signature", { status: 403 });
        }
      }

      const payload = JSON.parse(body);

      // Only process leadgen events
      if (payload.object !== "page") {
        return new Response("OK", { status: 200 });
      }

      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const adminClient = createClient(supabaseUrl, serviceRoleKey);

      // Process each entry
      for (const entry of payload.entry || []) {
        const pageId = entry.id;

        for (const change of entry.changes || []) {
          if (change.field !== "leadgen") continue;

          const leadgenId = change.value?.leadgen_id;
          const formId = change.value?.form_id;
          const adId = change.value?.ad_id;
          const createdTime = change.value?.created_time;

          if (!leadgenId) continue;

          // Find which integration/company owns this page
          const { data: pageAssets } = await adminClient
            .from("meta_assets")
            .select("integration_id, company_id")
            .eq("asset_id", String(pageId))
            .eq("asset_type", "page")
            .eq("selected", true)
            .limit(1);

          if (!pageAssets || pageAssets.length === 0) {
            console.warn(`No integration found for page ${pageId}`);
            continue;
          }

          const { integration_id, company_id } = pageAssets[0];

          // Enqueue event (idempotent via unique constraint)
          const { error: insertErr } = await adminClient
            .from("integration_webhook_events")
            .upsert(
              {
                company_id,
                integration_id,
                provider: "meta",
                event_type: "leadgen",
                event_id: String(leadgenId),
                payload: {
                  leadgen_id: leadgenId,
                  form_id: formId,
                  ad_id: adId,
                  page_id: pageId,
                  created_time: createdTime,
                  raw: change.value,
                },
                status: "pending",
                received_at: new Date().toISOString(),
              },
              { onConflict: "company_id,provider,event_id", ignoreDuplicates: true }
            );

          if (insertErr) {
            console.error("Failed to enqueue webhook event:", insertErr);
          }
        }
      }

      // Always respond 200 quickly
      return new Response("OK", { status: 200 });
    } catch (error) {
      console.error("meta-webhook error:", error);
      // Still respond 200 to prevent Meta from retrying
      return new Response("OK", { status: 200 });
    }
  }

  return new Response("Method not allowed", { status: 405 });
});
