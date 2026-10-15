/** Divide una voce su più pagine senza perdere righe né ripetere gli importi.
 * Le altezze includono l'interlinea: chi disegna mantiene il testo nel segmento.
 */
export function segmentoRiga(altezze: number[], spazio: number, padding: number, minimo = 0): number {
  let usato = padding * 2;
  let quanti = 0;
  for (const h of altezze) {
    if (!Number.isFinite(h) || h <= 0) throw new Error('Altezza riga non valida');
    if (Math.max(minimo, usato + h) > spazio) break;
    usato += h;
    quanti++;
  }
  return quanti;
}
