/**
 * Costo d'acquisto proposto per un materiale della commessa, con la sua fonte.
 * Regole pure: i dati li carica usePrezziProposti.
 *
 * Ordine delle fonti:
 *   1. listino collegato (article_templates: prezzo d'acquisto netto, poi
 *      costo standard);
 *   2. ultimo prezzo pagato dall'azienda per la stessa descrizione e la
 *      stessa unità (righe d'ordine emesse);
 *   3. prezzo scritto nella scomposizione da cui viene il materiale.
 * Se il materiale ha già un prezzo, vale quello: l'offerta aggiudicata o
 * l'ordine lo aggiornano dal database (materiali_prezzo_da_ordine).
 */
import { normalizzaUnita } from "./generaDistinta";

export type FontePrezzo = "listino" | "ultimo_acquisto" | "scomposizione" | "offerta" | "ordine" | "manuale";

export const ETICHETTA_FONTE_PREZZO: Record<FontePrezzo, string> = {
  listino: "Listino",
  ultimo_acquisto: "Ultimo acquisto",
  scomposizione: "Scomposizione",
  offerta: "Offerta aggiudicata",
  ordine: "Ordine",
  manuale: "Scritto a mano",
};

export interface PrezzoProposto {
  prezzo: number;
  fonte: FontePrezzo;
  /** Da dove esattamente: «ODA-2026-014 del 12/09/2026», nome del listino… */
  dettaglio: string | null;
}

/** Come la confronta il database (materiali_ultimi_prezzi): minuscole, spazi singoli. */
export function chiaveDescrizione(s: string | null | undefined): string {
  return (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

const positivo = (n: unknown): n is number => typeof n === "number" ? Number.isFinite(n) && n > 0 : false;
const numero = (n: unknown): number | null => {
  if (n == null || n === "") return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
};

export interface DatiPrezzo {
  /** Unità del materiale (vuota = pezzi). */
  unita: string | null;
  listino?: { nome?: string | null; prezzo_acquisto_netto?: number | null; standard_cost?: number | null } | null;
  ultimoAcquisto?: { prezzo: number | null; unita: string | null; data?: string | null; oda?: string | null } | null;
  scomposizione?: { nome?: string | null; prezzo_unitario: number | null } | null;
}

export function scegliPrezzo(d: DatiPrezzo): PrezzoProposto | null {
  const listino = numero(d.listino?.prezzo_acquisto_netto) ?? null;
  const standard = numero(d.listino?.standard_cost) ?? null;
  const daListino = positivo(listino) ? listino : positivo(standard) ? standard : null;
  if (daListino != null) {
    return { prezzo: daListino, fonte: "listino", dettaglio: d.listino?.nome?.trim() || null };
  }
  const u = d.ultimoAcquisto;
  const prezzoUltimo = numero(u?.prezzo);
  if (u && positivo(prezzoUltimo) && normalizzaUnita(u.unita) === normalizzaUnita(d.unita)) {
    const data = u.data ? new Date(`${u.data.slice(0, 10)}T12:00:00`).toLocaleDateString("it-IT") : null;
    return {
      prezzo: prezzoUltimo,
      fonte: "ultimo_acquisto",
      dettaglio: [u.oda, data ? `del ${data}` : null].filter(Boolean).join(" ") || null,
    };
  }
  const daScomposizione = numero(d.scomposizione?.prezzo_unitario);
  if (positivo(daScomposizione)) {
    return { prezzo: daScomposizione, fonte: "scomposizione", dettaglio: d.scomposizione?.nome?.trim() || null };
  }
  return null;
}

/** Il prezzo che la riga ha già, con la fonte (le righe di prima non la scrivevano). */
export function prezzoAttuale(m: { purchase_price?: number | null; prezzo_fonte?: string | null; article_template_id?: string | null }): PrezzoProposto | null {
  const p = numero(m.purchase_price);
  if (!positivo(p)) return null;
  const fonte = (m.prezzo_fonte as FontePrezzo | null) ?? (m.article_template_id ? "listino" : "manuale");
  return { prezzo: p, fonte: ETICHETTA_FONTE_PREZZO[fonte] ? fonte : "manuale", dettaglio: null };
}

export interface TotaleStimato {
  /** Somma di quantità × prezzo (attuale o proposto). */
  totale: number;
  /** Di cui da prezzi proposti, non ancora scritti sulle righe. */
  proposto: number;
  /** Materiali senza alcun prezzo. */
  senzaPrezzo: number;
}

export function totaleStimato(
  materiali: { id: string; quantity: number; purchase_price?: number | null; prezzo_fonte?: string | null; article_template_id?: string | null }[],
  proposte: Map<string, PrezzoProposto>,
): TotaleStimato {
  let totale = 0;
  let proposto = 0;
  let senzaPrezzo = 0;
  for (const m of materiali) {
    const q = Number(m.quantity) || 0;
    const attuale = prezzoAttuale(m);
    if (attuale) { totale += attuale.prezzo * q; continue; }
    const p = proposte.get(m.id);
    if (p) { totale += p.prezzo * q; proposto += p.prezzo * q; continue; }
    senzaPrezzo++;
  }
  const arrotonda = (n: number) => Math.round(n * 100) / 100;
  return { totale: arrotonda(totale), proposto: arrotonda(proposto), senzaPrezzo };
}
