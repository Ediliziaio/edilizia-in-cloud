import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";
import { corsHeaders, secureHeaders } from "../_shared/headers.ts";

// ─── Helpers ───────────────────────────────────────────────

async function logStripeEvent(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  eventType: string,
  companyId: string | null,
  payload: unknown,
  status = "processed",
  errorMessage: string | null = null
) {
  await supabase.from("stripe_events_log").insert({
    stripe_event_id: eventId,
    event_type: eventType,
    company_id: companyId,
    payload,
    status,
    error_message: errorMessage,
  });
}

async function getCompanyByStripeCustomer(
  supabase: ReturnType<typeof createClient>,
  stripeCustomerId: string
) {
  const { data } = await supabase
    .from("companies")
    .select("id, status")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  return data;
}

// ─── Event Handlers ────────────────────────────────────────

async function handleCheckoutCompleted(
  supabase: ReturnType<typeof createClient>,
  session: any,
  stripeSecretKey: string
) {
  const companyId = session.metadata?.company_id;
  const metadataType = session.metadata?.type;
  if (!companyId) return;

  // ── Email Credits Purchase ──
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
          if (pi.payment_method) {
            await supabase
              .from("company_auto_topup")
              .upsert(
                { company_id: companyId, wallet_type: "email", stripe_payment_method_id: pi.payment_method, payment_method: "stripe" },
                { onConflict: "company_id,wallet_type" }
              );
          }
        } catch (e) {
          console.error("Failed to save payment method:", e);
        }
      }
    }
    return;
  }

  // ── AI Subscription ──
  if (metadataType === "ai_subscription") {
    const stripeSubscriptionId = session.subscription;
    const priceEur = parseFloat(session.metadata?.price_eur || "49");

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

    const { data: bonusSetting } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", "ai_welcome_bonus_eur")
      .maybeSingle();
    const bonusEur = parseFloat(bonusSetting?.value || "5");
    if (bonusEur > 0) {
      await supabase.rpc("deduct_ai_credits" as never, {
        p_company_id: companyId,
        p_cost: -bonusEur,
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
    return;
  }

  // ── Standard Subscription Purchase ──
  const planId = session.metadata?.plan_id;
  const stripeCustomerId = session.customer;
  const stripeSubscriptionId = session.subscription;

  await supabase
    .from("companies")
    .update({
      stripe_customer_id: stripeCustomerId,
      status: "active",
      payment_method: "stripe",
      stripe_subscription_status: "active",
      payment_failure_count: 0,
      dunning_status: "none",
    })
    .eq("id", companyId);

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
}

async function handleInvoicePaid(
  supabase: ReturnType<typeof createClient>,
  invoice: any,
  stripeSecretKey: string
) {
  const stripeSubscriptionId = invoice.subscription;
  const stripeCustomerId = invoice.customer;
  if (!stripeSubscriptionId) return;

  const company = await getCompanyByStripeCustomer(supabase, stripeCustomerId);
  if (!company) return;

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

  // Reset dunning on successful payment
  await supabase
    .from("companies")
    .update({
      stripe_subscription_status: "active",
      payment_failure_count: 0,
      dunning_status: "none",
      last_payment_failure_at: null,
      dunning_started_at: null,
    })
    .eq("id", company.id);

  await supabase.from("subscription_logs").insert({
    company_id: company.id,
    event_type: "invoice_paid",
    notes: `Fattura Stripe pagata (${invoice.id})`,
  });
}

async function handleInvoicePaymentFailed(
  supabase: ReturnType<typeof createClient>,
  invoice: any
) {
  const stripeCustomerId = invoice.customer;
  if (!stripeCustomerId) return;

  const company = await getCompanyByStripeCustomer(supabase, stripeCustomerId);
  if (!company) return;

  // Increment failure count
  const { data: current } = await supabase
    .from("companies")
    .select("payment_failure_count")
    .eq("id", company.id)
    .single();

  const failureCount = (current?.payment_failure_count || 0) + 1;
  let dunningStatus = "warning"; // 1st failure
  if (failureCount >= 3) dunningStatus = "critical";
  else if (failureCount >= 2) dunningStatus = "escalated";

  const updateData: Record<string, unknown> = {
    payment_failure_count: failureCount,
    dunning_status: dunningStatus,
    stripe_subscription_status: "past_due",
    last_payment_failure_at: new Date().toISOString(),
  };
  if (failureCount === 1) {
    updateData.dunning_started_at = new Date().toISOString();
  }

  await supabase.from("companies").update(updateData).eq("id", company.id);

  await supabase.from("subscription_logs").insert({
    company_id: company.id,
    event_type: "payment_failed",
    new_status: "past_due",
    notes: `Pagamento fallito (tentativo #${failureCount}) - ${invoice.id}`,
  });
}

async function handleSubscriptionDeleted(
  supabase: ReturnType<typeof createClient>,
  subscription: any
) {
  const stripeCustomerId = subscription.customer;
  const company = await getCompanyByStripeCustomer(supabase, stripeCustomerId);
  if (!company) return;

  await supabase
    .from("companies")
    .update({
      status: "expired",
      stripe_subscription_status: "canceled",
      dunning_status: "churned",
    })
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
}

async function handleSubscriptionUpdated(
  supabase: ReturnType<typeof createClient>,
  subscription: any
) {
  const stripeCustomerId = subscription.customer;
  const company = await getCompanyByStripeCustomer(supabase, stripeCustomerId);
  if (!company) return;

  const stripeStatus = subscription.status; // active, past_due, canceled, unpaid, etc.
  await supabase
    .from("companies")
    .update({ stripe_subscription_status: stripeStatus })
    .eq("id", company.id);

  if (subscription.current_period_end) {
    await supabase
      .from("company_subscriptions")
      .update({
        status: stripeStatus === "active" ? "active" : stripeStatus,
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      })
      .eq("company_id", company.id);
  }
}

// ─── Main Handler ──────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      return new Response(JSON.stringify({ error: "Stripe non configurato" }), {
        status: 400,
        headers: secureHeaders,
      });
    }

    const body = await req.text();

    // ── Signature verification ──
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    let event: Stripe.Event;

    if (webhookSecret) {
      const signature = req.headers.get("stripe-signature");
      if (!signature) {
        return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
          status: 400,
          headers: secureHeaders,
        });
      }

      const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-12-18.acacia" });
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      } catch (err) {
        console.error("Stripe webhook signature verification failed:", err);
        return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
          status: 400,
          headers: secureHeaders,
        });
      }
    } else {
      // Fallback: no webhook secret configured — parse raw JSON (insecure, log warning)
      console.warn("[STRIPE] STRIPE_WEBHOOK_SECRET not set — skipping signature verification. Configure it for production!");
      event = JSON.parse(body) as Stripe.Event;
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // ── Idempotency check ──
    const { data: existing } = await supabase
      .from("stripe_events_log")
      .select("id")
      .eq("stripe_event_id", event.id)
      .maybeSingle();

    if (existing) {
      console.log(`[STRIPE] Event ${event.id} already processed, skipping`);
      return new Response(JSON.stringify({ received: true, duplicate: true }), {
        headers: secureHeaders,
      });
    }

    // Extract company_id for logging
    const obj = event.data?.object || {};
    const companyId = obj.metadata?.company_id || null;

    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(supabase, obj, stripeSecretKey);
          break;
        case "invoice.paid":
          await handleInvoicePaid(supabase, obj, stripeSecretKey);
          break;
        case "invoice.payment_failed":
          await handleInvoicePaymentFailed(supabase, obj);
          break;
        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(supabase, obj);
          break;
        case "customer.subscription.updated":
          await handleSubscriptionUpdated(supabase, obj);
          break;
      }

      await logStripeEvent(supabase, event.id, event.type, companyId, event.data);
    } catch (handlerErr) {
      console.error(`[STRIPE] Handler error for ${event.type}:`, handlerErr);
      await logStripeEvent(
        supabase, event.id, event.type, companyId, event.data,
        "error", (handlerErr as Error).message
      );
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: secureHeaders,
    });
  } catch (err) {
    console.error("Webhook error:", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: secureHeaders,
    });
  }
});
