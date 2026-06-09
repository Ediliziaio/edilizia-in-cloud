import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { resolveProduttore, loadOwnedReseller } from "../_shared/produttore.ts";

/**
 * set-reseller-status — il PRODUTTORE sospende o riattiva un suo rivenditore.
 * status: "active" | "suspended" (nessun delete: irreversibile, fuori scope).
 * Guardia anti-IDOR centralizzata. Logga su subscription_logs.
 */
const ALLOWED = new Set(["active", "suspended"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const body = await req.json();
    const resellerId = String(body?.reseller_id ?? "");
    const status = String(body?.status ?? "");
    if (!resellerId) return errorResponse("reseller_id richiesto", 400, corsH);
    if (!ALLOWED.has(status)) return errorResponse("status non valido (active|suspended)", 400, corsH);

    const ctx = await resolveProduttore(req, corsH);
    const reseller = await loadOwnedReseller(ctx, resellerId, corsH, "id, parent_company_id, status");

    const oldStatus = (reseller.status as string | null) ?? null;
    if (oldStatus === status) {
      return jsonResponse({ success: true, reseller_id: resellerId, status, unchanged: true }, 200, corsH);
    }

    const { error } = await ctx.supabaseAdmin
      .from("companies").update({ status }).eq("id", resellerId);
    if (error) return errorResponse(`Aggiornamento fallito: ${error.message}`, 500, corsH);

    await ctx.supabaseAdmin.from("subscription_logs").insert({
      company_id: resellerId,
      event_type: status === "suspended" ? "suspended" : "activated",
      old_status: oldStatus,
      new_status: status,
      performed_by: ctx.userId,
      notes: status === "suspended" ? "Rivenditore sospeso dal produttore" : "Rivenditore riattivato dal produttore",
    });

    return jsonResponse({ success: true, reseller_id: resellerId, status }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("set-reseller-status error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
