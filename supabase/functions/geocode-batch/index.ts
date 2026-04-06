/**
 * geocode-batch — Edge Function
 * Geocodifica in batch le posizioni GPS prive di indirizzo (address IS NULL).
 * Rispetta il rate limit Nominatim: 1 req/sec.
 *
 * Parametri body (opzionali):
 *   company_id: string  — limita a una specifica azienda
 *   limit: number       — max posizioni da processare (default 50, max 200)
 *
 * Ruolo richiesto: company_admin
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { getCorsHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const USER_AGENT = "EdiliziaInCloud/1.0 (info@ediliziaincloud.com)";
const RATE_LIMIT_MS = 1100; // 1.1s per essere safe

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms));
}

async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  try {
    const url = `${NOMINATIM_BASE}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "it",
      },
    });

    if (!res.ok) return null;

    const data = await res.json() as {
      address?: {
        road?: string;
        house_number?: string;
        city?: string;
        town?: string;
        village?: string;
      };
      display_name?: string;
    };

    if (data.address) {
      const a = data.address;
      const parts = [
        a.road,
        a.house_number,
        a.city ?? a.town ?? a.village,
      ].filter(Boolean);
      if (parts.length > 0) return parts.join(", ");
    }

    if (data.display_name) {
      return data.display_name.split(",").slice(0, 3).join(",").trim();
    }

    return null;
  } catch {
    return null;
  }
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
  let supabaseAdmin: ReturnType<typeof createClient>;

  try {
    const auth = await requireAuth(req, corsHeaders);
    supabaseAdmin = auth.supabaseAdmin;
  } catch (resp) {
    return resp as Response;
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: { company_id?: string; limit?: number } = {};
  try {
    body = await req.json();
  } catch {
    // body opzionale
  }

  const limitN = Math.min(body.limit ?? 50, 200);

  // ── Query posizioni senza address ─────────────────────────────────────────
  let query = supabaseAdmin
    .from("gps_positions")
    .select("id, lat, lng")
    .is("address", null)
    .order("recorded_at", { ascending: false })
    .limit(limitN);

  if (body.company_id) {
    query = query.eq("company_id", body.company_id);
  }

  const { data: positions, error: fetchError } = await query;

  if (fetchError) {
    console.error("[geocode-batch] fetch error:", fetchError);
    return errorResponse("Errore nel recupero delle posizioni", 500);
  }

  if (!positions || positions.length === 0) {
    return jsonResponse({ geocoded: 0, message: "Nessuna posizione da geocodificare" });
  }

  // ── Geocodifica con rate limit ────────────────────────────────────────────
  let geocoded = 0;
  let failed = 0;

  for (const pos of positions as { id: string; lat: number; lng: number }[]) {
    const address = await reverseGeocode(pos.lat, pos.lng);

    if (address) {
      const { error } = await supabaseAdmin
        .from("gps_positions")
        .update({ address })
        .eq("id", pos.id);

      if (!error) {
        geocoded++;
      } else {
        failed++;
      }
    } else {
      failed++;
    }

    await sleep(RATE_LIMIT_MS);
  }

  return jsonResponse({
    geocoded,
    failed,
    total: positions.length,
  });
});
