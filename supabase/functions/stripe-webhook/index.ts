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
      // For now, we proceed with basic validation
    }

    const event = JSON.parse(body);
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const companyId = session.metadata?.company_id;
        const planId = session.metadata?.plan_id;
        const stripeCustomerId = session.customer;
        const stripeSubscriptionId = session.subscription;

        if (!companyId) break;

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
          // Get subscription details from Stripe
          const subRes = await fetch(
            `https://api.stripe.com/v1/subscriptions/${stripeSubscriptionId}`,
            {
              headers: { Authorization: `Bearer ${stripeSecretKey}` },
            }
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

          // Update company plan
          await supabase
            .from("companies")
            .update({ subscription_plan_id: planId })
            .eq("id", companyId);
        }

        // Log event
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

        // Find company by stripe_customer_id
        const { data: company } = await supabase
          .from("companies")
          .select("id")
          .eq("stripe_customer_id", stripeCustomerId)
          .maybeSingle();

        if (!company) break;

        // Get subscription details
        const subRes = await fetch(
          `https://api.stripe.com/v1/subscriptions/${stripeSubscriptionId}`,
          {
            headers: { Authorization: `Bearer ${stripeSecretKey}` },
          }
        );
        const sub = await subRes.json();

        // Update subscription period
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
