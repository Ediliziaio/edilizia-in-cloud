import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    await requireRole(supabaseAdmin, userId, ["super_admin"], corsH);

    const { company_id, new_plan_id } = await req.json();
    if (!company_id || !new_plan_id) {
      return errorResponse("company_id e new_plan_id sono obbligatori");
    }

    // Load company and new plan
    const { data: company, error: compErr } = await supabaseAdmin
      .from("companies")
      .select("id, name, subscription_plan_id, stripe_customer_id, status")
      .eq("id", company_id)
      .single();
    if (compErr || !company) return errorResponse("Azienda non trovata", 404);

    const { data: newPlan, error: planErr } = await supabaseAdmin
      .from("subscription_plans")
      .select("id, name, stripe_price_id_monthly")
      .eq("id", new_plan_id)
      .single();
    if (planErr || !newPlan) return errorResponse("Piano non trovato", 404);

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

    // Update DB
    const { error: updateErr } = await supabaseAdmin
      .from("companies")
      .update({ subscription_plan_id: new_plan_id })
      .eq("id", company_id);
    if (updateErr) return errorResponse("Errore aggiornamento piano: " + updateErr.message, 500);

    // Stripe sync (if configured)
    let stripeSynced = false;
    const stripeKey = await getPlatformSetting("stripe_secret_key", "STRIPE_SECRET_KEY");
    if (stripeKey && company.stripe_customer_id && newPlan.stripe_price_id_monthly) {
      try {
        const Stripe = (await import("npm:stripe@14")).default;
        const stripe = new Stripe(stripeKey);

        const subscriptions = await stripe.subscriptions.list({
          customer: company.stripe_customer_id,
          status: "active",
          limit: 1,
        });

        if (subscriptions.data.length > 0) {
          const sub = subscriptions.data[0];
          await stripe.subscriptions.update(sub.id, {
            items: [{ id: sub.items.data[0].id, price: newPlan.stripe_price_id_monthly }],
            proration_behavior: "create_prorations",
          });
          stripeSynced = true;
        }
      } catch (stripeErr) {
        console.error("[admin-change-plan] Stripe sync failed:", stripeErr);
        // DB already updated, log the Stripe failure but don't rollback
      }
    }

    // Subscription log
    await supabaseAdmin.from("subscription_logs").insert({
      company_id,
      event_type: "plan_changed",
      old_status: company.status,
      new_status: company.status,
      plan_id: new_plan_id,
      notes: `Piano cambiato: ${oldPlanName} → ${newPlan.name}${stripeSynced ? " (Stripe sincronizzato)" : ""}`,
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
        stripe_synced: stripeSynced,
      },
    });

    return jsonResponse({ success: true, stripe_synced: stripeSynced });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin-change-plan] Error:", err);
    return errorResponse("Errore interno", 500);
  }
});
