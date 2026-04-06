// ════════════════════════════════════════════════════════════════════════════
// batch-gps-positions — Edge Function
// Riceve un batch di posizioni GPS dal Service Worker del tecnico e le inserisce
// in bulk nella tabella gps_positions. Verifica:
//   1. JWT valido (requireAuth)
//   2. fleet_track_enabled sull'azienda
//   3. Consenso GDPR attivo (tecnico_gps_consent)
//   4. Appartenenza utente all'azienda
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
    .select("company_id")
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

  return jsonResponse({ inserted: rows.length });
});
