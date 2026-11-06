/** Coordinate in metri: le doghe mantengono la stessa misura anche in stanze più grandi. */
export function uvFinitura(posizioni: ArrayLike<number>, normali: ArrayLike<number>, metri: [number, number]): Float32Array {
  const uv = new Float32Array(posizioni.length / 3 * 2);
  for (let i = 0; i < posizioni.length / 3; i++) {
    const x = posizioni[i * 3], y = posizioni[i * 3 + 1], z = posizioni[i * 3 + 2];
    const nx = Math.abs(normali[i * 3]), ny = Math.abs(normali[i * 3 + 1]), nz = Math.abs(normali[i * 3 + 2]);
    const u = ny >= nx && ny >= nz ? x : nx >= nz ? z : x;
    const v = ny >= nx && ny >= nz ? z : y;
    uv[i * 2] = u / Math.max(0.01, metri[0]);
    uv[i * 2 + 1] = v / Math.max(0.01, metri[1]);
  }
  return uv;
}
