import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getMetaCredentials } from "../_shared/getMetaCredentials.ts";
import { timingSafeEqualHex } from "../_shared/metaAuth.ts";

serve(async (req) => {
  const url = new URL(req.url);

  // GET - Meta webhook verification handshake
  if (req.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const verifyToken = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const expectedToken =
      Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") || Deno.env.get("WHATSAPP_VERIFY_TOKEN");

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

      if (!appSecret || !signature) {
        console.error("Missing Meta app secret or webhook signature");
        return new Response("Invalid signature", { status: 403 });
      }

      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw", encoder.encode(appSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
      const hexSig = "sha256=" + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
      if (!timingSafeEqualHex(signature, hexSig)) {
        console.error("Invalid webhook signature");
        return new Response("Invalid signature", { status: 403 });
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
            .select("id, integration_id, company_id")
            .eq("asset_id", String(pageId))
            .eq("asset_type", "page")
            .eq("selected", true);

          if (!pageAssets || pageAssets.length === 0) {
            console.warn(`No integration found for page ${pageId}`);
            continue;
          }

          for (const pageAsset of pageAssets) {
            const { integration_id, company_id } = pageAsset;

            const { data: activeForms } = await adminClient
              .from("meta_lead_forms")
              .select("id, page_asset_id")
              .eq("company_id", company_id)
              .eq("integration_id", integration_id)
              .eq("form_id", String(formId))
              .eq("status", "active");
            const activeForm = (activeForms || []).find(
              (form: { page_asset_id: string | null }) =>
                !form.page_asset_id || form.page_asset_id === pageAsset.id,
            );

            if (!activeForm) {
              console.warn(`Lead ignored: form ${formId} is not active for page ${pageId}`);
              continue;
            }

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
                    page_asset_id: pageAsset.id,
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
