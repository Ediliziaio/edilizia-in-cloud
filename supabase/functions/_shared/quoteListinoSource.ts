/**
 * Il listino AZIENDALE dei computi edili come fonte di prezzi per la chat AI.
 *
 * Prima la chat dei computi non leggeva il listino dell'azienda: le righe proposte nascevano senza prezzo e senza
 * collegamento (`listino_voce_id` nullo), anche con il listino pieno. Qui ogni modulo ha una «fonte» fissa (un id
 * riservato, riconoscibile) e le sue voci diventano riferimenti come quelli del prezzario: stesso meccanismo di
 * ranking, stessi controlli di corrispondenza, stesso percorso fino alla riga del computo.
 *
 * Il listino si legge SEMPRE filtrato per l'azienda della richiesta (già verificata da JWT, appartenenza e permesso).
 * Nessuna importazione remota: il file è usato anche dal browser per le costanti.
 */
import type { QuoteChatProposal, QuoteChatReference } from "./quoteConversation.ts";
import { CATALOGUE_LIMITS, rankCatalogueReferences } from "./quoteCatalogue.ts";

export const QUOTE_LISTINO_SOURCES = {
  bagni: { id: "00000000-0000-4000-b000-000000000001", table: "bgn_listino_voci", label: "Bagni" },
  climatizzazione: { id: "00000000-0000-4000-b000-000000000002", table: "clm_listino_voci", label: "Climatizzazione" },
  elettrico: { id: "00000000-0000-4000-b000-000000000003", table: "ele_listino_voci", label: "Elettrico" },
  termoidraulico: { id: "00000000-0000-4000-b000-000000000004", table: "idr_listino_voci", label: "Termoidraulico" },
  pavimenti: { id: "00000000-0000-4000-b000-000000000005", table: "pav_listino_voci", label: "Pavimenti" },
  piscine: { id: "00000000-0000-4000-b000-000000000006", table: "pis_listino_voci", label: "Piscine" },
  ristrutturazione: { id: "00000000-0000-4000-b000-000000000007", table: "rst_listino_voci", label: "Ristrutturazione" },
  tetti: { id: "00000000-0000-4000-b000-000000000008", table: "tet_listino_voci", label: "Tetti" },
} as const;
export type QuoteListinoModule = keyof typeof QUOTE_LISTINO_SOURCES;

const BY_ID = new Map<string, { table: string; label: string; module: QuoteListinoModule }>(
  (Object.entries(QUOTE_LISTINO_SOURCES) as Array<[QuoteListinoModule, (typeof QUOTE_LISTINO_SOURCES)[QuoteListinoModule]]>)
    .map(([module, s]) => [s.id, { table: s.table, label: s.label, module }]),
);
export const listinoSourceById = (id: string | null | undefined) => (id ? BY_ID.get(id.toLowerCase()) ?? null : null);
export const isListinoSourceId = (id: string | null | undefined) => !!listinoSourceById(id);
export const listinoSourceName = (id: string) => `Listino aziendale · ${listinoSourceById(id)?.label ?? "computo"}`;

type Row = { id: string; codice: string | null; descrizione: string; unita_misura: string | null; prezzo_unitario: number | string | null; note: string | null };
// Il database arriva da fuori (client Supabase o finto nei test): solo la forma che serve.
type ListinoDb = { from(table: string): any }; // eslint-disable-line @typescript-eslint/no-explicit-any
const COLUMNS = "id,codice,descrizione,unita_misura,prezzo_unitario,note";
/** Fino a questa dimensione si legge l'intero listino e si ordina qui: più robusto di un filtro per parole. */
const WHOLE_LISTINO_MAX = 400;

function toReference(row: Row, sourceId: string): QuoteChatReference | null {
  if (!row?.id || !row.descrizione?.trim()) return null;
  const price = Number(row.prezzo_unitario);
  const description = [row.descrizione.trim(), row.note?.trim()].filter(Boolean).join(" — ").slice(0, 6000);
  return {
    id: row.id, sourceId, code: (row.codice?.trim() || `LIS-${row.id.slice(0, 8)}`).slice(0, 160), description,
    unit: (row.unita_misura ?? "").slice(0, 40), price: Number.isFinite(price) && price > 0 && price <= 1_000_000 ? price : null,
    sourceName: listinoSourceName(sourceId),
  };
}

export async function searchListinoSource(
  db: ListinoDb, companyId: string, sourceId: string, terms: string[], existingIds: string[], targets: QuoteChatProposal[], signal?: AbortSignal,
): Promise<QuoteChatReference[]> {
  const source = listinoSourceById(sourceId); if (!source) return [];
  const rows = new Map<string, QuoteChatReference>();
  const keep = (data: Row[] | null) => { for (const row of data ?? []) { const ref = toReference(row, sourceId); if (ref) rows.set(ref.id, ref); } };
  const select = () => { let q = db.from(source.table).select(COLUMNS).eq("company_id", companyId); if (signal) q = q.abortSignal(signal); return q; };

  if (existingIds.length) {
    const { data, error } = await select().in("id", existingIds.slice(0, CATALOGUE_LIMITS.existing)).limit(CATALOGUE_LIMITS.existing);
    if (error) throw new Error("Lettura del listino non riuscita");
    keep(data);
  }
  const all = await select().order("ordine", { ascending: true }).limit(WHOLE_LISTINO_MAX + 1);
  if (all.error) throw new Error("Lettura del listino non riuscita");
  if ((all.data?.length ?? 0) <= WHOLE_LISTINO_MAX) keep(all.data);
  else {
    // Listino grande: si cerca per parole (solo lettere e cifre, mai caratteri del filtro).
    const words = [...new Set(terms.flatMap(t => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().match(/[a-z0-9]{3,}/g) ?? []))].slice(0, 6);
    if (words.length) {
      const filter = words.flatMap(w => [`descrizione.ilike.%${w}%`, `codice.ilike.%${w}%`]).join(",");
      const { data, error } = await select().or(filter).order("ordine", { ascending: true }).limit(CATALOGUE_LIMITS.rowsPerQuery * 2);
      if (error) throw new Error("Ricerca nel listino non riuscita");
      keep(data);
    }
  }
  return rankCatalogueReferences([...rows.values()], targets, existingIds);
}
