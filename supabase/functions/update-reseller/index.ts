import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { resolveProduttore, loadOwnedReseller } from "../_shared/produttore.ts";

/**
 * update-reseller — il PRODUTTORE rinomina un suo rivenditore. Service role +
 * guardia anti-IDOR. (Il cambio email dell'admin tocca l'auth → fuori scope qui.)
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const body = await req.json();
    const resellerId = String(body?.reseller_id ?? "");
    const name = String(body?.name ?? "").trim();
    if (!resellerId) return errorResponse("reseller_id richiesto", 400, corsH);
    if (!name) return errorResponse("Il nome è obbligatorio", 400, corsH);
    if (name.length > 120) return errorResponse("Nome troppo lungo", 400, corsH);

    const ctx = await resolveProduttore(req, corsH);
    await loadOwnedReseller(ctx, resellerId, corsH);

    const { error } = await ctx.supabaseAdmin
      .from("companies").update({ name }).eq("id", resellerId);
    if (error) return errorResponse(`Aggiornamento fallito: ${error.message}`, 500, corsH);

    return jsonResponse({ success: true, reseller_id: resellerId, name }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("update-reseller error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
