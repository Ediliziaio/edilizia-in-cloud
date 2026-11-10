/**
 * Che orari mostrare all'assistente, fra tutti quelli liberi di un giorno, e
 * quali giorni l'azienda tiene chiusi (10/11/2026).
 *
 * Sta in un file suo perché è l'unica parte di `orari_liberi` che si può
 * provare senza database né calendario.
 */

/**
 * Al massimo `quanti` orari, presi lungo tutta la giornata.
 *
 * Prima si tenevano i primi sei in ordine di ora. Su un martedì del
 * «Calendario Giusy» (aperto 09:30–11:30 e 13:30–17:00) l'assistente vedeva
 * 09:30, 10:00, 10:30, 11:00, 13:30, 14:00 e basta: a chi chiedeva «verso le
 * 16» rispondeva che non c'era posto, mentre 14:30, 15:00, 15:30, 16:00 e
 * 16:30 erano liberi. È lo stesso difetto della fascia «sera»: lo strumento
 * non distingueva «non ce n'è» da «non te l'ho detto».
 */
export function campiona(orari: string[], quanti: number): string[] {
  if (quanti <= 0) return [];
  if (orari.length <= quanti) return [...orari];
  if (quanti === 1) return [orari[0]];
  const scelti = new Set<number>();
  for (let i = 0; i < quanti; i++) {
    scelti.add(Math.round((i * (orari.length - 1)) / (quanti - 1)));
  }
  return [...scelti].sort((a, b) => a - b).map((i) => orari[i]);
}

export interface RigaFestivita {
  data: string | null;
  ricorrente?: boolean | null;
}

/**
 * Le date chiuse, in formato YYYY-MM-DD, per gli anni indicati.
 *
 * Le fasce dei calendari sono settimanali: senza questo, il 25 dicembre è un
 * mercoledì come gli altri e l'assistente ci fissa un appuntamento.
 */
export function dateDiChiusura(righe: RigaFestivita[], anni: number[]): Set<string> {
  const chiuso = new Set<string>();
  for (const f of righe) {
    const giorno = String(f?.data ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(giorno)) continue;
    if (f.ricorrente) for (const anno of anni) chiuso.add(`${anno}-${giorno.slice(5)}`);
    else chiuso.add(giorno);
  }
  return chiuso;
}
