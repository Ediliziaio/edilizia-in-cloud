import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { resolveProduttore, loadOwnedReseller } from "../_shared/produttore.ts";

/**
 * update-reseller — il PRODUTTORE aggiorna un suo rivenditore:
 *  - name: rinomina la company;
 *  - admin_email: cambia l'email dell'admin (auth + profilo + company), con guardia
 *    anti-takeover (la nuova email non deve appartenere ad un altro utente).
 * Almeno un campo richiesto. Service role + guardia anti-IDOR (figlio del produttore).
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const body = await req.json();
    const resellerId = String(body?.reseller_id ?? "");
    const name = body?.name !== undefined ? String(body.name).trim() : undefined;
    const adminEmail = body?.admin_email !== undefined ? String(body.admin_email).trim().toLowerCase() : undefined;

    if (!resellerId) return errorResponse("reseller_id richiesto", 400, corsH);
    if (name !== undefined && !name) return errorResponse("Il nome non può essere vuoto", 400, corsH);
    if (name !== undefined && name.length > 120) return errorResponse("Nome troppo lungo", 400, corsH);
    if (adminEmail !== undefined && !adminEmail.includes("@")) return errorResponse("Email non valida", 400, corsH);
    if (name === undefined && adminEmail === undefined) return errorResponse("Nessun campo da aggiornare", 400, corsH);

    const ctx = await resolveProduttore(req, corsH);
    await loadOwnedReseller(ctx, resellerId, corsH);
    const admin = ctx.supabaseAdmin;

    if (name !== undefined) {
      const { error } = await admin.from("companies").update({ name }).eq("id", resellerId);
      if (error) return errorResponse(`Rinomina fallita: ${error.message}`, 500, corsH);
    }

    if (adminEmail !== undefined) {
      const { data: prof } = await admin
        .from("profiles").select("id, email").eq("company_id", resellerId).limit(1).maybeSingle();
      if (!prof?.id) return errorResponse("Admin del rivenditore non trovato", 404, corsH);

      // Anti-takeover: la nuova email non deve essere di un altro utente.
      const { data: clash } = await admin
        .from("profiles").select("id").eq("email", adminEmail).neq("id", prof.id).limit(1).maybeSingle();
      if (clash) return errorResponse("Questa email è già in uso da un altro utente.", 409, corsH);

      const { error: authErr } = await admin.auth.admin.updateUserById(prof.id, { email: adminEmail, email_confirm: true });
      if (authErr) return errorResponse(`Cambio email fallito: ${authErr.message}`, 500, corsH);
      await admin.from("profiles").update({ email: adminEmail }).eq("id", prof.id);
      await admin.from("companies").update({ email: adminEmail }).eq("id", resellerId);
    }

    return jsonResponse({ success: true, reseller_id: resellerId, name, admin_email: adminEmail }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("update-reseller error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
