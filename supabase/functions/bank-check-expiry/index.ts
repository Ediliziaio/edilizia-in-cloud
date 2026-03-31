import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

/**
 * bank-check-expiry: Controlla connessioni bancarie in scadenza (< 14 giorni)
 * e invia notifiche in-app. Triggerabile via cron o manualmente da super_admin.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Auth: cron secret o super_admin
    const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
    const requestCronSecret = req.headers.get("x-cron-secret");
    const isCronCall = cronSecret && requestCronSecret === cronSecret;

    if (!isCronCall) {
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return errorResponse("Missing authorization", 401);
      const { data: { user } } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (!user) return errorResponse("Unauthorized", 401);
      const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "super_admin").maybeSingle();
      if (!role) return errorResponse("Forbidden", 403);
    }

    // Connessioni che scadono entro 14 giorni
    const { data: expiring, error: expErr } = await supabase
      .from("bank_connections")
      .select("id, company_id, institution_name, expires_at, status")
      .eq("status", "active")
      .lt("expires_at", new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString());

    if (expErr) throw expErr;

    // Connessioni già scadute ma non ancora marcate
    const { data: expired, error: expiredErr } = await supabase
      .from("bank_connections")
      .select("id, company_id, institution_name, expires_at")
      .eq("status", "active")
      .lt("expires_at", new Date().toISOString());

    if (expiredErr) throw expiredErr;

    // Marca le connessioni scadute come expired
    let markedExpired = 0;
    for (const conn of expired || []) {
      await supabase
        .from("bank_connections")
        .update({ status: "expired", error_message: "Connessione PSD2 scaduta (90 giorni)" })
        .eq("id", conn.id);
      markedExpired++;
    }

    // Crea notifiche in-app per connessioni in scadenza
    let notificationsSent = 0;
    const expiredIds = new Set((expired || []).map((e: any) => e.id));

    for (const conn of expiring || []) {
      if (expiredIds.has(conn.id)) continue; // già gestita come expired

      const daysLeft = Math.ceil(
        (new Date(conn.expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );

      // Controlla se una notifica simile è già stata inviata nelle ultime 48h
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("company_id", conn.company_id)
        .eq("type", "bank_expiry_warning")
        .ilike("metadata->>connection_id", conn.id)
        .gte("created_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString());

      if ((count ?? 0) > 0) continue;

      // Inserisci notifica (se la tabella notifications esiste)
      const { error: notifErr } = await supabase.from("notifications").insert({
        company_id: conn.company_id,
        type: "bank_expiry_warning",
        title: `Connessione ${conn.institution_name} in scadenza`,
        message: `La connessione bancaria con ${conn.institution_name} scade tra ${daysLeft} giorni. Ricollegati per continuare la sincronizzazione.`,
        severity: daysLeft <= 3 ? "critical" : "warning",
        metadata: { connection_id: conn.id, days_left: daysLeft },
        is_read: false,
      });

      if (!notifErr) notificationsSent++;
    }

    return jsonResponse({
      success: true,
      expiring_connections: (expiring || []).length,
      marked_expired: markedExpired,
      notifications_sent: notificationsSent,
    });
  } catch (e) {
    console.error("bank-check-expiry error:", e);
    return errorResponse(e.message, 500);
  }
});
