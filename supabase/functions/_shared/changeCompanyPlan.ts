import { errorResponse, jsonResponse } from "./headers.ts";
import { getPlatformSetting } from "./getPlatformSetting.ts";
import { emitPlatformEvent, PLATFORM_EVENTS } from "./platformAutomation.ts";
import { sendSystemEmail, formatEur, formatDateIt } from "./systemEmail.ts";
import { platformCompanyAdmin } from "./platformCompanyAdmin.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const APP_BASE = "https://app.ediliziaincloud.com";
async function planStripeClient(key: string) {
  const Stripe = (await import("npm:stripe@14")).default;
  return new Stripe(key);
}

/** Shared implementation, not an endpoint. Callers must authorize the actor. */
export async function changeCompanyPlan(supabaseAdmin: any, userId: string, body: unknown, corsH: Record<string, string> = {}): Promise<Response> {
    const { company_id, new_plan_id, motivo } = (body ?? {}) as {
      company_id?: string;
      new_plan_id?: string;
      motivo?: unknown;
    };
    const reason = typeof motivo === "string" ? motivo.trim().slice(0, 1000) : "";
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
      .select("id, name, stripe_price_monthly_id, stripe_price_yearly_id, price_monthly")
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
    let oldPlanPrice: number | null = null;
    if (oldPlanId) {
      const { data: oldPlan } = await supabaseAdmin
        .from("subscription_plans")
        .select("name, price_monthly")
        .eq("id", oldPlanId)
        .single();
      if (oldPlan) { oldPlanName = oldPlan.name; oldPlanPrice = oldPlan.price_monthly == null ? null : Number(oldPlan.price_monthly); }
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
      !!stripeKey && !!company.stripe_customer_id;

    if (stripeNeeded) {
      stripeAttempted = true;
      try {
        const stripe = await planStripeClient(stripeKey!);

        const subscriptions = await stripe.subscriptions.list({
          customer: company.stripe_customer_id!,
          status: "all",
          limit: 100,
        });

        const eligible = subscriptions.data.filter((sub: any) => ["active", "trialing", "past_due"].includes(sub.status));
        if (subscriptions.has_more || eligible.length > 1) throw new Error("Abbonamenti Stripe multipli: selezione manuale richiesta");
        if (eligible.length > 0) {
          const sub = eligible[0];
          if (sub.items.data.length !== 1) throw new Error("Abbonamento con più voci: cambio piano manuale richiesto");
          const interval = sub.items.data[0].price?.recurring?.interval;
          if (!["month", "year"].includes(interval || "")) throw new Error("Periodicità Stripe non supportata");
          const price = interval === "year" ? newPlan.stripe_price_yearly_id : newPlan.stripe_price_monthly_id;
          if (!price) throw new Error("Il nuovo piano non ha un prezzo Stripe per la periodicità attuale");
          await stripe.subscriptions.update(sub.id, {
            items: [{ id: sub.items.data[0].id, price }],
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

    // Trigger di PIATTAFORMA: piano cambiato (best-effort) per il builder admin.
    await emitPlatformEvent(supabaseAdmin, PLATFORM_EVENTS.PLAN_CHANGED, {
      entityId: company_id,
      entityType: "company",
      payload: {
        "azienda.id": company_id,
        "azienda.name": company.name,
        "piano.vecchio": oldPlanName,
        "piano.nuovo": newPlan.name,
        "piano.tipo_cambio": oldPlanPrice == null || newPlan.price_monthly == null ? "change" : Number(newPlan.price_monthly) > oldPlanPrice ? "upgrade" : Number(newPlan.price_monthly) < oldPlanPrice ? "downgrade" : "change",
      },
    });

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
          : " (Stripe non configurato)") + (reason ? ` — Motivo: ${reason}` : ""),
      performed_by: userId,
    });

    // Email "piano aggiornato" all'admin azienda (best-effort)
    try {
      const contact = await platformCompanyAdmin(supabaseAdmin, company_id);
      if (contact) {
        const { data: subRow } = await supabaseAdmin
          .from("company_subscriptions")
          .select("current_period_end")
          .eq("company_id", company_id)
          .maybeSingle();
        const priceMonthly = Number((newPlan as { price_monthly?: number }).price_monthly ?? 0);
        await sendSystemEmail(supabaseAdmin, {
          templateName: "plan_changed",
          companyId: company_id,
          to: contact.email,
          userId: contact.userId,
          props: {
            recipientName: contact.firstName || "Admin",
            planName: newPlan.name,
            amountFormatted: priceMonthly > 0 ? `${formatEur(priceMonthly)}/mese` : "—",
            renewalDate: subRow?.current_period_end
              ? formatDateIt(new Date(subRow.current_period_end as string))
              : "—",
            ctaUrl: `${APP_BASE}/azienda/impostazioni/abbonamento`,
          },
        });
      }
    } catch (e) {
      console.warn("[admin-change-plan] email plan_changed fallita:", (e as Error)?.message);
    }

    // Audit log
    await supabaseAdmin.from("admin_audit_log").insert({
      user_id: userId,
      action: "change_plan",
      target_type: "company",
      target_id: company_id,
      details: {
        motivo: reason || null,
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
        new_plan_id,
        stripe_synced: stripeSynced,
        stripe_attempted: stripeAttempted,
        stripe_error: stripeError,
      },
      200,
      corsH,
    );

}
