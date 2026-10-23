/**
 * Nota di credito FIC: la fattura stornata sta in ei_data.invoice_number /
 * invoice_date (DatiFattureCollegate della FatturaPA). Per gli altri documenti
 * non c'è niente da collegare.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function riferimentoFatturaStornata(doc: any): { rifFatturaNumero?: string; rifFatturaData?: string | null } {
  if (doc?.type !== "credit_note") return {};
  const numero = doc?.ei_data?.invoice_number;
  const s = numero == null ? "" : String(numero).trim();
  if (!s) return {};
  const data = doc?.ei_data?.invoice_date;
  return { rifFatturaNumero: s, rifFatturaData: typeof data === "string" && /^\d{4}-\d{2}-\d{2}/.test(data) ? data.slice(0, 10) : null };
}
