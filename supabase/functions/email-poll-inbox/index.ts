/**
 * email-poll-inbox — GAP 7b
 *
 * Cron 10min che:
 *   1. Lista connessioni due (RPC email_oauth_list_due_for_poll)
 *   2. Per ogni connection: refresh access_token se necessario
 *   3. Fetcha email NUOVE da Gmail/Outlook (since last_synced_at)
 *   4. Per ogni email: forward a edge `email-triage-ai` con company_id+to_email
 *   5. Marca sync result via RPC email_oauth_mark_sync
 *
 * Auth: x-cron-secret (env PROACTIVE_CRON_SECRET) o service_role.
 */

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";

// IMAP support (Sprint E4 — provider non-OAuth)
import { imapFetchUnreadSince, type ImapMessage } from "../_shared/imapSmtpClient.ts";

interface ConnectionDue {
  id: string;
  provider: "gmail" | "outlook" | "imap";
  email_address: string;
}

interface DecryptedTokens {
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  provider: string;
  email_address: string;
  company_id: string;
  scopes: string[];
  provider_metadata: Record<string, unknown>;
}

interface NormalizedEmail {
  message_id: string;
  from_email: string;
  from_name: string | null;
  to_email: string;
  subject: string;
  text: string;
  received_at: string;
}

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const GRAPH_API = "https://graph.microsoft.com/v1.0/me";
const TOKEN_URL_GMAIL = "https://oauth2.googleapis.com/token";
const TOKEN_URL_OUTLOOK = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

// ════════════════════════════════════════════════════════════════════════════
// TOKEN REFRESH
// ════════════════════════════════════════════════════════════════════════════

async function refreshTokenIfNeeded(
  supa: SupabaseClient,
  conn: DecryptedTokens,
  connectionId: string,
): Promise<string> {
  // Se access_token ancora valido per >5min, riusa
  const expiresAt = new Date(conn.expires_at).getTime();
  if (expiresAt > Date.now() + 5 * 60 * 1000) {
    return conn.access_token;
  }
  if (!conn.refresh_token) {
    throw new Error("refresh_token_missing");
  }

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
    throw new Error(`token_refresh_failed: ${res.status} ${err.substring(0, 100)}`);
  }
  const json = await res.json() as { access_token: string; expires_in: number; refresh_token?: string };
  // Salva nuovo access (e refresh se ritornato)
  const newExpiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supa as any).rpc("email_oauth_upsert_connection", {
    p_company_id: conn.company_id,
    p_user_id: null,
    p_provider: conn.provider,
    p_email_address: conn.email_address,
    p_access_token: json.access_token,
    p_refresh_token: json.refresh_token ?? null, // null = preserva esistente lato RPC
    p_expires_at: newExpiresAt,
    p_scopes: conn.scopes,
  });
  return json.access_token;
}

// ════════════════════════════════════════════════════════════════════════════
// GMAIL POLL
// ════════════════════════════════════════════════════════════════════════════

async function pollGmail(
  accessToken: string,
  emailAddress: string,
  sinceTimestamp: number,
): Promise<NormalizedEmail[]> {
  // Gmail query: recenti, non in spam/trash
  const qSince = Math.floor(sinceTimestamp / 1000); // Unix seconds
  const qParam = encodeURIComponent(`in:inbox after:${qSince}`);
  const listRes = await fetch(`${GMAIL_API}/messages?q=${qParam}&maxResults=20`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!listRes.ok) throw new Error(`gmail_list_${listRes.status}`);
  const listJson = await listRes.json() as { messages?: Array<{ id: string }> };
  if (!listJson.messages || listJson.messages.length === 0) return [];

  const emails: NormalizedEmail[] = [];
  for (const m of listJson.messages.slice(0, 20)) {
    const msgRes = await fetch(`${GMAIL_API}/messages/${m.id}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!msgRes.ok) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = await msgRes.json() as any;
    const headers = (msg.payload?.headers ?? []) as Array<{ name: string; value: string }>;
    const getHeader = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
    const fromRaw = getHeader("From");
    const fromMatch = /^(?:"?([^"<]+?)"?\s*)?<?([^\s<>]+@[^\s<>]+)>?$/.exec(fromRaw);
    const fromEmail = fromMatch?.[2] ?? fromRaw;
    const fromName = fromMatch?.[1]?.trim() ?? null;
    // Body: cerchiamo text/plain prima, poi snippet
    let text = "";
    const findText = (parts: unknown[]): string => {
      for (const p of parts as Array<{ mimeType: string; body?: { data?: string }; parts?: unknown[] }>) {
        if (p.mimeType === "text/plain" && p.body?.data) {
          // Gmail base64url decode
          return atob(p.body.data.replace(/-/g, "+").replace(/_/g, "/"));
        }
        if (p.parts) {
          const sub = findText(p.parts);
          if (sub) return sub;
        }
      }
      return "";
    };
    if (msg.payload?.parts) {
      text = findText(msg.payload.parts);
    } else if (msg.payload?.body?.data) {
      text = atob(msg.payload.body.data.replace(/-/g, "+").replace(/_/g, "/"));
    }
    if (!text) text = msg.snippet ?? "";
    emails.push({
      message_id: getHeader("Message-ID") || msg.id,
      from_email: fromEmail,
      from_name: fromName,
      to_email: emailAddress,
      subject: getHeader("Subject"),
      text: text.substring(0, 8000),
      received_at: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString(),
    });
  }
  return emails;
}

// ════════════════════════════════════════════════════════════════════════════
// OUTLOOK POLL
// ════════════════════════════════════════════════════════════════════════════

async function pollOutlook(
  accessToken: string,
  emailAddress: string,
  sinceTimestamp: number,
): Promise<NormalizedEmail[]> {
  const sinceIso = new Date(sinceTimestamp).toISOString();
  // Microsoft Graph: $filter receivedDateTime gt sinceIso
  const url = `${GRAPH_API}/messages?$filter=receivedDateTime gt ${sinceIso}&$top=20&$select=id,subject,from,bodyPreview,receivedDateTime,internetMessageId`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`outlook_list_${res.status}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const json = await res.json() as { value?: any[] };
  if (!json.value || json.value.length === 0) return [];

  const emails: NormalizedEmail[] = [];
  for (const m of json.value) {
    emails.push({
      message_id: m.internetMessageId ?? m.id,
      from_email: m.from?.emailAddress?.address ?? "",
      from_name: m.from?.emailAddress?.name ?? null,
      to_email: emailAddress,
      subject: m.subject ?? "",
      text: (m.bodyPreview ?? "").substring(0, 8000),
      received_at: m.receivedDateTime ?? new Date().toISOString(),
    });
  }
  return emails;
}

// ════════════════════════════════════════════════════════════════════════════
// FORWARD A EMAIL-TRIAGE-AI
// ════════════════════════════════════════════════════════════════════════════

async function forwardToTriage(email: NormalizedEmail): Promise<boolean> {
  const url = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/email-triage-ai`;
  const inboundSecret = Deno.env.get("INBOUND_EMAIL_SECRET");
  if (!inboundSecret) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-inbound-secret": inboundSecret,
      },
      body: JSON.stringify({
        from: { email: email.from_email, name: email.from_name },
        to: email.to_email,
        subject: email.subject,
        text: email.text,
        message_id: email.message_id,
      }),
    });
    return res.ok;
  } catch (e) {
    console.warn("[email-poll] triage forward failed:", e);
    return false;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════════════

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Auth: x-cron-secret OR service_role bearer
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("PROACTIVE_CRON_SECRET");
  const authHeader = req.headers.get("Authorization") ?? "";
  const isAuthorizedCron = cronSecret && expectedSecret && cronSecret === expectedSecret;
  const isServiceRole = authHeader.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "_no_match_");
  if (!isAuthorizedCron && !isServiceRole) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const summary = {
    connections_checked: 0,
    emails_fetched: 0,
    emails_forwarded: 0,
    errors: [] as Array<{ connection_id: string; error: string }>,
    duration_ms: 0,
  };
  const t0 = Date.now();

  // 1) Lista connessioni due
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: due, error: dueErr } = await (supa as any).rpc("email_oauth_list_due_for_poll", { p_limit: 50 });
  if (dueErr) {
    return new Response(JSON.stringify({ error: dueErr.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  for (const conn of (due ?? []) as ConnectionDue[]) {
    summary.connections_checked += 1;
    try {
      const sinceTs = Date.now() - 30 * 60 * 1000; // ultimi 30min (sicurezza overlap)
      let emails: NormalizedEmail[] = [];

      if (conn.provider === "imap") {
        // Branch IMAP custom (Aruba/Libero/iCloud/...)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: creds } = await (supa as any).rpc("email_imap_get_credentials", {
          p_connection_id: conn.id,
        });
        if (!creds || creds.length === 0) {
          summary.errors.push({ connection_id: conn.id, error: "imap_credentials_not_found" });
          continue;
        }
        const c = creds[0];
        const imapMsgs: ImapMessage[] = await imapFetchUnreadSince(
          {
            host: c.imap_host,
            port: c.imap_port,
            secure: c.imap_secure,
            username: c.imap_username || c.email_address,
            password: c.password,
          },
          new Date(sinceTs),
          50,
        );
        emails = imapMsgs.map((m) => ({
          message_id: m.messageId,
          from_email: m.from,
          from_name: m.fromName,
          to_email: c.email_address,
          subject: m.subject || "(senza oggetto)",
          text: m.text || "",
          received_at: m.date ? new Date(m.date).toISOString() : new Date().toISOString(),
        }));
      } else {
        // Branch OAuth Gmail/Outlook
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: tokensData } = await (supa as any).rpc("email_oauth_get_decrypted_tokens", {
          p_connection_id: conn.id,
        });
        if (!tokensData || tokensData.length === 0) {
          summary.errors.push({ connection_id: conn.id, error: "tokens_not_found" });
          continue;
        }
        const tokens = tokensData[0] as DecryptedTokens;
        const accessToken = await refreshTokenIfNeeded(supa, tokens, conn.id);
        emails = conn.provider === "gmail"
          ? await pollGmail(accessToken, conn.email_address, sinceTs)
          : await pollOutlook(accessToken, conn.email_address, sinceTs);
      }

      summary.emails_fetched += emails.length;

      // Forward a triage
      let forwarded = 0;
      for (const e of emails) {
        const ok = await forwardToTriage(e);
        if (ok) forwarded++;
      }
      summary.emails_forwarded += forwarded;

      // Mark sync ok
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supa as any).rpc("email_oauth_mark_sync", {
        p_connection_id: conn.id,
        p_success: true,
        p_emails_fetched: emails.length,
        p_error: null,
        p_provider_metadata: null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      summary.errors.push({ connection_id: conn.id, error: msg });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supa as any).rpc("email_oauth_mark_sync", {
        p_connection_id: conn.id,
        p_success: false,
        p_emails_fetched: 0,
        p_error: msg,
        p_provider_metadata: null,
      });
    }
  }

  summary.duration_ms = Date.now() - t0;
  return new Response(JSON.stringify(summary, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
