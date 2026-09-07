/**
 * Safe number conversion: returns fallback if value is NaN or Infinity.
 * Centralised utility — previously defined in useCruscottoData.ts.
 */
export function safeNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return isNaN(n) || !isFinite(n) ? fallback : n;
}

/**
 * Arrotondamento al centesimo per gli importi in denaro.
 *
 * `Math.round(n * 100) / 100` sbaglia quando il valore cade sul mezzo
 * centesimo: 5,75 × 22% in virgola mobile vale 1,2649999999999999, non 1,265,
 * e usciva 1,26 invece di 1,27. Misurato su 800.000 combinazioni di imponibile
 * e aliquota: 1.928 importi sbagliati. La variante con `Number.EPSILON`, che
 * era in uso in due punti del progetto, ne recuperava 31 — l'epsilon è troppo
 * piccolo rispetto alla scala del numero.
 *
 * La tolleranza va applicata al valore GIÀ moltiplicato per cento, dove
 * l'errore binario si misura in unità dell'ultimo posto e 1e-9 lo assorbe senza
 * poter spostare un importo vero. Simmetrico sui negativi, che servono alle
 * note di credito.
 */
export function arrotondaCentesimi(n: number): number {
  const centesimi = n * 100;
  return Math.round(centesimi + (centesimi >= 0 ? 1e-9 : -1e-9)) / 100;
}
