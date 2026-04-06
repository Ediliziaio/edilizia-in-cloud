// ════════════════════════════════════════════════════════════════════════════
// batch-gps-positions — Edge Function
// Riceve un batch di posizioni GPS dal Service Worker del tecnico e le inserisce
// in bulk nella tabella gps_positions. Verifica:
//   1. JWT valido (requireAuth)
//   2. fleet_track_enabled sull'azienda
//   3. Consenso GDPR attivo (tecnico_gps_consent)
//   4. Appartenenza utente all'azienda
// Dopo l'insert: controlla le violazioni geofence e crea notifiche agli admin.
// ════════════════════════════════════════════════════════════════════════════

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";

interface GpsPositionPayload {
  lat: number;
  lng: number;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  battery_level?: number | null;
  recorded_at?: string;
}

interface RequestBody {
  company_id: string;
  positions: GpsPositionPayload[];
}

interface GeofenceRow {
  id: string;
  nome: string;
  center_lat: number;
  center_lng: number;
  radius_mt: number;
}

interface AdminRow {
  user_id: string;
}

// ── Haversine distance (metres) ──────────────────────────────────────────────
function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000; // earth radius metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

Deno.serve(async (req: Request) => {
  const corsHeaders = getCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  // ── Auth ─────────────────────────────────────────────────────────────────
  let userId: string;
  let supabaseAdmin: ReturnType<typeof createClient>;

  try {
    const auth = await requireAuth(req, corsHeaders);
    userId = auth.userId;
    supabaseAdmin = auth.supabaseAdmin;
  } catch (resp) {
    return resp as Response;
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = await req.json() as RequestBody;
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const { company_id, positions } = body;

  if (!company_id || typeof company_id !== "string") {
    return errorResponse("company_id is required", 400);
  }
  if (!Array.isArray(positions) || positions.length === 0) {
    return errorResponse("positions must be a non-empty array", 400);
  }
  if (positions.length > 50) {
    return errorResponse("Max 50 positions per batch", 400);
  }

  // ── Check fleet_track_enabled ─────────────────────────────────────────────
  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, fleet_track_enabled")
    .eq("id", company_id)
    .single();

  if (companyError || !company) {
    return errorResponse("Company not found", 404);
  }
  if (!company.fleet_track_enabled) {
    return errorResponse("GPS FleetTrack non abilitato per questa azienda", 403);
  }

  // ── Check user belongs to company ────────────────────────────────────────
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("company_id, first_name, last_name")
    .eq("id", userId)
    .single();

  if (profile?.company_id !== company_id) {
    return errorResponse("Unauthorized: user does not belong to this company", 403);
  }

  // ── Check GDPR consent ───────────────────────────────────────────────────
  const { data: consent } = await supabaseAdmin
    .from("tecnico_gps_consent")
    .select("id, revoked_at")
    .eq("user_id", userId)
    .eq("company_id", company_id)
    .is("revoked_at", null)
    .order("consented_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!consent) {
    return errorResponse("Consenso GDPR mancante o revocato", 403);
  }

  // ── Bulk insert ──────────────────────────────────────────────────────────
  const now = new Date().toISOString();

  const rows = positions.map((p: GpsPositionPayload) => ({
    company_id,
    user_id: userId,
    lat: Number(p.lat),
    lng: Number(p.lng),
    accuracy: p.accuracy ?? null,
    speed: p.speed ?? null,
    heading: p.heading ?? null,
    battery_level: p.battery_level ?? null,
    recorded_at: p.recorded_at ?? now,
  }));

  const { error: insertError } = await supabaseAdmin
    .from("gps_positions")
    .insert(rows);

  if (insertError) {
    console.error("[batch-gps-positions] insert error:", insertError);
    return errorResponse("Errore durante l'inserimento delle posizioni", 500);
  }

  // ── Geofence alert check ─────────────────────────────────────────────────
  // Controlla l'ultima posizione del batch contro le geofence attive dell'azienda.
  // Se il tecnico risulta fuori dalla geofence e non esiste una notifica recente
  // (ultima ora), crea una notifica per gli admin.
  try {
    await checkGeofenceAlerts(supabaseAdmin, company_id, userId, profile, rows);
  } catch (geoErr) {
    // Non blocca la risposta: le notifiche geofence sono best-effort
    console.warn("[batch-gps-positions] geofence check error:", geoErr);
  }

  return jsonResponse({ inserted: rows.length });
});

// ── Geofence alert logic ─────────────────────────────────────────────────────
async function checkGeofenceAlerts(
  supabaseAdmin: ReturnType<typeof createClient>,
  company_id: string,
  userId: string,
  profile: { first_name: string | null; last_name: string } | null,
  rows: Array<{ lat: number; lng: number; recorded_at: string }>,
) {
  // Ultima posizione del batch (la più recente)
  const lastPos = rows[rows.length - 1];

  // Carica geofence attive
  const { data: geofences } = await supabaseAdmin
    .from("cantieri_geofence")
    .select("id, nome, center_lat, center_lng, radius_mt")
    .eq("company_id", company_id)
    .eq("is_active", true) as { data: GeofenceRow[] | null };

  if (!geofences || geofences.length === 0) return;

  // Carica admin dell'azienda (destinatari delle notifiche)
  const { data: adminRows } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("company_id", company_id)
    .in("role", ["company_admin", "company_staff", "super_admin"]) as { data: AdminRow[] | null };

  if (!adminRows || adminRows.length === 0) return;

  const tecnicoName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "Tecnico";
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  for (const geofence of geofences) {
    const distMeters = haversineMeters(
      lastPos.lat, lastPos.lng,
      geofence.center_lat, geofence.center_lng,
    );

    const isOutside = distMeters > geofence.radius_mt;
    if (!isOutside) continue;

    // Controlla se esiste già una notifica recente (ultima ora) per evitare spam
    const { data: recentNotif } = await supabaseAdmin
      .from("notifications")
      .select("id")
      .eq("company_id", company_id)
      .eq("entity_type", "geofence_breach")
      .eq("entity_id", geofence.id)
      .contains("body", userId) // body contiene userId per dedup per tecnico
      .gte("created_at", oneHourAgo)
      .limit(1)
      .maybeSingle();

    if (recentNotif) continue; // notifica già inviata nell'ultima ora

    // Crea notifiche per tutti gli admin
    const notifRows = adminRows.map((a) => ({
      company_id,
      user_id: a.user_id,
      type: "geofence_breach",
      title: `🚨 Tecnico fuori zona: ${geofence.nome}`,
      body: `${tecnicoName} (${userId}) si trova a ${Math.round(distMeters)}m dal cantiere "${geofence.nome}" (raggio: ${geofence.radius_mt}m).`,
      entity_type: "geofence_breach",
      entity_id: geofence.id,
      action_url: "/azienda/fleet",
    }));

    await supabaseAdmin.from("notifications").insert(notifRows);

    console.log(
      `[batch-gps-positions] geofence breach: user=${userId} geofence=${geofence.id} dist=${Math.round(distMeters)}m`,
    );
  }
}
