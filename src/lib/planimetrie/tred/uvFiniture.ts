/** Coordinate in metri: le doghe mantengono la stessa misura anche in stanze più grandi.
 * `rotazione` (gradi) gira la posa sulle facce orizzontali: 90 = doghe di traverso, 45 = posa in diagonale. */
export function uvFinitura(posizioni: ArrayLike<number>, normali: ArrayLike<number>, metri: [number, number], rotazione = 0): Float32Array {
  const uv = new Float32Array(posizioni.length / 3 * 2);
  const a = rotazione * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
  for (let i = 0; i < posizioni.length / 3; i++) {
    const x = posizioni[i * 3], y = posizioni[i * 3 + 1], z = posizioni[i * 3 + 2];
    const nx = Math.abs(normali[i * 3]), ny = Math.abs(normali[i * 3 + 1]), nz = Math.abs(normali[i * 3 + 2]);
    const piano = ny >= nx && ny >= nz;
    let u = piano ? x : nx >= nz ? z : x;
    let v = piano ? z : y;
    if (piano && rotazione) [u, v] = [u * cos + v * sin, v * cos - u * sin];
    uv[i * 2] = u / Math.max(0.01, metri[0]);
    uv[i * 2 + 1] = v / Math.max(0.01, metri[1]);
  }
  return uv;
}
