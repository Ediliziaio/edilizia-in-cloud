// MP01 — Handler bot_operativo.
// Replica il comportamento pre-MP01 del webhook: insert in
// messaging_conversations + messaging_messages per la UI admin, log in
// whatsapp_messages con wa_number_id (MP01), invocazione async di
// whatsapp-ai-processor, fire del trigger automation whatsapp_message_received.
//
// In MP2 questo handler verrà sostituito da un dispatcher function-calling.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { InboundContext } from "../types.ts";
import { sanitizePhoneForQuery } from "../../_shared/webhookSecurity.ts";

export async function handleBotOperativo(
  supabase: SupabaseClient,
  ctx: InboundContext,
): Promise<void> {
  const { waNumber, phoneNumberId, msg, extracted, senderPhone, senderName } = ctx;
  const companyId = waNumber.company_id;

  // IDEMPOTENCY: se wa_message_id già visto in whatsapp_messages, skip.
  // Meta può ritrasmettere lo stesso payload se non riceve 200 rapidamente.
  if (msg.id) {
    const { data: seen } = await supabase
      .from("whatsapp_messages")
      .select("id")
      .eq("wa_message_id", msg.id)
      .maybeSingle();
    if (seen) {
      console.log(
        JSON.stringify({
          level: "info",
          fn: "handleBotOperativo",
          msg: "skip duplicate",
          wa_message_id: msg.id,
        }),
      );
      return;
    }
  }

  // ── messaging_conversations (UI admin) ────────────────────────────────────
  let conversationId: string;
  const { data: existingConv } = await supabase
    .from("messaging_conversations")
    .select("id")
    .eq("company_id", companyId)
    .eq("phone_number", senderPhone)
    .maybeSingle();

  if (existingConv) {
    conversationId = existingConv.id;
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
    if (convErr || !newConv) {
      console.error(
        JSON.stringify({
          level: "error",
          fn: "handleBotOperativo",
          msg: "conversation insert failed",
          error: convErr?.message,
        }),
      );
      return;
    }
    conversationId = newConv.id;
  }

  // ── messaging_messages (UI admin) ─────────────────────────────────────────
  const mediaUrl = extracted.mediaId ? `wa-media://${extracted.mediaId}` : null;
  const { error: msgErr } = await supabase.from("messaging_messages").insert({
    conversation_id: conversationId,
    sender_type: "contact",
    sender_name: senderName,
    message_type: extracted.messageType,
    content: extracted.content,
    media_url: mediaUrl,
    metadata: extracted.metadata,
  });
  if (msgErr) {
    console.error(
      JSON.stringify({
        level: "error",
        fn: "handleBotOperativo",
        msg: "messaging_messages insert failed",
        error: msgErr.message,
      }),
    );
  }

  // ── whatsapp_messages (log bot + coda AI) ─────────────────────────────────
  // Leggi bot_enabled / ai_auto_process dalla config legacy per retro-compat.
  // In MP2 questi flag verranno migrati su ai_whatsapp_numbers.
  const { data: botConfig } = await supabase
    .from("messaging_whatsapp_config")
    .select("bot_enabled, ai_auto_process")
    .eq("company_id", companyId)
    .eq("is_connected", true)
    .maybeSingle();

  const botEnabled = botConfig?.bot_enabled ?? true;
  const autoProcess = botConfig?.ai_auto_process ?? true;

  if (botEnabled) {
    const waMessageId =
      msg.id ??
      `wa_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const { data: waMsg, error: waMsgErr } = await supabase
      .from("whatsapp_messages")
      .insert({
        company_id: companyId,
        wa_number_id: waNumber.id,
        wa_message_id: waMessageId,
        direction: "inbound",
        from_phone: senderPhone,
        to_phone: phoneNumberId,
        message_type: extracted.messageType,
        content_text: extracted.content,
        media_url: extracted.mediaId ? `wa-media://${extracted.mediaId}` : null,
        metadata: extracted.metadata,
        processing_status: autoProcess ? "received" : "processed",
      })
      .select("id")
      .single();

    if (waMsgErr) {
      console.error(
        JSON.stringify({
          level: "error",
          fn: "handleBotOperativo",
          msg: "whatsapp_messages insert failed",
          error: waMsgErr.message,
        }),
      );
    } else if (autoProcess && waMsg) {
      // Invoca AI processor in fire-and-forget.
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const workerKey = Deno.env.get("INTERNAL_WORKER_KEY") ?? "";
      fetch(`${supabaseUrl}/functions/v1/whatsapp-ai-processor`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-cron-secret": serviceKey,
          // Worker key per autenticare la chiamata interna verso ai-processor
          "x-internal-worker-key": workerKey,
        },
        body: JSON.stringify({ message_id: waMsg.id }),
      }).catch((err) =>
        console.error(
          JSON.stringify({
            level: "error",
            fn: "handleBotOperativo",
            msg: "ai-processor invoke failed",
            error: String(err),
          }),
        ),
      );
    }
  }

  // ── Automation trigger: whatsapp_message_received ─────────────────────────
  // Sanitizza phone (previene SQL-injection stile DSL PostgREST via .in()).
  const cleanPhone = sanitizePhoneForQuery(senderPhone);
  if (!cleanPhone) return;

  const digits = cleanPhone.replace(/\+/g, "");
  const phoneCandidates = [digits, `+${digits}`];

  const { data: mktContact } = await supabase
    .from("marketing_contacts")
    .select("id")
    .eq("company_id", companyId)
    .in("phone", phoneCandidates)
    .maybeSingle();

  if (mktContact) {
    await supabase.from("automation_trigger_events").insert({
      company_id: companyId,
      trigger_event: "whatsapp_message_received",
      entity_id: mktContact.id,
      entity_type: "contact",
      payload: {
        from: digits,
        message: extracted.content,
        conversation_id: conversationId,
        channel: "whatsapp",
        message_type: extracted.messageType,
        metadata: extracted.metadata,
        wa_number_id: waNumber.id,
        purpose: waNumber.purpose,
        legacy_events: ["whatsapp_received", "customer_replied"],
      },
    });
  }
}
