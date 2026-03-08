import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { corsHeaders, secureHeaders } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate user
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
      const { data: { user }, error: authError } = await anonClient.auth.getUser(token);
      if (authError || !user) {
        return new Response(JSON.stringify({ error: "Non autorizzato" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const companyId = body.company_id;

    if (!companyId) {
      return new Response(JSON.stringify({ error: "company_id richiesto" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find recurring costs with auto-generation enabled
    const { data: recurringCosts, error: fetchError } = await supabase
      .from("company_costs")
      .select("*")
      .eq("company_id", companyId)
      .eq("recurrence_auto", true)
      .neq("recurrence", "once");

    if (fetchError) throw fetchError;

    let createdCount = 0;
    const now = new Date();

    for (const cost of (recurringCosts || [])) {
      // Check end date
      if (cost.recurrence_end_date && new Date(cost.recurrence_end_date) < now) {
        continue;
      }

      const baseDate = new Date(cost.due_date);
      const recurrence = cost.recurrence;

      // Calculate next dates going forward from baseDate
      let nextDate = new Date(baseDate);
      const maxLookahead = 3; // Generate up to 3 months ahead

      while (nextDate <= new Date(now.getFullYear(), now.getMonth() + maxLookahead, 0)) {
        // Advance by recurrence interval
        if (recurrence === "monthly") {
          nextDate = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, nextDate.getDate());
        } else if (recurrence === "quarterly") {
          nextDate = new Date(nextDate.getFullYear(), nextDate.getMonth() + 3, nextDate.getDate());
        } else if (recurrence === "yearly") {
          nextDate = new Date(nextDate.getFullYear() + 1, nextDate.getMonth(), nextDate.getDate());
        } else {
          break;
        }

        // Don't go past end date
        if (cost.recurrence_end_date && nextDate > new Date(cost.recurrence_end_date)) break;

        // Don't generate in the past (before current month)
        if (nextDate < new Date(now.getFullYear(), now.getMonth(), 1)) continue;

        const dueDateStr = nextDate.toISOString().split("T")[0];

        // Check if this instance already exists (by name + due_date)
        const { data: existing } = await supabase
          .from("company_costs")
          .select("id")
          .eq("company_id", companyId)
          .eq("name", cost.name)
          .eq("due_date", dueDateStr)
          .limit(1);

        if (existing && existing.length > 0) continue;

        // Create new instance
        const { error: insertError } = await supabase.from("company_costs").insert({
          company_id: companyId,
          name: cost.name,
          cost_type: cost.cost_type,
          amount: cost.amount,
          category: cost.category,
          recurrence: cost.recurrence,
          due_date: dueDateStr,
          notes: cost.notes,
          supplier_id: cost.supplier_id,
          vat_rate: cost.vat_rate,
          recurrence_auto: false, // Generated instances are not auto-generators
        });

        if (!insertError) createdCount++;
      }
    }

    return new Response(JSON.stringify({ success: true, created: createdCount }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
