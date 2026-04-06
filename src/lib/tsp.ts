/**
 * src/lib/tsp.ts
 * Algoritmo Nearest-Neighbor TSP (greedy).
 * Complessità O(n²) — accettabile per ≤8 interventi.
 */

// ── Haversine distance (metri) ────────────────────────────────────────────────
export function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

/**
 * Nearest-neighbor TSP:
 * Dato un punto di partenza e una lista di punti,
 * restituisce la lista riordinata per minimizzare la distanza totale (greedy).
 *
 * @param start  - posizione attuale del tecnico
 * @param points - lista interventi da ordinare
 * @returns stessa lista riordinata
 */
export function nearestNeighborTSP<T extends GeoPoint>(
  start: GeoPoint,
  points: T[]
): T[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [...points];

  const remaining = [...points];
  const ordered: T[] = [];
  let current: GeoPoint = start;

  while (remaining.length > 0) {
    let minDist = Infinity;
    let minIdx = 0;

    for (let i = 0; i < remaining.length; i++) {
      const d = haversineMeters(
        current.lat,
        current.lng,
        remaining[i].lat,
        remaining[i].lng
      );
      if (d < minDist) {
        minDist = d;
        minIdx = i;
      }
    }

    ordered.push(remaining[minIdx]);
    current = remaining[minIdx];
    remaining.splice(minIdx, 1);
  }

  return ordered;
}

/**
 * Calcola la distanza totale di un percorso ordinato (in km).
 */
export function totalRouteKm(start: GeoPoint, ordered: GeoPoint[]): number {
  if (ordered.length === 0) return 0;
  let total = 0;
  let prev = start;
  for (const point of ordered) {
    total += haversineMeters(prev.lat, prev.lng, point.lat, point.lng);
    prev = point;
  }
  return Math.round((total / 1000) * 10) / 10;
}
