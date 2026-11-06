import type { RisultatoCalcolo } from "./types";

/** Confronta solo le componenti esposte: non corregge la fonte e non presume
 * che eventuali spese mancanti siano errori o siano già finanziate. */
export function differenzaTotaleVisibile(r: RisultatoCalcolo): number | null {
  if (r.modalita === "errore" || ![r.numero_rate, r.rata_completa, r.spese_istruttoria, r.importo_totale_dovuto].every(v => typeof v === "number" && Number.isFinite(v))) return null;
  const differenza = Math.round((r.importo_totale_dovuto! - r.rata_completa! * r.numero_rate - r.spese_istruttoria!) * 100) / 100;
  // Ogni rata visualizzata può essere stata arrotondata di mezzo centesimo.
  return Math.abs(differenza) > r.numero_rate * 0.005 + 0.01 ? differenza : null;
}
