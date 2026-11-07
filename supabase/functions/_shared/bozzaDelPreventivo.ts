/**
 * La bozza del preventivo classico mandata per il PDF vero a destra dell'editor (07/11/2026).
 *
 * Florin: «a destra vorrei vedere l'anteprima proprio del PDF che si va a generare». Il PDF del preventivo
 * classico lo fa `generate-quote-pdf`; mentre si scrive, il preventivo non è ancora salvato (il salvataggio
 * automatico passa ogni minuto). Allora l'editor manda la bozza com'è sullo schermo e il server la stampa con
 * la stessa strada del PDF vero. Qui si legge la bozza e si decide cosa NON può cambiare: identità, numero,
 * stato, firma e condizioni fissate restano quelli del database.
 */

// deno-lint-ignore no-explicit-any
type Riga = Record<string, any>;

export interface BozzaDelPreventivo {
  quote: Riga;
  items: Riga[];
}

/** Oltre, la bozza non è un preventivo che si sta scrivendo: si rifiuta. */
export const RIGHE_MASSIME_BOZZA = 1000;

const numero = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Come la colonna generata `quote_items.line_total`: quantità × prezzo × (1 − sconto%), a due decimali. */
export function totaleRiga(r: Riga): number {
  const lordo = numero(r.quantity) * numero(r.unit_price) * (1 - numero(r.discount_percent) / 100);
  return Math.round(lordo * 100) / 100;
}

/** I campi che vengono dal database e che la bozza non tocca. */
const DAL_DATABASE = [
  "id", "company_id", "quote_number", "status", "created_at", "created_by", "signed_at", "signature_token",
  "pdf_storage_path", "pdf_generated_at", "condizioni_origine", "source", "opportunity_id", "accepted_at",
] as const;

export function campiNonDaBozza(dalDatabase: Riga): Riga {
  return Object.fromEntries(DAL_DATABASE.filter((k) => k in dalDatabase).map((k) => [k, dalDatabase[k]]));
}

/** La bozza ricevuta, controllata. Null se non è una bozza leggibile. */
export function leggiBozzaDelPreventivo(valore: unknown, adesso: Date = new Date()): BozzaDelPreventivo | null {
  if (!valore || typeof valore !== "object") return null;
  const v = valore as { quote?: unknown; items?: unknown };
  if (!v.quote || typeof v.quote !== "object" || Array.isArray(v.quote)) return null;
  if (!Array.isArray(v.items) || v.items.length > RIGHE_MASSIME_BOZZA) return null;
  const quote: Riga = { ...(v.quote as Riga) };
  for (const k of DAL_DATABASE) if (k !== "company_id") delete quote[k];
  // La scadenza la calcola il database a ogni salvataggio: adesso + giorni di validità.
  const giorni = numero(quote.validity_days);
  if (giorni > 0) quote.expires_at = new Date(adesso.getTime() + giorni * 86_400_000).toISOString();
  const items = (v.items as unknown[])
    .filter((r): r is Riga => !!r && typeof r === "object" && !Array.isArray(r))
    .map((r, i) => ({ ...r, id: typeof r.id === "string" ? r.id : `bozza-${i + 1}`, sort_order: i, line_total: totaleRiga(r) }));
  return { quote, items };
}

/**
 * Il preventivo da stampare: quello salvato, con sopra la bozza. Quello che non si cambia scrivendo resta del
 * database; la scadenza resta quella salvata finché i giorni di validità sono gli stessi (il salvataggio la
 * ricalcola solo se cambiano), altrimenti l'anteprima direbbe una validità diversa dal PDF scaricato.
 */
export function unisciBozza(dalDatabase: Riga, bozza: BozzaDelPreventivo): Riga {
  const unito: Riga = { ...dalDatabase, ...bozza.quote, ...campiNonDaBozza(dalDatabase) };
  const stessiGiorni = numero(bozza.quote.validity_days) === numero(dalDatabase.validity_days);
  if (stessiGiorni && dalDatabase.expires_at) unito.expires_at = dalDatabase.expires_at;
  return unito;
}

