/**
 * route-geocoder — geocoding indirizzi + distance matrix con cache
 *
 * Usa Google Maps API se chiave presente, altrimenti fallback OSM Nominatim.
 *
 * Endpoints:
 *   POST { action: 'geocode', addresses: [{ id, address, reference_type, reference_id }] }
 *     → { results: [{ id, lat, lng, normalized_address }] }
 *
 *   POST { action: 'distance_matrix', origin_ids: uuid[], destination_ids: uuid[] }
 *     → { distances: [[meters, seconds, ...]] } using cache
 */
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.43.4";

interface GeocodeBody {
  action: "geocode";
  company_id: string;
  addresses: Array<{
    id?: string;
    address: string;
    reference_type: string;
    reference_id?: string;
  }>;
}

interface DistanceMatrixBody {
  action: "distance_matrix";
  company_id: string;
  origin_ids: string[];
  destination_ids: string[];
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("method_not_allowed", { status: 405 });
  }

  const auth = req.headers.get("Authorization");
  if (!auth) return jsonErr("unauthorized", 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body = await req.json().catch(() => null);
  if (!body) return jsonErr("invalid_json");

  if (body.action === "geocode") {
    return await handleGeocode(supabase, body as GeocodeBody);
  }
  if (body.action === "distance_matrix") {
    return await handleDistanceMatrix(supabase, body as DistanceMatrixBody);
  }
  return jsonErr("invalid_action");
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleGeocode(supabase: any, body: GeocodeBody): Promise<Response> {
  const googleKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  const results: Array<{ id?: string; lat: number; lng: number; normalized_address: string; cached?: boolean }> = [];

  for (const addr of body.addresses) {
    // Cache check
    if (addr.reference_id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: cached } = await (supabase as any)
        .from("geocoded_locations")
        .select("id, lat, lng, normalized_address")
        .eq("company_id", body.company_id)
        .eq("reference_type", addr.reference_type)
        .eq("reference_id", addr.reference_id)
        .single();
      if (cached) {
        results.push({
          id: cached.id,
          lat: Number(cached.lat),
          lng: Number(cached.lng),
          normalized_address: cached.normalized_address,
          cached: true,
        });
        continue;
      }
    }

    // Geocode
    let lat = 0, lng = 0, normalized = addr.address, source = "osm_nominatim";

    if (googleKey) {
      try {
        const r = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(addr.address)}&key=${googleKey}`,
        );
        const data = await r.json();
        const top = data.results?.[0];
        if (top) {
          lat = top.geometry.location.lat;
          lng = top.geometry.location.lng;
          normalized = top.formatted_address;
          source = "google";
        }
      } catch (e) {
        console.error("google_geocode_error", e);
      }
    }

    // Fallback Nominatim (gratis ma rate-limited)
    if (lat === 0 && lng === 0) {
      try {
        const r = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(addr.address)}&limit=1`,
          { headers: { "User-Agent": "EdiliziaInCloud/1.0 (info@aedix.it)" } },
        );
        const data = await r.json();
        const top = data?.[0];
        if (top) {
          lat = parseFloat(top.lat);
          lng = parseFloat(top.lon);
          normalized = top.display_name;
        }
      } catch (e) {
        console.error("nominatim_error", e);
      }
    }

    if (lat === 0 && lng === 0) {
      results.push({ lat: 0, lng: 0, normalized_address: addr.address });
      continue;
    }

    // Salva cache
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: ins } = await (supabase as any)
      .from("geocoded_locations")
      .upsert({
        company_id: body.company_id,
        reference_type: addr.reference_type,
        reference_id: addr.reference_id,
        full_address: addr.address,
        normalized_address: normalized,
        lat,
        lng,
        geocoder_source: source,
      }, { onConflict: "company_id,reference_type,reference_id" })
      .select("id")
      .single();

    results.push({
      id: ins?.id,
      lat,
      lng,
      normalized_address: normalized,
    });

    // Throttle Nominatim 1 req/sec
    if (source === "osm_nominatim") {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return jsonOk({ results });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleDistanceMatrix(supabase: any, body: DistanceMatrixBody): Promise<Response> {
  const googleKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  const matrix: Array<{
    origin_id: string;
    destination_id: string;
    meters: number;
    seconds: number;
    cached: boolean;
  }> = [];

  // Cache lookup
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: cached } = await (supabase as any)
    .from("distance_matrix_cache")
    .select("origin_location_id, destination_location_id, distance_meters, duration_seconds")
    .in("origin_location_id", body.origin_ids)
    .in("destination_location_id", body.destination_ids);

  const cachedMap = new Map<string, { meters: number; seconds: number }>();
  for (const c of (cached ?? [])) {
    cachedMap.set(`${c.origin_location_id}|${c.destination_location_id}`, {
      meters: c.distance_meters,
      seconds: c.duration_seconds,
    });
  }

  // Trova coppie mancanti
  const missing: Array<{ origin: string; destination: string }> = [];
  for (const o of body.origin_ids) {
    for (const d of body.destination_ids) {
      if (o === d) continue;
      const key = `${o}|${d}`;
      const c = cachedMap.get(key);
      if (c) {
        matrix.push({ origin_id: o, destination_id: d, ...c, cached: true });
      } else {
        missing.push({ origin: o, destination: d });
      }
    }
  }

  if (missing.length === 0) {
    return jsonOk({ matrix });
  }

  // Carica lat/lng degli ID mancanti
  const allIds = Array.from(new Set([...missing.map((m) => m.origin), ...missing.map((m) => m.destination)]));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: locs } = await (supabase as any)
    .from("geocoded_locations")
    .select("id, lat, lng")
    .in("id", allIds);

  const locMap = new Map<string, { lat: number; lng: number }>();
  for (const l of (locs ?? [])) {
    locMap.set(l.id, { lat: Number(l.lat), lng: Number(l.lng) });
  }

  if (googleKey) {
    // Google Distance Matrix API: max 25 origins × 25 destinations per call
    // Semplifico facendo 1 chiamata per ogni origin
    const uniqueOrigins = Array.from(new Set(missing.map((m) => m.origin)));
    for (const oId of uniqueOrigins) {
      const o = locMap.get(oId);
      if (!o) continue;
      const destIds = missing.filter((m) => m.origin === oId).map((m) => m.destination);
      const destCoords = destIds.map((d) => locMap.get(d)).filter(Boolean) as { lat: number; lng: number }[];
      if (destCoords.length === 0) continue;

      try {
        const url = `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${o.lat},${o.lng}&destinations=${destCoords.map((d) => `${d.lat},${d.lng}`).join("|")}&key=${googleKey}&mode=driving&units=metric`;
        const r = await fetch(url);
        const data = await r.json();
        const elements = data.rows?.[0]?.elements ?? [];
        for (let i = 0; i < destIds.length; i++) {
          const el = elements[i];
          if (el?.status === "OK") {
            const meters = el.distance.value;
            const seconds = el.duration.value;
            const dId = destIds[i];

            // Save cache
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (supabase as any)
              .from("distance_matrix_cache")
              .upsert({
                origin_location_id: oId,
                destination_location_id: dId,
                distance_meters: meters,
                duration_seconds: seconds,
                source: "google_distance_matrix",
              }, { onConflict: "origin_location_id,destination_location_id" });

            matrix.push({ origin_id: oId, destination_id: dId, meters, seconds, cached: false });
          }
        }
      } catch (e) {
        console.error("google_dm_error", e);
      }
    }
  } else {
    // Fallback: distanza euclidea (haversine) come stima rough
    for (const m of missing) {
      const o = locMap.get(m.origin);
      const d = locMap.get(m.destination);
      if (!o || !d) continue;
      const meters = haversine(o.lat, o.lng, d.lat, d.lng);
      const seconds = Math.round(meters / 13.89);  // 50 km/h media

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from("distance_matrix_cache")
        .upsert({
          origin_location_id: m.origin,
          destination_location_id: m.destination,
          distance_meters: meters,
          duration_seconds: seconds,
          source: "haversine_fallback",
        }, { onConflict: "origin_location_id,destination_location_id" });

      matrix.push({ origin_id: m.origin, destination_id: m.destination, meters, seconds, cached: false });
    }
  }

  return jsonOk({ matrix });
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // earth meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify({ ok: true, ...((body as object) ?? {}) }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
function jsonErr(error: string, status = 400): Response {
  return new Response(JSON.stringify({ ok: false, error }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
