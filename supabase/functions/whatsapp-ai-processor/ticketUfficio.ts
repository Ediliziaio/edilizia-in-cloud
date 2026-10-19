// Un ticket di Assistenza per l'ufficio quando il bot non può chiudere da solo
// (18/10/2026): un cliente che manda una foto o un vocale, un cliente a cui
// l'assistente non ha potuto rispondere, un numero che il bot non riconosce.
//
// Va nei ticket di Assistenza (la pagina che l'ufficio usa e che fa suonare la
// campanella alla nascita del ticket). Prima finiva in support_tickets, che
// nell'app dell'azienda non si vede da nessuna parte, oppure non nasceva per
// una categoria non ammessa. Uno al giorno per numero: chi scrive dieci volte
// non apre dieci ticket.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface TicketDaWhatsApp {
  companyId: string;
  telefono: string;
  /** «cliente» per i clienti; «api» per i numeri che il bot non riconosce. */
  fonte: "cliente" | "api";
  titolo: string;
  descrizione: string;
}

/** True se il ticket c'è (appena aperto o già aperto oggi per lo stesso numero). */
export async function ticketPerUfficio(supabase: SupabaseClient, t: TicketDaWhatsApp): Promise<boolean> {
  try {
    const { data: aperto } = await supabase.from("tickets").select("id")
      .eq("company_id", t.companyId).eq("fonte", t.fonte).eq("status", "aperto")
      .ilike("subject", `%${t.telefono}%`)
      .gte("created_at", new Date(Date.now() - 24 * 3_600_000).toISOString()).limit(1).maybeSingle();
    if (aperto?.id) return true;
    const titolo = `${t.titolo} · ${t.telefono}`.slice(0, 200);
    const { error } = await supabase.from("tickets").insert({
      company_id: t.companyId,
      customer_id: null,
      subject: titolo,
      titolo,
      descrizione: t.descrizione.slice(0, 2000),
      priorita: "media",
      priority: "normale",
      status: "aperto",
      fonte: t.fonte,
      internal_notes: `Arrivato su WhatsApp dal numero ${t.telefono}: la conversazione è in Conversazioni.`,
    });
    if (error) throw new Error(error.message);
    return true;
  } catch (e) {
    console.error(JSON.stringify({ level: "warn", fn: "ticketPerUfficio", error: String(e) }));
    return false;
  }
}
