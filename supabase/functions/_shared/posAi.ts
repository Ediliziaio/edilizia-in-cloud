import { normalizzaLavorazione, type Lavorazione } from "./posModello.ts";

const MAX_LAVORAZIONI = 30;
const MAX_TESTO = 3000;

/** Rischi, misure e DPI arrivano come elenchi: nella scheda diventano righe. */
const righe = (v: unknown): unknown => (Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.trim()).join("\n") : v);
const testo = (v: unknown): unknown => (typeof v === "string" ? v.slice(0, MAX_TESTO) : righe(v) === v ? v : String(righe(v)).slice(0, MAX_TESTO));

/**
 * Le schede proposte dall'AI diventano lavorazioni da rileggere. Si tengono solo i campi di testo della scheda: id,
 * fase, prodotti riesaminati, segnaletica, scheda tecnica e riscontri nominativi li decide chi compila il POS, mai la
 * risposta di un modello (un id ripetuto, per esempio, rendeva la seconda lavorazione non approvabile).
 */
export function lavorazioniDaRispostaAi(elenco: unknown[], base: string): Lavorazione[] {
  return elenco
    .slice(0, MAX_LAVORAZIONI * 2)
    .map((l) => (l && typeof l === "object" ? (l as Record<string, unknown>) : {}))
    .map((o) => ({
      titolo: testo(o.titolo), descrizione: testo(o.descrizione), modalita: testo(o.modalita), sostanze: testo(o.sostanze),
      opere_provvisionali: testo(o.opere_provvisionali), macchine: testo(o.macchine), impianti: testo(o.impianti), turni: testo(o.turni),
      rischi: testo(o.rischi), misure: testo(o.misure), dpi: testo(o.dpi),
      durata_giorni: o.durata_giorni, svolgimento: o.svolgimento, svolgimento_con: testo(o.svolgimento_con),
    }))
    .map((c, i) => ({ ...normalizzaLavorazione(c, `${base}-${i + 1}`), id: `${base}-${i + 1}`, origine: "ai" as const, verificata: false }))
    .filter((l) => l.titolo.trim() || l.descrizione.trim())
    .slice(0, MAX_LAVORAZIONI);
}
