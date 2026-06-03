/**
 * geocode — parser della risposta Google Geocoding (indirizzo → coordinate +
 * componenti amministrativi). Toglie la frizione #1 dello Step 2 (oggi lat/lng
 * si inseriscono a mano). Puro e testabile; l'edge `fv-geocode` chiama l'API e
 * usa lo stesso parsing (mirror).
 */

export interface RisultatoGeocode {
  lat: number;
  lng: number;
  comune: string | null;
  provincia: string | null; // sigla, es. "MI"
  cap: string | null;
  regione: string | null;
  formatted: string | null;
  in_italia: boolean;
}

// Bounding box Italia (coerente con isCoordinataItalia del wizard).
const IT_LAT_MIN = 35;
const IT_LAT_MAX = 47.5;
const IT_LNG_MIN = 6;
const IT_LNG_MAX = 19;

interface AddrComp {
  long_name?: string;
  short_name?: string;
  types?: string[];
}

function findComp(comps: AddrComp[], type: string): AddrComp | undefined {
  return comps.find((c) => Array.isArray(c.types) && c.types.includes(type));
}

/**
 * Estrae il primo risultato dalla risposta Google Geocoding.
 * Ritorna null se status non OK o nessun risultato.
 */
export function parseGeocodeGoogle(resp: unknown): RisultatoGeocode | null {
  const r = resp as {
    status?: string;
    results?: Array<{
      formatted_address?: string;
      geometry?: { location?: { lat?: number; lng?: number } };
      address_components?: AddrComp[];
    }>;
  };
  if (!r || (r.status && r.status !== "OK")) return null;
  const first = r.results?.[0];
  if (!first) return null;

  const lat = first.geometry?.location?.lat;
  const lng = first.geometry?.location?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  const comps = first.address_components ?? [];
  const comune =
    findComp(comps, "locality")?.long_name ??
    findComp(comps, "administrative_area_level_3")?.long_name ??
    null;
  const provincia = findComp(comps, "administrative_area_level_2")?.short_name ?? null;
  const regione = findComp(comps, "administrative_area_level_1")?.long_name ?? null;
  const cap = findComp(comps, "postal_code")?.long_name ?? null;
  const paese = findComp(comps, "country")?.short_name ?? null;

  const in_italia =
    paese === "IT" ||
    (lat >= IT_LAT_MIN && lat <= IT_LAT_MAX && lng >= IT_LNG_MIN && lng <= IT_LNG_MAX);

  return {
    lat,
    lng,
    comune,
    provincia,
    cap,
    regione,
    formatted: first.formatted_address ?? null,
    in_italia,
  };
}
