import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Haversine distance in km
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Estimate driving: haversine * 1.3 for km, speed ~50km/h for minutes
function haversineEstimate(lat1: number, lng1: number, lat2: number, lng2: number) {
  const km = haversineKm(lat1, lng1, lat2, lng2) * 1.3;
  const minutes = (km / 50) * 60;
  return { km: Math.round(km * 10) / 10, minutes: Math.round(minutes), isEstimate: true };
}

interface DirectionsLeg {
  distance_m: number;
  duration_s: number;
}

async function getDirections(
  apiKey: string | null,
  waypoints: { lat: number; lng: number }[]
): Promise<{ legs: DirectionsLeg[]; total_km: number; total_minutes: number; isEstimate: boolean }> {
  if (waypoints.length < 2) return { legs: [], total_km: 0, total_minutes: 0, isEstimate: false };

  // Try Google Maps API first
  if (apiKey) {
    try {
      const origin = `${waypoints[0].lat},${waypoints[0].lng}`;
      const destination = `${waypoints[waypoints.length - 1].lat},${waypoints[waypoints.length - 1].lng}`;
      const params = new URLSearchParams({
        origin,
        destination,
        mode: "driving",
        language: "it",
        key: apiKey,
      });
      if (waypoints.length > 2) {
        const intermediate = waypoints.slice(1, -1).map((w) => `${w.lat},${w.lng}`).join("|");
        params.set("waypoints", intermediate);
      }
      const res = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`);
      const data = await res.json();
      if (data.routes?.length) {
        const route = data.routes[0];
        const legs: DirectionsLeg[] = route.legs.map((leg: any) => ({
          distance_m: leg.distance?.value || 0,
          duration_s: leg.duration?.value || 0,
        }));
        const total_km = legs.reduce((s, l) => s + l.distance_m, 0) / 1000;
        const total_minutes = legs.reduce((s, l) => s + l.duration_s, 0) / 60;
        return {
          legs,
          total_km: Math.round(total_km * 10) / 10,
          total_minutes: Math.round(total_minutes),
          isEstimate: false,
        };
      }
    } catch {
      // Fall through to haversine
    }
  }

  // Haversine fallback
  let totalKm = 0;
  let totalMinutes = 0;
  const legs: DirectionsLeg[] = [];
  for (let i = 0; i < waypoints.length - 1; i++) {
    const est = haversineEstimate(waypoints[i].lat, waypoints[i].lng, waypoints[i + 1].lat, waypoints[i + 1].lng);
    totalKm += est.km;
    totalMinutes += est.minutes;
    legs.push({ distance_m: Math.round(est.km * 1000), duration_s: est.minutes * 60 });
  }
  return { legs, total_km: Math.round(totalKm * 10) / 10, total_minutes: Math.round(totalMinutes), isEstimate: true };
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function minutesToTime(m: number): string {
  const h = Math.floor(m / 60) % 24;
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

interface Appointment {
  id: string;
  appointment_time: string | null;
  appointment_end_time: string | null;
  lat: number | null;
  lng: number | null;
  formatted_address: string | null;
  title: string;
  is_blocked_slot: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const body = await req.json();
    const { company_id, client_lat, client_lng, date, desired_start_time } = body;

    if (!company_id || client_lat == null || client_lng == null || !date) {
      return new Response(JSON.stringify({ error: "Missing required fields: company_id, client_lat, client_lng, date" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Get all active calendars
    const { data: calendars, error: calErr } = await supabase
      .from("marketing_calendars")
      .select("id, name, base_lat, base_lng, base_formatted_address, owner_id, duration_minutes, max_daily_km")
      .eq("company_id", company_id)
      .eq("is_active", true);
    if (calErr) throw calErr;

    if (!calendars || calendars.length === 0) {
      return new Response(JSON.stringify({ suggestions: [], message: "Nessun calendario attivo" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Get company preferences
    const { data: prefs } = await supabase
      .from("marketing_calendar_preferences")
      .select("default_max_daily_km, max_travel_minutes, default_appointment_duration_minutes")
      .eq("company_id", company_id)
      .maybeSingle();

    const defaultMaxDailyKm = prefs?.default_max_daily_km ?? 250;
    const maxTravelMinutes = prefs?.max_travel_minutes ?? 60;
    const defaultDuration = prefs?.default_appointment_duration_minutes ?? 90;

    // 3. Get company fallback coordinates
    const { data: company } = await supabase
      .from("companies")
      .select("operational_lat, operational_lng, operational_address")
      .eq("id", company_id)
      .maybeSingle();

    const fallbackLat = company?.operational_lat;
    const fallbackLng = company?.operational_lng;

    // 4. Get Google Maps API key
    let apiKey: string | null = null;
    try {
      apiKey = await getPlatformSetting("google_maps_api_key", "GOOGLE_MAPS_API_KEY");
    } catch { /* fallback to haversine */ }

    // 5. Get availability for the day
    const dayOfWeek = new Date(date).getDay();
    const { data: allAvailability } = await supabase
      .from("marketing_calendar_availability")
      .select("calendar_id, start_time, end_time, is_enabled, day_of_week, specific_date")
      .eq("company_id", company_id)
      .eq("is_enabled", true);

    // 6. Get owner profiles for names
    const ownerIds = calendars.map((c) => c.owner_id).filter(Boolean) as string[];
    let ownerProfiles: Record<string, string> = {};
    if (ownerIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", ownerIds);
      if (profiles) {
        ownerProfiles = Object.fromEntries(profiles.map((p) => [p.id, `${p.first_name} ${p.last_name}`]));
      }
    }

    // 7. Process each calendar
    const suggestions: any[] = [];

    for (const cal of calendars) {
      const baseLat = cal.base_lat ?? fallbackLat;
      const baseLng = cal.base_lng ?? fallbackLng;
      const maxKm = cal.max_daily_km ?? defaultMaxDailyKm;
      const calDuration = cal.duration_minutes || defaultDuration;

      const hasBase = baseLat != null && baseLng != null;
      if (!hasBase) {
        suggestions.push({
          calendar_id: cal.id,
          calendar_name: cal.name,
          owner_name: cal.owner_id ? ownerProfiles[cal.owner_id] || null : null,
          travel_km: 0,
          travel_minutes: 0,
          daily_km_if_assigned: 0,
          max_daily_km: maxKm,
          suggested_times: [],
          reason: "Base non configurata",
          status: "WARNING",
          score: 9999,
          daily_route: [],
          is_estimate: false,
        });
        continue;
      }

      // Get existing appointments for this calendar on this date
      const { data: existingAppts } = await supabase
        .from("appointments")
        .select("id, title, appointment_time, appointment_end_time, lat, lng, formatted_address, is_blocked_slot")
        .eq("calendar_id", cal.id)
        .eq("appointment_date", date)
        .neq("status", "annullato")
        .order("appointment_time");

      const appts: Appointment[] = (existingAppts || []).filter((a) => a.appointment_time);

      // Sort by time
      appts.sort((a, b) => (a.appointment_time || "").localeCompare(b.appointment_time || ""));

      // Build waypoints for current route: Base → App1 → ... → AppN → Base
      const currentWaypoints: { lat: number; lng: number }[] = [{ lat: baseLat!, lng: baseLng! }];
      for (const a of appts) {
        if (a.lat != null && a.lng != null) {
          currentWaypoints.push({ lat: a.lat, lng: a.lng });
        }
      }
      currentWaypoints.push({ lat: baseLat!, lng: baseLng! });

      // Calculate current daily km
      const currentRoute = await getDirections(apiKey, currentWaypoints);

      // Calculate direct travel from base to client
      const baseToClient = await getDirections(apiKey, [
        { lat: baseLat!, lng: baseLng! },
        { lat: client_lat, lng: client_lng },
      ]);

      // Find the closest existing appointment to client
      let closestAppt: Appointment | null = null;
      let closestDist = Infinity;
      for (const a of appts) {
        if (a.lat != null && a.lng != null && !a.is_blocked_slot) {
          const d = haversineKm(client_lat, client_lng, a.lat, a.lng);
          if (d < closestDist) {
            closestDist = d;
            closestAppt = a;
          }
        }
      }

      // Simulate adding new appointment - build new route
      const newApptWaypoint = { lat: client_lat, lng: client_lng };
      const simWaypoints: { lat: number; lng: number }[] = [{ lat: baseLat!, lng: baseLng! }];
      // Insert new waypoint in chronological order
      let inserted = false;
      for (const a of appts) {
        if (a.lat != null && a.lng != null) {
          if (!inserted && desired_start_time) {
            const aTime = a.appointment_time?.substring(0, 5) || "00:00";
            if (desired_start_time < aTime) {
              simWaypoints.push(newApptWaypoint);
              inserted = true;
            }
          }
          simWaypoints.push({ lat: a.lat, lng: a.lng });
        }
      }
      if (!inserted) simWaypoints.push(newApptWaypoint);
      simWaypoints.push({ lat: baseLat!, lng: baseLng! });

      const simRoute = await getDirections(apiKey, simWaypoints);

      // Calculate travel time to client from nearest point
      let travelToClient = baseToClient;
      if (closestAppt && closestAppt.lat != null && closestAppt.lng != null) {
        const fromClosest = await getDirections(apiKey, [
          { lat: closestAppt.lat, lng: closestAppt.lng },
          { lat: client_lat, lng: client_lng },
        ]);
        if (fromClosest.total_minutes < baseToClient.total_minutes) {
          travelToClient = fromClosest;
        }
      }

      // Generate suggested times
      const suggestedTimes: string[] = [];

      // Get availability for this calendar on this day
      const calAvail = (allAvailability || []).filter(
        (a) =>
          a.calendar_id === cal.id &&
          ((a.specific_date === date) || (a.specific_date === null && a.day_of_week === dayOfWeek))
      );
      const availWindows = calAvail.map((a) => ({
        start: timeToMinutes(a.start_time),
        end: timeToMinutes(a.end_time),
      }));

      // If desired_start_time provided, check it first
      if (desired_start_time) {
        const desiredMin = timeToMinutes(desired_start_time);
        const hasConflict = appts.some((a) => {
          const aStart = timeToMinutes(a.appointment_time!.substring(0, 5));
          const aEnd = a.appointment_end_time
            ? timeToMinutes(a.appointment_end_time.substring(0, 5))
            : aStart + calDuration;
          return desiredMin < aEnd && desiredMin + calDuration > aStart;
        });
        if (!hasConflict) {
          suggestedTimes.push(desired_start_time);
        }
      }

      // Find first free window
      const busySlots = appts.map((a) => {
        const aStart = timeToMinutes(a.appointment_time!.substring(0, 5));
        const aEnd = a.appointment_end_time
          ? timeToMinutes(a.appointment_end_time.substring(0, 5))
          : aStart + calDuration;
        return { start: aStart, end: aEnd };
      }).sort((a, b) => a.start - b.start);

      for (const window of availWindows.length > 0 ? availWindows : [{ start: 8 * 60, end: 18 * 60 }]) {
        let cursor = window.start;
        for (const slot of busySlots) {
          if (cursor + calDuration <= slot.start && suggestedTimes.length < 3) {
            const t = minutesToTime(cursor);
            if (!suggestedTimes.includes(t)) suggestedTimes.push(t);
          }
          cursor = Math.max(cursor, slot.end);
        }
        if (cursor + calDuration <= window.end && suggestedTimes.length < 3) {
          const t = minutesToTime(cursor);
          if (!suggestedTimes.includes(t)) suggestedTimes.push(t);
        }
      }

      // After closest appointment slot
      if (closestAppt && suggestedTimes.length < 3) {
        const closestEnd = closestAppt.appointment_end_time
          ? timeToMinutes(closestAppt.appointment_end_time.substring(0, 5))
          : timeToMinutes(closestAppt.appointment_time!.substring(0, 5)) + calDuration;
        const afterClosest = closestEnd + Math.round(travelToClient.total_minutes);
        const t = minutesToTime(afterClosest);
        const hasConflict = busySlots.some(
          (s) => afterClosest < s.end && afterClosest + calDuration > s.start
        );
        if (!hasConflict && !suggestedTimes.includes(t)) {
          suggestedTimes.push(t);
        }
      }

      // Determine status
      let status = "OK";
      let reason = "";

      if (travelToClient.total_minutes > maxTravelMinutes) {
        status = "BLOCKED";
        reason = `Tempo di viaggio ${travelToClient.total_minutes} min supera il limite di ${maxTravelMinutes} min`;
      } else if (simRoute.total_km > maxKm) {
        status = "BLOCKED";
        reason = `Km giornalieri previsti (${simRoute.total_km} km) superano il limite di ${maxKm} km`;
      } else if (travelToClient.total_minutes > maxTravelMinutes * 0.8) {
        status = "WARNING";
        reason = `Tempo di viaggio vicino al limite (${travelToClient.total_minutes}/${maxTravelMinutes} min)`;
      } else if (simRoute.total_km > maxKm * 0.8) {
        status = "WARNING";
        reason = `Km giornalieri vicini al limite (${simRoute.total_km}/${maxKm} km)`;
      } else if (closestAppt) {
        reason = `Vicino all'appuntamento delle ${closestAppt.appointment_time?.substring(0, 5)} (${closestAppt.title || closestAppt.formatted_address || ""})`;
      } else {
        reason = "Dalla base";
      }

      if (suggestedTimes.length === 0 && status !== "BLOCKED") {
        status = "BLOCKED";
        reason = "Nessuno slot orario disponibile";
      }

      // Score
      let score = travelToClient.total_minutes * 2 + travelToClient.total_km;
      if (travelToClient.total_minutes > maxTravelMinutes) score += 1000;
      if (simRoute.total_km > maxKm) score += 500;

      // Build daily route display
      const dailyRoute: { label: string; address: string }[] = [];
      dailyRoute.push({
        label: "Base",
        address: cal.base_formatted_address || company?.operational_address || "Sede",
      });
      for (const a of appts) {
        dailyRoute.push({
          label: `${a.appointment_time?.substring(0, 5) || "?"} - ${a.title}`,
          address: a.formatted_address || "—",
        });
      }
      dailyRoute.push({
        label: "NUOVO",
        address: body.client_address || `${client_lat}, ${client_lng}`,
      });
      dailyRoute.push({
        label: "Base",
        address: cal.base_formatted_address || company?.operational_address || "Sede",
      });

      suggestions.push({
        calendar_id: cal.id,
        calendar_name: cal.name,
        owner_name: cal.owner_id ? ownerProfiles[cal.owner_id] || null : null,
        travel_km: travelToClient.total_km,
        travel_minutes: travelToClient.total_minutes,
        daily_km_if_assigned: simRoute.total_km,
        max_daily_km: maxKm,
        suggested_times: suggestedTimes.slice(0, 3),
        reason,
        status,
        score,
        daily_route: dailyRoute,
        is_estimate: travelToClient.isEstimate || simRoute.isEstimate,
        existing_appointments_count: appts.length,
      });
    }

    // Sort by score
    suggestions.sort((a, b) => a.score - b.score);

    return new Response(JSON.stringify({ suggestions: suggestions.slice(0, 5) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
