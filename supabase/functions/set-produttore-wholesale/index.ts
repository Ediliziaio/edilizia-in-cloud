import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

/**
 * set-produttore-wholesale — il SUPER ADMIN imposta la % di sconto wholesale di un
 * produttore (0-100): quanto il produttore paga la piattaforma rispetto al listino,
 * per i rivenditori che paga lui (comped). È la "trattativa" wholesale.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const body = await req.json();
    const produttoreId = String(body?.produttore_id ?? "");
    const pct = Number(body?.wholesale_pct);
    if (!produttoreId) return errorResponse("produttore_id richiesto", 400, corsH);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return errorResponse("wholesale_pct deve essere un numero 0-100", 400, corsH);
    }

    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
    const isSuper = (roles ?? []).some((r: { role: string }) => r.role === "super_admin");
    if (!isSuper) return errorResponse("Non autorizzato: richiesto super admin", 403, corsH);

    // Deve essere un produttore (tier agency).
    const { data: brand } = await supabaseAdmin
      .from("company_branding").select("whitelabel_tier").eq("company_id", produttoreId).maybeSingle();
    if (!brand || brand.whitelabel_tier !== "agency") {
      return errorResponse("L'azienda indicata non è un produttore (agency)", 400, corsH);
    }

    const rounded = Math.round(pct * 100) / 100;
    const { error } = await supabaseAdmin
      .from("companies").update({ reseller_wholesale_pct: rounded }).eq("id", produttoreId);
    if (error) return errorResponse(`Aggiornamento fallito: ${error.message}`, 500, corsH);

    return jsonResponse({ success: true, produttore_id: produttoreId, wholesale_pct: rounded }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("set-produttore-wholesale error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
