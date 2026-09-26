/**
 * Il rapporto del mattino dei clienti marketing.
 *
 * I numeri li prepara il database (mkt_rapporto_mattino: metriche del giorno,
 * allarmi del motore di regole, denaro, priorità di ieri). La forma — tre
 * priorità, una scheda per brand, riepilogo economico — la decide
 * _shared/rapportoMarketingMattino.ts, dal 21/09/2026 nella versione scritta dal
 * titolare. Qui si legge, si aggiunge il motivo per cui manca la spesa e, dopo
 * l'invio, si ricordano le priorità mostrate: il rapporto del giorno dopo dice
 * com'è andata.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { motivoSenzaSpesa } from "../_shared/motivoSenzaSpesa.ts";
import { costruisciRapporto, type DatiRapporto, type Priorita } from "../_shared/rapportoMarketingMattino.ts";

/** Primo giorno del mese e data di oggi, ora di Roma. */
export function meseDiOggi(adesso = new Date()): { mese: string; oggi: string } {
  const oggi = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(adesso);
  return { mese: `${oggi.slice(0, 7)}-01`, oggi };
}

/** L'ora di Roma di adesso (0-23): serve a tenere solo il cron delle 06:00. */
export function oraDiRoma(adesso = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hour: "2-digit", hour12: false }).format(adesso));
}

export async function rapportoClientiMarketing(
  supabase: SupabaseClient,
  urlConsole: string,
): Promise<{ subject: string; html: string; corpo: string; cose: number; clienti: number; priorita: Priorita[]; giorno: string }> {
  let { data, error } = await supabase.rpc("mkt_rapporto_mattino");
  if (error) throw new Error(`mkt_rapporto_mattino: ${error.message}`);
  let r = data as DatiRapporto;
  // Il primo giorno, o se il cron delle 05:30 non è passato: si calcola adesso.
  if (!r || !Array.isArray(r.clienti) || r.clienti.length === 0) {
    const agg = await supabase.rpc("mkt_aggiorna");
    if (agg.error) throw new Error(`mkt_aggiorna: ${agg.error.message}`);
    ({ data, error } = await supabase.rpc("mkt_rapporto_mattino"));
    if (error) throw new Error(`mkt_rapporto_mattino: ${error.message}`);
    r = data as DatiRapporto;
  }

  // Perché di un cliente non si legge la spesa, e cosa fare: il modulo della
  // forma non importa niente, il motivo glielo si passa già scritto.
  for (const c of r.clienti) c.motivo_spesa = motivoSenzaSpesa(c);

  const fatto = costruisciRapporto(r, urlConsole);
  return {
    subject: fatto.subject,
    html: fatto.html,
    corpo: fatto.corpo,
    cose: fatto.priorita.length,
    clienti: fatto.attivi,
    priorita: fatto.priorita,
    giorno: r.giorno,
  };
}

/**
 * Le priorità mostrate stamattina, per il rapporto di domani. Si riscrive il
 * giorno intero: se il rapporto parte due volte, conta l'ultimo.
 */
export async function ricordaPriorita(supabase: SupabaseClient, giorno: string, priorita: Priorita[]): Promise<void> {
  const { error: delErr } = await supabase.from("mkt_rapporto_priorita").delete().eq("giorno", giorno);
  if (delErr) throw new Error(`mkt_rapporto_priorita (pulizia): ${delErr.message}`);
  if (!priorita.length) return;
  const { error } = await supabase.from("mkt_rapporto_priorita").insert(priorita.map((p, i) => ({
    giorno,
    posizione: i + 1,
    chiave: p.chiave,
    allarme_id: p.allarme_id,
    service_client_id: p.service_client_id,
    cliente_nome: p.cliente_nome,
    titolo: p.titolo,
  })));
  if (error) throw new Error(`mkt_rapporto_priorita: ${error.message}`);
}
