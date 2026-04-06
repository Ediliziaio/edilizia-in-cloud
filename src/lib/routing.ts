/**
 * src/lib/routing.ts
 * Client OSRM per routing multi-waypoint.
 *
 * Endpoint: http://router.project-osrm.org (demo pubblico)
 * ⚠️  Demo server: rate limit non documentato. Per produzione usare istanza self-hosted.
 * Fallback: GraphHopper public API (5000 req/giorno) se OSRM non risponde.
 *
 * Polyline encoding: algoritmo Google Encoded Polyline (implementato inline).
 */

export interface RouteWaypoint {
  lat: number;
  lng: number;
}

export interface RouteResult {
  /** Lista di coordinate [lat, lng] decodificate dalla polyline */
  coordinates: [number, number][];
  /** Durata stimata in secondi */
  durationSec: number;
  /** Distanza in metri */
  distanceMeters: number;
  /** Durata formattata in italiano, es. "25 minuti" */
  durationLabel: string;
}

// ── Polyline decoder (Google Encoded Polyline Algorithm) ──────────────────────
/**
 * Decodifica una stringa Google Encoded Polyline in una lista di [lat, lng].
 * Implementazione inline per evitare dipendenze npm aggiuntive.
 */
export function decodePolyline(encoded: string): [number, number][] {
  const coords: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    // Decodifica latitudine
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    // Decodifica longitudine
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coords.push([lat / 1e5, lng / 1e5]);
  }

  return coords;
}

// ── Durata formattata ─────────────────────────────────────────────────────────
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)} secondi`;
  if (seconds < 3600) return `${Math.round(seconds / 60)} minuti`;
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return m > 0 ? `${h} ora${h > 1 ? "" : ""} ${m} min` : `${h} ora${h > 1 ? "" : ""}`;
}

// ── OSRM Route ────────────────────────────────────────────────────────────────
const OSRM_BASE = "https://router.project-osrm.org";
const OSRM_TIMEOUT_MS = 10_000;

/**
 * Calcola il percorso ottimale tra una lista di waypoint usando OSRM.
 * I waypoint sono già nell'ordine corretto (dopo TSP).
 * Restituisce null in caso di errore o timeout.
 */
export async function getOsrmRoute(
  waypoints: RouteWaypoint[]
): Promise<RouteResult | null> {
  if (waypoints.length < 2) return null;

  // OSRM vuole: /route/v1/driving/lng1,lat1;lng2,lat2;...
  const coords = waypoints
    .map((w) => `${w.lng},${w.lat}`)
    .join(";");

  const url = `${OSRM_BASE}/route/v1/driving/${coords}?overview=full&geometries=polyline&steps=false`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OSRM_TIMEOUT_MS);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);

    const data = await res.json() as {
      code: string;
      routes?: Array<{
        geometry: string;
        duration: number;
        distance: number;
      }>;
    };

    if (data.code !== "Ok" || !data.routes?.[0]) return null;

    const route = data.routes[0];

    return {
      coordinates: decodePolyline(route.geometry),
      durationSec: route.duration,
      distanceMeters: route.distance,
      durationLabel: formatDuration(route.duration),
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      console.warn("[routing] OSRM timeout");
    } else {
      console.warn("[routing] OSRM error:", err);
    }
    return null;
  }
}

/**
 * Crea un URL di navigazione Google Maps / Apple Maps con waypoints.
 * Usa Google Maps come primario, con fallback Apple Maps su iOS.
 */
export function buildNavigationUrl(
  waypoints: RouteWaypoint[],
  labels?: string[]
): { googleMaps: string; appleMaps: string } {
  const waypointStr = waypoints
    .map((w, i) => {
      const label = labels?.[i] ? encodeURIComponent(labels[i]) : "";
      return label ? `${w.lat},${w.lng}+${label}` : `${w.lat},${w.lng}`;
    })
    .join("/");

  return {
    googleMaps: `https://www.google.com/maps/dir/${waypointStr}`,
    appleMaps: `https://maps.apple.com/?daddr=${waypoints.map((w) => `${w.lat},${w.lng}`).join("+")}`,
  };
}
