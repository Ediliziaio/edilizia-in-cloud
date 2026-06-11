/**
 * src/lib/routing.ts
 * Routing multi-waypoint: HERE API (primario) con fallback OSRM demo.
 *
 * Primario: edge function geo-router → HERE Routing v8
 *   - 250k req/mese free tier, tempi con TRAFFICO REALE
 *   - restituisce durate per singola tratta (legs) → ETA precisi
 * Fallback: http://router.project-osrm.org (demo pubblico, no traffico)
 *   - usato se HERE_API_KEY non configurata o quota esaurita
 *
 * Polyline encoding OSRM: algoritmo Google Encoded Polyline (inline).
 * La polyline HERE (flexible polyline) è decodificata server-side.
 */

import { supabase } from "@/integrations/supabase/client";

export interface RouteWaypoint {
  lat: number;
  lng: number;
}

export interface RouteLeg {
  durationSec: number;
  distanceMeters: number;
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
  /** Durate per singola tratta (solo HERE) — per ETA precisi */
  legs?: RouteLeg[];
  /** Provider effettivamente usato */
  provider: "here" | "osrm";
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
  return m > 0 ? `${h} or${h > 1 ? "e" : "a"} ${m} min` : `${h} or${h > 1 ? "e" : "a"}`;
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
      provider: "osrm",
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

// ── HERE Route (via edge function geo-router) ─────────────────────────────────
/**
 * Calcola il percorso con HERE Routing v8 (traffico reale, legs per-tratta).
 * Restituisce null se HERE non è configurata o la chiamata fallisce —
 * il chiamante deve fare fallback su getOsrmRoute.
 */
async function getHereRoute(
  waypoints: RouteWaypoint[]
): Promise<RouteResult | null> {
  if (waypoints.length < 2) return null;

  try {
    const { data, error } = await supabase.functions.invoke("geo-router", {
      body: { action: "route", waypoints },
    });

    if (error || !data || data.error || !Array.isArray(data.coordinates)) {
      return null;
    }

    return {
      coordinates: data.coordinates as [number, number][],
      durationSec: data.durationSec,
      distanceMeters: data.distanceMeters,
      durationLabel: formatDuration(data.durationSec),
      legs: data.legs,
      provider: "here",
    };
  } catch {
    return null;
  }
}

/**
 * Routing multi-waypoint con fallback automatico:
 * 1. HERE (traffico reale, ETA per tratta)
 * 2. OSRM demo (gratuito, no traffico)
 *
 * Usare questa funzione nei nuovi sviluppi al posto di getOsrmRoute.
 */
export async function getRoute(
  waypoints: RouteWaypoint[]
): Promise<RouteResult | null> {
  const hereResult = await getHereRoute(waypoints);
  if (hereResult) return hereResult;
  return getOsrmRoute(waypoints);
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
