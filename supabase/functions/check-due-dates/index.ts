import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";

/** Verify that the caller is either a cron job (with x-cron-secret) or an authenticated user. */
function verifyCronOrAuth(req: Request): void {
  const cronSecret = Deno.env.get("CRON_SECRET");
  const reqSecret = req.headers.get("x-cron-secret");
  if (cronSecret && reqSecret === cronSecret) return; // cron OK

  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) return; // has JWT (will be validated by service role usage context)

  throw new Response(JSON.stringify({ error: "Unauthorized: missing cron secret or JWT" }), {
    status: 401,
    headers: secureHeaders,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    verifyCronOrAuth(req);

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

    return jsonResponse({ message: "Done", processed: totalProcessed });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("check-due-dates error:", err);
    return errorResponse(err instanceof Error ? err.message : String(err), 500);
  }
});
