import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

/**
 * manage-produttore-plan — il SUPER ADMIN gestisce i piani AD HOC di un produttore:
 *  - action "create": crea un piano full-module legato al produttore (name + price),
 *    visibile solo nel selettore rivenditori di quel produttore.
 *  - action "deactivate": disattiva (is_active=false) un piano custom (solo quelli
 *    con produttore_id valorizzato; i piani globali non si toccano da qui).
 */
const ALL_MODULES = ["orders", "warehouse", "calendar", "customers", "employees", "tickets", "forecast"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const body = await req.json();
    const action = String(body?.action ?? "");

    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r: { role: string }) => r.role === "super_admin")) {
      return errorResponse("Non autorizzato: richiesto super admin", 403, corsH);
    }

    if (action === "create") {
      const produttoreId = String(body?.produttore_id ?? "");
      const name = String(body?.name ?? "").trim();
      const price = Number(body?.price_monthly);
      if (!produttoreId) return errorResponse("produttore_id richiesto", 400, corsH);
      if (!name) return errorResponse("Nome del piano richiesto", 400, corsH);
      if (name.length > 80) return errorResponse("Nome troppo lungo (max 80)", 400, corsH);
      if (!Number.isFinite(price) || price < 0 || price > 100000) return errorResponse("Prezzo non valido", 400, corsH);

      const { data: brand } = await supabaseAdmin
        .from("company_branding").select("whitelabel_tier").eq("company_id", produttoreId).maybeSingle();
      if (!brand || brand.whitelabel_tier !== "agency") {
        return errorResponse("L'azienda indicata non è un produttore (agency)", 400, corsH);
      }

      const monthly = Math.round(price * 100) / 100;
      const slug = `prod-${produttoreId.slice(0, 8)}-${crypto.randomUUID().slice(0, 8)}`;
      const { data: plan, error } = await supabaseAdmin
        .from("subscription_plans")
        .insert({
          name,
          slug,
          price_monthly: monthly,
          price_yearly: Math.round(monthly * 12 * 100) / 100,
          produttore_id: produttoreId,
          is_full_plan: true,
          is_active: true,
          included_modules: ALL_MODULES,
          max_orders: -1,
          max_users: -1,
          max_storage_mb: 10240,
          trial_days: 0,
          position: 50,
        })
        .select("id, name, price_monthly")
        .single();
      if (error) return errorResponse(`Creazione piano fallita: ${error.message}`, 500, corsH);

      return jsonResponse({ success: true, plan }, 200, corsH);
    }

    if (action === "deactivate") {
      const planId = String(body?.plan_id ?? "");
      if (!planId) return errorResponse("plan_id richiesto", 400, corsH);
      const { data: pl } = await supabaseAdmin
        .from("subscription_plans").select("id, produttore_id").eq("id", planId).maybeSingle();
      if (!pl) return errorResponse("Piano non trovato", 404, corsH);
      if (!pl.produttore_id) return errorResponse("Non è un piano personalizzato (piano globale)", 400, corsH);

      const { error } = await supabaseAdmin
        .from("subscription_plans").update({ is_active: false }).eq("id", planId);
      if (error) return errorResponse(`Disattivazione fallita: ${error.message}`, 500, corsH);
      return jsonResponse({ success: true, plan_id: planId }, 200, corsH);
    }

    return errorResponse("action non valida (create | deactivate)", 400, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("manage-produttore-plan error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
