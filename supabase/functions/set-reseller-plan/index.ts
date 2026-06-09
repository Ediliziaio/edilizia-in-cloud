import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

/**
 * set-reseller-plan — il PRODUTTORE cambia il PIANO (subscription_plan_id) di un
 * suo rivenditore esistente. È la "cosa" di "chi paga cosa": definisce i moduli
 * abilitati sul rivenditore (subscription_plans.included_modules), in modo
 * speculare a "Cambia piano" del superadmin — ma scoped ai propri figli.
 *
 * Validazioni:
 *  - chiamante produttore_admin / super_admin;
 *  - il rivenditore deve essere figlio del produttore (no IDOR), salvo super_admin;
 *  - il piano deve essere ATTIVO.
 * Scrive un log best-effort su subscription_logs (event_type 'plan_changed').
 * NB: nessun sync Stripe (la riscossione del produttore è manuale — Fase 3).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    const body = await req.json();
    const resellerId = String(body?.reseller_id ?? "");
    const newPlanId = String(body?.subscription_plan_id ?? "");
    if (!resellerId) return errorResponse("reseller_id richiesto", 400, corsH);
    if (!newPlanId) return errorResponse("subscription_plan_id richiesto", 400, corsH);

    // 1. Azienda del chiamante (dal profilo).
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("company_id").eq("id", userId).single();
    const produttoreId = profile?.company_id as string | undefined;
    if (!produttoreId) return errorResponse("Profilo senza azienda", 403, corsH);

    // 1b. Ruolo: produttore_admin o super_admin.
    const { data: roleRows } = await supabaseAdmin
      .from("user_roles").select("role").eq("user_id", userId);
    const callerRoles = new Set((roleRows ?? []).map((r: { role: string }) => r.role));
    const isSuper = callerRoles.has("super_admin");
    if (!isSuper && !callerRoles.has("produttore_admin")) {
      return errorResponse("Non autorizzato: ruolo produttore richiesto", 403, corsH);
    }

    // 2. Il rivenditore deve essere figlio del produttore (no IDOR).
    const { data: reseller } = await supabaseAdmin
      .from("companies").select("id, parent_company_id, subscription_plan_id").eq("id", resellerId).maybeSingle();
    if (!reseller) return errorResponse("Rivenditore non trovato", 404, corsH);
    if (!isSuper && reseller.parent_company_id !== produttoreId) {
      return errorResponse("Questo rivenditore non appartiene alla tua azienda", 403, corsH);
    }

    // 3. Il piano deve esistere ed essere attivo.
    const { data: plan } = await supabaseAdmin
      .from("subscription_plans").select("id, name, is_active").eq("id", newPlanId).maybeSingle();
    if (!plan || plan.is_active === false) {
      return errorResponse("Piano non valido o non attivo", 400, corsH);
    }

    const oldPlanId = (reseller.subscription_plan_id as string | null) ?? null;
    if (oldPlanId === newPlanId) {
      // Idempotente: nessuna modifica.
      return jsonResponse({ success: true, reseller_id: resellerId, subscription_plan_id: newPlanId, unchanged: true }, 200, corsH);
    }

    // 4. Aggiorna il piano.
    const { error } = await supabaseAdmin
      .from("companies").update({ subscription_plan_id: newPlanId }).eq("id", resellerId);
    if (error) return errorResponse(`Aggiornamento fallito: ${error.message}`, 500, corsH);

    // 5. Log di audit (best-effort: non blocca la risposta).
    await supabaseAdmin.from("subscription_logs").insert({
      company_id: resellerId,
      event_type: "plan_changed",
      plan_id: newPlanId,
      previous_plan_id: oldPlanId,
      performed_by: userId,
      notes: `Piano rivenditore cambiato in "${plan.name}" dal produttore`,
    });

    return jsonResponse({ success: true, reseller_id: resellerId, subscription_plan_id: newPlanId }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("set-reseller-plan error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
