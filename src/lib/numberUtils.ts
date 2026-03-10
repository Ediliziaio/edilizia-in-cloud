/**
 * Safe number conversion: returns fallback if value is NaN or Infinity.
 * Centralised utility — previously defined in useCruscottoData.ts.
 */
export function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return isNaN(n) || !isFinite(n) ? fallback : n;
}
