import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";

/**
 * outreach-mailbox-connect — il SUPER_ADMIN collega una casella SMTP/IMAP del
 * pool cold salvandone la password nel Vault di Supabase (mai in chiaro nel DB).
 *
 * Body: { sender_account_id, password }
 * - scrive il secret nel Vault tramite la RPC outreach_mailbox_set_secret
 *   (SECURITY DEFINER, GRANT solo a service_role) con name = "outreach_mbx_<id>";
 * - aggiorna outreach_sender_accounts.secret_ref con lo stesso name.
 *
 * SICUREZZA: la password NON viene MAI loggata né restituita. Non finisce in
 * console.log, né in metadata, né nella risposta.
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin: admin } = await requireAuth(req, corsH);
    await requireRole(admin, userId, ["super_admin"], corsH);

    const body = await req.json().catch(() => ({}));
    const senderId = String(body?.sender_account_id || "").trim();
    const password = typeof body?.password === "string" ? body.password : "";
    if (!senderId || !password) {
      return errorResponse("Campi mancanti (casella, password)", 400, corsH);
    }

    const ref = `outreach_mbx_${senderId}`;

    // Scrivi/aggiorna il secret nel Vault (crea o update via RPC).
    const { error: secretErr } = await admin.rpc("outreach_mailbox_set_secret", {
      p_name: ref,
      p_secret: password,
    });
    if (secretErr) {
      console.error("outreach-mailbox-connect set_secret error:", secretErr.message);
      return errorResponse("Impossibile salvare la password della casella", 500, corsH);
    }

    // Collega il riferimento al secret sulla casella.
    const { error: updErr } = await admin
      .from("outreach_sender_accounts")
      .update({ secret_ref: ref, updated_at: new Date().toISOString() })
      .eq("id", senderId);
    if (updErr) {
      console.error("outreach-mailbox-connect update error:", updErr.message);
      return errorResponse("Impossibile aggiornare la casella", 500, corsH);
    }

    return jsonResponse({ ok: true }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("outreach-mailbox-connect error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
