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

    const now = new Date();
    const toInsert: any[] = [];

    for (const cost of (recurringCosts || [])) {
      // Check end date
      if (cost.recurrence_end_date && new Date(cost.recurrence_end_date) < now) {
        continue;
      }

      const baseDate = new Date(cost.due_date);
      const recurrence = cost.recurrence;
      const maxLookahead = 3;

      let nextDate = new Date(baseDate);

      while (nextDate <= new Date(now.getFullYear(), now.getMonth() + maxLookahead, 0)) {
        if (recurrence === "monthly") {
          nextDate = new Date(nextDate.getFullYear(), nextDate.getMonth() + 1, nextDate.getDate());
        } else if (recurrence === "quarterly") {
          nextDate = new Date(nextDate.getFullYear(), nextDate.getMonth() + 3, nextDate.getDate());
        } else if (recurrence === "yearly") {
          nextDate = new Date(nextDate.getFullYear() + 1, nextDate.getMonth(), nextDate.getDate());
        } else {
          break;
        }

        if (cost.recurrence_end_date && nextDate > new Date(cost.recurrence_end_date)) break;
        if (nextDate < new Date(now.getFullYear(), now.getMonth(), 1)) continue;

        const dueDateStr = nextDate.toISOString().split("T")[0];

        toInsert.push({
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
          recurrence_auto: false,
        });
      }
    }

    let createdCount = 0;

    if (toInsert.length > 0) {
      // Bulk upsert — ignoreDuplicates skips rows that conflict on (company_id, name, due_date)
      const { data: inserted, error: insertError } = await supabase
        .from("company_costs")
        .upsert(toInsert, { onConflict: "company_id,name,due_date", ignoreDuplicates: true })
        .select("id");

      if (insertError) throw insertError;
      createdCount = inserted?.length ?? 0;
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
