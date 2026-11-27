/** Piano della falda in coordinate metriche est/nord, condiviso da mappa, casa 3D e PDF. */
export function puntiFaldaInQuota(
  punti: Array<{ x: number; y: number }>,
  gronda: number,
  pendenza: number,
  azimut: number,
): Array<{ x: number; y: number; z: number }> {
  if (![gronda, pendenza, azimut].every(Number.isFinite) || gronda < .5 || gronda > 150 || pendenza < 0 || pendenza > 75)
    throw new Error("Inserisci una quota da 0,5 a 150 m e una pendenza da 0 a 75°.");
  if (punti.length < 3 || !punti.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)))
    throw new Error("La falda deve avere almeno tre vertici validi.");
  const angolo = azimut * Math.PI / 180;
  const direzione = { x: Math.sin(angolo), y: Math.cos(angolo) };
  const grondaInPianta = Math.max(...punti.map(p => p.x * direzione.x + p.y * direzione.y));
  const tangente = Math.tan(pendenza * Math.PI / 180);
  return punti.map(p => ({
    x: p.x,
    y: p.y,
    z: gronda + (grondaInPianta - p.x * direzione.x - p.y * direzione.y) * tangente,
  }));
}
