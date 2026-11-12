import type { DocumentoFiscale } from "@/types/fatturazione";
import { residuoDaIncassare } from "./incassi";

/** Un'unica scelta per desktop e telefono; emissione e invio SDI sono distinti. */
export const STATI_FILTRO_DOCUMENTI = [
  { value: "all", label: "Tutti gli stati" },
  { value: "bozza", label: "Bozza" },
  { value: "emessa", label: "Emesse (tutte)" },
  { value: "pagata", label: "Pagata" },
  { value: "scaduta", label: "Scaduta" },
  { value: "parzialmente_pagata", label: "Parz. pagata" },
  { value: "sdi:da_inviare", label: "Da inviare SDI" },
  { value: "sdi:in_elaborazione", label: "In elaborazione SDI" },
  { value: "sdi:scartata", label: "Scartate dallo SDI" },
];

export function giornoItaliano(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Coerente con elenco_scaduta SQL, anche a mezzanotte e al cambio ora. */
export function getScadenzaInfo(doc: Pick<DocumentoFiscale, "data_scadenza" | "stato" | "totale_da_pagare" | "importo_pagato" | "deleted_at">, now = new Date()) {
  if (!doc.data_scadenza || doc.deleted_at || ["bozza", "annullata", "stornata", "pagata"].includes(doc.stato) || residuoDaIncassare(doc) <= 0) return null;
  const due = doc.data_scadenza.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return null;
  // UTC qui serve solo a sottrarre giorni di calendario, non gli istanti locali.
  const diffDays = Math.round((Date.parse(`${giornoItaliano(now)}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86_400_000);
  if (!Number.isFinite(diffDays)) return null;
  return { scaduta: diffDays > 0, giorni: Math.abs(diffDays), urgente: diffDays > -7 && diffDays <= 0 };
}

/** Regex letterale, quotata per la grammatica PostgREST: niente wildcard
 * involontari o OR iniettati da virgole, parentesi, virgolette e backslash.
 * URLSearchParams (supabase-js) si occupa dell'encoding HTTP una sola volta.
 */
export function testoLetteraleDocumenti(term: string): string {
  const literal = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return `"${literal.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Nessun Date.parse permissivo: 31/02 deve restare testo, non diventare marzo. */
export function dataRicercaDocumenti(term: string): string | undefined {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(term);
  const italiana = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(term);
  if (!iso && !italiana) return;
  const [y, m, d] = iso ? iso.slice(1).map(Number) : [Number(italiana![3]), Number(italiana![2]), Number(italiana![1])];
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function importoRicercaDocumenti(term: string): number | undefined {
  const v = term.replace(/€/g, "").replace(/[\s\u00a0]/g, "");
  if (!/^-?(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(v) && !/^-?\d+\.\d{1,2}$/.test(v)) return;
  const n = Number(v.includes(",") || /^-?\d{1,3}(?:\.\d{3})+$/.test(v) ? v.replace(/\./g, "").replace(",", ".") : v);
  return Number.isFinite(n) && Math.abs(n) < 1e12 ? n : undefined;
}

export function ricercaDocumenti(search: string, operativo = false): string | undefined {
  const term = search.trim();
  if (!term) return undefined;
  const quoted = testoLetteraleDocumenti(term);
  const clauses = ["numero", "note_documento", "elenco_cliente", "cliente_snapshot->>codice_fiscale", "cliente_snapshot->>partita_iva", "note_interne"]
    .map(field => `${field}.imatch.${quoted}`);
  const data = dataRicercaDocumenti(term);
  if (data) clauses.push(`data_emissione.eq.${data}`);
  const importo = importoRicercaDocumenti(term);
  if (importo !== undefined) {
    for (const col of ["imponibile_totale", "totale_documento", "totale_da_pagare", "importo_pagato", ...(operativo ? ["elenco_residuo"] : [])]) clauses.push(`${col}.eq.${importo}`);
  }
  return clauses.join(",");
}
