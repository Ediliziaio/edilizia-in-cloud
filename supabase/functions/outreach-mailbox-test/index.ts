import { getCorsHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireRole } from "../_shared/auth.ts";
import { smtpTestConnection, imapTestConnection } from "../_shared/imapSmtpClient.ts";

/**
 * outreach-mailbox-test — il SUPER_ADMIN verifica la connessione SMTP+IMAP di
 * una casella del pool cold SENZA inviare alcuna email. Recupera la password dal
 * Vault (RPC outreach_mailbox_secret), prova l'auth SMTP (handshake fino ad AUTH
 * LOGIN) e l'auth IMAP (LOGIN/LOGOUT), poi persiste l'esito sulla casella
 * (connection_status / connection_error / connection_checked_at).
 *
 * Body: { sender_account_id }
 */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });
  const corsH = getCorsHeaders(req);

  try {
    const { userId, supabaseAdmin: admin } = await requireAuth(req, corsH);
    await requireRole(admin, userId, ["super_admin"], corsH);

    const body = await req.json().catch(() => ({}));
    const senderId = String(body?.sender_account_id || "").trim();
    if (!senderId) return errorResponse("Campo mancante (casella)", 400, corsH);

    const { data: mbx, error: mbxErr } = await admin
      .from("outreach_sender_accounts")
      .select(
        "id,email,smtp_host,smtp_port,smtp_secure,smtp_username,imap_host,imap_port,imap_secure,secret_ref",
      )
      .eq("id", senderId)
      .maybeSingle();
    if (mbxErr) throw mbxErr;
    if (!mbx) return errorResponse("Casella mittente non trovata", 404, corsH);

    const nowIso = new Date().toISOString();

    // Recupera la password dal Vault.
    let password = "";
    if (mbx.secret_ref) {
      const { data: secret, error: secErr } = await admin.rpc("outreach_mailbox_secret", {
        p_ref: mbx.secret_ref,
      });
      if (secErr) {
        console.error("outreach-mailbox-test secret error:", secErr.message);
      } else if (typeof secret === "string") {
        password = secret;
      }
    }

    if (!password) {
      const msg = "Credenziali mancanti: collega prima la casella";
      await admin
        .from("outreach_sender_accounts")
        .update({ connection_status: "error", connection_error: msg, connection_checked_at: nowIso })
        .eq("id", mbx.id);
      return jsonResponse({ ok: false, smtp: false, imap: false, error: msg }, 200, corsH);
    }

    const username = mbx.smtp_username ?? mbx.email;

    // Test SMTP (no invio).
    const smtpRes = await smtpTestConnection({
      host: mbx.smtp_host,
      port: mbx.smtp_port,
      secure: mbx.smtp_secure,
      username,
      password,
    });

    // Test IMAP — imapTestConnection ritorna true o lancia: normalizziamo a bool.
    let imapOk = false;
    let imapError: string | undefined;
    try {
      imapOk = await imapTestConnection({
        host: mbx.imap_host,
        port: mbx.imap_port,
        secure: mbx.imap_secure,
        username,
        password,
      });
    } catch (e) {
      imapOk = false;
      imapError = e instanceof Error ? e.message : String(e);
    }

    const ok = smtpRes.ok && imapOk;
    let error: string | null = null;
    if (!ok) {
      const parts: string[] = [];
      if (!smtpRes.ok) parts.push(`SMTP: ${smtpRes.error ?? "errore"}`);
      if (!imapOk) parts.push(`IMAP: ${imapError ?? "errore"}`);
      error = parts.join(" | ");
    }

    await admin
      .from("outreach_sender_accounts")
      .update({
        connection_status: ok ? "ok" : "error",
        connection_error: error,
        connection_checked_at: nowIso,
      })
      .eq("id", mbx.id);

    return jsonResponse({ ok, smtp: smtpRes.ok, imap: imapOk, error }, 200, corsH);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("outreach-mailbox-test error:", e);
    return errorResponse("Errore interno del server", 500, corsH);
  }
});
