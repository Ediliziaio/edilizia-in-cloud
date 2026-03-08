import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

import { corsHeaders, secureHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const GOOGLE_MAPS_API_KEY = await getPlatformSetting("google_maps_api_key", "GOOGLE_MAPS_API_KEY");
    if (!GOOGLE_MAPS_API_KEY) {
      return new Response(JSON.stringify({ error: "Maps API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const action = body.action as string;

    // ── AUTOCOMPLETE ──
    if (action === "autocomplete") {
      const query = body.query as string;
      if (!query || query.length < 3) {
        return new Response(JSON.stringify({ predictions: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const params = new URLSearchParams({
        input: query,
        components: `country:${body.country || "it"}`,
        language: "it",
        key: GOOGLE_MAPS_API_KEY,
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
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── PLACE DETAILS ──
    if (action === "place-details") {
      const placeId = body.place_id as string;
      if (!placeId) {
        return new Response(JSON.stringify({ error: "place_id required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
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
          headers: { ...corsHeaders, "Content-Type": "application/json" },
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
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── DIRECTIONS ──
    if (action === "directions") {
      const waypoints = body.waypoints as Array<{ lat: number; lng: number }>;
      if (!waypoints || waypoints.length < 2) {
        return new Response(
          JSON.stringify({ error: "At least 2 waypoints required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
