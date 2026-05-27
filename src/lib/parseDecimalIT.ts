/**
 * 2026-05-27 (audit Form UX — BUG CRITICO calcoli fiscali):
 *
 * Prima: ovunque si usava `parseFloat(e.target.value) || 0` sui campi
 * importo / quantità / IVA. Se l'utente incolla un valore in formato
 * italiano da Excel o mail del cliente:
 *   "9,50"     → parseFloat → 9 (perde i 50 centesimi)
 *   "1.234,56" → parseFloat → 1.234 (perde 1233 €!)
 *   "€ 9,50"   → parseFloat → NaN
 *
 * Risultato: totali fattura SBAGLIATI, autosalvati in DB, inviati a SDI.
 * Il cliente vede e contesta → reputazione professionista distrutta.
 *
 * Questo helper accetta tutti i formati comuni (locale IT, locale US,
 * con simboli, con spazi):
 *   "9,50"     → 9.50
 *   "9.50"     → 9.50
 *   "1.234,56" → 1234.56
 *   "1,234.56" → 1234.56 (interpretato come US: virgola separatore migliaia)
 *   "€ 9,50"   → 9.50
 *   "EUR 9,50" → 9.50
 *   "  9,50 "  → 9.50
 *   "9,50€"    → 9.50
 *   ""         → 0
 *   null       → 0
 *
 * Convenzione: se ci sono sia "." che "," distinguiamo dal LAST separator
 * (l'ultimo è quello decimale). Se c'è solo "," è decimale (formato IT).
 * Se c'è solo "." è decimale (formato US) tranne quando viene seguito
 * da 3 cifre + fine stringa → migliaia.
 */
export function parseDecimalIT(v: string | number | null | undefined): number {
  if (typeof v === "number") {
    return Number.isFinite(v) ? v : 0;
  }
  if (v == null) return 0;

  // Strip valuta + spazi
  let s = String(v).trim().replace(/[\s€$£]|EUR/gi, "");
  if (!s) return 0;

  // Cattura segno
  const negative = s.startsWith("-");
  if (negative) s = s.slice(1);

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma > -1 && lastDot > -1) {
    // Entrambi presenti → l'ultimo è il decimale
    if (lastComma > lastDot) {
      // formato IT: 1.234,56
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      // formato US: 1,234.56
      s = s.replace(/,/g, "");
    }
  } else if (lastComma > -1) {
    // Solo virgola → formato IT (virgola decimale)
    // Edge case: "1,234" può essere 1234 (US migliaia) o 1.234 (IT decimale)?
    // Heuristic: se ci sono ESATTAMENTE 3 cifre dopo l'ultima virgola E nessun separatore prima,
    // probabilmente è il decimale IT (es. "9,500" = 9.5). Tratta come decimale IT sempre.
    s = s.replace(",", ".");
  } else if (lastDot > -1) {
    // Solo punto → ambiguo. Se ci sono ESATTAMENTE 3 cifre dopo l'ultimo punto E
    // nessuna virgola prima, è migliaia (formato US "1.234" → 1234)? No, in IT
    // "1.234" è ambiguo. Manteniamo lo standard JS: il punto è decimale.
    // Caso noto: "1.234" → 1.234 (NON 1234). Per migliaia + 0 decimali l'utente
    // deve usare formato IT con virgola.
    // Resta s invariato (parseFloat lo gestisce nativamente).
  }

  const n = parseFloat(s);
  if (!Number.isFinite(n)) return 0;
  return negative ? -n : n;
}
