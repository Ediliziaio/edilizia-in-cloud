import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const anonClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user } } = await anonClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (!user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const { companyId, amountEur, paymentMethod, notes: topupNotes } = await req.json();

    if (!companyId || !amountEur || amountEur < 5) {
      return json({ error: "Importo minimo €5.00" }, 400);
    }

    // Get current credits
    const { data: credits } = await adminClient
      .from("ai_credits")
      .select("balance_eur, calls_blocked, blocked_reason")
      .eq("company_id", companyId)
      .single();

    if (!credits) {
      // Auto-create if missing
      await adminClient.from("ai_credits").insert({ company_id: companyId });
    }

    const currentBalance = credits?.balance_eur || 0;
    const newBalance = Number((currentBalance + amountEur).toFixed(4));

    // Update balance
    const updateData: Record<string, unknown> = {
      balance_eur: newBalance,
      total_recharged_eur: Number(((credits as Record<string, number>)?.total_recharged_eur || 0) + amountEur).toFixed(4),
      updated_at: new Date().toISOString(),
    };

    // Unblock if was blocked for balance_zero
    if (credits?.calls_blocked && credits?.blocked_reason === "balance_zero") {
      updateData.calls_blocked = false;
      updateData.blocked_at = null;
      updateData.blocked_reason = null;
    }

    await adminClient
      .from("ai_credits")
      .update(updateData)
      .eq("company_id", companyId);

    // Generate invoice number
    const invoiceNum = `EIO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

    // Create topup record
    await adminClient.from("ai_credit_topups").insert({
      company_id: companyId,
      amount_eur: amountEur,
      type: "manual",
      status: "completed",
      payment_method: paymentMethod || "manual_admin",
      invoice_number: invoiceNum,
      notes: topupNotes || null,
      triggered_by: user.id,
      processed_at: new Date().toISOString(),
    });

    // Audit log
    await adminClient.from("ai_agent_audit_log").insert({
      company_id: companyId,
      agent_id: null,
      user_id: user.id,
      action: "credit_topup",
      details: {
        amount_eur: amountEur,
        new_balance: newBalance,
        invoice: invoiceNum,
        payment_method: paymentMethod,
      },
    });

    return json({
      success: true,
      new_balance_eur: newBalance,
      invoice_number: invoiceNum,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("topup-credits error:", message);
    return json({ error: message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
