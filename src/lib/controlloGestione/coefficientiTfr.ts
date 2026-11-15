/**
 * Coefficienti ISTAT di rivalutazione del TFR: lettura del numero inserito e
 * coefficiente dell'anno con la stessa regola di private.cg_tfr_coefficiente_anno
 * (migrazione 20290401200000): dicembre, oppure l'ultimo mese con la parte
 * fissa dell'1,5% per l'anno intero; senza mesi, 1,5% (stimato).
 */

/** «4,285617» o «4.285617» → 4.285617; null se non è un numero. */
export function parseCoefficiente(testo: string): number | null {
  const t = testo.trim().replace("%", "").replace(/\s/g, "");
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}

/** Coefficiente dell'anno come lo usa il database: dicembre, o la stima dall'ultimo mese. */
export function coefficienteAnno(righe: { mese: number; coefficiente_pct: number }[]): { valore: number; stimato: boolean; mese: number | null } {
  if (righe.length === 0) return { valore: 1.5, stimato: true, mese: null };
  const ultima = [...righe].sort((a, b) => b.mese - a.mese)[0];
  if (ultima.mese === 12) return { valore: ultima.coefficiente_pct, stimato: false, mese: 12 };
  return { valore: ultima.coefficiente_pct - (1.5 * ultima.mese) / 12 + 1.5, stimato: true, mese: ultima.mese };
}
