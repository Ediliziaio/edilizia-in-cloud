/** Coordinate del documento verso l'alto → editor, tavole e pianta del 3D verso il basso.
 * Il retro dei simboli è sempre sul lato locale y/z negativo: nessun mezzo giro aggiuntivo.
 */
export const rotazioneSchermo = (gradi: number): number => ((-gradi % 360) + 360) % 360;
