/**
 * email-poll-inbox — GAP 7b
 *
 * Cron 10min che:
 *   1. Lista connessioni due (RPC email_oauth_list_due_for_poll)
 *   2. Per ogni connection: refresh access_token se necessario
 *   3. Fetcha email NUOVE da Gmail/Outlook (since last_synced_at)
 *   4. Per ogni email: salva in email_inbox con owner personale e account provider
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
  company_id?: string | null;
  user_id?: string | null;
  last_synced_at?: string | null;
  sync_from_date?: string | null;
}

interface DecryptedTokens {
  access_token: string;
  refresh_token: string | null;
  expires_at: string;
  provider: string;
  email_address: string;
  company_id: string;
  user_id?: string | null;
  scopes: string[];
  provider_metadata: Record<string, unknown>;
}

interface NormalizedEmail {
  message_id: string;
  provider_message_id: string | null;
  provider_thread_id: string | null;
  in_reply_to: string | null;
  references_ids: string[];
  from_email: string;
  from_name: string | null;
  to_email: string;
  subject: string;
  text: string;
  html: string | null;
  received_at: string;
  is_read?: boolean;
  attachments?: Array<{ filename: string; mime?: string | null; size?: number | null; storage_path?: string | null }>;
}

interface StoredEmailResult {
  stored: boolean;
  id: string | null;
  needsTriage: boolean;
}

const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";
const GRAPH_API = "https://graph.microsoft.com/v1.0/me";
const TOKEN_URL_GMAIL = "https://oauth2.googleapis.com/token";
const TOKEN_URL_OUTLOOK = "https://login.microsoftonline.com/common/oauth2/v2.0/token";

function decodeBase64Url(data: string): string {
  const normalized = data.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function parseReferences(raw: string): string[] {
  return raw
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 0)
    .slice(-20);
}

function computeSinceTimestamp(conn: ConnectionDue): number {
  const syncFrom = conn.sync_from_date ? new Date(conn.sync_from_date).getTime() : Date.now();
  if (!conn.last_synced_at) return Number.isFinite(syncFrom) ? syncFrom : Date.now();
  const last = new Date(conn.last_synced_at).getTime();
  if (!Number.isFinite(last)) return Number.isFinite(syncFrom) ? syncFrom : Date.now();
  return Math.max(syncFrom, last - 30 * 60 * 1000);
}

// ════════════════════════════════════════════════════════════════════════════
// TOKEN REFRESH
// ════════════════════════════════════════════════════════════════════════════

async function refreshTokenIfNeeded(
  supa: SupabaseClient,
  conn: DecryptedTokens,
  connectionId: string,
  userId: string | null,
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
    p_user_id: userId,
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
  /**
   * Hard cap di messaggi totali da scaricare in un singolo run.
   * Il backfill iniziale (first sync) può sforare i 500; lo lasciamo
   * generoso per coprire utenti con inbox grande, ma con un soft-stop
   * per non bruciare timeout Edge Function (max ~150s).
   */
  hardCap = 1000,
): Promise<NormalizedEmail[]> {
  // Gmail query: recenti, non in spam/trash
  // 2026-05-26: paginazione completa via nextPageToken. maxResults=100 per pagina
  // (max consentito da Gmail), cap totale = hardCap. Sufficiente per inbox grandi.
  const qSince = Math.floor(sinceTimestamp / 1000); // Unix seconds
  const qParam = encodeURIComponent(`in:inbox after:${qSince}`);

  // 1) Lista TUTTI i messaggi del periodo, paginando.
  const messageIds: string[] = [];
  let pageToken: string | null = null;
  let safety = 0;
  do {
    safety++;
    if (safety > 20) break; // 20 pagine × 100 = 2000 msg max, hard stop
    const url = `${GMAIL_API}/messages?q=${qParam}&maxResults=100${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`;
    const listRes = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!listRes.ok) throw new Error(`gmail_list_${listRes.status}`);
    const listJson = await listRes.json() as { messages?: Array<{ id: string }>; nextPageToken?: string };
    if (listJson.messages?.length) {
      for (const m of listJson.messages) {
        messageIds.push(m.id);
        if (messageIds.length >= hardCap) break;
      }
    }
    pageToken = listJson.nextPageToken ?? null;
    if (messageIds.length >= hardCap) break;
  } while (pageToken);

  if (messageIds.length === 0) return [];

  // 2026-05-26: fetch dettagli in PARALLELO con batch size 15.
  // Serie (1 alla volta) → 1000 messaggi × 100ms = 100s = timeout.
  // Parallelo (15 alla volta) → 1000/15 × 100ms = ~7s. 14× più veloce.
  // Limite 15: stiamo sotto il quota Gmail (250 quota units / second per user;
  // un messages.get costa 5 quota → 50 req/s teorici, prendo margine).
  const BATCH_SIZE = 15;
  const fetchOne = async (messageId: string): Promise<NormalizedEmail | null> => {
    const msgRes = await fetch(`${GMAIL_API}/messages/${messageId}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!msgRes.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const msg = await msgRes.json() as any;
    const headers = (msg.payload?.headers ?? []) as Array<{ name: string; value: string }>;
    const getHeader = (name: string) => headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
    const fromRaw = getHeader("From");
    const fromMatch = /^(?:"?([^"<]+?)"?\s*)?<?([^\s<>]+@[^\s<>]+)>?$/.exec(fromRaw);
    const fromEmail = fromMatch?.[2] ?? fromRaw;
    const fromName = fromMatch?.[1]?.trim() ?? null;
    let text = "";
    let html: string | null = null;
    const findBody = (parts: unknown[]): { text: string; html: string | null } => {
      let foundText = "";
      let foundHtml: string | null = null;
      for (const p of parts as Array<{ mimeType: string; body?: { data?: string }; parts?: unknown[] }>) {
        if (p.mimeType === "text/plain" && p.body?.data && !foundText) {
          foundText = decodeBase64Url(p.body.data);
        }
        if (p.mimeType === "text/html" && p.body?.data && !foundHtml) {
          foundHtml = decodeBase64Url(p.body.data);
        }
        if (p.parts) {
          const sub = findBody(p.parts);
          if (sub.text && !foundText) foundText = sub.text;
          if (sub.html && !foundHtml) foundHtml = sub.html;
        }
      }
      return { text: foundText, html: foundHtml };
    };
    if (msg.payload?.parts) {
      const body = findBody(msg.payload.parts);
      text = body.text;
      html = body.html;
    } else if (msg.payload?.body?.data) {
      const decoded = decodeBase64Url(msg.payload.body.data);
      if (msg.payload?.mimeType === "text/html") html = decoded;
      else text = decoded;
    }
    if (!text) text = msg.snippet ?? "";
    return {
      message_id: getHeader("Message-ID") || msg.id,
      provider_message_id: msg.id ?? null,
      provider_thread_id: msg.threadId ?? null,
      in_reply_to: getHeader("In-Reply-To") || null,
      references_ids: parseReferences(getHeader("References")),
      from_email: fromEmail,
      from_name: fromName,
      to_email: emailAddress,
      subject: getHeader("Subject"),
      text: text.substring(0, 8000),
      html,
      received_at: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : new Date().toISOString(),
      is_read: Array.isArray(msg.labelIds) ? !msg.labelIds.includes("UNREAD") : false,
    };
  };

  const emails: NormalizedEmail[] = [];
  for (let i = 0; i < messageIds.length; i += BATCH_SIZE) {
    const slice = messageIds.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(slice.map(fetchOne));
    for (const r of results) {
      if (r) emails.push(r);
    }
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
  hardCap = 1000,
): Promise<NormalizedEmail[]> {
  // 2026-05-26: paginazione via @odata.nextLink, $top=100 per pagina.
  const sinceIso = new Date(sinceTimestamp).toISOString();
  const params = new URLSearchParams({
    "$filter": `receivedDateTime gt ${sinceIso}`,
    "$orderby": "receivedDateTime desc",
    "$top": "100",
    "$select": "id,conversationId,subject,from,toRecipients,ccRecipients,bccRecipients,body,bodyPreview,receivedDateTime,internetMessageId,isRead,hasAttachments",
  });

  // Collect TUTTE le pagine
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allMessages: any[] = [];
  let nextUrl: string | null = `${GRAPH_API}/messages?${params.toString()}`;
  let safety = 0;
  while (nextUrl) {
    safety++;
    if (safety > 20) break; // hard stop
    const res: Response = await fetch(nextUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) throw new Error(`outlook_list_${res.status}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const json = await res.json() as { value?: any[]; "@odata.nextLink"?: string };
    if (json.value?.length) {
      for (const v of json.value) {
        allMessages.push(v);
        if (allMessages.length >= hardCap) break;
      }
    }
    if (allMessages.length >= hardCap) break;
    nextUrl = json["@odata.nextLink"] ?? null;
  }

  if (allMessages.length === 0) return [];

  const emails: NormalizedEmail[] = [];
  for (const m of allMessages) {
    emails.push({
      message_id: m.internetMessageId ?? m.id,
      provider_message_id: m.id ?? null,
      provider_thread_id: m.conversationId ?? null,
      in_reply_to: null,
      references_ids: [],
      from_email: m.from?.emailAddress?.address ?? "",
      from_name: m.from?.emailAddress?.name ?? null,
      to_email: emailAddress,
      subject: m.subject ?? "",
      text: (m.bodyPreview ?? "").substring(0, 8000),
      html: m.body?.contentType === "html" || m.body?.contentType === "HTML" ? m.body?.content ?? null : null,
      received_at: m.receivedDateTime ?? new Date().toISOString(),
      is_read: !!m.isRead,
    });
  }
  return emails;
}

// ════════════════════════════════════════════════════════════════════════════
// STORAGE + THREADING
// ════════════════════════════════════════════════════════════════════════════

async function storePersonalEmail(
  supa: SupabaseClient,
  conn: Required<Pick<ConnectionDue, "id" | "company_id" | "user_id" | "email_address">> & Pick<ConnectionDue, "provider">,
  email: NormalizedEmail,
): Promise<StoredEmailResult> {
  if (!conn.user_id || !conn.company_id) {
    throw new Error("connection_missing_owner");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = await (supa as any)
    .from("email_inbox")
    .select("id, ai_category, status")
    .eq("company_id", conn.company_id)
    .eq("user_id", conn.user_id)
    .eq("message_id", email.message_id)
    .maybeSingle();
  if (existing.error) throw existing.error;

  const payload = {
    company_id: conn.company_id,
    user_id: conn.user_id,
    oauth_connection_id: conn.id,
    message_id: email.message_id,
    provider_message_id: email.provider_message_id,
    provider_thread_id: email.provider_thread_id,
    in_reply_to: email.in_reply_to,
    references_ids: email.references_ids,
    mailbox_folder: "inbox",
    from_email: email.from_email || "(sconosciuto)",
    from_name: email.from_name,
    to_email: email.to_email || conn.email_address,
    cc_emails: [],
    bcc_emails: [],
    subject: email.subject || "(senza oggetto)",
    received_at: email.received_at,
    raw_text: email.text,
    raw_html: email.html,
    attachments: email.attachments ?? [],
    is_read: !!email.is_read,
    is_archived: false,
    is_trashed: false,
  };

  if (existing.data?.id) {
    const { error } = await supa
      .from("email_inbox")
      .update(payload)
      .eq("id", existing.data.id);
    if (error) throw error;
    const needsTriage =
      !existing.data.ai_category ||
      existing.data.ai_category === "pending" ||
      existing.data.status === "new";
    return { stored: false, id: existing.data.id, needsTriage };
  }

  const insertPayload = {
    ...payload,
    status: "new",
    ai_category: "pending",
    ai_priority: "nessuna",
  };

  const { data: inserted, error } = await supa
    .from("email_inbox")
    .insert(insertPayload)
    .select("id")
    .maybeSingle();
  if (error) {
    // Compatibilità con il vecchio indice UNIQUE(company_id, message_id):
    // se esiste già una riga legacy senza user_id, la rivendichiamo per l'owner.
    if (String(error.message ?? "").includes("duplicate")) {
      const { data: recovered, error: updateErr } = await supa
        .from("email_inbox")
        .update(insertPayload)
        .eq("company_id", conn.company_id)
        .eq("message_id", email.message_id)
        .is("user_id", null)
        .select("id")
        .maybeSingle();
      if (updateErr) throw updateErr;
      return { stored: true, id: recovered?.id ?? null, needsTriage: true };
    }
    throw error;
  }
  return { stored: true, id: inserted?.id ?? null, needsTriage: true };
}

function queueTriagePending(companyId: string, limit: number): void {
  const cronSecret = Deno.env.get("PROACTIVE_CRON_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!cronSecret || !supabaseUrl) return;

  const task = fetch(`${supabaseUrl}/functions/v1/email-triage-ai`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": cronSecret,
    },
    body: JSON.stringify({
      mode: "triage_pending",
      company_id: companyId,
      limit: Math.max(1, Math.min(limit, 25)),
    }),
  }).catch((e) => {
    console.warn("[email-poll] triage queue failed:", e);
  });

  const runtime = (globalThis as unknown as {
    EdgeRuntime?: { waitUntil?: (promise: Promise<unknown>) => void };
  }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(task);
}

async function resolveThreadsForUser(userId: string, batchSize: number): Promise<void> {
  const url = `${Deno.env.get("SUPABASE_URL")!}/functions/v1/email-thread-resolver`;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!serviceKey) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({ user_id: userId, batch_size: Math.max(20, Math.min(batchSize, 500)) }),
    });
  } catch (e) {
    console.warn("[email-poll] thread resolver failed:", e);
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

  const body = (await req.json().catch(() => ({}))) as { source?: string; connection_id?: string };

  // Auth: x-cron-secret OR service_role bearer OR owner JWT for manual sync.
  const cronSecret = req.headers.get("x-cron-secret");
  const expectedSecret = Deno.env.get("PROACTIVE_CRON_SECRET");
  const authHeader = req.headers.get("Authorization") ?? "";
  const isAuthorizedCron = cronSecret && expectedSecret && cronSecret === expectedSecret;
  const isServiceRole = authHeader.includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "_no_match_");

  const supa = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let manualUserId: string | null = null;
  if (!isAuthorizedCron && !isServiceRole && authHeader.startsWith("Bearer ")) {
    const { data: userData } = await supa.auth.getUser(authHeader.replace("Bearer ", ""));
    manualUserId = userData?.user?.id ?? null;
  }

  if (!isAuthorizedCron && !isServiceRole && !manualUserId) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const summary = {
    connections_checked: 0,
    emails_fetched: 0,
    emails_stored: 0,
    ai_triage_queued: 0,
    errors: [] as Array<{ connection_id: string; error: string }>,
    duration_ms: 0,
  };
  const t0 = Date.now();

  // 1) Lista connessioni: cron usa le due, sync manuale usa solo account dell'utente.
  let due: ConnectionDue[] | null = null;
  let dueErr: { message: string } | null = null;
  if (manualUserId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (supa as any)
      .from("email_oauth_connections")
      .select("id, provider, email_address, company_id, user_id, last_synced_at, sync_from_date")
      .eq("user_id", manualUserId)
      .eq("status", "active")
      .eq("poll_enabled", true)
      .order("created_at", { ascending: false })
      .limit(10);
    due = res.data ?? null;
    dueErr = res.error;
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (supa as any).rpc("email_oauth_list_due_for_poll", { p_limit: 50 });
    due = res.data ?? null;
    dueErr = res.error;
  }
  if (dueErr) {
    return new Response(JSON.stringify({ error: dueErr.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  for (const dueConn of (due ?? []) as ConnectionDue[]) {
    summary.connections_checked += 1;
    try {
      // Carica sempre il record completo: la RPC storica ritorna solo metadata minimi.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: connFull, error: connErr } = await (supa as any)
        .from("email_oauth_connections")
        .select("id, provider, email_address, company_id, user_id, last_synced_at, sync_from_date")
        .eq("id", dueConn.id)
        .maybeSingle();
      if (connErr || !connFull) {
        throw new Error(connErr?.message ?? "connection_not_found");
      }
      const conn = connFull as ConnectionDue;
      if (!conn.user_id || !conn.company_id) {
        throw new Error("connection_without_user_or_company");
      }
      if (body.connection_id && body.connection_id !== conn.id) continue;

      const sinceTs = computeSinceTimestamp(conn);
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
          html: null,
          provider_message_id: m.messageId,
          provider_thread_id: null,
          in_reply_to: null,
          references_ids: [],
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
        const accessToken = await refreshTokenIfNeeded(supa, tokens, conn.id, conn.user_id ?? null);
        // First sync (mai sincronizzato) → backfill aggressivo (max 1000 messaggi).
        // Sync incrementale (already synced once) → solo i messaggi nuovi dopo
        // last_synced_at: cap basso (200) per restare ben sotto i timeout Edge.
        const isFirstSync = !conn.last_synced_at;
        const hardCap = isFirstSync ? 1000 : 200;
        emails = conn.provider === "gmail"
          ? await pollGmail(accessToken, conn.email_address, sinceTs, hardCap)
          : await pollOutlook(accessToken, conn.email_address, sinceTs, hardCap);
      }

      summary.emails_fetched += emails.length;

      // Salvataggio diretto nel client personale, senza perdere ownership utente/account.
      // 2026-05-26: storage parallelo a batch di 10 per non saturare il pool
      // di connessioni Postgres. Riduce ~10× il tempo storage per i first sync.
      const STORE_BATCH = 10;
      let stored = 0;
      let triageCandidates = 0;
      const connContext = {
        id: conn.id,
        company_id: conn.company_id,
        user_id: conn.user_id,
        email_address: conn.email_address,
        provider: conn.provider,
      };
      for (let i = 0; i < emails.length; i += STORE_BATCH) {
        const slice = emails.slice(i, i + STORE_BATCH);
        const results = await Promise.allSettled(
          slice.map((e) => storePersonalEmail(supa, connContext, e)),
        );
        for (const r of results) {
          if (r.status === "fulfilled") {
            if (r.value.stored) stored++;
            if (r.value.needsTriage) triageCandidates++;
          } else {
            console.warn("[email-poll] storePersonalEmail failed:", r.reason?.message ?? r.reason);
          }
        }
      }
      summary.emails_stored += stored;
      if (emails.length > 0) {
        await resolveThreadsForUser(conn.user_id, emails.length + 20);
      }
      if (triageCandidates > 0) {
        queueTriagePending(conn.company_id, triageCandidates);
        summary.ai_triage_queued += triageCandidates;
      }

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
      summary.errors.push({ connection_id: dueConn.id, error: msg });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supa as any).rpc("email_oauth_mark_sync", {
        p_connection_id: dueConn.id,
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
