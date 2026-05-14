/**
 * src/lib/serramenti/format.ts — formatter helpers per il modulo
 * Serramenti (€, %, numeri). Estratti da `wizardUI.tsx` per silenziare
 * i warning `react-refresh/only-export-components` (HMR non supporta
 * moduli che esportano sia componenti React che helper).
 *
 * Funzioni PURE — nessuna dipendenza React.
 */

export const formatEuro = (n: number | null | undefined, decimals = 0): string => {
  if (n == null || isNaN(Number(n))) return "—";
  return `€ ${Number(n).toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
};

export const formatPct = (n: number | null | undefined, decimals = 0): string => {
  if (n == null || isNaN(Number(n))) return "—";
  return `${Number(n).toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
};

export const formatNumero = (n: number | null | undefined, decimals = 0): string => {
  if (n == null || isNaN(Number(n))) return "—";
  return Number(n).toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
};

export const formatEuroRangeOrSingle = (
  min: number | null | undefined,
  max: number | null | undefined,
  decimals = 0,
): string => {
  const minN = Number(min ?? 0);
  const maxN = Number(max ?? 0);
  if (!minN && !maxN) return "—";
  if (!minN) return formatEuro(maxN, decimals);
  if (!maxN) return formatEuro(minN, decimals);
  if (Math.abs(minN - maxN) < 0.01) return formatEuro(maxN, decimals);
  return `${formatEuro(minN, decimals)} – ${formatEuro(maxN, decimals)}`;
};
