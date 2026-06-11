/**
 * src/lib/geocoding.ts
 * Reverse e forward geocoding: HERE API (primario) + Nominatim (fallback).
 *
 * Primario: edge function geo-router → HERE Geocoding
 *  - cache globale cross-company nel DB (lo stesso indirizzo geocodificato
 *    da un'azienda viene riusato da tutte → -70/80% di chiamate API)
 *  - 250k req/mese free tier
 * Fallback: Nominatim OpenStreetMap (se HERE non configurata o in errore)
 *  - Max 1 richiesta/secondo (rate limit policy OSM)
 *  - User-Agent obbligatorio
 *
 * Cache locale in-memory (4 decimali ≈ 11m) + timeout 5s su entrambi.
 */

import { fetchWithTimeout } from "@/lib/utils/fetchWithTimeout";
import { supabase } from "@/integrations/supabase/client";

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

// ── Rate limiter Nominatim (1 req/sec) ────────────────────────────────────────
let lastRequestTime = 0;

async function waitForSlot(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < 1100) {
    await new Promise<void>((r) => setTimeout(r, 1100 - elapsed));
  }
  lastRequestTime = Date.now();
}

// ── HERE via edge function geo-router ─────────────────────────────────────────
// Se la funzione risponde con errore (chiave mancante, quota, rete) si torna
// a Nominatim in modo trasparente. Disattivabile dopo il primo 503 per non
// pagare una round-trip inutile a ogni chiamata della sessione.
let hereDisabledThisSession = false;

async function hereGeocode(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  if (hereDisabledThisSession) return null;
  try {
    const { data, error } = await supabase.functions.invoke("geo-router", {
      body: { action: "geocode", address },
    });
    if (error || !data || data.error) {
      if (data?.error === "here_not_configured") hereDisabledThisSession = true;
      return null;
    }
    if (typeof data.lat !== "number" || typeof data.lng !== "number") return null;
    return { lat: data.lat, lng: data.lng };
  } catch {
    return null;
  }
}

async function hereReverse(lat: number, lng: number): Promise<string | null> {
  if (hereDisabledThisSession) return null;
  try {
    const { data, error } = await supabase.functions.invoke("geo-router", {
      body: { action: "reverse", lat, lng },
    });
    if (error || !data || data.error) {
      if (data?.error === "here_not_configured") hereDisabledThisSession = true;
      return null;
    }
    return typeof data.address === "string" ? data.address : null;
  } catch {
    return null;
  }
}

// ── Nominatim (fallback) ──────────────────────────────────────────────────────
async function nominatimReverse(lat: number, lng: number): Promise<string> {
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

    return address;
  } catch {
    return "Indirizzo non disponibile";
  }
}

async function nominatimForward(
  address: string
): Promise<{ lat: number; lng: number } | null> {
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

    if (!results || results.length === 0) return null;

    return {
      lat: parseFloat(results[0].lat),
      lng: parseFloat(results[0].lon),
    };
  } catch {
    return null;
  }
}

// ── API pubblica ──────────────────────────────────────────────────────────────
/**
 * Converte (lat, lng) in un indirizzo leggibile italiano.
 * HERE primario (cache globale) → fallback Nominatim.
 * Restituisce 'Indirizzo non disponibile' in caso di errore.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  const key = cacheKey(lat, lng);
  const cached = reverseCache.get(key);
  if (cached !== undefined) return cached;

  const hereResult = await hereReverse(lat, lng);
  if (hereResult) {
    reverseCache.set(key, hereResult);
    return hereResult;
  }

  const address = await nominatimReverse(lat, lng);
  reverseCache.set(key, address);
  return address;
}

/**
 * Converte un indirizzo testuale in coordinate (lat, lng).
 * HERE primario (cache globale) → fallback Nominatim.
 * Restituisce null se l'indirizzo non viene trovato.
 */
export async function forwardGeocode(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const normalizedKey = address.trim().toLowerCase();
  if (forwardCache.has(normalizedKey)) return forwardCache.get(normalizedKey) ?? null;

  const hereResult = await hereGeocode(address);
  if (hereResult) {
    forwardCache.set(normalizedKey, hereResult);
    return hereResult;
  }

  const coords = await nominatimForward(address);
  forwardCache.set(normalizedKey, coords);
  return coords;
}

/** Svuota le cache (utile nei test) */
export function clearGeocodingCache(): void {
  reverseCache.clear();
  forwardCache.clear();
  hereDisabledThisSession = false;
}
