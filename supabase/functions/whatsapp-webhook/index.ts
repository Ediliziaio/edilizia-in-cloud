import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { getMetaCredentials } from "../_shared/getMetaCredentials.ts";
import { corsHeaders } from "../_shared/headers.ts";
import { verifyHmacSha256, sanitizePhoneForQuery } from "../_shared/webhookSecurity.ts";

// P1-2: tipo esplicito per messaggi WhatsApp inbound.
// Evita uso di `any` per il parser extractMessageContent.
interface IncomingWhatsAppMessage {
  id?: string;
  from: string;
  type?: string;
  caption?: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string };
  video?: { id?: string; caption?: string };
  audio?: { id?: string; voice?: boolean };
  document?: { id?: string; filename?: string; mime_type?: string; caption?: string };
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: Array<{ name?: { formatted_name?: string } }>;
  sticker?: { id?: string };
  reaction?: { emoji?: string; message_id?: string };
  interactive?: {
    button_reply?: { id?: string; title?: string };
    list_reply?: { id?: string; title?: string };
  };
  button?: { text?: string; payload?: string };
}

interface ExtractedMessage {
  content: string;
  messageType: string;
  mediaId: string | null;
  metadata: Record<string, unknown> | null;
}

/**
 * P1-2: estrae content + messageType + mediaId + metadata strutturata dal
 * payload Meta. Gestisce tutti i tipi inbound (text, image, video, audio,
 * document, location, contacts, sticker, reaction, interactive, button,
 * unknown). Prima il codice gestiva solo i primi 5 e scartava i dati
 * strutturati (coordinate location, emoji reaction, contatti condivisi).
 */
function extractMessageContent(msg: IncomingWhatsAppMessage): ExtractedMessage {
  const type = msg.type ?? "unknown";
  switch (type) {
    case "text":
      return {
        content: msg.text?.body ?? "",
        messageType: "text",
        mediaId: null,
        metadata: null,
      };
    case "image":
      return {
        content: msg.image?.caption || "[Immagine]",
        messageType: "image",
        mediaId: msg.image?.id ?? null,
        metadata: msg.image?.caption ? { caption: msg.image.caption } : null,
      };
    case "video":
      return {
        content: msg.video?.caption || "[Video]",
        messageType: "video",
        mediaId: msg.video?.id ?? null,
        metadata: msg.video?.caption ? { caption: msg.video.caption } : null,
      };
    case "audio":
      return {
        content: "[Audio]",
        messageType: "audio",
        mediaId: msg.audio?.id ?? null,
        metadata: { voice: msg.audio?.voice ?? false },
      };
    case "document":
      return {
        content: msg.document?.caption || msg.document?.filename || "[Documento]",
        messageType: "document",
        mediaId: msg.document?.id ?? null,
        metadata: {
          filename: msg.document?.filename,
          mime_type: msg.document?.mime_type,
        },
      };
    case "location": {
      const loc = msg.location ?? {};
      const label = loc.name ?? loc.address ?? `${loc.latitude ?? ""},${loc.longitude ?? ""}`;
      return {
        content: `[Posizione] ${label}`,
        messageType: "location",
        mediaId: null,
        metadata: {
          latitude: loc.latitude,
          longitude: loc.longitude,
          name: loc.name,
          address: loc.address,
        },
      };
    }
    case "contacts": {
      const list = msg.contacts ?? [];
      const names = list
        .map((c) => c.name?.formatted_name ?? "Contatto")
        .slice(0, 3)
        .join(", ");
      return {
        content: `[Contatti] ${names || "condivisi"}`,
        messageType: "contacts",
        mediaId: null,
        metadata: { contacts: list },
      };
    }
    case "sticker":
      return {
        content: "[Sticker]",
        messageType: "sticker",
        mediaId: msg.sticker?.id ?? null,
        metadata: null,
      };
    case "reaction":
      return {
        content: `[Reazione ${msg.reaction?.emoji ?? ""}]`.trim(),
        messageType: "reaction",
        mediaId: null,
        metadata: {
          emoji: msg.reaction?.emoji,
          to_message_id: msg.reaction?.message_id,
        },
      };
    case "interactive": {
      const ir = msg.interactive?.button_reply || msg.interactive?.list_reply;
      return {
        content: ir?.title || "[Risposta interattiva]",
        messageType: "interactive",
        mediaId: null,
        metadata: { interactive: msg.interactive },
      };
    }
    case "button":
      return {
        content: msg.button?.text || "[Pulsante]",
        messageType: "button",
        mediaId: null,
        metadata: { payload: msg.button?.payload },
      };
    default:
      return {
        content: `[Messaggio ${type}]`,
        messageType: "unknown",
        mediaId: null,
        metadata: { raw_type: type },
      };
  }
}

// P2-1: verifyHmac locale rimosso; usiamo verifyHmacSha256 timing-safe
// dall'helper _shared/webhookSecurity.ts.

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
    // SICUREZZA: se META_APP_SECRET è vuoto, verifyHmac calcolerebbe HMAC
    // con chiave vuota → firma forgiabile. Rifiutiamo sempre.
    if (!metaAppSecret || metaAppSecret.trim() === "") {
      console.error("META_APP_SECRET non configurato — reject all");
      return new Response("Webhook secret not configured on server", { status: 503 });
    }
    if (!(await verifyHmacSha256(bodyText, signature, metaAppSecret))) {
      console.error("Invalid HMAC signature");
      return new Response("Unauthorized", { status: 401 });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // P0-7: traccia esito elaborazione webhook. Se throwa, ritorniamo 500 così
    // Meta ritenta (retry policy: 15m → 1h → 6h → 24h). La guard idempotency
    // su `whatsapp_messages.wa_message_id` (righe 141-151) previene double-
    // processing dei messaggi già visti in un retry.
    let webhookFailed = false;
    let webhookError: string | null = null;

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
            // IDEMPOTENCY: Meta può ritrasmettere lo stesso webhook se non
            // riceve 200 rapidamente. Guard su whatsapp_messages.wa_message_id
            // (unique) evita doppia insert, doppio trigger automation e bot AI
            // invocato due volte.
            if (msg.id) {
              const { data: seen } = await supabase
                .from("whatsapp_messages")
                .select("id")
                .eq("wa_message_id", msg.id)
                .maybeSingle();
              if (seen) {
                console.log(`[WHATSAPP-WEBHOOK] Skip duplicate message ${msg.id}`);
                continue;
              }
            }

            const senderPhone = msg.from;
            const senderName = contactMap[senderPhone] || senderPhone;

            // P1-2: extractMessageContent gestisce tutti i tipi Meta
            // (text, image, video, audio, document, location, contacts,
            // sticker, reaction, interactive, button, unknown). I dati
            // strutturati (lat/lng per location, emoji per reaction, lista
            // contatti condivisi) finiscono in metadata jsonb invece di
            // essere persi nel fallback generico '[Messaggio]'.
            const { content, messageType, mediaId, metadata: msgMetadata } =
              extractMessageContent(msg as IncomingWhatsAppMessage);

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
            const mediaUrl = mediaId ? `wa-media://${mediaId}` : null;

            const { error: msgErr } = await supabase
              .from("messaging_messages")
              .insert({
                conversation_id: conversationId,
                sender_type: "contact",
                sender_name: senderName,
                message_type: messageType,
                content,
                media_url: mediaUrl,
                metadata: msgMetadata,
              });

            if (msgErr) {
              console.error("Error inserting message:", msgErr);
            }

            // ── AI Bot Processing ──
            // If company has bot_enabled, log in whatsapp_messages and invoke AI processor
            const { data: botConfig } = await supabase
              .from("messaging_whatsapp_config")
              .select("bot_enabled, ai_auto_process")
              .eq("company_id", companyId)
              .eq("is_connected", true)
              .maybeSingle();

            if (botConfig?.bot_enabled) {
              // Log raw message for AI processing. mediaId e metadata sono
              // già estratti da extractMessageContent (P1-2) così il
              // processor AI ha accesso sia al mediaId sia a metadata
              // (coordinate, emoji reaction, filename, etc.) in modo
              // strutturato.
              const waMessageId = msg.id || `wa_${Date.now()}_${Math.random().toString(36).slice(2)}`;

              const { data: waMsg, error: waMsgErr } = await supabase
                .from("whatsapp_messages")
                .insert({
                  company_id: companyId,
                  wa_message_id: waMessageId,
                  direction: "inbound",
                  from_phone: senderPhone,
                  to_phone: phoneNumberId,
                  message_type: messageType,
                  content_text: content,
                  media_url: mediaId ? `wa-media://${mediaId}` : null,
                  metadata: msgMetadata,
                  processing_status: botConfig.ai_auto_process ? "received" : "processed",
                })
                .select("id")
                .single();

              if (waMsgErr) {
                console.error("Error inserting whatsapp_messages:", waMsgErr);
              } else if (botConfig.ai_auto_process && waMsg) {
                // Invoke AI processor asynchronously
                const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
                const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
                fetch(`${supabaseUrl}/functions/v1/whatsapp-ai-processor`, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                    "x-cron-secret": serviceKey,
                  },
                  body: JSON.stringify({ message_id: waMsg.id }),
                }).catch((err) => console.error("Error invoking AI processor:", err));
              }
            }

            // P0-7: Fire automation trigger: whatsapp_received
            // SQL INJECTION FIX: prima usavamo `.or("phone.eq.X,phone.eq.+X")`
            // con template-string interpolation, dove `senderPhone` viene
            // dal payload Meta non fidato. Un attaccante con webhook valido
            // (firma HMAC corretta se trapelato APP_SECRET) poteva forgiare
            // `msg.from` con sintassi DSL PostgREST tipo
            // "39348,phone.eq.OTHER,phone.eq." e bypassare il filtro
            // company_id estraendo contatti di altre aziende.
            // FIX: sanitizziamo il phone a [0-9+] e usiamo `.in()` con array
            // esplicito (PostgREST parametrizza correttamente gli array).
            // P2-1/P2-2: sanitize phone tramite helper condiviso (stesso
            // pattern usato da whatsapp-ai-processor, telnyx-webhook,
            // internal-agent-tools).
            const cleanPhone = sanitizePhoneForQuery(senderPhone);
            if (!cleanPhone) {
              console.warn(`[WHATSAPP-WEBHOOK] senderPhone non valido, skip trigger: ${senderPhone}`);
            } else {
              const digits = cleanPhone.replace(/\+/g, "");
              const phoneCandidates = [digits, `+${digits}`];
              const { data: mktContact } = await supabase
                .from("marketing_contacts")
                .select("id")
                .eq("company_id", companyId)
                .in("phone", phoneCandidates)
                .maybeSingle();

              if (mktContact) {
                // P2-10: trigger canonico unico 'whatsapp_message_received'.
                // P0-7 aveva lasciato 'whatsapp_received' + legacy_events
                // ['customer_replied']. Ora il canonical è
                // 'whatsapp_message_received' e il legacy fallback è
                // gestito dal runner process-automation.
                await supabase.from("automation_trigger_events").insert({
                  company_id: companyId,
                  trigger_event: "whatsapp_message_received",
                  entity_id: mktContact.id,
                  entity_type: "contact",
                  payload: {
                    from: digits,
                    message: content,
                    conversation_id: conversationId,
                    channel: "whatsapp",
                    message_type: messageType,
                    metadata: msgMetadata,
                    legacy_events: ["whatsapp_received", "customer_replied"],
                  },
                });
              }
            }
          }
        }
      }
    } catch (err) {
      webhookFailed = true;
      webhookError = (err as Error).message;
      console.error("Error processing webhook:", err);
    }

    // P0-7: se l'elaborazione è fallita, ritorna 500 così Meta ritenta.
    // Prima ritornavamo sempre 200 e Meta non ri-consegnava mai, perdendo
    // messaggi entrata al cliente in caso di errore transitorio (Postgres
    // down, rate limit, RLS bug).
    if (webhookFailed) {
      return new Response(
        JSON.stringify({ ok: false, error: webhookError }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response("OK", { status: 200, headers: corsHeaders });
  }

  return new Response("Method not allowed", { status: 405 });
});
