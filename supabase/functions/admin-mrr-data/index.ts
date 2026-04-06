/**
 * admin-mrr-data — Dati MRR mensili storici per forecast
 *
 * Legge mrr_monthly_snapshot ultimi 6 mesi.
 * Protetto: richiede ruolo super_admin o platform_admin.
 * Usa service_role key — mai esporre al frontend.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getCorsHeaders,
  errorResponse,
} from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    const corsH = getCorsHeaders(req);
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    // Verifica ruolo super_admin
    const { data: roleData } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .in("role", ["super_admin", "platform_admin"])
      .maybeSingle();

    if (!roleData) {
      return errorResponse("Accesso riservato ai super admin", 403);
    }

    // Calcola data 6 mesi fa (primo giorno del mese)
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().split("T")[0];

    const { data, error } = await supabaseAdmin
      .from("mrr_monthly_snapshot")
      .select("year_month, mrr_eur, active_subscriptions")
      .gte("year_month", sixMonthsAgoStr)
      .order("year_month", { ascending: true })
      .limit(12);

    if (error) {
      console.error("Errore lettura mrr_monthly_snapshot:", error.message);
      return errorResponse("Errore nel recupero dei dati MRR", 500);
    }

    const rows = (data ?? []).map((row: {
      year_month: string;
      mrr_eur: number;
      active_subscriptions: number;
    }) => ({
      year_month: row.year_month,
      mrr_eur: Number(row.mrr_eur),
      active_subscriptions: Number(row.active_subscriptions),
    }));

    return new Response(
      JSON.stringify({ data: rows }),
      {
        status: 200,
        headers: {
          ...corsH,
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Errore interno";
    console.error("admin-mrr-data error:", msg);
    return errorResponse("Errore interno del server", 500);
  }
});
