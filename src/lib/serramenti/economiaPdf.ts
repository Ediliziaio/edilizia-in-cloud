import type { SrPianoFinanziamento } from "@/types/serramenti";

/** Ignore stale plans left behind when switching back to a non-financed payment. */
export function pianiFinanziamentoPdf(finanziamento: boolean, value: unknown): SrPianoFinanziamento[] {
  if (!finanziamento || !Array.isArray(value)) return [];
  return value.filter((p): p is SrPianoFinanziamento => p != null
    && Number.isInteger(p.mesi) && p.mesi > 0
    && Number.isFinite(p.rata_mese) && p.rata_mese > 0
    && Number.isFinite(p.finanziato) && p.finanziato > 0
    && Number.isFinite(p.anticipo) && p.anticipo >= 0
    && Number.isFinite(p.tasso) && p.tasso >= 0);
}

/** Do not round sub-thousand balances to the misleading label "0k". */
export function etichettaSaldoGrafico(value: number): string {
  const absolute = Math.abs(value);
  const unit = absolute >= 1_000_000 ? 1_000_000 : absolute >= 1_000 ? 1_000 : 1;
  const digits = unit === 1 ? (absolute > 0 && absolute < 1 ? 2 : 0) : 1;
  return `${value < 0 ? "-" : ""}€ ${(absolute / unit).toLocaleString("it-IT", { maximumFractionDigits: digits })}${unit === 1_000_000 ? " mln" : unit === 1_000 ? "k" : ""}`;
}
