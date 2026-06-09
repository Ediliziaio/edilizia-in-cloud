import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth } from "../_shared/auth.ts";

/**
 * set-reseller-billing — il PRODUTTORE cambia "chi paga" su un suo rivenditore
 * esistente: billing_comped true = paga il produttore, false = paga il rivenditore.
 * Validazione: il rivenditore deve essere figlio del produttore (a meno di super_admin).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);

    const body = await req.json();
    const resellerId = String(body?.reseller_id ?? "");
    const comped = body?.billing_comped;
    if (!resellerId) return errorResponse("reseller_id richiesto", 400, corsH);
    if (typeof comped !== "boolean") return errorResponse("billing_comped deve essere booleano", 400, corsH);

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
      .from("companies").select("id, parent_company_id").eq("id", resellerId).maybeSingle();
    if (!reseller) return errorResponse("Rivenditore non trovato", 404, corsH);
    if (!isSuper && reseller.parent_company_id !== produttoreId) {
      return errorResponse("Questo rivenditore non appartiene alla tua azienda", 403, corsH);
    }

    // 3. Aggiorna chi paga.
    const { error } = await supabaseAdmin
      .from("companies")
      .update({ billing_comped: comped, payment_method: comped ? "comped" : "none" })
      .eq("id", resellerId);
    if (error) return errorResponse(`Aggiornamento fallito: ${error.message}`, 500, corsH);

    return jsonResponse({ success: true, reseller_id: resellerId, billing_comped: comped }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("set-reseller-billing error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
