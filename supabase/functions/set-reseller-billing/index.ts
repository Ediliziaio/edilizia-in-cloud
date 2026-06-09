import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { resolveProduttore, loadOwnedReseller } from "../_shared/produttore.ts";

/**
 * set-reseller-billing — il PRODUTTORE cambia "chi paga" su un suo rivenditore:
 * billing_comped true = paga il produttore (comped/esente), false = paga il
 * rivenditore (deve aggiungere la carta → payment_method 'none'). Guardia
 * anti-IDOR centralizzata nell'helper. Logga su subscription_logs (audit #3).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const body = await req.json();
    const resellerId = String(body?.reseller_id ?? "");
    const comped = body?.billing_comped;
    if (!resellerId) return errorResponse("reseller_id richiesto", 400, corsH);
    if (typeof comped !== "boolean") return errorResponse("billing_comped deve essere booleano", 400, corsH);

    const ctx = await resolveProduttore(req, corsH);
    await loadOwnedReseller(ctx, resellerId, corsH);

    const { error } = await ctx.supabaseAdmin
      .from("companies")
      .update({ billing_comped: comped, payment_method: comped ? "comped" : "none" })
      .eq("id", resellerId);
    if (error) return errorResponse(`Aggiornamento fallito: ${error.message}`, 500, corsH);

    // Audit best-effort: chi paga è una decisione economica, lascia traccia.
    await ctx.supabaseAdmin.from("subscription_logs").insert({
      company_id: resellerId,
      event_type: "status_change",
      performed_by: ctx.userId,
      notes: comped ? "Chi paga → Paghi tu (produttore, comped)" : "Chi paga → Paga il rivenditore",
    });

    return jsonResponse({ success: true, reseller_id: resellerId, billing_comped: comped }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("set-reseller-billing error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
