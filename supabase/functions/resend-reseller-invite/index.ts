import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { resolveProduttore, loadOwnedReseller } from "../_shared/produttore.ts";

/**
 * resend-reseller-invite — genera un LINK D'ACCESSO da condividere con l'admin del
 * rivenditore (utile se non ha mai impostato la password). Ritorna il link
 * (action_link) così il produttore può copiarlo/inviarlo, senza dipendere
 * dall'invio email. Service role + guardia anti-IDOR.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const body = await req.json();
    const resellerId = String(body?.reseller_id ?? "");
    if (!resellerId) return errorResponse("reseller_id richiesto", 400, corsH);

    const ctx = await resolveProduttore(req, corsH);
    const reseller = await loadOwnedReseller(ctx, resellerId, corsH, "id, parent_company_id, name, email");
    const admin = ctx.supabaseAdmin;

    const { data: prof } = await admin
      .from("profiles").select("email").eq("company_id", resellerId).limit(1).maybeSingle();
    const email = (prof?.email as string | undefined) ?? (reseller.email as string | undefined) ?? "";
    if (!email) return errorResponse("Email dell'admin del rivenditore non trovata", 404, corsH);

    const origin = Deno.env.get("SITE_URL") || "https://app.ediliziaincloud.com";
    // L'admin del rivenditore esiste già (creato alla creazione del rivenditore):
    // un link di recovery gli permette di (ri)impostare la password ed entrare.
    const { data: link, error } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      // /reset-password e non /cambia-password: chi riceve l'invito non ha
      // ancora una password, e /cambia-password gli chiederebbe quella attuale.
      options: { redirectTo: `${origin}/reset-password` },
    });
    const actionLink = link?.properties?.action_link ?? null;
    if (error || !actionLink) {
      return errorResponse(`Impossibile generare il link d'accesso: ${error?.message ?? "sconosciuto"}`, 502, corsH);
    }

    return jsonResponse({ success: true, email, action_link: actionLink }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("resend-reseller-invite error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
