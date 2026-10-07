/**
 * Ponte avanzamento fisico → verbale SAL (07/10/2026).
 *
 * Il verbale SAL (SalTab) finora si compilava a mano o con un suggerimento AI:
 * non c'era un legame diretto con l'avanzamento dichiarato sulle fasi di
 * lavorazione. Qui si traduce ogni fase in una voce di SAL — descrizione = nome
 * della fase, % = avanzamento dichiarato, importo contrattuale = venduto della
 * fase se l'ufficio l'ha scritto. L'ufficio può poi correggere ogni voce.
 *
 * Modulo puro: niente React, niente Supabase.
 */

export interface FasePerSal {
  name: string;
  /** Avanzamento dichiarato (0..100), da order_work_phases.percentuale. */
  percentuale: number | null;
  /** Venduto della fase (€), se scritto dall'ufficio; altrimenti non lo sappiamo. */
  importo_venduto: number | null;
}

/** Stessa forma del form voce in SalTab (campi stringa per gli input). */
export interface VoceSalDraft {
  descrizione: string;
  importo_contrattuale: string;
  percentuale_avanzamento: string;
  note: string;
}

const clampPerc = (v: number | null): number =>
  Math.min(100, Math.max(0, Math.round(Number(v) || 0)));

/**
 * Una voce di SAL per ogni fase con un nome. L'importo contrattuale resta vuoto
 * se il venduto della fase non c'è (lo scrive l'ufficio): la % invece arriva
 * sempre dall'avanzamento dichiarato, che è il dato che prima non si trasferiva.
 */
export function vociSalDaFasi(fasi: ReadonlyArray<FasePerSal>): VoceSalDraft[] {
  return fasi
    .filter((f) => f.name?.trim())
    .map((f) => ({
      descrizione: f.name.trim(),
      importo_contrattuale: f.importo_venduto != null && f.importo_venduto > 0 ? String(f.importo_venduto) : "",
      percentuale_avanzamento: String(clampPerc(f.percentuale)),
      note: "",
    }));
}
