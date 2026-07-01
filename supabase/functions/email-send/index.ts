/**
 * email-send — invio email via OAuth Gmail / Outlook
 *
 * Sprint E3.
 *
 * Body: { outbox_id: string }   (consigliato — usa la riga email_outbox)
 *   oppure
 *   { to, cc?, bcc?, subject, body_html?, body_text?,
 *     oauth_connection_id, in_reply_to_id?, thread_id? }
 *
 * Flusso outbox_id:
 *   1. Auth user JWT, verifica ownership outbox row
 *   2. Mark status=sending, attempts++
 *   3. Decrypt tokens via email_oauth_get_decrypted_tokens
 *   4. Refresh access_token se scaduto (logica identica a email-poll-inbox)
 *   5. Build RFC822 (Gmail) o Graph payload (Outlook)
 *   6. POST a provider, raccogli message_id
 *   7. Update outbox: status=sent, sent_at, provider_message_id
 *   8. Inserisce copia nella inbox locale (folder=sent) per coerenza UI
 *
 * Auth: super_admin / company_admin / company_staff con email_oauth_connection
 * di proprietà.
 */
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { smtpSend, buildRFC822, imapAppend, type SmtpAttachment } from "../_shared/imapSmtpClient.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOKEN_URL_GMAIL = "https://oauth2.googleapis.com/token";
const TOKEN_URL_OUTLOOK = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface DecryptedTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string;
  provider: "gmail" | "outlook";
  email_address: string;
  company_id: string;
  scopes: string[];
}

async function refreshTokenIfNeeded(
  supa: SupabaseClient,
  conn: DecryptedTokens,
  userId: string,
): Promise<string> {
  const expiresAt = new Date(conn.expires_at).getTime();
  if (expiresAt > Date.now() + 5 * 60 * 1000) return conn.access_token;
  if (!conn.refresh_token) throw new Error("refresh_token_missing");

  const tokenUrl = conn.provider === "gmail" ? TOKEN_URL_GMAIL : TOKEN_URL_OUTLOOK;
  const clientId = Deno.env.get(conn.provider === "gmail" ? "GOOGLE_OAUTH_CLIENT_ID" : "MS_OAUTH_CLIENT_ID");
  const clientSecret = Deno.env.get(conn.provider === "gmail" ? "GOOGLE_OAUTH_CLIENT_SECRET" : "MS_OAUTH_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error(`${conn.provider}_oauth_not_configured`);

  const res = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`token_refresh_failed: ${res.status} ${err.substring(0, 200)}`);
  }
  const json = await res.json() as { access_token: string; expires_in: number; refresh_token?: string };
  const newExpiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supa as any).rpc("email_oauth_upsert_connection", {
    p_company_id: conn.company_id,
    p_user_id: userId,
    p_provider: conn.provider,
    p_email_address: conn.email_address,
    p_access_token: json.access_token,
    p_refresh_token: json.refresh_token ?? null,
    p_expires_at: newExpiresAt,
    p_scopes: conn.scopes,
  });
  return json.access_token;
}

function base64UrlEncode(input: string): string {
  // UTF-8 safe encode
  const bytes = new TextEncoder().encode(input);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// (buildRFC822 ora importato da _shared/imapSmtpClient.ts con supporto attachments)

// ─────────────────────────────────────────────────────────────────────────────
// Gmail send
// ─────────────────────────────────────────────────────────────────────────────

async function sendViaGmail(accessToken: string, rfc822: string, threadIdHint?: string | null): Promise<{ id: string; threadId: string }> {
  const body: Record<string, unknown> = { raw: base64UrlEncode(rfc822) };
  if (threadIdHint) body.threadId = threadIdHint;
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`gmail_send_${res.status}: ${err.substring(0, 300)}`);
  }
  return await res.json() as { id: string; threadId: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// Outlook send (Microsoft Graph)
// ─────────────────────────────────────────────────────────────────────────────

interface GraphRecipient { emailAddress: { address: string; name?: string } }
function toRecipients(emails: string[]): GraphRecipient[] {
  return emails.filter(Boolean).map((address) => ({ emailAddress: { address } }));
}

async function sendViaOutlook(
  accessToken: string,
  payload: {
    subject: string;
    bodyHtml?: string | null;
    bodyText?: string | null;
    to: string[];
    cc?: string[];
    bcc?: string[];
    inReplyTo?: string | null;
    attachments?: SmtpAttachment[];
  },
): Promise<{ id: string }> {
  const contentType = payload.bodyHtml ? "HTML" : "Text";
  const content = payload.bodyHtml || payload.bodyText || "";
  // Microsoft Graph: fileAttachment con @odata.type
  const graphAttachments = (payload.attachments ?? []).map((a) => ({
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: a.filename,
    contentType: a.mimeType,
    contentBytes: a.contentBase64,
  }));
  const message: Record<string, unknown> = {
    subject: payload.subject,
    body: { contentType, content },
    toRecipients: toRecipients(payload.to),
    ccRecipients: payload.cc ? toRecipients(payload.cc) : [],
    bccRecipients: payload.bcc ? toRecipients(payload.bcc) : [],
  };
  if (graphAttachments.length > 0) {
    message.attachments = graphAttachments;
  }
  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`outlook_send_${res.status}: ${err.substring(0, 300)}`);
  }
  return { id: `outlook-sent-${Date.now()}` };
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler principale
// ─────────────────────────────────────────────────────────────────────────────

interface OutboxRow {
  id: string;
  user_id: string;
  company_id: string;
  oauth_connection_id: string | null;
  thread_id: string | null;
  in_reply_to_id: string | null;
  to_emails: string[];
  cc_emails: string[];
  bcc_emails: string[];
  subject: string;
  body_html: string | null;
  body_text: string | null;
  attachments: Array<{ filename: string; size?: number; mime: string; storage_path: string; bucket?: string }> | null;
  status: string;
  attempts: number;
}

async function downloadAttachments(
  supabase: SupabaseClient,
  raw: OutboxRow["attachments"],
): Promise<SmtpAttachment[]> {
  if (!raw || raw.length === 0) return [];
  const result: SmtpAttachment[] = [];
  for (const a of raw) {
    const { data, error } = await supabase.storage
      .from(a.bucket ?? "email-attachments")
      .download(a.storage_path);
    if (error || !data) {
      throw new Error(`attachment_download_failed: ${a.filename} — ${error?.message}`);
    }
    const buf = new Uint8Array(await data.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i += 1024) {
      bin += String.fromCharCode(...buf.subarray(i, i + 1024));
    }
    result.push({
      filename: a.filename,
      mimeType: a.mime || "application/octet-stream",
      contentBase64: btoa(bin),
    });
  }
  return result;
}

async function resolveThreadsForUser(userId: string): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/email-thread-resolver`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ user_id: userId, batch_size: 50 }),
    });
  } catch {
    // Best effort: l'email inviata resta salvata anche se il resolver è temporaneamente giù.
  }
}

async function insertSentCopy(
  supabase: SupabaseClient,
  outbox: OutboxRow,
  fromEmail: string,
  providerMessageId: string,
): Promise<void> {
  const sentAt = new Date().toISOString();
  const messageId = providerMessageId
    ? `sent:${outbox.oauth_connection_id}:${providerMessageId}`
    : `sent:${outbox.id}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase as any)
    .from("email_inbox")
    .select("id")
    .eq("company_id", outbox.company_id)
    .eq("user_id", outbox.user_id)
    .eq("message_id", messageId)
    .maybeSingle();

  const payload = {
    company_id: outbox.company_id,
    user_id: outbox.user_id,
    oauth_connection_id: outbox.oauth_connection_id,
    thread_id: outbox.thread_id,
    in_reply_to: null,
    references_ids: [],
    message_id: messageId,
    provider_message_id: providerMessageId,
    provider_thread_id: null,
    mailbox_folder: "sent",
    from_email: fromEmail,
    from_name: null,
    to_email: outbox.to_emails.join(", "),
    cc_emails: outbox.cc_emails ?? [],
    bcc_emails: outbox.bcc_emails ?? [],
    subject: outbox.subject,
    received_at: sentAt,
    raw_text: outbox.body_text,
    raw_html: outbox.body_html,
    attachments: outbox.attachments ?? [],
    ai_category: "altro",
    ai_priority: "nessuna",
    status: "archived",
    is_read: true,
    is_archived: true,
    is_trashed: false,
  };

  if (existing?.id) {
    await supabase.from("email_inbox").update(payload).eq("id", existing.id);
  } else {
    await supabase.from("email_inbox").insert(payload);
  }
  await resolveThreadsForUser(outbox.user_id);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Auth: utente JWT, oppure chiamante interno fidato (service role).
  // L'unico chiamante interno è il motore sequenze (MP-13, edge `email-sequenze-tick`)
  // che in modalità 'automatico' invia una riga outbox senza un utente in sessione.
  // L'ownership in quel caso è già garantita a monte (esecuzione company-scoped +
  // riga outbox costruita dal tick), quindi saltiamo il filtro user_id.
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  const isInternal = token.length > 0 && token === SERVICE_ROLE_KEY;
  let userId: string | undefined;
  if (!isInternal) {
    const { data: userRes } = await supabase.auth.getUser(token);
    userId = userRes?.user?.id;
    if (!userId) {
      return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
    }
  }

  let body: { outbox_id?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  if (!body.outbox_id) {
    return jsonResponse({ ok: false, error: "outbox_id required" }, 400);
  }

  // 1) Carica outbox row e verifica ownership (saltata per il chiamante interno)
  let outboxQuery = supabase
    .from("email_outbox")
    .select("*")
    .eq("id", body.outbox_id);
  if (!isInternal) outboxQuery = outboxQuery.eq("user_id", userId!);
  const { data: outboxRow, error: loadErr } = await outboxQuery.maybeSingle();
  if (loadErr || !outboxRow) {
    return jsonResponse({ ok: false, error: "Outbox row not found or access denied" }, 404);
  }
  const outbox = outboxRow as OutboxRow;

  if (outbox.status === "sent") {
    return jsonResponse({ ok: true, already_sent: true });
  }
  if (outbox.attempts >= 3) {
    return jsonResponse({ ok: false, error: "max_attempts_exceeded" }, 400);
  }
  if (!outbox.oauth_connection_id) {
    return jsonResponse({ ok: false, error: "oauth_connection_id missing" }, 400);
  }

  // 2) Mark sending
  await supabase
    .from("email_outbox")
    .update({ status: "sending", attempts: outbox.attempts + 1 })
    .eq("id", outbox.id);

  try {
    // 3) Carica info connessione (provider type)
    const { data: connRow } = await supabase
        .from("email_oauth_connections")
        .select("provider, email_address, user_id")
        .eq("id", outbox.oauth_connection_id)
        .maybeSingle();
    if (!connRow || connRow.user_id !== outbox.user_id) {
      throw new Error("email_connection_not_found_or_not_owned");
    }
    const providerType = (connRow?.provider as "gmail" | "outlook" | "imap" | undefined) ?? null;

    // 4) Recupera info reply per threading
    let inReplyToHeader: string | null = null;
    let referencesHeader: string[] = [];
    if (outbox.in_reply_to_id) {
      const { data: parent } = await supabase
        .from("email_inbox")
        .select("message_id, references_ids")
        .eq("id", outbox.in_reply_to_id)
        .maybeSingle();
      if (parent?.message_id) {
        inReplyToHeader = parent.message_id;
        referencesHeader = [...(parent.references_ids ?? []), parent.message_id];
      }
    }
    const providerThreadId: string | null = null;

    // Pre-download attachments (riusato in tutti i branch provider)
    const smtpAttachments = await downloadAttachments(supabase, outbox.attachments);

    // 5) Branch IMAP/SMTP custom: nessun OAuth, usa password decrypted
    if (providerType === "imap") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: creds } = await (supabase as any).rpc("email_imap_get_credentials", {
        p_connection_id: outbox.oauth_connection_id,
      });
      if (!creds || creds.length === 0) {
        throw new Error("imap_credentials_not_found");
      }
      const c = creds[0];
      const sent = await smtpSend(
        {
          host: c.smtp_host,
          port: c.smtp_port,
          secure: c.smtp_secure,
          username: c.imap_username || c.email_address,
          password: c.password,
        },
        {
          from: c.email_address,
          to: outbox.to_emails,
          cc: outbox.cc_emails,
          bcc: outbox.bcc_emails,
          subject: outbox.subject,
          bodyHtml: outbox.body_html,
          bodyText: outbox.body_text,
          inReplyTo: inReplyToHeader,
          references: referencesHeader,
          attachments: smtpAttachments,
        },
      );
      await supabase
        .from("email_outbox")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
          provider_message_id: sent.messageId,
        })
        .eq("id", outbox.id);
      await insertSentCopy(supabase, outbox, c.email_address, sent.messageId)
        .catch((e) => console.warn("[email-send] sent copy failed:", e));
      // APPEND nei "Inviati" del server IMAP → l'email compare anche nella webmail
      // del provider (Aruba/Register/…). Best-effort: non blocca l'invio riuscito.
      try {
        const rfc822 = buildRFC822({
          from: c.email_address,
          to: outbox.to_emails,
          cc: outbox.cc_emails,
          bcc: outbox.bcc_emails,
          subject: outbox.subject,
          bodyHtml: outbox.body_html,
          bodyText: outbox.body_text,
          inReplyTo: inReplyToHeader,
          references: referencesHeader,
          messageId: sent.messageId,
          attachments: smtpAttachments,
        });
        const appendRes = await imapAppend(
          { host: c.imap_host, port: c.imap_port, secure: c.imap_secure, username: c.imap_username || c.email_address, password: c.password },
          rfc822,
        );
        if (!appendRes.ok) console.warn("[email-send] imap APPEND Sent skipped:", appendRes.error);
      } catch (e) {
        console.warn("[email-send] imap APPEND Sent error:", e instanceof Error ? e.message : e);
      }
      return jsonResponse({
        ok: true,
        outbox_id: outbox.id,
        provider_message_id: sent.messageId,
        provider: "imap",
      });
    }

    // 6) Branch OAuth (Gmail/Outlook)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tokensData } = await (supabase as any).rpc("email_oauth_get_decrypted_tokens", {
      p_connection_id: outbox.oauth_connection_id,
    });
    if (!tokensData || tokensData.length === 0) {
      throw new Error("tokens_not_found_for_connection");
    }
    const tokens = tokensData[0] as DecryptedTokens;
    const accessToken = await refreshTokenIfNeeded(supabase, tokens, outbox.user_id);

    let providerMessageId = "";
    if (tokens.provider === "gmail") {
      const rfc = buildRFC822({
        from: tokens.email_address,
        to: outbox.to_emails,
        cc: outbox.cc_emails,
        bcc: outbox.bcc_emails,
        subject: outbox.subject,
        bodyHtml: outbox.body_html,
        bodyText: outbox.body_text,
        inReplyTo: inReplyToHeader,
        references: referencesHeader,
        messageId: `<${crypto.randomUUID()}@edilizia-in-cloud>`,
        attachments: smtpAttachments,
      });
      const sent = await sendViaGmail(accessToken, rfc, providerThreadId);
      providerMessageId = sent.id;
    } else if (tokens.provider === "outlook") {
      const sent = await sendViaOutlook(accessToken, {
        subject: outbox.subject,
        bodyHtml: outbox.body_html,
        bodyText: outbox.body_text,
        to: outbox.to_emails,
        cc: outbox.cc_emails,
        bcc: outbox.bcc_emails,
        inReplyTo: inReplyToHeader,
        attachments: smtpAttachments,
      });
      providerMessageId = sent.id;
    } else {
      throw new Error(`unsupported_provider_${tokens.provider}`);
    }

    // 7) Mark sent
    await supabase
      .from("email_outbox")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        provider_message_id: providerMessageId,
      })
      .eq("id", outbox.id);

    // 8) Copia locale in Inviati: il polling inbound non legge la cartella Sent.
    await insertSentCopy(supabase, outbox, tokens.email_address, providerMessageId)
      .catch((e) => console.warn("[email-send] sent copy failed:", e));

    return jsonResponse({
      ok: true,
      outbox_id: outbox.id,
      provider_message_id: providerMessageId,
      provider: tokens.provider,
    });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("email_outbox")
      .update({
        status: "failed",
        last_error: errMsg.slice(0, 1000),
      })
      .eq("id", outbox.id);
    return jsonResponse({ ok: false, error: errMsg }, 500);
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
