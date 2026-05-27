import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

/**
 * Verify that the caller is either a cron job (with x-cron-secret),
 * service-role server-to-server, or an authenticated user.
 *
 * 2026-05-27 SECURITY FIX: prima accettava QUALSIASI Bearer senza
 * validazione. Ora verifica che il token sia service-role o un JWT
 * utente valido via supabase.auth.getUser.
 */
async function verifyCronOrAuth(req: Request): Promise<void> {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const reqSecret = req.headers.get("x-cron-secret");
  if (cronSecret && reqSecret === cronSecret) return; // cron OK

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "Unauthorized: missing cron secret or JWT" }), {
      status: 401,
      headers: secureHeaders,
    });
  }
  const token = authHeader.slice(7);

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey && token === serviceRoleKey) return; // server-to-server

  const sbUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!sbUrl || !anonKey) {
    throw new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 503,
      headers: secureHeaders,
    });
  }
  const client = createClient(sbUrl, anonKey);
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) {
    throw new Response(JSON.stringify({ error: "Unauthorized: invalid JWT" }), {
      status: 401,
      headers: secureHeaders,
    });
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  try {
    await verifyCronOrAuth(req);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Get all active automations with due_date_approaching trigger
    const { data: automations, error: autoErr } = await supabase
      .from("automations")
      .select("*")
      .eq("trigger_type", "due_date_approaching")
      .eq("is_active", true);

    if (autoErr) throw autoErr;
    if (!automations || automations.length === 0) {
      return jsonResponse({ message: "No due_date_approaching automations found", processed: 0 });
    }

    let totalProcessed = 0;

    for (const automation of automations) {
      const config = automation.trigger_config || {};
      const dateField = config.date_field || "expected_date";
      const daysBefore = config.days_before ?? 3;

      // Validate date_field to prevent SQL injection
      const allowedFields = ["expected_date", "work_start_date", "work_end_date"];
      if (!allowedFields.includes(dateField)) continue;

      const today = new Date();
      const targetDate = new Date(today);
      targetDate.setDate(targetDate.getDate() + daysBefore);

      const todayStr = today.toISOString().split("T")[0];
      const targetStr = targetDate.toISOString().split("T")[0];

      // 2. Find orders with the date in range [today, today + days_before]
      const { data: orders, error: ordErr } = await supabase
        .from("orders")
        .select("id, company_id")
        .eq("company_id", automation.company_id)
        .gte(dateField, todayStr)
        .lte(dateField, targetStr);

      if (ordErr) {
        console.error(`Error querying orders for automation ${automation.id}:`, ordErr);
        continue;
      }

      if (!orders || orders.length === 0) continue;

      // 3. For each matching order, call execute_automation via RPC
      for (const order of orders) {
        // Deduplication: check if a task already exists from this automation for this order
        const { data: existingTasks } = await supabase
          .from("tasks")
          .select("id")
          .eq("order_id", order.id)
          .eq("company_id", automation.company_id)
          .ilike("title", `%${(automation.actions?.[0]?.config?.title || "").substring(0, 20)}%`)
          .gte("created_at", todayStr)
          .limit(1);

        if (existingTasks && existingTasks.length > 0) {
          console.log(`Skipping duplicate for order ${order.id}, automation ${automation.id}`);
          continue;
        }

        const { error: rpcErr } = await supabase.rpc("execute_automation", {
          p_trigger_type: "due_date_approaching",
          p_order_id: order.id,
          p_company_id: order.company_id,
        });

        if (rpcErr) {
          console.error(`Error executing automation for order ${order.id}:`, rpcErr);
        } else {
          totalProcessed++;
        }
      }
    }

    // ── DURC Scadenza Alert ───────────────────────────────────────────────────
    let durcAlertsTriggered = 0;
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

    const { data: scadenzeDurc } = await supabase
      .from("anagrafica_azienda")
      .select("company_id, ragione_sociale, durc_expiry_date")
      .not("durc_expiry_date", "is", null)
      .lte("durc_expiry_date", in30);

    for (const az of scadenzeDurc || []) {
      const daysLeft = Math.floor(
        (new Date(az.durc_expiry_date).getTime() - Date.now()) / 86400000
      );

      // Evita notifiche duplicate nelle ultime 48h
      const { count } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("company_id", az.company_id)
        .eq("type", "durc_expiry")
        .gte("created_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString());

      if ((count ?? 0) > 0) continue;

      await supabase.from("notifications").insert({
        company_id: az.company_id,
        type: "durc_expiry",
        title: daysLeft <= 0 ? "DURC SCADUTO" : `DURC in scadenza tra ${daysLeft} giorni`,
        message: `Il DURC scade il ${az.durc_expiry_date}. Rinnovarlo prima di partecipare a gare o emettere fatture PA.`,
        severity: daysLeft <= 0 ? "critical" : daysLeft <= 7 ? "high" : "warning",
        metadata: { expiry_date: az.durc_expiry_date, days_left: daysLeft },
        is_read: false,
      });

      durcAlertsTriggered++;
    }

    return jsonResponse({ message: "Done", processed: totalProcessed, durc_alerts: durcAlertsTriggered });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("check-due-dates error:", err);
    return errorResponse(err instanceof Error ? err.message : String(err), 500);
  }
});
