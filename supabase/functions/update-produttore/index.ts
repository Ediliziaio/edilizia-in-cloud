import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { resolveProduttore } from "../_shared/produttore.ts";

/**
 * update-produttore — il PRODUTTORE aggiorna i dati della PROPRIA azienda
 * (nome ed email di contatto). resolveProduttore garantisce che si scriva solo
 * sulla company del chiamante (produttoreId), quindi nessun rischio cross-tenant.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    const emailRaw = body?.email;
    const email = typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : undefined;
    if (!name) return errorResponse("Il nome dell'azienda è obbligatorio", 400, corsH);
    if (name.length > 120) return errorResponse("Nome troppo lungo", 400, corsH);
    if (email !== undefined && email !== "" && !email.includes("@")) {
      return errorResponse("Email non valida", 400, corsH);
    }

    const ctx = await resolveProduttore(req, corsH);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: Record<string, any> = { name };
    if (email !== undefined) patch.email = email || null;

    const { error } = await ctx.supabaseAdmin
      .from("companies").update(patch).eq("id", ctx.produttoreId);
    if (error) return errorResponse(`Aggiornamento fallito: ${error.message}`, 500, corsH);

    return jsonResponse({ success: true, company_id: ctx.produttoreId, name }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("update-produttore error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
