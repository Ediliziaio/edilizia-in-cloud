/**
 * outreach-imap-poll — lettura risposte via IMAP (cron).
 *
 * Le risposte dei prospect arrivano nelle mailbox reali del pool (caselle SMTP
 * con config IMAP). Questo cron, per ogni casella attiva:
 *   1. risolve la password dal Vault (RPC outreach_mailbox_secret);
 *   2. legge i messaggi NON letti dall'ultimo check (imapFetchUnreadSince);
 *   3. per ogni messaggio matcha il contatto (per indirizzo mittente) e, se c'è,
 *      riusa la STESSA logica "gestisci risposta" del webhook inbound
 *      (handleInboundReply): inbox + intent AI + stop sequenza + opt-out;
 *   4. avanza last_imap_check_at (e last_imap_uid con l'UID più alto visto).
 *
 * Robusto per-casella: se l'IMAP di una casella fallisce, logga e continua con
 * la prossima (mai crashare l'intero tick).
 *
 * Auth: solo cron interno (service role bearer o x-cron-secret == PROACTIVE_CRON_SECRET).
 * Mai pubblico. Richiede le colonne IMAP (migrazione 20270818000000).
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { imapFetchUnreadSince, type ImapConfig } from "../_shared/imapSmtpClient.ts";
import { matchReplyToContact, type KnownContact } from "../_shared/outreach-reply-match.ts";
import { handleInboundReply } from "../_shared/outreach-reply-handler.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") || "";
const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";
const DAY_MS = 86_400_000;
const PER_MAILBOX = 20;

/** Estrae l'indirizzo bare da "Nome <email@x.com>" o "email@x.com". Lowercase. */
function addrOf(from: string): string {
  const m = (from || "").match(/<([^>]+)>/);
  return (m ? m[1] : from || "").trim().toLowerCase();
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const authorized = (!!token && token === SERVICE_ROLE) || (!!CRON_SECRET && cronHeader === CRON_SECRET);
  if (!authorized) return json({ error: "unauthorized" }, 401, cors);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  let checked = 0;
  let replies = 0;

  try {
    // 1. Caselle SMTP attive con config IMAP e connessione sana.
    const { data: mailboxes, error: mErr } = await admin
      .from("outreach_sender_accounts")
      .select("id, email, imap_host, imap_port, imap_secure, smtp_username, secret_ref, last_imap_check_at")
      .eq("provider", "smtp").eq("status", "active").eq("connection_status", "ok")
      .not("imap_host", "is", null);
    if (mErr) throw mErr;
    if (!mailboxes || mailboxes.length === 0) return json({ checked: 0, replies: 0, note: "nessuna casella IMAP" }, 200, cors);

    for (const mb of mailboxes) {
      try {
        // 2. Password dal Vault. Senza secret_ref / segreto risolto → salta la casella.
        if (!mb.secret_ref) { console.warn(`[outreach-imap-poll] ${mb.email}: secret_ref mancante`); continue; }
        const { data: password, error: secErr } = await admin.rpc("outreach_mailbox_secret", { p_ref: mb.secret_ref });
        if (secErr || !password) { console.warn(`[outreach-imap-poll] ${mb.email}: segreto non risolto`); continue; }

        const cfg: ImapConfig = {
          host: mb.imap_host,
          port: mb.imap_port,
          secure: mb.imap_secure,
          username: mb.smtp_username ?? mb.email,
          password,
        };
        const since = mb.last_imap_check_at ? new Date(mb.last_imap_check_at) : new Date(Date.now() - DAY_MS);

        const messages = await imapFetchUnreadSince(cfg, since, PER_MAILBOX);
        checked++;

        let maxUid = 0;
        for (const msg of messages) {
          const n = parseInt(msg.uid, 10);
          if (Number.isFinite(n) && n > maxUid) maxUid = n;

          // 3. Matcha il contatto per indirizzo mittente.
          const addr = addrOf(msg.from);
          if (!addr) continue;
          const { data: cands } = await admin
            .from("marketing_contacts").select("id, email")
            .eq("company_id", PLATFORM_COMPANY).ilike("email", addr);
          const match = matchReplyToContact(
            { from: msg.from, inReplyTo: msg.inReplyTo, references: msg.references },
            (cands ?? []) as KnownContact[],
          );
          if (!match) continue;

          // enrollment attivo del contatto (se presente).
          const { data: enr } = await admin
            .from("outreach_enrollments").select("id")
            .eq("company_id", PLATFORM_COMPANY).eq("contact_id", match.id).eq("status", "active").limit(1).maybeSingle();

          // 3b. Stessa logica "gestisci risposta" del webhook inbound.
          await handleInboundReply(admin, {
            contactId: match.id,
            enrollmentId: enr?.id ?? null,
            from: msg.from,
            subject: msg.subject,
            text: msg.text,
            messageId: msg.messageId,
            headers: msg.headers,
          });
          replies++;
        }

        // 4. Avanza il checkpoint della casella (UID più alto visto, se utile).
        const upd: Record<string, unknown> = { last_imap_check_at: new Date().toISOString() };
        if (maxUid > 0) upd.last_imap_uid = String(maxUid);
        await admin.from("outreach_sender_accounts").update(upd).eq("id", mb.id);
      } catch (e) {
        // IMAP di questa casella ko: logga e continua (mai crashare il tick).
        console.warn(`[outreach-imap-poll] ${mb.email}: IMAP fallito —`, e instanceof Error ? e.message : String(e));
        continue;
      }
    }

    return json({ checked, replies }, 200, cors);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500, cors);
  }
});

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
