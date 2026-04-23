// MP01 — Helper condivisi per handler stub (assistenza/lead/marketing/notifiche).
// Persiste il messaggio in whatsapp_messages con wa_number_id per audit.
// In MP3 gli handler reali (assistenza/lead) useranno questo baseline.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { InboundContext } from "../types.ts";

export async function persistInboundMessage(
  supabase: SupabaseClient,
  ctx: InboundContext,
  opts: { processingStatus?: string } = {},
): Promise<string | null> {
  const { waNumber, phoneNumberId, msg, extracted, senderPhone } = ctx;

  // Deduplica su wa_message_id.
  if (msg.id) {
    const { data: seen } = await supabase
      .from("whatsapp_messages")
      .select("id")
      .eq("wa_message_id", msg.id)
      .maybeSingle();
    if (seen) return null;
  }

  const waMessageId =
    msg.id ?? `wa_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  const { data, error } = await supabase
    .from("whatsapp_messages")
    .insert({
      company_id: waNumber.company_id,
      wa_number_id: waNumber.id,
      wa_message_id: waMessageId,
      direction: "inbound",
      from_phone: senderPhone,
      to_phone: phoneNumberId,
      message_type: extracted.messageType,
      content_text: extracted.content,
      media_url: extracted.mediaId ? `wa-media://${extracted.mediaId}` : null,
      metadata: extracted.metadata,
      processing_status: opts.processingStatus ?? "processed",
    })
    .select("id")
    .single();

  if (error) {
    console.error(
      JSON.stringify({
        level: "error",
        fn: "persistInboundMessage",
        msg: "insert failed",
        purpose: waNumber.purpose,
        error: error.message,
      }),
    );
    return null;
  }
  return data.id;
}
