/**
 * src/lib/geocoding.ts
 * Reverse e forward geocoding via Nominatim OpenStreetMap.
 *
 * Regole OSM:
 *  - Max 1 richiesta/secondo (rate limit)
 *  - User-Agent obbligatorio
 *  - Cache in-memory (4 decimali di precisione ≈ 11m)
 *  - Timeout 5s (S3-05) + fallback graceful in caso di TimeoutError
 */

import { fetchWithTimeout } from "@/lib/utils/fetchWithTimeout";

const USER_AGENT = "EdiliziaInCloud/1.0 (info@ediliziaincloud.com)";
const GEOCODE_TIMEOUT_MS = 5_000;

// ── Cache ─────────────────────────────────────────────────────────────────────
const reverseCache = new Map<string, string>();
const forwardCache = new Map<string, { lat: number; lng: number } | null>();

/**
 * Arrotonda una coordinata a 4 decimali per la chiave di cache.
 * Precisione ~11m — sufficiente per indirizzi stradali.
 */
function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

// ── Rate limiter (1 req/sec) ──────────────────────────────────────────────────
let lastRequestTime = 0;

async function waitForSlot(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 1100) {
    await new Promise<void>((r) => setTimeout(r, 1100 - elapsed));
  }
  lastRequestTime = Date.now();
}

// ── Reverse geocoding ─────────────────────────────────────────────────────────
/**
 * Converte (lat, lng) in un indirizzo leggibile italiano.
 * Usa cache in-memory; rispetta il rate limit di Nominatim.
 * Restituisce 'Indirizzo non disponibile' in caso di errore.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = cacheKey(lat, lng);
  const cached = reverseCache.get(key);
  if (cached !== undefined) return cached;

  try {
    await waitForSlot();

    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;

    const res = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "it",
      },
      timeoutMs: GEOCODE_TIMEOUT_MS,
      context: "geocoding.reverse",
    });

    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);

    const data = await res.json() as {
      address?: {
        road?: string;
        house_number?: string;
        city?: string;
        town?: string;
        village?: string;
        postcode?: string;
      };
      display_name?: string;
    };

    let address = "Indirizzo non disponibile";
    if (data.address) {
      const a = data.address;
      const parts = [
        a.road,
        a.house_number,
        a.city ?? a.town ?? a.village,
      ].filter(Boolean);
      if (parts.length > 0) address = parts.join(", ");
    } else if (data.display_name) {
      address = data.display_name.split(",").slice(0, 3).join(",").trim();
    }

    reverseCache.set(key, address);
    return address;
  } catch {
    reverseCache.set(key, "Indirizzo non disponibile");
    return "Indirizzo non disponibile";
  }
}

// ── Forward geocoding ─────────────────────────────────────────────────────────
/**
 * Converte un indirizzo testuale in coordinate (lat, lng).
 * Usa la Nominatim Search API.
 * Restituisce null se l'indirizzo non viene trovato.
 */
export async function forwardGeocode(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const normalizedKey = address.trim().toLowerCase();
  if (forwardCache.has(normalizedKey)) return forwardCache.get(normalizedKey) ?? null;

  try {
    await waitForSlot();

    const params = new URLSearchParams({
      format: "jsonv2",
      q: address,
      limit: "1",
      countrycodes: "it",
    });

    const url = `https://nominatim.openstreetmap.org/search?${params.toString()}`;

    const res = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "it",
      },
      timeoutMs: GEOCODE_TIMEOUT_MS,
      context: "geocoding.forward",
    });

    if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);

    const results = await res.json() as Array<{ lat: string; lon: string }>;

    if (!results || results.length === 0) {
      forwardCache.set(normalizedKey, null);
      return null;
    }

    const coords = {
      lat: parseFloat(results[0].lat),
      lng: parseFloat(results[0].lon),
    };

    forwardCache.set(normalizedKey, coords);
    return coords;
  } catch {
    forwardCache.set(normalizedKey, null);
    return null;
  }
}

/** Svuota le cache (utile nei test) */
export function clearGeocodingCache(): void {
  reverseCache.clear();
  forwardCache.clear();
}
