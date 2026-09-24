// MP03 — Handler marketing PRODUCTION.
// Canale commerciale. Inbound: aggiorna broadcast recipient, gestisce opt-out,
// lega la risposta al contatto e fa partire le automazioni «Quando arriva un
// WhatsApp». La coda umana è Conversazioni: la risposta arriva lì come non letta.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { InboundContext } from "../types.ts";
import { messaggioGiaRicevuto, persistInboundMessage } from "./_shared.ts";
import {
  avvisaAutomazioni,
  isStopMessage,
  markOptOut,
  resolveOrCreateContact,
  sendPlainReply,
} from "./_contact.ts";

function normalizePhone(phone: string): string {
  return (phone ?? "").replace(/[^0-9]/g, "");
}

export async function handleMarketing(
  supabase: SupabaseClient,
  ctx: InboundContext,
): Promise<void> {
  const { waNumber, extracted, senderPhone } = ctx;
  const companyId = waNumber.company_id;

  if (await messaggioGiaRicevuto(supabase, ctx)) return;

  const contact = await resolveOrCreateContact(supabase, senderPhone, companyId, {
    tipo: "lead",
    stato: "whatsapp_da_gestire",
    source: "whatsapp_marketing",
    firstMessage: extracted.content,
    profileName: ctx.senderName,
  });

  const messageId = await persistInboundMessage(supabase, ctx, { contactId: contact?.id ?? null });

  const normalized = normalizePhone(senderPhone);

  // Risposta a un broadcast degli ultimi 30 giorni. I destinatari hanno il
  // contatto e il numero in sole cifre (whatsapp-broadcast); prima si cercava
  // in colonne che la tabella non ha (phone_number, created_at).
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  let destinatari = supabase
    .from("whatsapp_broadcast_recipients")
    .select("id")
    .gte("sent_at", since)
    .in("status", ["sent", "delivered", "read"]);
  destinatari = contact
    ? destinatari.eq("contact_id", contact.id)
    : destinatari.in("phone", [normalized, normalized.replace(/^39(?=\d{9})/, "")]);
  const { data: recipient } = await destinatari
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (recipient) {
    await supabase
      .from("whatsapp_broadcast_recipients")
      .update({ status: "replied", read_at: new Date().toISOString() })
      .eq("id", recipient.id);
  }

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

    // Prima qui si apriva un ticket di assistenza per ogni messaggio, con una
    // categoria che il database non accetta: non ne è mai nato uno. La coda è
    // Conversazioni (non letti, assegnazione); chi vuole un'azione in più la
    // costruisce con l'automazione «Quando arriva un WhatsApp».
    await avvisaAutomazioni(supabase, ctx, contact.id, messageId);
  }
}
