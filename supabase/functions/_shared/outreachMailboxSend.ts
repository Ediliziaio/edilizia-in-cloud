/**
 * outreachMailboxSend — invio e test dalle caselle "vere" del pool outreach.
 *
 * Tre provider nativi:
 *   • gmail   → Gmail API (users.messages.send, MIME raw) con i token OAuth
 *               della connessione di /admin/email (email_oauth_connections);
 *   • outlook → Microsoft Graph /me/sendMail in formato MIME (stessi token);
 *   • smtp    → SMTP della casella (password nel Vault), come prima ma con
 *               Message-ID/In-Reply-To/References per il threading.
 *
 * Il MIME e' costruito da noi (buildRFC822): stessa forma per tutti, con
 * List-Unsubscribe e threading; e' il provider a firmarla DKIM e a consegnarla,
 * quindi per il destinatario e' una mail scritta da quella casella.
 *
 * Suppression list e log consegna (email_delivery_log) come sendEmailUnified.
 */

// deno-lint-ignore-file no-explicit-any

import { buildRFC822, smtpSend } from "./imapSmtpClient.ts";
import { getMsOAuthCredentials } from "./msOAuth.ts";
import { getSuppressedEmailMap, normalizeEmailAddress } from "./emailSuppression.ts";
import { logEmailDelivery } from "./email-log.ts";

export type NativeProvider = "gmail" | "outlook" | "smtp";

export function isNativeProvider(p: string | null | undefined): p is NativeProvider {
  return p === "gmail" || p === "outlook" || p === "smtp";
}

export interface NativeSender {
  id: string;
  email: string;
  display_name?: string | null;
  provider: string;
  oauth_connection_id?: string | null;
  smtp_host?: string | null;
  smtp_port?: number | null;
  smtp_secure?: boolean | null;
  smtp_username?: string | null;
  secret_ref?: string | null;
}

export interface NativeMessage {
  companyId: string;
  to: string;
  subject: string;
  html?: string | null;
  text?: string | null;
  fromName?: string | null;
  replyTo?: string | null;
  inReplyTo?: string | null;
  references?: string[];
  /** Id thread Gmail del primo invio (accoda nello stesso thread). */
  threadIdHint?: string | null;
  headers?: Record<string, string>;
  metadata?: Record<string, unknown>;
  stream?: string;
}

export interface NativeSendResult {
  ok: boolean;
  status: number;
  messageId: string | null;
  threadId: string | null;
  providerUsed: NativeProvider;
  error?: string;
  body?: unknown;
  /** true = e' la CASELLA che non puo' spedire (token, credenziali, quota), non il destinatario. */
  accountFailure?: boolean;
  suppressed?: boolean;
}

interface OauthTokens {
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  provider: "gmail" | "outlook";
  email_address: string;
  company_id: string;
  user_id: string;
  scopes: string[] | null;
}

const TOKEN_URL_GMAIL = "https://oauth2.googleapis.com/token";
const TOKEN_URL_OUTLOOK = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

/** Token d'accesso valido per la connessione OAuth (refresh se scade entro 5 minuti). */
export async function getOauthAccessToken(admin: any, connectionId: string): Promise<{ accessToken: string; tokens: OauthTokens }> {
  const { data, error } = await admin.rpc("email_oauth_get_decrypted_tokens", { p_connection_id: connectionId });
  if (error) throw new Error(`token_lookup_failed: ${error.message}`);
  const t = ((data ?? []) as OauthTokens[])[0];
  if (!t) throw new Error("tokens_not_found_for_connection");
  if (new Date(t.expires_at).getTime() > Date.now() + 5 * 60_000) return { accessToken: t.access_token, tokens: t };
  if (!t.refresh_token) throw new Error("refresh_token_missing");

  const { clientId, clientSecret } = t.provider === "gmail"
    ? { clientId: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID"), clientSecret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET") }
    : await getMsOAuthCredentials();
  if (!clientId || !clientSecret) throw new Error(`${t.provider}_oauth_not_configured`);
  const res = await fetch(t.provider === "gmail" ? TOKEN_URL_GMAIL : TOKEN_URL_OUTLOOK, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: t.refresh_token, grant_type: "refresh_token" }).toString(),
  });
  if (!res.ok) throw new Error(`token_refresh_failed: ${res.status} ${(await res.text()).slice(0, 200)}`);
  const j = await res.json() as { access_token: string; expires_in: number; refresh_token?: string };
  const expiresAt = new Date(Date.now() + j.expires_in * 1000).toISOString();
  await admin.rpc("email_oauth_upsert_connection", {
    p_company_id: t.company_id, p_user_id: t.user_id, p_provider: t.provider, p_email_address: t.email_address,
    p_access_token: j.access_token, p_refresh_token: j.refresh_token ?? null, p_expires_at: expiresAt, p_scopes: t.scopes ?? [],
  });
  return { accessToken: j.access_token, tokens: { ...t, access_token: j.access_token, expires_at: expiresAt } };
}

/** Verifica che la casella possa lavorare (token validi + profilo raggiungibile). Non invia nulla. */
export async function testNativeSender(admin: any, sender: NativeSender): Promise<{ ok: boolean; error?: string }> {
  try {
    if (sender.provider === "gmail" || sender.provider === "outlook") {
      if (!sender.oauth_connection_id) return { ok: false, error: "Nessuna connessione OAuth collegata" };
      const { accessToken } = await getOauthAccessToken(admin, sender.oauth_connection_id);
      const url = sender.provider === "gmail"
        ? "https://gmail.googleapis.com/gmail/v1/users/me/profile"
        : "https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName";
      const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!r.ok) return { ok: false, error: `${sender.provider}: ${r.status} ${(await r.text()).slice(0, 160)}` };
      return { ok: true };
    }
    return { ok: false, error: `provider ${sender.provider} non testabile qui` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function base64Bytes(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function base64Url(s: string): string {
  return base64Bytes(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Message-ID "della casella": <uuid@dominio-mittente>, non @edilizia-in-cloud. */
function nuovoMessageId(email: string): string {
  const dom = (email.split("@")[1] || "mail.local").toLowerCase();
  return `<${crypto.randomUUID()}@${dom}>`;
}

const ACCOUNT_FAIL_RE = /token_refresh_failed|tokens_not_found|refresh_token_missing|oauth_not_configured|invalid_grant|_401|_403|_429|username and password not accepted|authentication (failed|unsuccessful)|invalid (credentials|login)|\b53[045]\b|smtp_unexpected: 4|smtp_connection_closed|connection refused|econnrefused|timed out|network|tls/i;

function classificaErrore(msg: string): { accountFailure: boolean; transient: boolean } {
  const m = msg.toLowerCase();
  if (/token_refresh_failed|tokens_not_found|refresh_token_missing|oauth_not_configured|invalid_grant|_401|_403|_429|username and password not accepted|authentication (failed|unsuccessful)|invalid (credentials|login)|\b53[045]\b/.test(m)) {
    return { accountFailure: true, transient: false };
  }
  if (/smtp_unexpected: 4|smtp_connection_closed|connection refused|econnrefused|timed out|network|tls|_5\d\d:|gmail_send_5|outlook_send_5/.test(m)) {
    return { accountFailure: false, transient: true };
  }
  return { accountFailure: false, transient: false };
}

async function gmailSend(accessToken: string, rfc822: string, threadId?: string | null): Promise<{ id: string; threadId: string | null }> {
  const body: Record<string, unknown> = { raw: base64Url(rfc822) };
  if (threadId) body.threadId = threadId;
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`gmail_send_${res.status}: ${(await res.text()).slice(0, 300)}`);
  const j = await res.json() as { id: string; threadId?: string };
  return { id: j.id, threadId: j.threadId ?? null };
}

/** Gmail puo' riscrivere il Message-ID: si rilegge quello VERO per il threading. */
async function gmailMessageIdHeader(accessToken: string, id: string): Promise<string | null> {
  try {
    const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=Message-ID`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return null;
    const j = await res.json() as { payload?: { headers?: Array<{ name: string; value: string }> } };
    return j.payload?.headers?.find((h) => h.name.toLowerCase() === "message-id")?.value ?? null;
  } catch { return null; }
}

async function outlookSendMime(accessToken: string, rfc822: string): Promise<void> {
  const res = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "text/plain" }, body: base64Bytes(rfc822),
  });
  if (!res.ok && res.status !== 202) throw new Error(`outlook_send_${res.status}: ${(await res.text()).slice(0, 300)}`);
}

export async function sendViaNativeSender(admin: any, sender: NativeSender, msg: NativeMessage): Promise<NativeSendResult> {
  const provider = sender.provider as NativeProvider;
  const stream = msg.stream ?? "marketing";
  const to = String(msg.to ?? "").trim();
  const log = async (status: "sent" | "failed", providerId: string | null, err: string | null, extra?: Record<string, unknown>) => {
    try {
      await logEmailDelivery(admin, {
        company_id: msg.companyId, recipient: to, subject: msg.subject, template_name: undefined,
        status, provider, stream, campaign_id: null, provider_id: providerId, error_message: err ?? undefined,
        cost_eur: 0, charged_eur: 0,
        metadata: { sender_source: "outreach_pool_native", from_address: sender.email, ...(msg.metadata ?? {}), ...(extra ?? {}) },
      });
    } catch (e) { console.warn("[outreachMailboxSend] log fallito:", e instanceof Error ? e.message : e); }
  };

  // 0. suppression list (stessa di sendEmailUnified)
  try {
    const sup = await getSuppressedEmailMap(admin, [to], msg.companyId, stream);
    const hit = sup.get(normalizeEmailAddress(to));
    if (hit) {
      await log("failed", null, `Destinatario in suppression list (${hit.reason})`, { suppressed: true, suppression_reason: hit.reason });
      return { ok: false, status: 400, messageId: null, threadId: null, providerUsed: provider, error: `suppressed: ${hit.reason}`, suppressed: true };
    }
  } catch (e) { console.warn("[outreachMailboxSend] suppression check saltato:", e instanceof Error ? e.message : e); }

  const messageId = nuovoMessageId(sender.email);
  const headers: Record<string, string> = { ...(msg.headers ?? {}) };
  if (msg.replyTo && msg.replyTo.toLowerCase() !== sender.email.toLowerCase()) headers["Reply-To"] = msg.replyTo;

  try {
    if (provider === "smtp") {
      if (!sender.secret_ref || !sender.smtp_host || !sender.smtp_port) throw new Error("smtp_config_missing: casella senza host/porta/password");
      const { data: pwd, error: pErr } = await admin.rpc("outreach_mailbox_secret", { p_ref: sender.secret_ref });
      if (pErr || !pwd) throw new Error("smtp_secret_missing: password non risolta dal Vault");
      const r = await smtpSend(
        { host: sender.smtp_host, port: sender.smtp_port, secure: sender.smtp_secure ?? true, username: sender.smtp_username ?? sender.email, password: pwd as string },
        { from: sender.email, fromName: msg.fromName ?? sender.display_name ?? null, to: [to], subject: msg.subject, bodyHtml: msg.html ?? null, bodyText: msg.text ?? null, inReplyTo: msg.inReplyTo ?? null, references: msg.references ?? [], headers, messageId },
      );
      await log("sent", r.messageId, null);
      return { ok: true, status: 200, messageId: r.messageId, threadId: null, providerUsed: provider };
    }

    if (!sender.oauth_connection_id) throw new Error("oauth_connection_missing: casella senza connessione OAuth");
    const { accessToken } = await getOauthAccessToken(admin, sender.oauth_connection_id);
    const rfc822 = buildRFC822({
      from: sender.email, fromName: msg.fromName ?? sender.display_name ?? null, to: [to],
      subject: msg.subject, bodyHtml: msg.html ?? null, bodyText: msg.text ?? null,
      inReplyTo: msg.inReplyTo ?? null, references: msg.references ?? [], messageId, headers,
    });
    if (provider === "gmail") {
      const sent = await gmailSend(accessToken, rfc822, msg.threadIdHint ?? null);
      const realId = (await gmailMessageIdHeader(accessToken, sent.id)) ?? messageId;
      await log("sent", sent.id, null, { gmail_thread_id: sent.threadId });
      return { ok: true, status: 200, messageId: realId, threadId: sent.threadId, providerUsed: provider };
    }
    await outlookSendMime(accessToken, rfc822);
    await log("sent", messageId, null);
    return { ok: true, status: 200, messageId, threadId: null, providerUsed: provider };
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    const cls = classificaErrore(err);
    await log("failed", null, err, { account_failure: cls.accountFailure, transient: cls.transient });
    // Transitorio (rete, 5xx, 4xx SMTP): si LANCIA, cosi' il dispatcher ritenta con backoff.
    if (cls.transient) throw new Error(err);
    return { ok: false, status: cls.accountFailure ? 503 : 502, messageId: null, threadId: null, providerUsed: provider, error: err, body: err, accountFailure: cls.accountFailure };
  }
}

export { ACCOUNT_FAIL_RE };
