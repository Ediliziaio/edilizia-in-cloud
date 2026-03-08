import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, secureHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Cron/internal auth: require x-cron-secret or valid JWT
  const cronSecret = Deno.env.get("CRON_SECRET");
  const requestCronSecret = req.headers.get("x-cron-secret");
  const authHeader = req.headers.get("authorization");
  if (cronSecret && requestCronSecret !== cronSecret && !authHeader?.startsWith("Bearer ")) {
    return errorResponse("Unauthorized", 401);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    if (!stripeSecretKey) {
      return jsonResponse({ skipped: true, reason: "No STRIPE_SECRET_KEY" });
    }

    // Accept optional company_id to check a specific company, otherwise check all
    let targetCompanyId: string | null = null;
    try {
      const body = await req.json();
      targetCompanyId = body?.company_id || null;
    } catch { /* no body */ }

    // Get all enabled auto-topup configs
    let query = supabase
      .from("company_auto_topup")
      .select("*")
      .eq("enabled", true)
      .eq("wallet_type", "email")
      .not("stripe_payment_method_id", "is", null);

    if (targetCompanyId) {
      query = query.eq("company_id", targetCompanyId);
    }

    const { data: configs, error: configError } = await query;
    if (configError || !configs?.length) {
      return jsonResponse({ processed: 0 });
    }

    let processed = 0;

    for (const config of configs) {
      // Debounce: skip if last topup was less than 5 minutes ago
      if (config.last_topup_at) {
        const lastTopup = new Date(config.last_topup_at).getTime();
        if (Date.now() - lastTopup < 5 * 60 * 1000) continue;
      }

      // Get current balance
      const { data: credits } = await supabase
        .from("email_credits")
        .select("balance_eur")
        .eq("company_id", config.company_id)
        .maybeSingle();

      const balance = credits?.balance_eur ?? 0;

      // Check threshold
      if (balance > config.threshold_eur) continue;

      // Get stripe_customer_id
      const { data: company } = await supabase
        .from("companies")
        .select("stripe_customer_id")
        .eq("id", config.company_id)
        .single();

      if (!company?.stripe_customer_id) continue;

      // Create PaymentIntent off-session
      try {
        const piRes = await fetch("https://api.stripe.com/v1/payment_intents", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            amount: String(Math.round(config.topup_amount_eur * 100)),
            currency: "eur",
            customer: company.stripe_customer_id,
            payment_method: config.stripe_payment_method_id,
            off_session: "true",
            confirm: "true",
            "metadata[company_id]": config.company_id,
            "metadata[type]": "auto_topup_email",
          }),
        });

        const pi = await piRes.json();

        if (pi.status === "succeeded") {
          // Credit the balance
          await supabase.rpc("add_email_credits_with_log", {
            p_company_id: config.company_id,
            p_amount: config.topup_amount_eur,
            p_type: "topup",
            p_description: `Auto top-up Stripe - €${config.topup_amount_eur}`,
            p_metadata: { stripe_payment_intent: pi.id, auto_topup: true },
          });

          // Update last_topup_at
          await supabase
            .from("company_auto_topup")
            .update({ last_topup_at: new Date().toISOString() })
            .eq("id", config.id);

          processed++;
          console.log(`Auto-topup OK for company ${config.company_id}: €${config.topup_amount_eur}`);
        } else {
          console.error(`Auto-topup failed for company ${config.company_id}:`, pi.error?.message || pi.status);
        }
      } catch (e) {
        console.error(`Auto-topup error for company ${config.company_id}:`, e);
      }
    }

    return new Response(JSON.stringify({ processed }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("auto-topup-check error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
