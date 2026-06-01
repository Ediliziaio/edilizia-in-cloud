/**
 * #44/#50 — Sorgente unica per "dove è usata" una tariffa.
 *
 * Le tabelle che referenziano `tariffe_aziendali.id` sono elencate qui una sola
 * volta, così sia il dialog "Dove è usata" sia la guardia anti-eliminazione
 * (conferma di delete) usano lo stesso elenco e non possono divergere.
 *
 * Approccio: conteggi `head:true` per-sorgente lanciati in parallelo. Nessuna
 * migration: ci si appoggia alle FK già esistenti verso `tariffe_aziendali.id`
 * e all'isolamento per-azienda via RLS (la tariffa è company-scoped e l'id è un
 * UUID globale, quindi il filtro per FK è sufficiente e sicuro). Le sorgenti non
 * interrogabili (tabella assente in un ambiente o policy che nega la SELECT)
 * vengono ignorate con grazia (ok:false → escluse dal totale).
 *
 * Modulo "puro" lato dati: nessun JSX/icona qui, così è riutilizzabile ovunque.
 * Le icone sono mappate dal componente che renderizza (per `table`).
 */
import { supabase } from "@/integrations/supabase/client";

export interface TariffaUsageSourceDef {
  /** Nome tabella che referenzia tariffe_aziendali.id. */
  table: string;
  /** Colonna FK verso tariffe_aziendali.id. */
  column: string;
  /** Etichetta leggibile (italiano). */
  label: string;
  /** Sottotitolo/aiuto. */
  hint: string;
}

/**
 * Tabelle che referenziano `tariffe_aziendali.id` (escluso il figlio
 * `tariffa_costi_varianti`, che fa parte della tariffa stessa). I nomi tabella
 * e colonna sono stati verificati contro i tipi generati di Supabase.
 */
export const TARIFFA_USAGE_SOURCES: TariffaUsageSourceDef[] = [
  { table: "quote_items", column: "tariffa_id", label: "Righe di preventivo / offerta", hint: "Voci inserite nei preventivi" },
  { table: "bundle_voci", column: "tariffa_id", label: "Bundle e pacchetti", hint: "Pacchetti chiavi-in-mano" },
  { table: "article_families", column: "posa_tariffa_default_id", label: "Famiglie articoli (posa default)", hint: "Posa predefinita di una famiglia" },
  { table: "article_templates", column: "montaggio_tariffa_id", label: "Articoli a catalogo (montaggio)", hint: "Montaggio predefinito di un articolo" },
  { table: "product_aliases", column: "tariffa_id", label: "Alias prodotto", hint: "Sinonimi/codici collegati" },
  { table: "supplier_product_lines", column: "manodopera_tariffa_id", label: "Listini fornitore (manodopera)", hint: "Manodopera su righe fornitore" },
  { table: "preventivo_manodopera_assegnazioni", column: "tariffa_id", label: "Manodopera assegnata a preventivi", hint: "Assegnazioni di manodopera" },
  { table: "fv_manodopera_progetto", column: "tariffa_id", label: "Manodopera progetti (serramenti)", hint: "Manodopera nei progetti FV" },
  { table: "sr_servizi_progetto", column: "tariffa_id", label: "Manodopera progetti (sostituzione)", hint: "Manodopera nei progetti SR" },
];

export interface TariffaUsageRow {
  table: string;
  column: string;
  label: string;
  hint: string;
  count: number;
  /** false se la sorgente non è interrogabile (tabella assente/RLS) → esclusa dal totale. */
  ok: boolean;
}

/** Cast localizzato: i nomi tabella sono dinamici (string) e alcune colonne FK
 *  potrebbero non essere nei tipi generati → query rilassata ma sicura. */
const sbAny = supabase as unknown as {
  from: (t: string) => {
    select: (cols: string, opts: { count: "exact"; head: true }) => {
      eq: (col: string, val: string) => Promise<{ count: number | null; error: unknown }>;
      in: (col: string, vals: string[]) => Promise<{ count: number | null; error: unknown }>;
    };
  };
};

/** Conta, per ogni sorgente, quante righe referenziano la tariffa. */
export async function countTariffaUsage(tariffaId: string): Promise<TariffaUsageRow[]> {
  const results = await Promise.allSettled(
    TARIFFA_USAGE_SOURCES.map(async (s) => {
      const { count, error } = await sbAny
        .from(s.table)
        .select("*", { count: "exact", head: true })
        .eq(s.column, tariffaId);
      if (error) throw error;
      return count ?? 0;
    }),
  );
  return TARIFFA_USAGE_SOURCES.map((s, i) => {
    const r = results[i];
    return {
      table: s.table,
      column: s.column,
      label: s.label,
      hint: s.hint,
      count: r.status === "fulfilled" ? r.value : 0,
      ok: r.status === "fulfilled",
    };
  });
}

/** Somma dei riferimenti effettivi (solo sorgenti interrogabili con count>0). */
export function totalTariffaUsage(rows: TariffaUsageRow[]): number {
  return rows.filter((r) => r.ok && r.count > 0).reduce((acc, r) => acc + r.count, 0);
}

/**
 * #51 — Conteggio aggregato per più tariffe (azioni in blocco). Restituisce il
 * numero TOTALE di riferimenti verso l'insieme di id selezionato (somma su tutte
 * le sorgenti). Costo costante: 9 `head`-count con `.in(...)`, indipendente dalla
 * dimensione della selezione. Le sorgenti non interrogabili sono ignorate.
 */
export async function countTariffaUsageBulk(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const results = await Promise.allSettled(
    TARIFFA_USAGE_SOURCES.map(async (s) => {
      const { count, error } = await sbAny
        .from(s.table)
        .select("*", { count: "exact", head: true })
        .in(s.column, ids);
      if (error) throw error;
      return count ?? 0;
    }),
  );
  return results.reduce((acc, r) => acc + (r.status === "fulfilled" ? r.value : 0), 0);
}

/** Vero se almeno una sorgente non è verificabile in questo ambiente. */
export function hasUnknownTariffaUsage(rows: TariffaUsageRow[]): boolean {
  return rows.some((r) => !r.ok);
}
