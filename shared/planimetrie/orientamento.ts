/** Coordinate del documento verso l'alto → editor, tavole e pianta del 3D verso il basso.
 * Il retro dei simboli è sempre sul lato locale y/z negativo: nessun mezzo giro aggiuntivo.
 */
export const rotazioneSchermo = (gradi: number): number => ((-gradi % 360) + 360) % 360;

/** Percorso indicativo nell'emisfero nord, riferito al nord della tavola. */
export function soleIndicativo(ora: number, nord = 0): { direzione: [number, number, number]; elevazioneGradi: number; fase: number } {
  const t = (Math.min(19, Math.max(7, ora)) - 7) / 12;
  const fase = Math.sin(Math.PI * t);
  const elevazioneGradi = 6 + 54 * fase;
  const azimut = (90 + 180 * t - nord) * Math.PI / 180;
  const elevazione = elevazioneGradi * Math.PI / 180;
  const orizzontale = Math.cos(elevazione);
  return { direzione: [Math.sin(azimut) * orizzontale, Math.sin(elevazione), -Math.cos(azimut) * orizzontale], elevazioneGradi, fase };
}
