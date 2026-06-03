/**
 * fv-geocode — indirizzo → coordinate (Google Geocoding API).
 * Toglie la frizione dell'inserimento manuale di lat/lng nello Step 2 FV.
 *
 * Body: { indirizzo: string }
 * Output: { lat, lng, comune, provincia, cap, regione, formatted, in_italia }
 *
 * Usa la stessa chiave Google del modulo FV (GOOGLE_GEOCODING_API_KEY, con
 * fallback su GOOGLE_SOLAR_API_KEY / GOOGLE_MAPS_API_KEY). Se la chiave non è
 * configurata ritorna 503 e il frontend resta sull'inserimento manuale.
 *
 * Il parsing è mirror di src/lib/fotovoltaico/geocode.ts (coperto da unit test).
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

const IT = { latMin: 35, latMax: 47.5, lngMin: 6, lngMax: 19 };

function findComp(comps: AddrComp[], type: string): AddrComp | undefined {
  return comps.find((c) => Array.isArray(c.types) && c.types.includes(type));
}

// Mirror di parseGeocodeGoogle (src/lib/fotovoltaico/geocode.ts).
function parseGeocodeGoogle(resp: Record<string, unknown>) {
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

  const in_italia =
    paese === "IT" ||
    (lat >= IT.latMin && lat <= IT.latMax && lng >= IT.lngMin && lng <= IT.lngMax);

  return {
    lat,
    lng,
    comune,
    provincia,
    cap,
    regione,
    formatted: (first.formatted_address as string) ?? null,
    in_italia,
  };
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

    const key =
      Deno.env.get("GOOGLE_GEOCODING_API_KEY") ??
      Deno.env.get("GOOGLE_SOLAR_API_KEY") ??
      Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!key) {
      return errorResponse("Geocoding non configurato (chiave Google assente)", 503, corsHeaders);
    }

    const url =
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(indirizzo)}` +
      `&region=it&language=it&key=${key}`;
    const resp = await fetch(url);
    const json = (await resp.json()) as Record<string, unknown>;

    const result = parseGeocodeGoogle(json);
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
