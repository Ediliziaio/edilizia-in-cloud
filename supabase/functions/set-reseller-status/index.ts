import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

/**
 * set-reseller-status — il PRODUTTORE sospende o riattiva un suo rivenditore.
 * status: "active" | "suspended" (nessun delete: è irreversibile e fuori scope).
 *
 * Validazioni speculari a set-reseller-billing/plan:
 *  - chiamante produttore_admin / super_admin;
 *  - il rivenditore deve essere figlio del produttore (no IDOR), salvo super_admin.
 * Logga su subscription_logs (suspended | activated) per audit.
 */
const ALLOWED = new Set(["active", "suspended"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    const body = await req.json();
    const resellerId = String(body?.reseller_id ?? "");
    const status = String(body?.status ?? "");
    if (!resellerId) return errorResponse("reseller_id richiesto", 400, corsH);
    if (!ALLOWED.has(status)) return errorResponse("status non valido (active|suspended)", 400, corsH);

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
      .from("companies").select("id, parent_company_id, status").eq("id", resellerId).maybeSingle();
    if (!reseller) return errorResponse("Rivenditore non trovato", 404, corsH);
    if (!isSuper && reseller.parent_company_id !== produttoreId) {
      return errorResponse("Questo rivenditore non appartiene alla tua azienda", 403, corsH);
    }

    const oldStatus = (reseller.status as string | null) ?? null;
    if (oldStatus === status) {
      return jsonResponse({ success: true, reseller_id: resellerId, status, unchanged: true }, 200, corsH);
    }

    // 3. Aggiorna lo stato.
    const { error } = await supabaseAdmin
      .from("companies").update({ status }).eq("id", resellerId);
    if (error) return errorResponse(`Aggiornamento fallito: ${error.message}`, 500, corsH);

    // 4. Log di audit (best-effort).
    await supabaseAdmin.from("subscription_logs").insert({
      company_id: resellerId,
      event_type: status === "suspended" ? "suspended" : "activated",
      old_status: oldStatus,
      new_status: status,
      performed_by: userId,
      notes: status === "suspended" ? "Rivenditore sospeso dal produttore" : "Rivenditore riattivato dal produttore",
    });

    return jsonResponse({ success: true, reseller_id: resellerId, status }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("set-reseller-status error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
