import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    await requireRole(supabaseAdmin, userId, ["super_admin"], corsH);

    // Parse + validate input — S1.9 hardening
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return errorResponse("Body JSON non valido", 400, corsH);
    }
    const { company_id, new_plan_id } = (body ?? {}) as {
      company_id?: string;
      new_plan_id?: string;
    };
    if (!company_id || typeof company_id !== "string" || !UUID_RE.test(company_id)) {
      return errorResponse("company_id non valido (UUID richiesto)", 400, corsH);
    }
    if (!new_plan_id || typeof new_plan_id !== "string" || !UUID_RE.test(new_plan_id)) {
      return errorResponse("new_plan_id non valido (UUID richiesto)", 400, corsH);
    }

    // Load company and new plan
    const { data: company, error: compErr } = await supabaseAdmin
      .from("companies")
      .select("id, name, subscription_plan_id, stripe_customer_id, status")
      .eq("id", company_id)
      .single();
    if (compErr || !company) return errorResponse("Azienda non trovata", 404, corsH);

    const { data: newPlan, error: planErr } = await supabaseAdmin
      .from("subscription_plans")
      .select("id, name, stripe_price_monthly_id")
      .eq("id", new_plan_id)
      .single();
    if (planErr || !newPlan) return errorResponse("Piano non trovato", 404, corsH);

    // No-op check: se il piano non cambia, torna subito success idempotente
    if (company.subscription_plan_id === new_plan_id) {
      return jsonResponse(
        { success: true, stripe_synced: true, no_change: true },
        200,
        corsH,
      );
    }

    const oldPlanId = company.subscription_plan_id;
    let oldPlanName = "Nessuno";
    if (oldPlanId) {
      const { data: oldPlan } = await supabaseAdmin
        .from("subscription_plans")
        .select("name")
        .eq("id", oldPlanId)
        .single();
      if (oldPlan) oldPlanName = oldPlan.name;
    }

    // --- Stripe sync PRIMA dell'update DB (prepare-then-commit) ------------
    // Invertiamo l'ordine così se Stripe fallisce l'azienda NON passa al nuovo
    // piano con fatturazione ancora legata al vecchio. Se Stripe non è
    // configurato o l'azienda non ha subscription attiva, skippiamo e
    // aggiorniamo solo il DB (coerente con il comportamento pre-esistente per
    // account non ancora integrati con Stripe).
    let stripeSynced = false;
    let stripeAttempted = false;
    let stripeError: string | null = null;
    const stripeKey = await getPlatformSetting("stripe_secret_key", "STRIPE_SECRET_KEY");
    const stripeNeeded =
      !!stripeKey && !!company.stripe_customer_id && !!newPlan.stripe_price_monthly_id;

    if (stripeNeeded) {
      stripeAttempted = true;
      try {
        const Stripe = (await import("npm:stripe@14")).default;
        const stripe = new Stripe(stripeKey!);

        const subscriptions = await stripe.subscriptions.list({
          customer: company.stripe_customer_id!,
          status: "active",
          limit: 1,
        });

        if (subscriptions.data.length > 0) {
          const sub = subscriptions.data[0];
          await stripe.subscriptions.update(sub.id, {
            items: [{ id: sub.items.data[0].id, price: newPlan.stripe_price_monthly_id! }],
            proration_behavior: "create_prorations",
          });
          stripeSynced = true;
        } else {
          // Il cliente è in Stripe ma non ha subscription attive — non blocca
          // l'operazione (caso piani "gratis" / manuali), ma rendiamo esplicito.
          stripeSynced = false;
          stripeError = "no_active_subscription";
        }
      } catch (stripeErr) {
        stripeError = stripeErr instanceof Error ? stripeErr.message : String(stripeErr);
        console.error("[admin-change-plan] Stripe sync failed:", stripeError);
        // Audit log esplicito del fallimento per analisi post-mortem
        await supabaseAdmin.from("admin_audit_log").insert({
          user_id: userId,
          action: "change_plan_stripe_failed",
          target_type: "company",
          target_id: company_id,
          details: {
            company_name: company.name,
            old_plan: oldPlanName,
            new_plan: newPlan.name,
            error: stripeError,
          },
        });
        // NON aggiorniamo il DB se Stripe falla e il cliente era syncato —
        // restituiamo 502 Bad Gateway per far vedere al frontend che serve retry.
        return errorResponse(
          `Sincronizzazione Stripe fallita: ${stripeError}. Il piano DB non è stato modificato — riprova o contatta Stripe support.`,
          502,
          corsH,
        );
      }
    }

    // --- Commit: aggiornamento DB ------------------------------------------
    const { error: updateErr } = await supabaseAdmin
      .from("companies")
      .update({ subscription_plan_id: new_plan_id })
      .eq("id", company_id);
    if (updateErr) {
      // Se il DB fallisce DOPO Stripe sync, abbiamo drift: logga esplicitamente.
      if (stripeSynced) {
        console.error(
          "[admin-change-plan] DRIFT: Stripe aggiornato ma DB update fallito",
          { company_id, stripe_error: stripeError, db_error: updateErr.message },
        );
        await supabaseAdmin.from("admin_audit_log").insert({
          user_id: userId,
          action: "change_plan_db_drift",
          target_type: "company",
          target_id: company_id,
          details: {
            company_name: company.name,
            new_plan: newPlan.name,
            db_error: updateErr.message,
          },
        });
      }
      return errorResponse("Errore aggiornamento piano: " + updateErr.message, 500, corsH);
    }

    // Subscription log
    await supabaseAdmin.from("subscription_logs").insert({
      company_id,
      event_type: "plan_changed",
      old_status: company.status,
      new_status: company.status,
      plan_id: new_plan_id,
      notes:
        `Piano cambiato: ${oldPlanName} → ${newPlan.name}` +
        (stripeAttempted
          ? stripeSynced
            ? " (Stripe sincronizzato)"
            : ` (Stripe NON sincronizzato: ${stripeError ?? "unknown"})`
          : " (Stripe non configurato)"),
      performed_by: userId,
    });

    // Audit log
    await supabaseAdmin.from("admin_audit_log").insert({
      user_id: userId,
      action: "change_plan",
      target_type: "company",
      target_id: company_id,
      details: {
        company_name: company.name,
        old_plan: oldPlanName,
        new_plan: newPlan.name,
        stripe_attempted: stripeAttempted,
        stripe_synced: stripeSynced,
        stripe_error: stripeError,
      },
    });

    return jsonResponse(
      {
        success: true,
        stripe_synced: stripeSynced,
        stripe_attempted: stripeAttempted,
        stripe_error: stripeError,
      },
      200,
      corsH,
    );
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin-change-plan] Error:", err);
    return errorResponse("Errore interno", 500, corsH);
  }
});
