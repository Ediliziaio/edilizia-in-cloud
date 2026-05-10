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
    p_user_id: null,
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

function escapeHeader(s: string): string {
  // Solo se contiene caratteri non-ASCII fa MIME encoded-word
  // eslint-disable-next-line no-control-regex
  if (!/[^\x00-\x7F]/.test(s)) return s;
  return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(s)))}?=`;
}

function buildRFC822({
  from, fromName, to, cc, bcc, subject, bodyHtml, bodyText, inReplyTo, references,
}: {
  from: string;
  fromName?: string | null;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyHtml?: string | null;
  bodyText?: string | null;
  inReplyTo?: string | null;
  references?: string[];
}): string {
  const fromHeader = fromName ? `${escapeHeader(fromName)} <${from}>` : from;
  const lines: string[] = [];
  lines.push(`From: ${fromHeader}`);
  lines.push(`To: ${to.join(", ")}`);
  if (cc && cc.length > 0) lines.push(`Cc: ${cc.join(", ")}`);
  if (bcc && bcc.length > 0) lines.push(`Bcc: ${bcc.join(", ")}`);
  lines.push(`Subject: ${escapeHeader(subject)}`);
  lines.push(`Date: ${new Date().toUTCString()}`);
  lines.push(`Message-ID: <${crypto.randomUUID()}@edilizia-in-cloud>`);
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references && references.length > 0) lines.push(`References: ${references.join(" ")}`);
  lines.push(`MIME-Version: 1.0`);

  const hasHtml = !!bodyHtml && bodyHtml.trim().length > 0;
  const hasText = !!bodyText && bodyText.trim().length > 0;

  if (hasHtml && hasText) {
    const boundary = `=_boundary_${crypto.randomUUID().replace(/-/g, "")}`;
    lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
    lines.push("");
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: text/plain; charset=UTF-8`);
    lines.push(`Content-Transfer-Encoding: 8bit`);
    lines.push("");
    lines.push(bodyText!);
    lines.push("");
    lines.push(`--${boundary}`);
    lines.push(`Content-Type: text/html; charset=UTF-8`);
    lines.push(`Content-Transfer-Encoding: 8bit`);
    lines.push("");
    lines.push(bodyHtml!);
    lines.push("");
    lines.push(`--${boundary}--`);
  } else if (hasHtml) {
    lines.push(`Content-Type: text/html; charset=UTF-8`);
    lines.push(`Content-Transfer-Encoding: 8bit`);
    lines.push("");
    lines.push(bodyHtml!);
  } else {
    lines.push(`Content-Type: text/plain; charset=UTF-8`);
    lines.push(`Content-Transfer-Encoding: 8bit`);
    lines.push("");
    lines.push(bodyText ?? "");
  }
  return lines.join("\r\n");
}

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
  },
): Promise<{ id: string }> {
  const contentType = payload.bodyHtml ? "HTML" : "Text";
  const content = payload.bodyHtml || payload.bodyText || "";
  const message = {
    subject: payload.subject,
    body: { contentType, content },
    toRecipients: toRecipients(payload.to),
    ccRecipients: payload.cc ? toRecipients(payload.cc) : [],
    bccRecipients: payload.bcc ? toRecipients(payload.bcc) : [],
  };
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
  // sendMail non ritorna messageId; ne sintetizziamo uno locale per tracking
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
  status: string;
  attempts: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // Auth: estrai user JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  const { data: userRes } = await supabase.auth.getUser(token);
  const userId = userRes?.user?.id;
  if (!userId) {
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  let body: { outbox_id?: string } = {};
  try { body = await req.json(); } catch { /* empty */ }

  if (!body.outbox_id) {
    return jsonResponse({ ok: false, error: "outbox_id required" }, 400);
  }

  // 1) Carica outbox row e verifica ownership
  const { data: outboxRow, error: loadErr } = await supabase
    .from("email_outbox")
    .select("*")
    .eq("id", body.outbox_id)
    .eq("user_id", userId)
    .maybeSingle();
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
    // 3) Decrypt tokens
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: tokensData } = await (supabase as any).rpc("email_oauth_get_decrypted_tokens", {
      p_connection_id: outbox.oauth_connection_id,
    });
    if (!tokensData || tokensData.length === 0) {
      throw new Error("tokens_not_found_for_connection");
    }
    const tokens = tokensData[0] as DecryptedTokens;

    // 4) Refresh se serve
    const accessToken = await refreshTokenIfNeeded(supabase, tokens);

    // 5) Recupera info reply (Message-ID del messaggio originale per In-Reply-To)
    let inReplyToHeader: string | null = null;
    let referencesHeader: string[] = [];
    let providerThreadId: string | null = null;
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
    // Per Gmail, threadId aiuta il provider a raggruppare nello stesso thread
    if (outbox.thread_id) {
      // (futuro: persistere provider_thread_id quando salviamo messaggi Gmail)
    }

    // 6) Send via provider
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

    // 8) Optional: inserisci copia in email_inbox (folder=sent) per coerenza UI
    // Nota: Gmail/Outlook salvano automaticamente in Sent del provider; il
    // polling al prossimo ciclo importerà la copia. Per ora skippiamo l'insert
    // diretto e lasciamo che il polling normale faccia il lavoro.

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
