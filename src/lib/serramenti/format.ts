/**
 * src/lib/serramenti/format.ts — formatter helpers per il modulo
 * Serramenti (€, %, numeri). Estratti da `wizardUI.tsx` per silenziare
 * i warning `react-refresh/only-export-components` (HMR non supporta
 * moduli che esportano sia componenti React che helper).
 *
 * Funzioni PURE — nessuna dipendenza React.
 */

/**
 * Il valore da scrivere: un numero che con quei decimali arrotonda a zero (anche «-0», anche -0,001) è 0.
 * Senza, `toLocaleString` scrive «-0»: «€ -0» accanto a un margine che pareggia, «-0,00» in un saldo.
 */
const daScrivere = (n: number | string, decimals: number): number => {
  const v = Number(n);
  return Math.abs(v) < 0.5 / 10 ** decimals ? 0 : v;
};

// useGrouping: in italiano il separatore delle migliaia manca sotto le cinque
// cifre («€ 1234» accanto a «€ 12.345»): qui lo si mette sempre.
export const formatEuro = (n: number | null | undefined, decimals = 0): string => {
  if (n == null || isNaN(Number(n))) return "—";
  return `€ ${daScrivere(n, decimals).toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
  })}`;
};

export const formatPct = (n: number | null | undefined, decimals = 0): string => {
  if (n == null || isNaN(Number(n))) return "—";
  return `${daScrivere(n, decimals).toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
};

export const formatNumero = (n: number | null | undefined, decimals = 0): string => {
  if (n == null || isNaN(Number(n))) return "—";
  return daScrivere(n, decimals).toLocaleString("it-IT", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: true,
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
