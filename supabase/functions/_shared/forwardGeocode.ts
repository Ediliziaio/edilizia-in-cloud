/**
 * forwardGeocode — indirizzo (stringa) → coordinate + componenti, con catena di
 * provider a fallback. Estratto per essere condiviso tra gli edge che geocodificano
 * indirizzi in blocco (es. crm-geocode-batch) senza dipendere da fv-geocode.
 *
 * Provider, in ordine:
 *   1. HERE Geocoding (HERE_API_KEY) — free tier ampio, ottimo per l'Italia.
 *   2. Google Geocoding (GOOGLE_GEOCODING_API_KEY / GOOGLE_SOLAR_API_KEY /
 *      GOOGLE_MAPS_API_KEY) — riserva.
 *   3. Nominatim (OpenStreetMap) — fallback SENZA chiave, sempre disponibile
 *      (policy OSM: User-Agent descrittivo + basso volume, ~1 req/s).
 *
 * Il parsing rispecchia fv-geocode/index.ts (che ha unit test in src/lib).
 */

export interface GeocodeResult {
  lat: number;
  lng: number;
  comune: string | null;
  provincia: string | null;
  cap: string | null;
  regione: string | null;
  formatted: string | null;
  in_italia: boolean;
}

interface AddrComp {
  long_name?: string;
  short_name?: string;
  types?: string[];
}

const IT = { latMin: 35, latMax: 47.5, lngMin: 6, lngMax: 19 };

function inItalia(lat: number, lng: number, countryIsIt: boolean): boolean {
  return countryIsIt ||
    (lat >= IT.latMin && lat <= IT.latMax && lng >= IT.lngMin && lng <= IT.lngMax);
}

// ── HERE Geocoding v7 ─────────────────────────────────────────────────────────
async function geocodeHere(indirizzo: string, apiKey: string): Promise<GeocodeResult | null> {
  const url =
    `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(indirizzo)}` +
    `&in=countryCode:ITA&lang=it-IT&limit=1&apiKey=${apiKey}`;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 8000);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) return null;
    const json = await resp.json() as {
      items?: Array<{
        position?: { lat?: number; lng?: number };
        address?: {
          label?: string; countryCode?: string; state?: string;
          county?: string; countyCode?: string; city?: string; postalCode?: string;
        };
      }>;
    };
    const item = json.items?.[0];
    const lat = item?.position?.lat;
    const lng = item?.position?.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    const a = item?.address ?? {};
    return {
      lat, lng,
      comune: a.city ?? null,
      provincia: a.countyCode ?? a.county ?? null,
      cap: a.postalCode ?? null,
      regione: a.state ?? null,
      formatted: a.label ?? null,
      in_italia: inItalia(lat, lng, a.countryCode === "ITA"),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(tid);
  }
}

// ── Google Geocoding ──────────────────────────────────────────────────────────
function findComp(comps: AddrComp[], type: string): AddrComp | undefined {
  return comps.find((c) => Array.isArray(c.types) && c.types.includes(type));
}

function parseGeocodeGoogle(resp: Record<string, unknown>): GeocodeResult | null {
  const status = resp.status as string | undefined;
  if (status && status !== "OK") return null;
  const results = resp.results as Array<Record<string, unknown>> | undefined;
  const first = results?.[0];
  if (!first) return null;
  const geometry = first.geometry as { location?: { lat?: number; lng?: number } } | undefined;
  const lat = geometry?.location?.lat;
  const lng = geometry?.location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  const comps = (first.address_components as AddrComp[]) ?? [];
  const comune =
    findComp(comps, "locality")?.long_name ??
    findComp(comps, "administrative_area_level_3")?.long_name ?? null;
  const provincia = findComp(comps, "administrative_area_level_2")?.short_name ?? null;
  const regione = findComp(comps, "administrative_area_level_1")?.long_name ?? null;
  const cap = findComp(comps, "postal_code")?.long_name ?? null;
  const paese = findComp(comps, "country")?.short_name ?? null;
  return {
    lat, lng, comune, provincia, cap, regione,
    formatted: (first.formatted_address as string) ?? null,
    in_italia: inItalia(lat, lng, paese === "IT"),
  };
}

async function geocodeGoogle(indirizzo: string, key: string): Promise<GeocodeResult | null> {
  const url =
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(indirizzo)}` +
    `&region=it&language=it&key=${key}`;
  try {
    const resp = await fetch(url);
    const json = (await resp.json()) as Record<string, unknown>;
    return parseGeocodeGoogle(json);
  } catch {
    return null;
  }
}

// ── Nominatim (OpenStreetMap) — fallback SENZA API key ────────────────────────
async function geocodeNominatim(indirizzo: string): Promise<GeocodeResult | null> {
  const url =
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(indirizzo)}` +
    `&countrycodes=it&format=jsonv2&addressdetails=1&limit=1`;
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), 8000);
  try {
    const resp = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "EdiliziaInCloud/1.0 (geocoding CRM outreach)" },
    });
    if (!resp.ok) return null;
    const arr = (await resp.json()) as Array<{
      lat?: string; lon?: string; display_name?: string; address?: Record<string, string>;
    }>;
    const item = arr?.[0];
    if (!item) return null;
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const a = item.address ?? {};
    const comune = a.city ?? a.town ?? a.village ?? a.municipality ?? a.county ?? null;
    const iso = a["ISO3166-2-lvl6"] ?? "";
    const provincia = iso.startsWith("IT-") ? iso.slice(3) : (a.county ?? null);
    return {
      lat, lng, comune, provincia,
      cap: a.postcode ?? null,
      regione: a.state ?? null,
      formatted: item.display_name ?? null,
      in_italia: inItalia(lat, lng, (a.country_code ?? "").toLowerCase() === "it"),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(tid);
  }
}

/** Restituisce true se la catena usa Nominatim (nessuna chiave HERE/Google). */
export function usesNominatimOnly(): boolean {
  return !Deno.env.get("HERE_API_KEY") &&
    !Deno.env.get("GOOGLE_GEOCODING_API_KEY") &&
    !Deno.env.get("GOOGLE_SOLAR_API_KEY") &&
    !Deno.env.get("GOOGLE_MAPS_API_KEY");
}

/**
 * Geocodifica un indirizzo con la catena di provider. Ritorna null se nessun
 * provider trova coordinate valide.
 */
export async function geocodeAddress(indirizzo: string): Promise<GeocodeResult | null> {
  const q = (indirizzo ?? "").trim();
  if (q.length < 4) return null;
  const hereKey = Deno.env.get("HERE_API_KEY");
  const googleKey =
    Deno.env.get("GOOGLE_GEOCODING_API_KEY") ??
    Deno.env.get("GOOGLE_SOLAR_API_KEY") ??
    Deno.env.get("GOOGLE_MAPS_API_KEY");
  let result: GeocodeResult | null = null;
  if (hereKey) result = await geocodeHere(q, hereKey);
  if (!result && googleKey) result = await geocodeGoogle(q, googleKey);
  if (!result) result = await geocodeNominatim(q);
  return result;
}
