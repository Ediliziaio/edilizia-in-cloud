import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { getMetaCredentials } from "../_shared/getMetaCredentials.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function verifyHmac(body: string, signature: string, appSecret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(body)
  );
  const expected =
    "sha256=" +
    Array.from(new Uint8Array(sig))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  return expected === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // GET — webhook verification
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    const VERIFY_TOKEN = await getPlatformSetting("whatsapp_verify_token", "WHATSAPP_VERIFY_TOKEN");
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified");
      return new Response(challenge, { status: 200 });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // POST — incoming messages
  if (req.method === "POST") {
    const bodyText = await req.text();
    const signature = req.headers.get("x-hub-signature-256") || "";

    const { metaAppSecret } = await getMetaCredentials();
    if (!(await verifyHmac(bodyText, signature, metaAppSecret))) {
      console.error("Invalid HMAC signature");
      return new Response("Unauthorized", { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    try {
      const payload = JSON.parse(bodyText);
      const entries = payload.entry || [];

      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          if (change.field !== "messages") continue;
          const value = change.value;

          // ── Handle delivery status updates ──
          const statuses = value?.statuses || [];
          for (const status of statuses) {
            const metaMessageId = status.id;
            const newStatus = status.status; // sent, delivered, read, failed
            const timestamp = new Date(parseInt(status.timestamp) * 1000).toISOString();

            const updateData: Record<string, string> = {
              delivery_status: newStatus,
            };
            if (newStatus === "delivered") updateData.delivered_at = timestamp;
            if (newStatus === "read") {
              updateData.delivered_at = updateData.delivered_at || timestamp;
              updateData.read_at = timestamp;
            }

            await supabase
              .from("messaging_messages")
              .update(updateData)
              .eq("meta_message_id", metaMessageId);

            // Also update broadcast recipients if applicable
            const broadcastUpdate: Record<string, string> = { status: newStatus };
            if (newStatus === "delivered") broadcastUpdate.delivered_at = timestamp;
            if (newStatus === "read") broadcastUpdate.read_at = timestamp;

            await supabase
              .from("whatsapp_broadcast_recipients")
              .update(broadcastUpdate)
              .eq("meta_message_id", metaMessageId);
          } // ← close for (const status of statuses)

          if (!value?.messages) continue;

          const phoneNumberId = value.metadata?.phone_number_id;
          if (!phoneNumberId) continue;

          // Find company by phone_number_id
          const { data: config } = await supabase
            .from("messaging_whatsapp_config")
            .select("company_id")
            .eq("phone_number_id", phoneNumberId)
            .eq("is_connected", true)
            .maybeSingle();

          if (!config) {
            console.warn(`No config for phone_number_id: ${phoneNumberId}`);
            continue;
          }

          const companyId = config.company_id;
          const contacts = value.contacts || [];
          const contactMap: Record<string, string> = {};
          for (const c of contacts) {
            contactMap[c.wa_id] = c.profile?.name || c.wa_id;
          }

          for (const msg of value.messages) {
            const senderPhone = msg.from;
            const senderName = contactMap[senderPhone] || senderPhone;
            const content =
              msg.text?.body ||
              msg.caption ||
              (msg.type === "image"
                ? "[Immagine]"
                : msg.type === "document"
                ? "[Documento]"
                : msg.type === "audio"
                ? "[Audio]"
                : msg.type === "video"
                ? "[Video]"
                : "[Messaggio]");

            const messageType =
              msg.type === "text"
                ? "text"
                : msg.type === "image"
                ? "image"
                : msg.type === "document"
                ? "document"
                : msg.type === "audio"
                ? "audio"
                : "text";

            // Find or create conversation
            const { data: existing } = await supabase
              .from("messaging_conversations")
              .select("id")
              .eq("company_id", companyId)
              .eq("phone_number", senderPhone)
              .maybeSingle();

            let conversationId: string;

            if (existing) {
              conversationId = existing.id;
              await supabase
                .from("messaging_conversations")
                .update({
                  last_message_at: new Date().toISOString(),
                  contact_name: senderName,
                  status: "da_gestire",
                })
                .eq("id", conversationId);
            } else {
              const { data: newConv, error: convErr } = await supabase
                .from("messaging_conversations")
                .insert({
                  company_id: companyId,
                  phone_number: senderPhone,
                  contact_name: senderName,
                  contact_type: "sconosciuto",
                  last_message_at: new Date().toISOString(),
                })
                .select("id")
                .single();

              if (convErr) {
                console.error("Error creating conversation:", convErr);
                continue;
              }
              conversationId = newConv.id;
            }

            // Insert message
            const mediaUrl =
              msg.image?.id || msg.document?.id || msg.audio?.id || msg.video?.id
                ? `wa-media://${msg[msg.type]?.id}`
                : null;

            const { error: msgErr } = await supabase
              .from("messaging_messages")
              .insert({
                conversation_id: conversationId,
                sender_type: "contact",
                sender_name: senderName,
                message_type: messageType,
                content,
                media_url: mediaUrl,
              });

            if (msgErr) {
              console.error("Error inserting message:", msgErr);
            }
          }
        }
      }
    } catch (err) {
      console.error("Error processing webhook:", err);
    }

    // Always respond 200 to Meta
    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  return new Response("Method not allowed", { status: 405 });
});
