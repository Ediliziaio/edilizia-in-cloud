import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

/**
 * set-produttore-config — il SUPER ADMIN aggiorna la configurazione di un produttore:
 *  - status: "active" | "suspended" (ciclo di vita; logga su subscription_logs)
 *  - reseller_limit: tetto rivenditori (0 = illimitato)
 * Almeno un campo richiesto. Nessun delete (irreversibile, fuori scope).
 */
const STATUSES = new Set(["active", "suspended"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const body = await req.json();
    const produttoreId = String(body?.produttore_id ?? "");
    if (!produttoreId) return errorResponse("produttore_id richiesto", 400, corsH);

    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", userId);
    if (!(roles ?? []).some((r: { role: string }) => r.role === "super_admin")) {
      return errorResponse("Non autorizzato: richiesto super admin", 403, corsH);
    }

    const { data: brand } = await supabaseAdmin
      .from("company_branding").select("whitelabel_tier").eq("company_id", produttoreId).maybeSingle();
    if (!brand || brand.whitelabel_tier !== "agency") {
      return errorResponse("L'azienda indicata non è un produttore (agency)", 400, corsH);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: Record<string, any> = {};
    if (body?.status !== undefined) {
      const s = String(body.status);
      if (!STATUSES.has(s)) return errorResponse("status non valido (active|suspended)", 400, corsH);
      patch.status = s;
    }
    if (body?.reseller_limit !== undefined) {
      const n = Number(body.reseller_limit);
      if (!Number.isInteger(n) || n < 0) return errorResponse("reseller_limit deve essere un intero >= 0", 400, corsH);
      patch.reseller_limit = n;
    }
    if (Object.keys(patch).length === 0) return errorResponse("Nessun campo da aggiornare", 400, corsH);

    let oldStatus: string | null = null;
    if (patch.status !== undefined) {
      const { data: cur } = await supabaseAdmin.from("companies").select("status").eq("id", produttoreId).maybeSingle();
      oldStatus = (cur?.status as string | null) ?? null;
    }

    const { error } = await supabaseAdmin.from("companies").update(patch).eq("id", produttoreId);
    if (error) return errorResponse(`Aggiornamento fallito: ${error.message}`, 500, corsH);

    if (patch.status !== undefined && patch.status !== oldStatus) {
      await supabaseAdmin.from("subscription_logs").insert({
        company_id: produttoreId,
        event_type: patch.status === "suspended" ? "suspended" : "activated",
        old_status: oldStatus,
        new_status: patch.status,
        performed_by: userId,
        notes: patch.status === "suspended" ? "Produttore sospeso dal super admin" : "Produttore riattivato dal super admin",
      });
    }

    return jsonResponse({ success: true, produttore_id: produttoreId, ...patch }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("set-produttore-config error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
