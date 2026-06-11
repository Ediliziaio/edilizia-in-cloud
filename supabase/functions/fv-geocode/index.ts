/**
 * fv-geocode — indirizzo → coordinate.
 * Toglie la frizione dell'inserimento manuale di lat/lng nello Step 2 FV.
 *
 * Body: { indirizzo: string }
 * Output: { lat, lng, comune, provincia, cap, regione, formatted, in_italia }
 *
 * Provider (in ordine):
 *   1. HERE Geocoding (HERE_API_KEY) — 250k req/mese free tier
 *   2. Google Geocoding (GOOGLE_GEOCODING_API_KEY / GOOGLE_SOLAR_API_KEY /
 *      GOOGLE_MAPS_API_KEY) — riserva, ~10k free/mese
 * Se nessuna chiave è configurata ritorna 503 e il frontend resta
 * sull'inserimento manuale.
 *
 * Il parsing Google è mirror di src/lib/fotovoltaico/geocode.ts (unit test).
 */
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

interface Payload {
  indirizzo?: string;
}

interface AddrComp {
  long_name?: string;
  short_name?: string;
  types?: string[];
}

interface GeocodeResult {
  lat: number;
  lng: number;
  comune: string | null;
  provincia: string | null;
  cap: string | null;
  regione: string | null;
  formatted: string | null;
  in_italia: boolean;
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
          label?: string;
          countryCode?: string;
          state?: string;       // es. "Lombardia"
          county?: string;      // es. "Milano"
          countyCode?: string;  // es. "MI"
          city?: string;
          postalCode?: string;
        };
      }>;
    };
    const item = json.items?.[0];
    const lat = item?.position?.lat;
    const lng = item?.position?.lng;
    if (typeof lat !== "number" || typeof lng !== "number") return null;
    const a = item?.address ?? {};
    return {
      lat,
      lng,
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

// ── Google Geocoding (fallback) ───────────────────────────────────────────────
function findComp(comps: AddrComp[], type: string): AddrComp | undefined {
  return comps.find((c) => Array.isArray(c.types) && c.types.includes(type));
}

// Mirror di parseGeocodeGoogle (src/lib/fotovoltaico/geocode.ts).
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
    lat,
    lng,
    comune,
    provincia,
    cap,
    regione,
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

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return errorResponse("Method not allowed", 405, corsHeaders);

  try {
    await requireAuth(req, corsHeaders);

    const p = (await req.json()) as Payload;
    const indirizzo = (p.indirizzo ?? "").trim();
    if (indirizzo.length < 4) {
      return errorResponse("Indirizzo troppo corto", 400, corsHeaders);
    }

    const hereKey = Deno.env.get("HERE_API_KEY");
    const googleKey =
      Deno.env.get("GOOGLE_GEOCODING_API_KEY") ??
      Deno.env.get("GOOGLE_SOLAR_API_KEY") ??
      Deno.env.get("GOOGLE_MAPS_API_KEY");

    if (!hereKey && !googleKey) {
      return errorResponse("Geocoding non configurato (nessuna chiave)", 503, corsHeaders);
    }

    let result: GeocodeResult | null = null;
    if (hereKey) result = await geocodeHere(indirizzo, hereKey);
    if (!result && googleKey) result = await geocodeGoogle(indirizzo, googleKey);

    if (!result) {
      return errorResponse("Indirizzo non trovato", 404, corsHeaders);
    }
    return jsonResponse(result, 200, corsHeaders);
  } catch (e) {
    return errorResponse(
      e instanceof Error ? e.message : "Errore geocoding",
      500,
      corsHeaders,
    );
  }
});
