import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

import { getCorsHeaders } from "../_shared/headers.ts";

import { serveConMetriche } from "../_shared/withMetrics.ts";
serveConMetriche("maps-proxy", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: authUser }, error: claimsError } = await supabase.auth.getUser(token);
    if (claimsError || !authUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // 2026-06-11: autocomplete e place-details passano a HERE (free tier
    // 250k/mese) — la chiave Google Places non è mai stata configurata e
    // l'autocomplete indirizzi era rotto da sempre. Google resta come
    // fallback se mai venisse aggiunta la chiave. "directions" resta su
    // Google (deprecato: i nuovi call site usano geo-router/getRoute).
    const HERE_API_KEY = Deno.env.get("HERE_API_KEY");
    const GOOGLE_MAPS_API_KEY = await getPlatformSetting("google_maps_api_key", "GOOGLE_MAPS_API_KEY");

    const body = await req.json();
    const action = body.action as string;

    if (!HERE_API_KEY && !GOOGLE_MAPS_API_KEY) {
      return new Response(JSON.stringify({ error: "Maps API key not configured" }), {
        status: 500,
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── STATICMAP (immagine satellitare del tetto per il wizard FV) ──
    // Ritorna un data URL base64 (la chiave resta server-side). Prova Google
    // Static Maps (satellite) poi HERE Map Image; se nessuna chiave/API risponde
    // torna { error: "static_map_unavailable" } e il frontend degrada con grazia.
    if (action === "staticmap") {
      const lat = Number(body.lat);
      const lng = Number(body.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return new Response(JSON.stringify({ error: "lat/lng required" }), {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }
      const zoom = Math.min(Math.max(Number(body.zoom) || 20, 1), 21);
      const w = Math.min(Number(body.w) || 700, 1280);
      const h = Math.min(Number(body.h) || 420, 1280);

      const toDataUrl = async (url: string): Promise<string | null> => {
        try {
          const res = await fetch(url);
          const ct = res.headers.get("content-type") || "";
          if (!res.ok || !ct.startsWith("image/")) return null;
          const bytes = new Uint8Array(await res.arrayBuffer());
          let bin = "";
          const CH = 0x8000;
          for (let i = 0; i < bytes.length; i += CH) {
            bin += String.fromCharCode(...bytes.subarray(i, i + CH));
          }
          return `data:${ct};base64,${btoa(bin)}`;
        } catch {
          return null;
        }
      };

      let dataUrl: string | null = null;
      let provider: string | null = null;
      if (GOOGLE_MAPS_API_KEY) {
        dataUrl = await toDataUrl(
          `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=${zoom}&size=${w}x${h}&scale=2&maptype=satellite&key=${GOOGLE_MAPS_API_KEY}`,
        );
        if (dataUrl) provider = "google";
      }
      if (!dataUrl && HERE_API_KEY) {
        // Request 2× pixel dimensions so the browser can downscale to display size,
        // compensating for HERE's lower tile resolution vs Google in rural areas.
        // Cap at 1280px to stay within HERE's max allowed dimension.
        const hw = Math.min(w * 2, 1280), hh = Math.min(h * 2, 1280);
        dataUrl = await toDataUrl(
          `https://image.maps.hereapi.com/mia/v3/base/mc/center:${lat},${lng};zoom=${Math.min(zoom, 20)}/${hw}x${hh}/png?style=satellite.day&apiKey=${HERE_API_KEY}`,
        );
        if (dataUrl) provider = "here";
      }

      return new Response(
        JSON.stringify(dataUrl ? { dataUrl, provider } : { error: "static_map_unavailable" }),
        { status: 200, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } },
      );
    }

    // ── AUTOCOMPLETE ──
    if (action === "autocomplete") {
      const query = body.query as string;
      if (!query || query.length < 3) {
        return new Response(JSON.stringify({ predictions: [] }), {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      if (HERE_API_KEY) {
        // HERE Autosuggest: "at" è obbligatorio come bias — centro Italia.
        const params = new URLSearchParams({
          q: query,
          at: "42.5,12.5",
          in: "countryCode:ITA",
          limit: "6",
          lang: "it",
          apiKey: HERE_API_KEY,
        });
        const res = await fetch(
          `https://autosuggest.search.hereapi.com/v1/autosuggest?${params}`
        );
        const data = await res.json();

        const predictions = (data.items || [])
          .filter((it: any) => it.id && it.address?.label)
          .map((it: any) => ({
            place_id: it.id,
            description: it.address.label,
            structured: { main_text: it.title, secondary_text: it.address.label },
          }));

        return new Response(JSON.stringify({ predictions }), {
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Fallback Google Places
      const params = new URLSearchParams({
        input: query,
        components: `country:${body.country || "it"}`,
        language: "it",
        key: GOOGLE_MAPS_API_KEY!,
      });

      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?${params}`
      );
      const data = await res.json();

      const predictions = (data.predictions || []).map((p: any) => ({
        place_id: p.place_id,
        description: p.description,
        structured: p.structured_formatting,
      }));

      return new Response(JSON.stringify({ predictions }), {
        headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
      });
    }

    // ── PLACE DETAILS ──
    if (action === "place-details") {
      const placeId = body.place_id as string;
      if (!placeId) {
        return new Response(JSON.stringify({ error: "place_id required" }), {
          status: 400,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Gli id HERE iniziano per "here:" — usali con HERE Lookup; gli id
      // Google (selezionati prima della migrazione o dal fallback) restano
      // sul ramo Google.
      if (HERE_API_KEY && placeId.startsWith("here:")) {
        const params = new URLSearchParams({
          id: placeId,
          lang: "it",
          apiKey: HERE_API_KEY,
        });
        const res = await fetch(
          `https://lookup.search.hereapi.com/v1/lookup?${params}`
        );
        if (!res.ok) {
          return new Response(JSON.stringify({ error: "Place not found" }), {
            status: 404,
            headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
          });
        }
        const it = await res.json();
        const a = it.address || {};
        const addressLine = a.street
          ? `${a.street}${a.houseNumber ? ` ${a.houseNumber}` : ""}`
          : "";

        return new Response(
          JSON.stringify({
            formatted_address: a.label || "",
            lat: it.position?.lat,
            lng: it.position?.lng,
            address_line: addressLine,
            city: a.city || "",
            postal_code: a.postalCode || "",
            province: a.countyCode || a.county || "",
            country: a.countryName || "",
          }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      if (!GOOGLE_MAPS_API_KEY) {
        return new Response(JSON.stringify({ error: "Place not found" }), {
          status: 404,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      const params = new URLSearchParams({
        place_id: placeId,
        fields: "formatted_address,geometry,address_components",
        language: "it",
        key: GOOGLE_MAPS_API_KEY,
      });

      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/details/json?${params}`
      );
      const data = await res.json();
      const result = data.result;

      if (!result) {
        return new Response(JSON.stringify({ error: "Place not found" }), {
          status: 404,
          headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
        });
      }

      // Parse address components
      const components = result.address_components || [];
      const get = (type: string) =>
        components.find((c: any) => c.types.includes(type))?.long_name || "";

      const streetNumber = get("street_number");
      const route = get("route");
      const addressLine = route ? `${route}${streetNumber ? ` ${streetNumber}` : ""}` : "";

      return new Response(
        JSON.stringify({
          formatted_address: result.formatted_address,
          lat: result.geometry?.location?.lat,
          lng: result.geometry?.location?.lng,
          address_line: addressLine,
          city: get("locality") || get("administrative_area_level_3"),
          postal_code: get("postal_code"),
          province: get("administrative_area_level_2"),
          country: get("country"),
        }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    // ── DIRECTIONS ── (deprecato: usare geo-router action=route / getRoute)
    if (action === "directions") {
      if (!GOOGLE_MAPS_API_KEY) {
        return new Response(
          JSON.stringify({ error: "directions richiede GOOGLE_MAPS_API_KEY — usare geo-router (HERE)" }),
          { status: 501, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }
      const waypoints = body.waypoints as Array<{ lat: number; lng: number }>;
      if (!waypoints || waypoints.length < 2) {
        return new Response(
          JSON.stringify({ error: "At least 2 waypoints required" }),
          { status: 400, headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      const origin = `${waypoints[0].lat},${waypoints[0].lng}`;
      const destination = `${waypoints[waypoints.length - 1].lat},${waypoints[waypoints.length - 1].lng}`;

      const params = new URLSearchParams({
        origin,
        destination,
        mode: "driving",
        language: "it",
        key: GOOGLE_MAPS_API_KEY,
      });

      if (waypoints.length > 2) {
        const intermediate = waypoints
          .slice(1, -1)
          .map((w) => `${w.lat},${w.lng}`)
          .join("|");
        params.set("waypoints", intermediate);
      }

      const res = await fetch(
        `https://maps.googleapis.com/maps/api/directions/json?${params}`
      );
      const data = await res.json();

      if (!data.routes?.length) {
        return new Response(
          JSON.stringify({ error: "No route found", legs: [], total_duration_s: 0, total_distance_m: 0 }),
          { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
        );
      }

      const route = data.routes[0];
      const legs = route.legs.map((leg: any) => ({
        distance_m: leg.distance?.value || 0,
        duration_s: leg.duration?.value || 0,
        distance_text: leg.distance?.text || "",
        duration_text: leg.duration?.text || "",
        start_address: leg.start_address,
        end_address: leg.end_address,
      }));

      const totalDuration = legs.reduce((s: number, l: any) => s + l.duration_s, 0);
      const totalDistance = legs.reduce((s: number, l: any) => s + l.distance_m, 0);

      return new Response(
        JSON.stringify({
          legs,
          total_duration_s: totalDuration,
          total_distance_m: totalDistance,
        }),
        { headers: { ...getCorsHeaders(req), "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
