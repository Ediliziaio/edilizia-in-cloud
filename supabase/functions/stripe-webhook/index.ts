import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "npm:stripe@14";
import { corsHeaders, secureHeaders } from "../_shared/headers.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { emitPlatformEvent, PLATFORM_EVENTS } from "../_shared/platformAutomation.ts";
import { sendPlatformCapiEvent } from "../_shared/capiPlatform.ts";

// ─── Helpers ───────────────────────────────────────────────

/**
 * Stripe API 2024-12-18+ sposta current_period_start/end su items[0].
 * Fallback su top-level per compatibilità con versioni precedenti.
 */
function getSubscriptionPeriod(sub: any): { start: string | null; end: string | null } {
  const item = sub?.items?.data?.[0];
  const startEpoch = item?.current_period_start ?? sub?.current_period_start ?? null;
  const endEpoch   = item?.current_period_end   ?? sub?.current_period_end   ?? null;
  return {
    start: startEpoch ? new Date(startEpoch * 1000).toISOString() : null,
    end:   endEpoch   ? new Date(endEpoch   * 1000).toISOString() : null,
  };
}

async function logStripeEvent(
  supabase: ReturnType<typeof createClient>,
  eventId: string,
  eventType: string,
  companyId: string | null,
  payload: unknown,
  status = "processed",
  errorMessage: string | null = null
) {
  // Upsert: update if exists (e.g. from 'processing' → 'processed'/'error'), insert if new.
  // processed_at aggiornato a ogni transizione: il claim atomico lo usa per
  // distinguere un 'processing' vivo da uno stantio (owner morto) da reclaimare.
  await supabase.from("stripe_events_log").upsert(
    {
      stripe_event_id: eventId,
      event_type: eventType,
      company_id: companyId,
      payload,
      status,
      error_message: errorMessage,
      processed_at: new Date().toISOString(),
    },
    { onConflict: "stripe_event_id" }
  );
}

async function getCompanyByStripeCustomer(
  supabase: ReturnType<typeof createClient>,
  stripeCustomerId: string
) {
  const { data } = await supabase
    .from("companies")
    .select("id, status, stripe_subscription_status")
    .eq("stripe_customer_id", stripeCustomerId)
    .maybeSingle();
  return data;
}

async function upsertSubscriptionInvoice(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  invoice: any,
  stripeCustomerId: string
) {
  await supabase.from("subscription_invoices").upsert(
    {
      company_id: companyId,
      stripe_invoice_id: invoice.id,
      stripe_customer_id: stripeCustomerId,
      amount_paid: invoice.amount_paid ?? 0,
      amount_due: invoice.amount_due ?? 0,
      currency: invoice.currency ?? "eur",
      status: invoice.status ?? "draft",
      invoice_url: invoice.hosted_invoice_url ?? null,
      invoice_pdf: invoice.invoice_pdf ?? null,
      period_start: invoice.period_start
        ? new Date(invoice.period_start * 1000).toISOString()
        : null,
      period_end: invoice.period_end
        ? new Date(invoice.period_end * 1000).toISOString()
        : null,
      paid_at: invoice.status_transitions?.paid_at
        ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "stripe_invoice_id" }
  );
}

async function handleInvoiceCreated(
  supabase: ReturnType<typeof createClient>,
  invoice: any
) {
  const stripeCustomerId = invoice.customer;
  if (!stripeCustomerId) return;

  const company = await getCompanyByStripeCustomer(supabase, stripeCustomerId);
  if (!company) return;

  await upsertSubscriptionInvoice(supabase, company.id, invoice, stripeCustomerId);
}

// ─── Event Handlers ────────────────────────────────────────

// Salva la carta del customer su company_auto_topup per TUTTI i wallet a consumo
// (email/ai/whatsapp): così l'auto-ricarica usa la stessa carta dell'abbonamento
// o dell'aggiunta-carta, senza pretendere una ricarica manuale separata. Aggiorna
// solo lo stripe_payment_method_id (non tocca soglia/importo/enabled del cliente).
async function saveCardForAutoTopup(
  supabase: ReturnType<typeof createClient>,
  stripeSecretKey: string,
  companyId: string,
  customerId: string | null,
  pmIdHint: string | null,
) {
  if (!companyId) return;
  let pmId = pmIdHint;
  if (!pmId && customerId) {
    try {
      const cRes = await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
        headers: { Authorization: `Bearer ${stripeSecretKey}` },
      });
      const cust = await cRes.json();
      const dpm = cust?.invoice_settings?.default_payment_method;
      pmId = typeof dpm === "string" ? dpm : (dpm?.id ?? null);
      if (!pmId) {
        const pmRes = await fetch(
          `https://api.stripe.com/v1/payment_methods?customer=${customerId}&type=card&limit=1`,
          { headers: { Authorization: `Bearer ${stripeSecretKey}` } },
        );
        const pmList = await pmRes.json();
        pmId = pmList?.data?.[0]?.id ?? null;
      }
    } catch (e) {
      console.error("saveCardForAutoTopup: PM resolution failed:", e);
    }
  }
  if (!pmId) return;
  for (const wallet of ["email", "ai", "whatsapp"]) {
    try {
      // tabella non tipizzata nel client → cast (come il resto del codebase)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from("company_auto_topup") as any).upsert(
        { company_id: companyId, wallet_type: wallet, stripe_payment_method_id: pmId, payment_method: "stripe" },
        { onConflict: "company_id,wallet_type" },
      );
    } catch (e) {
      console.error(`saveCardForAutoTopup: upsert ${wallet} failed:`, e);
    }
  }
}

async function handleCheckoutCompleted(
  supabase: ReturnType<typeof createClient>,
  session: any,
  stripeSecretKey: string
) {
  const companyId = session.metadata?.company_id;
  const metadataType = session.metadata?.type;
  if (!companyId) return;

  // ── Setup Card (aggiunta carta senza addebito → sblocca gli strumenti a costo) ──
  if (metadataType === "setup_card") {
    let pmId: string | null = null;
    if (session.setup_intent) {
      try {
        const siRes = await fetch(
          `https://api.stripe.com/v1/setup_intents/${session.setup_intent}`,
          { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
        );
        const si = await siRes.json();
        pmId = si.payment_method ?? null;
      } catch (e) {
        console.error("Failed to read setup_intent:", e);
      }
    }
    // Fallback: se il setup_intent non ha restituito la payment method, prendi
    // l'ultima carta salvata sul customer (così non restiamo senza default).
    if (!pmId && session.customer) {
      try {
        const pmRes = await fetch(
          `https://api.stripe.com/v1/payment_methods?customer=${session.customer}&type=card&limit=1`,
          { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
        );
        const pmList = await pmRes.json();
        pmId = pmList?.data?.[0]?.id ?? null;
      } catch (e) {
        console.error("Failed to list payment methods:", e);
      }
    }
    // Imposta la carta come metodo di pagamento di default del customer (addebiti futuri).
    if (pmId && session.customer) {
      try {
        await fetch(`https://api.stripe.com/v1/customers/${session.customer}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${stripeSecretKey}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ "invoice_settings[default_payment_method]": pmId }),
        });
      } catch (e) {
        console.error("Failed to set default payment method:", e);
      }
    }
    // Segna payment_method='stripe' SOLO se c'è davvero una carta di default,
    // altrimenti il flag resterebbe disallineato dalla realtà Stripe e il
    // rinnovo fallirebbe pur mostrando "carta a posto".
    await supabase
      .from("companies")
      .update({ payment_method: pmId ? "stripe" : "none" })
      .eq("id", companyId);
    // Unifica la carta anche per l'auto-ricarica crediti (tutti i wallet).
    await saveCardForAutoTopup(supabase, stripeSecretKey, companyId, (session.customer as string | null) ?? null, pmId);
    return;
  }

  // ── Plan Signup (checkout pubblico offerta in trattativa → attiva l'azienda) ──
  // La sessione è mode=subscription: al completamento l'abbonamento è attivo e la
  // carta è agganciata al customer. Sblocchiamo il gate di attivazione dell'azienda.
  if (metadataType === "plan_signup") {
    const planId = session.metadata?.plan_id || null;
    const update: Record<string, unknown> = {
      status: "active",
      payment_method: "stripe",
      trial_ends_at: null,
    };
    if (planId) update.subscription_plan_id = planId;
    await supabase.from("companies").update(update).eq("id", companyId);

    // Registro abbonamento canonico (pannello Abbonamento, MRR, cancellazione).
    // Una riga attiva per azienda: pulisco le attive/in-prova e ne creo una.
    if (planId) {
      await supabase.from("company_subscriptions").delete()
        .eq("company_id", companyId).in("status", ["active", "trialing"]);
      await supabase.from("company_subscriptions").insert({
        company_id: companyId,
        plan_id: planId,
        billing_period: session.metadata?.billing_period === "yearly" ? "yearly" : "monthly",
        status: "active",
        stripe_subscription_id: (session.subscription as string | null) ?? null,
        current_period_start: new Date().toISOString(),
      });
    }

    // Salva la carta come default del customer (pmId null → la funzione la recupera).
    await saveCardForAutoTopup(supabase, stripeSecretKey, companyId, (session.customer as string | null) ?? null, null);
    return;
  }

  // ── Email Credits Purchase ──
  if (metadataType === "email_credits") {
    const amountEur = parseFloat(session.metadata?.amount_eur || "0");
    if (amountEur > 0) {
      const { error: addEmailErr } = await supabase.rpc("add_email_credits_with_log", {
        p_company_id: companyId,
        p_amount: amountEur,
        p_type: "topup",
        p_description: `Acquisto Stripe - €${amountEur}`,
        p_metadata: { stripe_session_id: session.id, payment_intent: session.payment_intent },
      });
      // Soldi già incassati: se l'accredito fallisce NON ingoiare l'errore → l'handler
      // torna 500 e Stripe riconsegna l'evento (idempotente) finché va a buon fine.
      if (addEmailErr) throw new Error(`add_email_credits_with_log failed: ${addEmailErr.message}`);

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

  // ── WhatsApp Credits Purchase ──
  if (metadataType === "whatsapp_credits") {
    const amountEur = parseFloat(session.metadata?.amount_eur || "0");
    if (amountEur > 0) {
      const { error: addWaErr } = await supabase.rpc("add_whatsapp_credits_with_log", {
        p_company_id: companyId,
        p_amount: amountEur,
        p_type: "topup",
        p_description: `Acquisto Stripe - €${amountEur}`,
        p_metadata: { stripe_session_id: session.id, payment_intent: session.payment_intent },
      });
      if (addWaErr) throw new Error(`add_whatsapp_credits_with_log failed: ${addWaErr.message}`);

      // Salva payment method per auto top-up futuri
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
                { company_id: companyId, wallet_type: "whatsapp", stripe_payment_method_id: pi.payment_method, payment_method: "stripe" },
                { onConflict: "company_id,wallet_type" }
              );
          }
        } catch (e) {
          console.error("Failed to save WhatsApp payment method:", e);
        }
      }
    }
    return;
  }

  // ── AI Credits Purchase (one-time top-up) ──
  // Diverso da ai_subscription: e' un acquisto crediti spot, non abbonamento.
  // Accredito atomico via update + insert log.
  if (metadataType === "ai_credits") {
    const amountEur = parseFloat(session.metadata?.amount_eur || "0");
    if (amountEur > 0) {
      // Accredito ATOMICO via RPC (UPDATE in-place con lock): elimina la race
      // read-modify-write su acquisti/retry concorrenti. 'ai_agents' → ai_credits.
      const { error: aiTopupErr } = await supabase.rpc("topup_service_credits", {
        p_service: "ai_agents",
        p_company_id: companyId,
        p_amount: amountEur,
      });
      if (aiTopupErr) throw new Error(`topup_service_credits(ai_agents) failed: ${aiTopupErr.message}`);

      // Log topup
      await supabase.from("ai_credit_topups").insert({
        company_id: companyId,
        amount_eur: amountEur,
        type: "topup",
        status: "completed",
        notes: `Acquisto Stripe - €${amountEur}`,
        payment_ref: session.id,
        payment_method: "stripe",
        processed_at: new Date().toISOString(),
      });

      // Salva payment method per auto top-up
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
                { company_id: companyId, wallet_type: "ai", stripe_payment_method_id: pi.payment_method, payment_method: "stripe" },
                { onConflict: "company_id,wallet_type" }
              );
          }
        } catch (e) {
          console.error("Failed to save AI payment method:", e);
        }
      }
    }
    return;
  }

  // ── Render Credits Purchase (one-time, count-based) ──
  // Diverso dagli altri: render_credits e' "count" non "eur".
  // metadata.qty = numero di render acquistati (10/50/100).
  if (metadataType === "render_credits") {
    const qty = parseInt(session.metadata?.qty || "0");
    if (qty > 0) {
      // Accredito ATOMICO render (lock FOR UPDATE + upsert + ledger): elimina la
      // race read-modify-write su retry concorrenti. p_delta = render acquistati.
      const { error: rndErr } = await supabase.rpc("adjust_render_credits_atomic", {
        p_company_id: companyId,
        p_delta: qty,
        p_reason: `Acquisto render via Stripe (${session.id})`,
        p_adjusted_by: null,
      });
      if (rndErr) throw new Error(`adjust_render_credits_atomic failed: ${rndErr.message}`);
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

    // Bonus benvenuto — idempotente: controlliamo se già erogato
    const { data: existingBonus } = await supabase
      .from("ai_credit_topups")
      .select("id")
      .eq("company_id", companyId)
      .eq("type", "bonus")
      .eq("notes", "Bonus benvenuto AI")
      .maybeSingle();

    if (!existingBonus) {
      const { data: bonusSetting } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "ai_welcome_bonus_eur")
        .maybeSingle();
      const bonusEur = parseFloat(bonusSetting?.value || "5");
      if (bonusEur > 0) {
        // Accredito diretto via update atomico
        const { data: credits } = await supabase
          .from("ai_credits")
          .select("balance_eur, total_recharged_eur")
          .eq("company_id", companyId)
          .maybeSingle();
        const newBalance = Number(((credits?.balance_eur ?? 0) + bonusEur).toFixed(4));
        const newRecharged = Number(((credits?.total_recharged_eur ?? 0) + bonusEur).toFixed(4));
        if (credits) {
          await supabase
            .from("ai_credits")
            .update({ balance_eur: newBalance, total_recharged_eur: newRecharged })
            .eq("company_id", companyId);
        } else {
          await supabase.from("ai_credits").insert({
            company_id: companyId,
            balance_eur: bonusEur,
            total_recharged_eur: bonusEur,
          });
        }
        await supabase.from("ai_credit_topups").insert({
          company_id: companyId,
          amount_eur: bonusEur,
          type: "bonus",
          status: "completed",
          notes: "Bonus benvenuto AI",
          processed_at: new Date().toISOString(),
        });
      }
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

    const period = getSubscriptionPeriod(sub);
    await supabase.from("company_subscriptions").upsert(
      {
        company_id: companyId,
        plan_id: planId,
        status: "active",
        stripe_subscription_id: stripeSubscriptionId,
        billing_period: sub.items?.data?.[0]?.price?.recurring?.interval === "year" ? "yearly" : "monthly",
        current_period_start: period.start,
        current_period_end: period.end,
      },
      { onConflict: "company_id" }
    );

    await supabase
      .from("companies")
      .update({ subscription_plan_id: planId })
      .eq("id", companyId);
  }

  // Unifica la carta: la stessa carta dell'abbonamento serve all'auto-ricarica crediti.
  await saveCardForAutoTopup(supabase, stripeSecretKey, companyId, (stripeCustomerId as string | null) ?? null, null);

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

  // Sync invoice to subscription_invoices
  await upsertSubscriptionInvoice(supabase, company.id, invoice, stripeCustomerId);

  // Non riattivare company churned/expired: l'invoice potrebbe essere un credit note
  // tardivo o un rimborso parziale. Lasciamo traccia in subscription_invoices ma
  // non tocchiamo lo stato della company.
  if (company.status === "expired" || company.status === "churned") {
    console.log(`[STRIPE] invoice.paid ignored for ${company.status} company ${company.id}`);
    return;
  }

  const subRes = await fetch(
    `https://api.stripe.com/v1/subscriptions/${stripeSubscriptionId}`,
    { headers: { Authorization: `Bearer ${stripeSecretKey}` } }
  );
  const sub = await subRes.json();

  const period = getSubscriptionPeriod(sub);
  await supabase
    .from("company_subscriptions")
    .update({
      status: "active",
      current_period_start: period.start,
      current_period_end: period.end,
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

  // Trigger di PIATTAFORMA: pagamento abbonamento ricevuto (best-effort).
  const cPaid = company as { id: string; name?: string };
  await emitPlatformEvent(supabase, PLATFORM_EVENTS.PAYMENT_RECEIVED, {
    entityId: cPaid.id,
    entityType: "company",
    payload: {
      "azienda.id": cPaid.id,
      "azienda.name": cPaid.name ?? null,
      "pagamento.importo": typeof invoice.amount_paid === "number" ? invoice.amount_paid / 100 : null,
      "pagamento.data": new Date().toISOString(),
      "pagamento.metodo": "stripe",
    },
  });

  // Meta CAPI (pixel piattaforma EiC) — eventi per Custom Audience di
  // remarketing. Subscribe SOLO sul primo abbonamento (billing_reason
  // subscription_create); Purchase su ogni fattura pagata (valore reale).
  // Best-effort + no-op se EIC_CAPI_PIXEL_TOKEN non è configurato.
  const valueEur = typeof invoice.amount_paid === "number" ? invoice.amount_paid / 100 : undefined;
  const capiUser = {
    email: typeof invoice.customer_email === "string" ? invoice.customer_email : undefined,
    external_id: cPaid.id,
  };
  const capiCustom = {
    value: valueEur,
    currency: String(invoice.currency ?? "eur").toUpperCase(),
    content_name: "Abbonamento EiC",
    content_category: "subscription",
  };
  if (invoice.billing_reason === "subscription_create") {
    await sendPlatformCapiEvent("Subscribe", capiUser, capiCustom, `sub-${cPaid.id}-${invoice.id}`);
  }
  await sendPlatformCapiEvent("Purchase", capiUser, capiCustom, `pur-${invoice.id}`);
}

async function handleInvoicePaymentFailed(
  supabase: ReturnType<typeof createClient>,
  invoice: any
) {
  const stripeCustomerId = invoice.customer;
  if (!stripeCustomerId) return;

  const company = await getCompanyByStripeCustomer(supabase, stripeCustomerId);
  if (!company) return;

  // Sync failed invoice to subscription_invoices
  await upsertSubscriptionInvoice(supabase, company.id, invoice, stripeCustomerId);

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

  // Trigger dunning immediately — non bloccare: errori non critici
  const cronSecret = Deno.env.get("INTERNAL_CRON_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (cronSecret && supabaseUrl) {
    fetch(`${supabaseUrl}/functions/v1/process-dunning`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-cron-secret": cronSecret,
      },
      body: JSON.stringify({ triggered_by: "stripe_payment_failed", company_id: company.id }),
    }).catch((e) =>
      console.error("[stripe-webhook] Failed to trigger process-dunning:", (e as Error).message)
    );
  }

  // ─── CUSTOMER OS — enqueue Beatrice CFO alert ────────────────────────────
  // Fire-and-forget: Beatrice prepara una bozza interna a Florin con contesto
  // cliente, urgenza (failure count), prossima azione consigliata.
  // Skip silenzioso se la RPC enqueue_customer_workflow non è ancora deployata.
  try {
    await supabase.rpc("enqueue_customer_workflow", {
      p_workflow_key: "cfo.payment_failed_alert",
      p_company_id: company.id,
      p_payload: {
        invoice_id: invoice.id,
        amount_due: invoice.amount_due ?? 0,
        failure_count: failureCount,
        dunning_status: dunningStatus,
        triggered_at: new Date().toISOString(),
      },
    });
  } catch (e) {
    // RPC non esiste ancora oppure errore non bloccante
    const msg = (e as Error).message ?? "";
    if (!/function .* does not exist/i.test(msg)) {
      console.warn("[stripe-webhook] enqueue cfo.payment_failed_alert failed:", msg);
    }
  }
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

  // Trigger di PIATTAFORMA: abbonamento cancellato (best-effort) per builder admin.
  const cCancel = company as { id: string; name?: string };
  await emitPlatformEvent(supabase, PLATFORM_EVENTS.SUBSCRIPTION_CANCELLED, {
    entityId: cCancel.id,
    entityType: "company",
    payload: {
      "azienda.id": cCancel.id,
      "azienda.name": cCancel.name ?? null,
      "abbonamento.piano": null,
      "abbonamento.motivo": "stripe_cancellation",
    },
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
  const previousStatus = (company as { stripe_subscription_status?: string })
    .stripe_subscription_status;

  await supabase
    .from("companies")
    .update({ stripe_subscription_status: stripeStatus })
    .eq("id", company.id);

  const period = getSubscriptionPeriod(subscription);
  if (period.end || period.start) {
    await supabase
      .from("company_subscriptions")
      .update({
        status: stripeStatus === "active" ? "active" : stripeStatus,
        current_period_start: period.start,
        current_period_end: period.end,
      })
      .eq("company_id", company.id);
  }

  // Meta CAPI — StartTrial: l'azienda entra in prova (status trialing per la
  // prima volta) → audience di remarketing per chi prova ma non si abbona
  // (win-back). Best-effort + no-op se EIC_CAPI_PIXEL_TOKEN non è configurato.
  if (stripeStatus === "trialing" && previousStatus !== "trialing") {
    const { data: trialCompany } = await supabase
      .from("companies")
      .select("email")
      .eq("id", company.id)
      .maybeSingle();
    const trialEmail = (trialCompany as { email?: string } | null)?.email;
    await sendPlatformCapiEvent(
      "StartTrial",
      { email: typeof trialEmail === "string" ? trialEmail : undefined, external_id: company.id },
      { content_name: "Trial EiC", content_category: "subscription" },
      `trial-${company.id}-${subscription.id}`,
    );
  }

  // ─── CUSTOMER OS — Sofia onboarding kickoff su PRIMA attivazione ────────
  // Trigger SOLO se il vecchio status NON era active (transizione null→active
  // o trial→active, NON re-attivazioni dopo past_due).
  const isFirstActivation =
    stripeStatus === "active" &&
    (!previousStatus || previousStatus === "trialing" || previousStatus === "incomplete");
  if (isFirstActivation) {
    try {
      await supabase.rpc("enqueue_customer_workflow", {
        p_workflow_key: "onboarding.kickoff_email",
        p_company_id: company.id,
        p_payload: {
          stripe_subscription_id: subscription.id,
          previous_status: previousStatus ?? null,
          triggered_at: new Date().toISOString(),
        },
      });
    } catch (e) {
      const msg = (e as Error).message ?? "";
      if (!/function .* does not exist/i.test(msg)) {
        console.warn("[stripe-webhook] enqueue onboarding.kickoff_email failed:", msg);
      }
    }
  }
}

// ─── Referral Attribution ─────────────────────────────────

async function handleReferralAttribution(
  supabase: ReturnType<typeof createClient>,
  stripeCustomerId: string
) {
  try {
    // Recupera la company con referred_by
    const { data: company } = await supabase
      .from('companies')
      .select('id, referred_by, name')
      .eq('stripe_customer_id', stripeCustomerId)
      .maybeSingle();

    if (!company?.referred_by) return; // Nessun referral da attribuire

    // Verifica che non esista già in referral_companies
    const { data: existing } = await supabase
      .from('referral_companies')
      .select('id')
      .eq('referrer_id', company.referred_by)
      .eq('company_id', company.id)
      .maybeSingle();

    const { data: referrer } = await supabase
      .from('referrers')
      .select('referral_code')
      .eq('id', company.referred_by)
      .maybeSingle();

    if (referrer?.referral_code) {
      await supabase.rpc('record_referral_conversion', {
        p_referral_code: referrer.referral_code,
        p_company_id: company.id,
        p_status: 'active',
      }).catch((e: unknown) => console.error('[stripe-webhook] record_referral_conversion error:', e));
    }

    if (existing) return; // Già attribuito

    // Aggiorna conversion_rate del referrer
    await supabase.rpc('update_referrer_stats', { p_referrer_id: company.referred_by });

    // Notifica il partner della conversione
    await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/send-partner-notification`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-cron-secret': Deno.env.get('INTERNAL_CRON_SECRET') || Deno.env.get('CRON_SECRET') || '',
        },
        body: JSON.stringify({
          type:        'conversion',
          referrer_id: company.referred_by,
          data:        { company_name: company.name || 'Nuova azienda' },
        }),
      }
    ).catch((e) => console.error('[stripe-webhook] Referral notification error:', e));

    console.log(`[stripe-webhook] Referral attribuito: company=${company.id} → referrer=${company.referred_by}`);
  } catch (err) {
    console.error('[stripe-webhook] handleReferralAttribution error:', err);
  }
}

// ─── Main Handler ──────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeSecretKey = await getPlatformSetting("stripe_secret_key", "STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      return new Response(JSON.stringify({ error: "Stripe non configurato" }), {
        status: 400,
        headers: secureHeaders,
      });
    }

    const body = await req.text();

    // ── Signature verification ──
    // SICUREZZA: rifiutiamo SEMPRE se il secret non è configurato. Prima il
    // webhook faceva JSON.parse del body non firmato → un attaccante poteva
    // forgiare `checkout.session.completed` e attivarsi un abbonamento gratis.
    const webhookSecret = await getPlatformSetting("stripe_webhook_secret", "STRIPE_WEBHOOK_SECRET");
    if (!webhookSecret) {
      console.error("[STRIPE] STRIPE_WEBHOOK_SECRET non configurato — reject all");
      return new Response(JSON.stringify({ error: "Webhook secret not configured on server" }), {
        status: 503,
        headers: secureHeaders,
      });
    }

    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
        status: 400,
        headers: secureHeaders,
      });
    }

    let event: Stripe.Event;
    const stripe = new Stripe(stripeSecretKey, { apiVersion: "2024-12-18.acacia" });
    try {
      // P0-5: in Deno NON usare constructEvent() sync — stripe-node l'ha
      // scritta sopra `require('crypto').createHmac()` che è Node API.
      // Deno espone solo WebCrypto (async), quindi il metodo sync o
      // lancia "subtle is not defined" o degrada silenziosamente in
      // qualche fork buggato. Risultato: la firma del webhook NON veniva
      // effettivamente verificata.
      // constructEventAsync + createSubtleCryptoProvider è la via supportata
      // ufficialmente da Stripe per runtime Deno/Cloudflare Workers.
      event = await stripe.webhooks.constructEventAsync(
        body,
        signature,
        webhookSecret,
        undefined, // tolerance default 300s
        Stripe.createSubtleCryptoProvider(),
      );
    } catch (err) {
      console.error("Stripe webhook signature verification failed:", err);
      return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
        status: 400,
        headers: secureHeaders,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Extract company_id for logging
    const obj = event.data?.object || {};
    const companyId = obj.metadata?.company_id || null;

    // ── Idempotency con CLAIM ATOMICO ─────────────────────────────────────
    // Il vecchio pattern SELECT('processed')→UPSERT('processing') aveva una
    // finestra di race: se l'handler supera i ~20s, Stripe ritenta MENTRE il
    // primo tentativo sta ancora girando; entrambi passavano il check e gli
    // accrediti (add_*_credits/topup) venivano eseguiti DUE volte per un solo
    // pagamento. Ora vince chi INSERISCE la riga (ignoreDuplicates): il
    // perdente vede lo stato del vincitore e decide — processed=skip,
    // processing recente=skip (owner vivo), processing stantio >5min o
    // error=reclaim (owner morto/timeout: si può rilavorare in sicurezza).
    const { data: claimed } = await supabase
      .from("stripe_events_log")
      .upsert(
        {
          stripe_event_id: event.id,
          event_type: event.type,
          company_id: companyId,
          payload: event.data,
          status: "processing",
          processed_at: new Date().toISOString(),
        },
        { onConflict: "stripe_event_id", ignoreDuplicates: true },
      )
      .select("id");

    if (!claimed || claimed.length === 0) {
      const { data: existing } = await supabase
        .from("stripe_events_log")
        .select("status, processed_at")
        .eq("stripe_event_id", event.id)
        .maybeSingle();

      if (existing?.status === "processed") {
        console.log(`[STRIPE] Event ${event.id} already processed, skipping`);
        return new Response(JSON.stringify({ received: true, already_processed: true }), {
          headers: secureHeaders,
        });
      }
      if (existing?.status === "processing") {
        const ageMs = existing.processed_at
          ? Date.now() - new Date(existing.processed_at as string).getTime()
          : Number.POSITIVE_INFINITY;
        if (ageMs < 5 * 60 * 1000) {
          console.log(`[STRIPE] Event ${event.id} in lavorazione da ${Math.round(ageMs / 1000)}s: skip retry concorrente`);
          return new Response(JSON.stringify({ received: true, in_progress: true }), {
            headers: secureHeaders,
          });
        }
      }
      // status='error' oppure 'processing' stantio: reclaim esplicito e si rilavora.
      await logStripeEvent(supabase, event.id, event.type, companyId, event.data, "processing");
    }

    // ── Eventi customer-scoped di clienti NON EiC (account Stripe condiviso) ─
    // Lo stesso account Stripe incassa anche altri prodotti AEDIX (es. Pratica
    // Rapida, abbonamenti WhatsApp venduti fuori piattaforma): i loro eventi
    // arrivano qui ma nessuna company ha quel stripe_customer_id. Prima gli
    // handler facevano `if (!company) return` in SILENZIO — impossibile
    // distinguere il rumore cross-prodotto da un VERO cliente EiC sganciato.
    // Ora l'evento è marcato processed con nota 'company_not_found:<cus>':
    // registro auditabile, e un mismatch reale si vede subito.
    const CUSTOMER_SCOPED_EVENTS = [
      "invoice.paid",
      "invoice.payment_failed",
      "invoice.created",
      "customer.subscription.created",
      "customer.subscription.updated",
      "customer.subscription.deleted",
    ];
    if (CUSTOMER_SCOPED_EVENTS.includes(event.type) && obj.customer) {
      const scopedCompany = await getCompanyByStripeCustomer(supabase, obj.customer);
      if (!scopedCompany) {
        await logStripeEvent(
          supabase, event.id, event.type, null, event.data,
          "processed", `company_not_found:${obj.customer}`,
        );
        return new Response(JSON.stringify({ received: true, skipped: "company_not_found" }), {
          headers: secureHeaders,
        });
      }
    }

    // P0-6: traccia esito handler per decidere lo status HTTP di ritorno.
    // Se ritornassimo sempre 200, Stripe considererebbe l'evento "consegnato"
    // anche quando il nostro handler fallisce, e non ritenterebbe mai. Con
    // l'idempotency check qui sopra (`status='processed'`) possiamo tornare
    // 500 in sicurezza: Stripe ritenta con backoff esponenziale e alla
    // riconsegna, se nel frattempo tutto è stato sistemato, l'evento viene
    // processato correttamente; se è già processed, viene skippato.
    let handlerFailed = false;
    let handlerError: string | null = null;

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
        case "customer.subscription.created":
          // Attribuisce il referral al primo abbonamento attivo
          await handleReferralAttribution(supabase, obj.customer);
          await handleSubscriptionUpdated(supabase, obj);
          break;
        case "customer.subscription.updated":
          await handleSubscriptionUpdated(supabase, obj);
          break;
        case "invoice.created":
          await handleInvoiceCreated(supabase, obj);
          break;
      }

      await logStripeEvent(supabase, event.id, event.type, companyId, event.data, "processed");
    } catch (handlerErr) {
      handlerFailed = true;
      handlerError = (handlerErr as Error).message;
      console.error(`[STRIPE] Handler error for ${event.type}:`, handlerErr);
      await logStripeEvent(
        supabase, event.id, event.type, companyId, event.data,
        "error", handlerError,
      );
    }

    if (handlerFailed) {
      // Stripe ritenta con backoff: ~3 giorni per eventi critici (invoice.paid,
      // checkout.session.completed). Questo è il comportamento desiderato:
      // vogliamo che l'evento venga riconsegnato finché il nostro handler
      // non lo processa correttamente.
      return new Response(
        JSON.stringify({ received: false, error: handlerError }),
        { status: 500, headers: secureHeaders },
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
