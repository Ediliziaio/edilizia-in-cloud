/**
 * geo-router — geocoding + routing via HERE API con cache globale
 *
 * Sostituisce le chiamate client-side dirette a Nominatim/OSRM con HERE
 * (250k req/mese free tier, tempi con traffico reale). Il client mantiene
 * Nominatim/OSRM come fallback se questa funzione risponde con errore
 * (es. HERE_API_KEY mancante o quota esaurita).
 *
 * Actions (POST):
 *   { action: "geocode", address: string }
 *     → { lat, lng, label, cached }
 *   { action: "reverse", lat: number, lng: number }
 *     → { address, cached }
 *   { action: "route", waypoints: [{lat,lng}, ...] }   (min 2, max 25)
 *     → { coordinates: [[lat,lng],...], durationSec, distanceMeters,
 *         legs: [{durationSec, distanceMeters}] }
 *
 * Cache: tabella geo_cache (globale cross-company) per geocode/reverse.
 * Le route NON sono cached (dipendono dal traffico in tempo reale).
 *
 * Auth: utente Supabase autenticato (qualsiasi ruolo).
 * Secret: HERE_API_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

// ── HERE flexible polyline decoder ───────────────────────────────────────────
// Porting del decoder ufficiale heremaps/flexible-polyline (MIT license).
// HERE Routing v8 NON usa il Google Encoded Polyline: serve questo formato.
const DECODING_TABLE = [
  62, -1, -1, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, -1, -1, -1, -1, -1, -1,
  -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
  20, 21, 22, 23, 24, 25, -1, -1, -1, -1, 63, -1, 26, 27, 28, 29, 30, 31, 32,
  33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51,
];

function decodeUnsignedValues(encoded: string): bigint[] {
  let result = 0n;
  let shift = 0n;
  const values: bigint[] = [];
  for (const char of encoded) {
    const value = BigInt(DECODING_TABLE[char.charCodeAt(0) - 45]);
    result |= (value & 0x1fn) << shift;
    if ((value & 0x20n) === 0n) {
      values.push(result);
      result = 0n;
      shift = 0n;
    } else {
      shift += 5n;
    }
  }
  if (shift > 0n) throw new Error("Invalid flexible polyline encoding");
  return values;
}

function toSigned(val: bigint): number {
  let res = val;
  if (res & 1n) res = ~res;
  res >>= 1n;
  return Number(res);
}

function decodeFlexiblePolyline(encoded: string): [number, number][] {
  const values = decodeUnsignedValues(encoded);
  const header = Number(values[1]);
  const precision = header & 15;
  const thirdDim = (header >> 4) & 7;
  const factor = 10 ** precision;

  let lat = 0;
  let lng = 0;
  const coords: [number, number][] = [];
  const step = thirdDim ? 3 : 2;

  for (let i = 2; i + 1 < values.length; i += step) {
    lat += toSigned(values[i]);
    lng += toSigned(values[i + 1]);
    coords.push([lat / factor, lng / factor]);
  }
  return coords;
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function admin() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

function json(data: unknown, status = 200, cors: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

const HERE_TIMEOUT_MS = 8000;

async function hereFetch(url: string): Promise<Response> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), HERE_TIMEOUT_MS);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(tid);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

  // Auth: utente Supabase autenticato
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "unauthorized" }, 401, cors);
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401, cors);

  const apiKey = Deno.env.get("HERE_API_KEY");
  if (!apiKey) return json({ error: "here_not_configured" }, 503, cors);

  let body: {
    action?: string;
    address?: string;
    lat?: number;
    lng?: number;
    waypoints?: Array<{ lat: number; lng: number }>;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400, cors);
  }

  const db = admin();

  // ── GEOCODE ────────────────────────────────────────────────────────────────
  if (body.action === "geocode") {
    const address = (body.address ?? "").trim();
    if (!address) return json({ error: "address_required" }, 400, cors);

    const cacheKey = `geocode:${address.toLowerCase()}`;
    const { data: cached } = await db
      .from("geo_cache")
      .select("payload")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (cached?.payload) {
      // fire-and-forget: aggiorna last_hit senza bloccare la risposta
      db.from("geo_cache")
        .update({ last_hit_at: new Date().toISOString() })
        .eq("cache_key", cacheKey)
        .then(() => {});
      return json({ ...cached.payload, cached: true }, 200, cors);
    }

    try {
      const url = `https://geocode.search.hereapi.com/v1/geocode?q=${encodeURIComponent(address)}&in=countryCode:ITA&lang=it-IT&limit=1&apiKey=${apiKey}`;
      const res = await hereFetch(url);
      if (!res.ok) return json({ error: `here_http_${res.status}` }, 502, cors);
      const data = await res.json() as {
        items?: Array<{ position: { lat: number; lng: number }; address?: { label?: string } }>;
      };
      const item = data.items?.[0];
      if (!item) return json({ error: "not_found" }, 404, cors);

      const payload = {
        lat: item.position.lat,
        lng: item.position.lng,
        label: item.address?.label ?? address,
      };
      await db.from("geo_cache").upsert(
        { cache_key: cacheKey, kind: "geocode", payload, provider: "here" },
        { onConflict: "cache_key" },
      );
      return json({ ...payload, cached: false }, 200, cors);
    } catch {
      return json({ error: "here_timeout" }, 504, cors);
    }
  }

  // ── REVERSE ────────────────────────────────────────────────────────────────
  if (body.action === "reverse") {
    const { lat, lng } = body;
    if (typeof lat !== "number" || typeof lng !== "number") {
      return json({ error: "lat_lng_required" }, 400, cors);
    }

    // 4 decimali ≈ 11m — stessa precisione della cache client esistente
    const cacheKey = `reverse:${lat.toFixed(4)},${lng.toFixed(4)}`;
    const { data: cached } = await db
      .from("geo_cache")
      .select("payload")
      .eq("cache_key", cacheKey)
      .maybeSingle();
    if (cached?.payload) {
      db.from("geo_cache")
        .update({ last_hit_at: new Date().toISOString() })
        .eq("cache_key", cacheKey)
        .then(() => {});
      return json({ ...cached.payload, cached: true }, 200, cors);
    }

    try {
      const url = `https://revgeocode.search.hereapi.com/v1/revgeocode?at=${lat},${lng}&lang=it-IT&limit=1&apiKey=${apiKey}`;
      const res = await hereFetch(url);
      if (!res.ok) return json({ error: `here_http_${res.status}` }, 502, cors);
      const data = await res.json() as {
        items?: Array<{
          address?: { street?: string; houseNumber?: string; city?: string; label?: string };
        }>;
      };
      const a = data.items?.[0]?.address;
      if (!a) return json({ error: "not_found" }, 404, cors);

      const parts = [a.street, a.houseNumber, a.city].filter(Boolean);
      const address = parts.length > 0 ? parts.join(", ") : (a.label ?? "Indirizzo non disponibile");

      const payload = { address };
      await db.from("geo_cache").upsert(
        { cache_key: cacheKey, kind: "reverse", payload, provider: "here" },
        { onConflict: "cache_key" },
      );
      return json({ ...payload, cached: false }, 200, cors);
    } catch {
      return json({ error: "here_timeout" }, 504, cors);
    }
  }

  // ── ROUTE ──────────────────────────────────────────────────────────────────
  if (body.action === "route") {
    const wps = body.waypoints ?? [];
    if (wps.length < 2) return json({ error: "min_2_waypoints" }, 400, cors);
    if (wps.length > 25) return json({ error: "max_25_waypoints" }, 400, cors);
    for (const w of wps) {
      if (typeof w?.lat !== "number" || typeof w?.lng !== "number") {
        return json({ error: "invalid_waypoint" }, 400, cors);
      }
    }

    const origin = wps[0];
    const destination = wps[wps.length - 1];
    const vias = wps.slice(1, -1);

    const params = new URLSearchParams({
      transportMode: "car",
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      return: "polyline,summary",
      lang: "it-IT",
      apiKey,
    });
    // HERE accetta "via" ripetuto per ogni tappa intermedia
    let url = `https://router.hereapi.com/v8/routes?${params}`;
    for (const v of vias) url += `&via=${v.lat},${v.lng}`;

    try {
      const res = await hereFetch(url);
      if (!res.ok) return json({ error: `here_http_${res.status}` }, 502, cors);
      const data = await res.json() as {
        routes?: Array<{
          sections?: Array<{
            polyline?: string;
            summary?: { duration: number; length: number };
          }>;
        }>;
      };
      const sections = data.routes?.[0]?.sections;
      if (!sections?.length) return json({ error: "no_route" }, 404, cors);

      const coordinates: [number, number][] = [];
      const legs: Array<{ durationSec: number; distanceMeters: number }> = [];
      let durationSec = 0;
      let distanceMeters = 0;

      for (const section of sections) {
        if (section.polyline) {
          const decoded = decodeFlexiblePolyline(section.polyline);
          // evita il punto duplicato alla giunzione tra sezioni
          coordinates.push(...(coordinates.length > 0 ? decoded.slice(1) : decoded));
        }
        const dur = section.summary?.duration ?? 0;
        const len = section.summary?.length ?? 0;
        legs.push({ durationSec: dur, distanceMeters: len });
        durationSec += dur;
        distanceMeters += len;
      }

      return json({ coordinates, durationSec, distanceMeters, legs }, 200, cors);
    } catch {
      return json({ error: "here_timeout" }, 504, cors);
    }
  }

  return json({ error: "invalid_action" }, 400, cors);
});
