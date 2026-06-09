import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { resolveProduttore, loadOwnedReseller } from "../_shared/produttore.ts";

/**
 * set-reseller-plan — il PRODUTTORE cambia il PIANO (subscription_plan_id) di un
 * suo rivenditore: definisce i moduli abilitati (subscription_plans.included_modules),
 * speculare a "Cambia piano" del superadmin ma scoped ai propri figli. Guardia
 * anti-IDOR centralizzata. Nessun sync Stripe (riscossione manuale — Fase 3).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const body = await req.json();
    const resellerId = String(body?.reseller_id ?? "");
    const newPlanId = String(body?.subscription_plan_id ?? "");
    if (!resellerId) return errorResponse("reseller_id richiesto", 400, corsH);
    if (!newPlanId) return errorResponse("subscription_plan_id richiesto", 400, corsH);

    const ctx = await resolveProduttore(req, corsH);
    const reseller = await loadOwnedReseller(ctx, resellerId, corsH, "id, parent_company_id, subscription_plan_id");

    const { data: plan } = await ctx.supabaseAdmin
      .from("subscription_plans").select("id, name, is_active").eq("id", newPlanId).maybeSingle();
    if (!plan || plan.is_active === false) return errorResponse("Piano non valido o non attivo", 400, corsH);

    const oldPlanId = (reseller.subscription_plan_id as string | null) ?? null;
    if (oldPlanId === newPlanId) {
      return jsonResponse({ success: true, reseller_id: resellerId, subscription_plan_id: newPlanId, unchanged: true }, 200, corsH);
    }

    const { error } = await ctx.supabaseAdmin
      .from("companies").update({ subscription_plan_id: newPlanId }).eq("id", resellerId);
    if (error) return errorResponse(`Aggiornamento fallito: ${error.message}`, 500, corsH);

    await ctx.supabaseAdmin.from("subscription_logs").insert({
      company_id: resellerId,
      event_type: "plan_changed",
      plan_id: newPlanId,
      previous_plan_id: oldPlanId,
      performed_by: ctx.userId,
      notes: `Piano rivenditore cambiato in "${plan.name}" dal produttore`,
    });

    return jsonResponse({ success: true, reseller_id: resellerId, subscription_plan_id: newPlanId }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("set-reseller-plan error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
