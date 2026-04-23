// MP03 — Handler marketing PRODUCTION.
// Canale outbound-only. Inbound: aggiorna broadcast recipient + opt-out +
// route ad assistenza se configurata, altrimenti ticket generico.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { InboundContext } from "../types.ts";
import { persistInboundMessage } from "./_shared.ts";
import { isStopMessage, sendPlainReply } from "./_contact.ts";

function normalizePhone(phone: string): string {
  return (phone ?? "").replace(/[^0-9]/g, "");
}

export async function handleMarketing(
  supabase: SupabaseClient,
  ctx: InboundContext,
): Promise<void> {
  const { waNumber, extracted, senderPhone } = ctx;
  const companyId = waNumber.company_id;

  await persistInboundMessage(supabase, ctx);

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

  const { data: contact } = await supabase
    .from("marketing_contacts")
    .select("id, opt_out")
    .eq("company_id", companyId)
    .eq("telefono_normalized", normalized)
    .maybeSingle();

  if (isStopMessage(extracted.content)) {
    if (contact) {
      await supabase
        .from("marketing_contacts")
        .update({ opt_out: true, opt_out_at: new Date().toISOString() })
        .eq("id", contact.id);
    }
    await sendPlainReply(
      waNumber.id,
      companyId,
      senderPhone,
      "Ok, rimosso dalle nostre comunicazioni. Scrivici pure se cambi idea.",
    );
    return;
  }

  // Route ad assistenza se configurata
  const { data: assistenzaNum } = await supabase
    .from("ai_whatsapp_numbers")
    .select("id")
    .eq("company_id", companyId)
    .eq("purpose", "assistenza")
    .is("deleted_at", null)
    .eq("stato", "active")
    .maybeSingle();

  if (assistenzaNum) {
    const baseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    await fetch(`${baseUrl}/functions/v1/assistenza-ai-processor`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        wa_number_id: assistenzaNum.id,
        contact_id: contact?.id,
        routed_from: "marketing",
        phone: senderPhone,
        content: extracted.content,
      }),
    }).catch(() => {});
    return;
  }

  // Ticket generico
  if (contact) {
    await supabase.from("support_tickets").insert({
      company_id: companyId,
      contact_id: contact.id,
      titolo: "Risposta a broadcast marketing",
      descrizione: extracted.content || "(media non testo)",
      urgenza: "media",
      categoria: "altro",
      source: "whatsapp_marketing",
    });
  }
}
