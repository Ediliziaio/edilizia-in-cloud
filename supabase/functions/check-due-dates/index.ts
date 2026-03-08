import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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
      return new Response(
        JSON.stringify({ message: "No due_date_approaching automations found", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    return new Response(
      JSON.stringify({ message: "Done", processed: totalProcessed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-due-dates error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
