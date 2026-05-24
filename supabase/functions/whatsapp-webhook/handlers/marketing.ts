// MP03 — Handler marketing PRODUCTION.
// Canale commerciale. Inbound: aggiorna broadcast recipient, gestisce opt-out
// e apre una coda umana per l'ufficio marketing/commerciale.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { InboundContext } from "../types.ts";
import { persistInboundMessage } from "./_shared.ts";
import { isStopMessage, markOptOut, resolveOrCreateContact, sendPlainReply } from "./_contact.ts";

function normalizePhone(phone: string): string {
  return (phone ?? "").replace(/[^0-9]/g, "");
}

export async function handleMarketing(
  supabase: SupabaseClient,
  ctx: InboundContext,
): Promise<void> {
  const { waNumber, extracted, senderPhone } = ctx;
  const companyId = waNumber.company_id;

  const messageId = await persistInboundMessage(supabase, ctx);

  const normalized = normalizePhone(senderPhone);

  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data: recipient } = await supabase
    .from("whatsapp_broadcast_recipients")
    .select("id, broadcast_id, contact_id")
    .eq("phone_number", senderPhone)
    .gte("created_at", since)
    .in("status", ["sent", "delivered", "read"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recipient) {
    await supabase
      .from("whatsapp_broadcast_recipients")
      .update({ status: "replied", read_at: new Date().toISOString() })
      .eq("id", recipient.id);
  }

  const contact = await resolveOrCreateContact(supabase, senderPhone, companyId, {
    tipo: "lead",
    stato: "whatsapp_da_gestire",
    source: "whatsapp_marketing",
    firstMessage: extracted.content,
  });

  if (isStopMessage(extracted.content)) {
    if (contact) {
      await markOptOut(supabase, contact.id);
    }
    await sendPlainReply(
      waNumber.id,
      companyId,
      senderPhone,
      "Ok, rimosso dalle nostre comunicazioni. Scrivici pure se cambi idea.",
    );
    return;
  }

  // Marketing deve restare in mano all'ufficio: Silvio prepara contesto,
  // ma non rimbalza automaticamente la risposta verso assistenza AI.
  if (contact) {
    await supabase.from("marketing_contact_activities").insert({
      company_id: companyId,
      contact_id: contact.id,
      activity_type: "whatsapp_marketing_reply",
      description: extracted.content || "(messaggio WhatsApp con media)",
      metadata: {
        wa_number_id: waNumber.id,
        wa_message_id: ctx.msg.id ?? null,
        message_id: messageId,
        phone: senderPhone,
        normalized_phone: normalized,
        purpose: "marketing",
      },
    });

    await supabase.from("support_tickets").insert({
      company_id: companyId,
      contact_id: contact.id,
      titolo: "Risposta WhatsApp marketing da gestire",
      descrizione: `Messaggio da ${senderPhone}:\n\n${extracted.content || "(media non testo)"}`,
      urgenza: "media",
      categoria: "commerciale",
      source: "whatsapp_marketing",
      stato: "aperto",
      channel_msg_id: messageId,
    });
  }
}
