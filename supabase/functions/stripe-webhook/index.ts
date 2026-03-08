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
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    const stripeWebhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!stripeSecretKey) {
      return new Response(JSON.stringify({ error: "Stripe non configurato" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.text();
    const signature = req.headers.get("stripe-signature");

    // Verify webhook signature if secret is configured
    if (stripeWebhookSecret && signature) {
      // For production, use Stripe's signature verification
    }

    const event = JSON.parse(body);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const companyId = session.metadata?.company_id;
        const metadataType = session.metadata?.type;

        if (!companyId) break;

        // ─── EMAIL CREDITS PURCHASE ───
        if (metadataType === "email_credits") {
          const amountEur = parseFloat(session.metadata?.amount_eur || "0");
          if (amountEur > 0) {
            await supabase.rpc("add_email_credits_with_log", {
              p_company_id: companyId,
              p_amount: amountEur,
              p_type: "topup",
              p_description: `Acquisto Stripe - €${amountEur}`,
              p_metadata: { stripe_session_id: session.id, payment_intent: session.payment_intent },
            });

            if (session.payment_intent) {
              try {
                const piRes = await fetch(
                  `https://api.stripe.com/v1/payment_intents/${session.payment_intent}`,
                  { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
                );
                const pi = await piRes.json();
                const pmId = pi.payment_method;
                if (pmId) {
                  await supabase
                    .from("company_auto_topup")
                    .upsert(
                      { company_id: companyId, wallet_type: "email", stripe_payment_method_id: pmId, payment_method: "stripe" },
                      { onConflict: "company_id,wallet_type" }
                    );
                }
              } catch (e) {
                console.error("Failed to save payment method:", e);
              }
            }
          }
          break;
        }

        // ─── AI SUBSCRIPTION ───
        if (metadataType === "ai_subscription") {
          const stripeSubscriptionId = session.subscription;
          const priceEur = parseFloat(session.metadata?.price_eur || "49");

          // Create or update ai_subscriptions record
          await supabase.from("ai_subscriptions").upsert(
            {
              company_id: companyId,
              status: "active",
              stripe_subscription_id: stripeSubscriptionId,
              price_eur: priceEur,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "company_id" }
          );

          // Welcome bonus: add credits
          const { data: bonusSetting } = await supabase
            .from("platform_settings")
            .select("value")
            .eq("key", "ai_welcome_bonus_eur")
            .maybeSingle();
          const bonusEur = parseFloat(bonusSetting?.value || "5");
          if (bonusEur > 0) {
            await supabase.rpc("deduct_ai_credits" as never, {
              p_company_id: companyId,
              p_cost: -bonusEur, // negative = add credits
            });

            await supabase.from("ai_credit_topups").insert({
              company_id: companyId,
              amount_eur: bonusEur,
              type: "bonus",
              status: "completed",
              notes: "Bonus benvenuto AI",
              processed_at: new Date().toISOString(),
            });
          }

          console.log(`[STRIPE] AI subscription activated for company ${companyId}`);
          break;
        }

        // ─── SUBSCRIPTION PURCHASE (existing flow) ───
        const planId = session.metadata?.plan_id;
        const stripeCustomerId = session.customer;
        const stripeSubscriptionId = session.subscription;

        // Update company
        await supabase
          .from("companies")
          .update({
            stripe_customer_id: stripeCustomerId,
            status: "active",
            payment_method: "stripe",
          })
          .eq("id", companyId);

        // Create/update subscription record
        if (planId && stripeSubscriptionId) {
          const subRes = await fetch(
            `https://api.stripe.com/v1/subscriptions/${stripeSubscriptionId}`,
            { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
          );
          const sub = await subRes.json();

          await supabase.from("company_subscriptions").upsert(
            {
              company_id: companyId,
              plan_id: planId,
              status: "active",
              stripe_subscription_id: stripeSubscriptionId,
              billing_period: sub.items?.data?.[0]?.price?.recurring?.interval === "year" ? "yearly" : "monthly",
              current_period_start: sub.current_period_start
                ? new Date(sub.current_period_start * 1000).toISOString()
                : null,
              current_period_end: sub.current_period_end
                ? new Date(sub.current_period_end * 1000).toISOString()
                : null,
            },
            { onConflict: "company_id" }
          );

          await supabase
            .from("companies")
            .update({ subscription_plan_id: planId })
            .eq("id", companyId);
        }

        await supabase.from("subscription_logs").insert({
          company_id: companyId,
          event_type: "payment_completed",
          new_status: "active",
          plan_id: planId || null,
          notes: `Pagamento Stripe completato (${stripeSubscriptionId})`,
        });
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object;
        const stripeSubscriptionId = invoice.subscription;
        const stripeCustomerId = invoice.customer;

        if (!stripeSubscriptionId) break;

        const { data: company } = await supabase
          .from("companies")
          .select("id")
          .eq("stripe_customer_id", stripeCustomerId)
          .maybeSingle();

        if (!company) break;

        const subRes = await fetch(
          `https://api.stripe.com/v1/subscriptions/${stripeSubscriptionId}`,
          { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
        );
        const sub = await subRes.json();

        await supabase
          .from("company_subscriptions")
          .update({
            status: "active",
            current_period_start: sub.current_period_start
              ? new Date(sub.current_period_start * 1000).toISOString()
              : null,
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
          })
          .eq("company_id", company.id);

        await supabase.from("subscription_logs").insert({
          company_id: company.id,
          event_type: "invoice_paid",
          notes: `Fattura Stripe pagata (${invoice.id})`,
        });
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const stripeCustomerId = subscription.customer;

        const { data: company } = await supabase
          .from("companies")
          .select("id, status")
          .eq("stripe_customer_id", stripeCustomerId)
          .maybeSingle();

        if (!company) break;

        await supabase
          .from("companies")
          .update({ status: "expired" })
          .eq("id", company.id);

        await supabase
          .from("company_subscriptions")
          .update({ status: "canceled", canceled_at: new Date().toISOString() })
          .eq("company_id", company.id);

        await supabase.from("subscription_logs").insert({
          company_id: company.id,
          event_type: "subscription_canceled",
          old_status: company.status,
          new_status: "expired",
          notes: "Abbonamento Stripe cancellato",
        });
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
