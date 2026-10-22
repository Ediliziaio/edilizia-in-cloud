/**
 * Formati delle tabelle del Controllo di gestione: importi interi con il
 * punto delle migliaia («1.234.567 €») e percentuali con la virgola («18,6%»).
 * Niente «1.2M €» o «250k €» nelle tabelle finanziarie.
 */
const intero = new Intl.NumberFormat("it-IT", {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
  useGrouping: "always",
} as Intl.NumberFormatOptions);

/** «1.234.567 €», «-164.000 €». Lo zero negativo diventa «0 €». */
export function euroIntero(valore: number | null | undefined): string {
  const n = Number(valore);
  if (!Number.isFinite(n)) return "—";
  const arrotondato = Math.round(n);
  return `${intero.format(arrotondato === 0 ? 0 : arrotondato)} €`;
}

/** «18,6%» (una cifra decimale di default), «—» se il valore manca. */
export function percIt(valore: number | null | undefined, decimali = 1): string {
  const n = Number(valore);
  if (valore == null || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("it-IT", { minimumFractionDigits: decimali, maximumFractionDigits: decimali })}%`;
}
