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

  // v8.6.74 (FIX B6) — IDEMPOTENCY ATOMICA via reserve-insert su
  // whatsapp_messages PRIMA di toccare messaging_conversations/messages.
  //
  // PRIMA: il check faceva SELECT su whatsapp_messages.wa_message_id; tra
  // SELECT (vuoto) e successivo INSERT messaging_messages c'era una race
  // condition — se Meta reinviava lo stesso payload, due webhook concorrenti
  // arrivavano qui contemporaneamente, entrambi vedevano "non visto" e
  // inserivano due messaging_messages (doppione in UI admin chat).
  //
  // DOPO: facciamo subito un INSERT su whatsapp_messages con
  //   ON CONFLICT (wa_message_id) DO NOTHING (vincolo unique già esistente).
  // Se l'insert ritorna 0 righe → un altro worker ha già preso in carico →
  // skip totale. Garantisce single-execution end-to-end del side-effect.
  let reservedWaMsgId: string | null = null;
  if (msg.id) {
    const placeholderMessageType = extracted.messageType ?? "text";
    const { data: reserved, error: reserveErr } = await supabase
      .from("whatsapp_messages")
      .insert({
        company_id: companyId,
        wa_number_id: waNumber.id,
        wa_message_id: msg.id,
        direction: "inbound",
        from_phone: senderPhone,
        to_phone: phoneNumberId,
        message_type: placeholderMessageType,
        content_text: extracted.content,
        media_url: extracted.mediaId ? `wa-media://${extracted.mediaId}` : null,
        metadata: extracted.metadata,
        processing_status: "received",
      })
      .select("id")
      .maybeSingle();

    if (reserveErr) {
      // Se è un conflict UNIQUE su wa_message_id → duplicato. Skip silenzioso.
      // Codice 23505 = unique_violation in Postgres.
      const isDuplicate =
        reserveErr.code === "23505" ||
        (reserveErr.message ?? "").toLowerCase().includes("duplicate") ||
        (reserveErr.message ?? "").toLowerCase().includes("unique");
      if (isDuplicate) {
        console.log(
          JSON.stringify({
            level: "info",
            fn: "handleBotOperativo",
            msg: "skip duplicate (atomic insert conflict)",
            wa_message_id: msg.id,
          }),
        );
        return;
      }
      // Altri errori → log e prosegui senza reservation (best-effort, no race
      // protection ma evitiamo perdere il messaggio per errori transitori).
      console.error(
        JSON.stringify({
          level: "error",
          fn: "handleBotOperativo",
          msg: "whatsapp_messages reservation insert failed",
          error: reserveErr.message,
          wa_message_id: msg.id,
        }),
      );
    } else {
      reservedWaMsgId = reserved?.id ?? null;
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

  // ── Bot config (dual-read MP2 + legacy fallback) ─────────────────────────
  // v8.6.74 (FIX B1) — Prima si leggeva SOLO da messaging_whatsapp_config
  // (legacy). Se il cliente disconnetteva la config legacy ma manteneva il
  // numero in ai_whatsapp_numbers, perdeva il controllo bot. Ora:
  //   1. preferenza: ai_whatsapp_numbers.operational_settings (MP2)
  //   2. fallback:   messaging_whatsapp_config (retro-compat)
  //   3. default:    bot_enabled=true, ai_auto_process=true
  const opSettings = (waNumber as Record<string, unknown>).operational_settings as
    | { bot_enabled?: boolean; ai_auto_process?: boolean }
    | null
    | undefined;

  let botEnabled: boolean | undefined = opSettings?.bot_enabled;
  let autoProcess: boolean | undefined = opSettings?.ai_auto_process;

  if (botEnabled === undefined || autoProcess === undefined) {
    const { data: botConfig } = await supabase
      .from("messaging_whatsapp_config")
      .select("bot_enabled, ai_auto_process")
      .eq("company_id", companyId)
      .eq("is_connected", true)
      .maybeSingle();
    if (botEnabled === undefined) botEnabled = botConfig?.bot_enabled;
    if (autoProcess === undefined) autoProcess = botConfig?.ai_auto_process;
  }

  // Default permissivo se nessuna fonte ha valori (nuovo onboarding)
  if (botEnabled === undefined) botEnabled = true;
  if (autoProcess === undefined) autoProcess = true;

  // ── whatsapp_messages (coda AI) ──────────────────────────────────────────
  // L'insert principale è già stato fatto in fase di reservation (sopra)
  // come parte del fix B6. Qui aggiorniamo solo il processing_status se
  // l'auto-process è disabilitato (mark immediato "processed" così la
  // recovery cron non lo riprende per retry).
  if (botEnabled && reservedWaMsgId) {
    if (!autoProcess) {
      await supabase
        .from("whatsapp_messages")
        .update({ processing_status: "processed" })
        .eq("id", reservedWaMsgId);
    } else {
      // Invoca AI processor in fire-and-forget.
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const workerKey = Deno.env.get("INTERNAL_WORKER_KEY") ?? "";
      // v8.6.74 — Se workerKey è vuoto NON chiamiamo: ai-processor ora rifiuta
      // hard 503/401 senza key (vedi fix B2). Loggiamo per setup operativo.
      if (!workerKey) {
        console.error(
          JSON.stringify({
            level: "error",
            fn: "handleBotOperativo",
            msg: "INTERNAL_WORKER_KEY mancante — ai-processor non invocato",
            wa_message_id: reservedWaMsgId,
          }),
        );
      } else {
        // waitUntil: senza, la chiamata poteva morire con la risposta a Meta
        // (stesso schema del gestore lead).
        const chiamata = fetch(`${supabaseUrl}/functions/v1/whatsapp-ai-processor`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cron-secret": serviceKey,
            "x-internal-worker-key": workerKey,
          },
          body: JSON.stringify({ message_id: reservedWaMsgId }),
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
        // deno-lint-ignore no-explicit-any
        (globalThis as any).EdgeRuntime?.waitUntil?.(chiamata);
      }
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
