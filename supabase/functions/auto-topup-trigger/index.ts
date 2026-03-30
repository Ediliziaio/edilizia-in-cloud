import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, errorResponse } from "../_shared/headers.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

interface WalletConfig {
  service: string;
  table: string;
  addFn: string | null;
  topupTable: string;
}

const WALLETS: WalletConfig[] = [
  { service: "email",     table: "email_credits",    addFn: "add_email_credits_with_log",    topupTable: "email_credit_topups" },
  { service: "whatsapp",  table: "whatsapp_credits",  addFn: "add_whatsapp_credits_with_log", topupTable: "whatsapp_credit_topups" },
  { service: "ai_agents", table: "ai_credits",        addFn: null,                            topupTable: "ai_credit_topups" },
];

async function sendLowBalanceAlert(supabase: ReturnType<typeof createClient>, companyId: string, service: string): Promise<void> {
  try {
    await supabase.functions.invoke("send-email-campaign", {
      body: {
        type: "low_balance_alert",
        company_id: companyId,
        service,
      },
    });
  } catch (e) {
    console.warn(`[auto-topup] sendLowBalanceAlert failed for company ${companyId}:`, e);
  }
}

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
    const stripeSecretKey = await getPlatformSetting("stripe_secret_key", "STRIPE_SECRET_KEY");
    const supabase = createClient(supabaseUrl, serviceKey);

    if (!stripeSecretKey) {
      return jsonResponse({ skipped: true, reason: "No STRIPE_SECRET_KEY" });
    }

    let totalProcessed = 0;
    const results: Record<string, number> = {};

    for (const wallet of WALLETS) {
      let processed = 0;

      // Query companies with auto_recharge enabled and balance below threshold for this wallet
      const { data: walletRows } = await supabase
        .from(wallet.table as never)
        .select("company_id, balance_eur, auto_recharge_enabled, auto_recharge_threshold, auto_recharge_amount")
        .eq("auto_recharge_enabled" as never, true as never);

      if (!walletRows?.length) {
        results[wallet.service] = 0;
        continue;
      }

      for (const row of walletRows as any[]) {
        const balance: number = row.balance_eur ?? 0;
        const threshold: number = row.auto_recharge_threshold ?? 5;
        const rechargeAmount: number = row.auto_recharge_amount ?? 20;

        if (balance > threshold) continue;

        const companyId: string = row.company_id;

        // Get Stripe details from company_auto_topup
        const { data: autoTopup } = await supabase
          .from("company_auto_topup" as never)
          .select("stripe_payment_method_id, topup_amount_eur, last_topup_at")
          .eq("company_id" as never, companyId as never)
          .eq("wallet_type" as never, wallet.service as never)
          .eq("enabled" as never, true as never)
          .maybeSingle();

        const topupAmount = (autoTopup as any)?.topup_amount_eur ?? rechargeAmount;

        // Debounce: skip if last topup was less than 5 minutes ago
        if ((autoTopup as any)?.last_topup_at) {
          const lastTopup = new Date((autoTopup as any).last_topup_at).getTime();
          if (Date.now() - lastTopup < 5 * 60 * 1000) continue;
        }

        // Get stripe_customer_id
        const { data: company } = await supabase
          .from("companies" as never)
          .select("stripe_customer_id")
          .eq("id" as never, companyId as never)
          .maybeSingle();

        const stripeCustomerId = (company as any)?.stripe_customer_id;
        const stripePaymentMethodId = (autoTopup as any)?.stripe_payment_method_id;

        if (!stripeCustomerId || !stripePaymentMethodId) {
          // No payment data — send alert and skip
          await sendLowBalanceAlert(supabase, companyId, wallet.service);
          continue;
        }

        // Stripe PaymentIntent off-session
        try {
          const piRes = await fetch("https://api.stripe.com/v1/payment_intents", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${stripeSecretKey}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              amount: String(Math.round(topupAmount * 100)),
              currency: "eur",
              customer: stripeCustomerId,
              payment_method: stripePaymentMethodId,
              off_session: "true",
              confirm: "true",
              "metadata[company_id]": companyId,
              "metadata[type]": `auto_topup_${wallet.service}`,
            }),
          });

          const pi = await piRes.json() as any;

          if (pi.status === "succeeded") {
            const invoiceNum = `EIO-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`;

            // Use RPC if available, otherwise direct update
            if (wallet.addFn) {
              await supabase.rpc(wallet.addFn as never, {
                p_company_id: companyId,
                p_amount: topupAmount,
                p_type: "auto",
                p_description: `Auto top-up Stripe — €${topupAmount}`,
                p_metadata: { stripe_payment_intent: pi.id, auto_topup: true },
              } as never);
            } else {
              // ai_agents: direct update (no RPC available yet)
              const { data: credits } = await supabase
                .from(wallet.table as never)
                .select("balance_eur, total_recharged_eur")
                .eq("company_id" as never, companyId as never)
                .maybeSingle();
              const before = (credits as any)?.balance_eur ?? 0;
              const after = Number((before + topupAmount).toFixed(4));
              await supabase
                .from(wallet.table as never)
                .update({
                  balance_eur: after,
                  total_recharged_eur: Number(((credits as any)?.total_recharged_eur ?? 0) + topupAmount).toFixed(4),
                  calls_blocked: false,
                  updated_at: new Date().toISOString(),
                } as never)
                .eq("company_id" as never, companyId as never);
            }

            // Insert topup record
            await supabase.from(wallet.topupTable as never).insert({
              company_id: companyId,
              amount_eur: topupAmount,
              type: "auto",
              status: "completed",
              payment_method: "stripe_auto",
              invoice_number: invoiceNum,
              stripe_payment_intent_id: pi.id,
              notes: `Auto top-up: balance €${balance} <= threshold €${threshold}`,
              processed_at: new Date().toISOString(),
            } as never);

            // Update last_topup_at
            if (autoTopup) {
              await supabase
                .from("company_auto_topup" as never)
                .update({ last_topup_at: new Date().toISOString() } as never)
                .eq("company_id" as never, companyId as never)
                .eq("wallet_type" as never, wallet.service as never);
            }

            processed++;
            console.log(`[auto-topup-trigger] ${wallet.service} OK for company ${companyId}: €${topupAmount}`);
          } else {
            // Payment failed — dunning
            console.error(`[auto-topup-trigger] ${wallet.service} FAILED for company ${companyId}:`, pi.error?.message || pi.status);
            await supabase
              .from("companies" as never)
              .update({
                dunning_status: "warning",
                payment_failure_count: (supabase as any).raw
                  ? undefined
                  : undefined,
                updated_at: new Date().toISOString(),
              } as never)
              .eq("id" as never, companyId as never);
            // Increment payment_failure_count separately with rpc if available
            await supabase.rpc("increment_payment_failure_count" as never, { p_company_id: companyId } as never)
              .catch(() => {/* ignore if RPC doesn't exist */});
          }
        } catch (e) {
          console.error(`[auto-topup-trigger] error for company ${companyId} (${wallet.service}):`, e);
        }
      }

      results[wallet.service] = processed;
      totalProcessed += processed;
    }

    return jsonResponse({ processed: totalProcessed, by_service: results });
  } catch (err) {
    console.error("[auto-topup-trigger] error:", err);
    return errorResponse((err as Error).message, 500);
  }
});
