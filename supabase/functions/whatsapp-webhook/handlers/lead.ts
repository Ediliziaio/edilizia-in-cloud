// MP03 — Handler lead PRODUCTION.
// Click-to-WhatsApp da advertising → qualifica in 4-6 turni via lead-ai-processor.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { InboundContext } from "../types.ts";
import { messaggioGiaRicevuto, persistInboundMessage } from "./_shared.ts";
import {
  avvisaAutomazioni,
  isStopMessage,
  resolveOrCreateContact,
  sendPlainReply,
} from "./_contact.ts";

export async function handleLead(
  supabase: SupabaseClient,
  ctx: InboundContext,
): Promise<void> {
  const { waNumber, extracted, senderPhone } = ctx;

  if (await messaggioGiaRicevuto(supabase, ctx)) return;

  const contact = await resolveOrCreateContact(supabase, senderPhone, waNumber.company_id, {
    tipo: "lead",
    stato: "lead_nuovo",
    source: "whatsapp_lead",
    firstMessage: extracted.content,
    profileName: ctx.senderName,
  });

  // Il messaggio si salva anche se il contatto non si è potuto trovare né
  // creare: prima in quel caso andava perso.
  const messageId = await persistInboundMessage(supabase, ctx, { contactId: contact?.id ?? null });

  if (!contact) return;

  if (isStopMessage(extracted.content)) {
    await supabase
      .from("marketing_contacts")
      .update({
        opt_out: true,
        optout_whatsapp: true,
        stato: "lead_scartato_opt_out",
        opt_out_at: new Date().toISOString(),
      })
      .eq("id", contact.id);
    await sendPlainReply(
      waNumber.id,
      waNumber.company_id,
      senderPhone,
      "Ok, rimosso dalle nostre comunicazioni. Scrivici pure se cambi idea.",
    );
    return;
  }

  await avvisaAutomazioni(supabase, ctx, contact.id, messageId);

  const baseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Numero con un agente dell'azienda (25/09/2026): risponde lui, col prompt,
  // il calendario e le fasi scelte dall'azienda. Niente ramo «già qualificato
  // → ticket»: la conversazione la segue l'agente o, se è in pausa, una persona.
  if (waNumber.agent_id) {
    fetch(`${baseUrl}/functions/v1/lead-agente-whatsapp`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceKey}` },
      body: JSON.stringify({ message_id: messageId, contact_id: contact.id, wa_number_id: waNumber.id }),
    }).catch((err) =>
      console.error(JSON.stringify({ level: "error", fn: "handleLead", msg: "lead-agente-whatsapp non chiamato", error: String(err) }))
    );
    return;
  }

  // Lead già qualificato → handoff commerciale (skip AI)
  if (
    contact.stato === "lead_qualificato" ||
    contact.stato === "lead_handoff_fatto"
  ) {
    await supabase.from("support_tickets").insert({
      company_id: waNumber.company_id,
      contact_id: contact.id,
      titolo: "Follow-up lead qualificato",
      descrizione: `Lead già qualificato ha scritto nuovo messaggio:\n\n${(extracted.content ?? "").substring(0, 500)}`,
      urgenza: "media",
      categoria: "modifica_ordine",
      source: "whatsapp_lead",
    });
    return;
  }

  fetch(`${baseUrl}/functions/v1/lead-ai-processor`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      message_id: messageId,
      contact_id: contact.id,
      wa_number_id: waNumber.id,
    }),
  }).catch((err) =>
    console.error(
      JSON.stringify({
        level: "error",
        fn: "handleLead",
        msg: "lead processor invoke failed",
        error: String(err),
      }),
    )
  );
}
