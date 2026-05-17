/**
 * SerramentiIndex — formatters
 * Estratto da SerramentiIndex.tsx (MP-MKT-001).
 */

export const fmtEur = (n: number) =>
  `€ ${Number(n).toLocaleString("it-IT", { maximumFractionDigits: 0 })}`;

export const fmtEurRangeOrSingle = (min?: number | null, max?: number | null) => {
  const minN = Number(min ?? 0);
  const maxN = Number(max ?? 0);
  if (!minN && !maxN) return "—";
  if (!minN) return fmtEur(maxN);
  if (!maxN) return fmtEur(minN);
  if (Math.abs(minN - maxN) < 0.01) return fmtEur(maxN);
  return `${fmtEur(minN)} – ${fmtEur(maxN)}`;
};
