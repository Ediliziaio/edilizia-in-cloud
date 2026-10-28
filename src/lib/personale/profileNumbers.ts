const NON_NEGATIVE = ["ore_settimanali","ore_giornaliere","pausa_pranzo_minuti","ferie_anno_giorni","permessi_anno_ore","rol_anno_ore","posizione_organigramma"];
const BALANCES = ["ferie_residue","permessi_residui_ore","rol_residuo_ore"];
/** Blank is unknown, not a new entitlement. Negative residual balances are data to review, not to reset. */
export function normalizeHrNumbers(input: Record<string, unknown>): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const field of [...NON_NEGATIVE,...BALANCES]) {
    if (!(field in input)) continue;
    const value=input[field];
    if (value==null || value==="" || (typeof value==="number" && Number.isNaN(value))) {
      result[field]=field==="posizione_organigramma" ? 0 : null;
      continue;
    }
    const number=Number(value);
    if (!Number.isFinite(number) || (NON_NEGATIVE.includes(field) && number<0)) throw new Error(`Valore non valido: ${field}`);
    if ((field==="ore_giornaliere" && number>24) || (field==="ore_settimanali" && number>168) || (field==="pausa_pranzo_minuti" && number>1440)) throw new Error(`Valore fuori intervallo: ${field}`);
    result[field]=number;
  }
  return result;
}
