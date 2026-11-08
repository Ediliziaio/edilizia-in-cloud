// Lo scaduto da incassare per Silvio e il brief del mattino, con la regola del
// Previsionale di cassa (08/11/2026).
//
// Fino a oggi Silvio rispondeva con silvio_tool_overdue_payments: le sole rate
// delle commesse, senza la finanziaria. L'app dal 08/11/2026 dice un altro
// numero, quello del Previsionale (rate, scadenze e fatture una volta sola:
// src/lib/finance/incassiScaduti.ts). Qui lo stesso calcolo, dallo stesso
// codice: caricaPrevisionale legge le fonti col client del servizio,
// incassiScaduti le filtra. La risposta ha la stessa forma di prima (count,
// total_overdue_eur, priorita_recupero…), così chi la legge non cambia.
//
// Se il Previsionale non riesce a caricare, si ripiega sulla RPC di prima e lo
// si dice in data_quality: meglio il numero delle rate che nessun numero.
import { loadForecastDataset, type ReadClient } from "../../../src/lib/finance/caricaPrevisionale.ts";
import { incassiScaduti } from "../../../src/lib/finance/incassiScaduti.ts";

// deno-lint-ignore no-explicit-any
type Supa = any;

const giorniFra = (da: string, a: string) =>
  Math.round((new Date(`${a}T12:00:00`).getTime() - new Date(`${da}T12:00:00`).getTime()) / 86_400_000);

export async function scadutoPrevisionale(supabase: Supa, companyId: string, oggi = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" })) {
  let dataset;
  try {
    dataset = await loadForecastDataset(companyId, oggi, supabase as ReadClient);
  } catch (e) {
    const { data, error } = await supabase.rpc("silvio_tool_overdue_payments", { p_company_id: companyId });
    if (error) throw error;
    return {
      ...(data ?? {}),
      data_quality: {
        ...((data as { data_quality?: object })?.data_quality ?? {}),
        fonte: "solo rate delle commesse (il Previsionale non si è caricato)",
        errore_previsionale: e instanceof Error ? e.message : String(e),
      },
    };
  }
  const scaduti = incassiScaduti(dataset.movements, dataset.today)
    .map((m) => ({ m, giorni: giorniFra(m.date!, dataset.today), euro: m.cents / 100 }))
    .map((x) => ({ ...x, punteggio: x.euro + Math.max(0, x.giorni) * 50 }))
    .sort((a, b) => b.punteggio - a.punteggio || b.giorni - a.giorni || b.euro - a.euro);
  const totale = Math.round(scaduti.reduce((t, x) => t + x.m.cents, 0)) / 100;
  const voci = scaduti.map((x, i) => ({
    priorita_num: i + 1,
    priorita: i < 3 ? "alta" : i < 6 ? "media" : "bassa",
    priority_score: Math.round(x.punteggio * 100) / 100,
    commessa: x.m.orderLabel ?? null,
    cliente: x.m.counterparty || "Cliente",
    rata: x.m.description,
    fonte: x.m.source,
    importo_eur: x.euro,
    data_attesa: x.m.date,
    giorni_ritardo: x.giorni,
    azione_suggerita: x.giorni >= 30
      ? "telefonata oggi + promessa pagamento scritta"
      : x.euro >= 5000 ? "telefonata oggi + sollecito formale" : "sollecito email/whatsapp oggi",
  }));
  const avvisi: string[] = [];
  if (voci.length === 0) avvisi.push("overdue_receivables_missing");
  if (dataset.issues.length) avvisi.push(`fonti non lette: ${dataset.issues.join(", ")}`);
  return {
    totale_scaduti: voci.length,
    count: voci.length,
    importo_totale_eur: totale,
    total_overdue_eur: totale,
    data_quality: {
      overdue_receivables_count: voci.length,
      fonte: "Previsionale di cassa: rate delle commesse, scadenze e fatture, una volta sola (lo stesso numero del Cruscotto)",
      warnings: avvisi,
    },
    rate_scadute: voci,
    priorita_recupero: voci,
  };
}
