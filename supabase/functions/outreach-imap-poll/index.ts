/**
 * outreach-imap-poll — lettura risposte e bounce delle caselle del pool (cron).
 *
 * Due famiglie di caselle:
 *   • SMTP con IMAP: si legge la casella via IMAP con CURSORE UID (prima
 *     "UNSEEN SINCE data" rileggeva ogni 15' le stesse risposte non aperte);
 *   • Gmail/Outlook via OAuth: la posta e' gia' scaricata da email-poll-inbox
 *     in email_inbox ogni 2 minuti; qui si leggono le righe nuove di quella
 *     connessione.
 * Caselle in warm-up INCLUSE: spediscono, quindi ricevono risposte.
 *
 * Per ogni messaggio: (1) e' un mancato recapito? → suppression + stop
 * iscrizione + contatore bounce; (2) altrimenti match contatto per mittente →
 * handleInboundReply (dedup per Message-ID, intent AI, stop sequenza, opt-out).
 *
 * Auth: solo cron interno (service role bearer o x-cron-secret).
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { imapFetchUnreadSince, type ImapConfig } from "../_shared/imapSmtpClient.ts";
import { matchReplyToContact, type KnownContact } from "../_shared/outreach-reply-match.ts";
import { handleInboundReply } from "../_shared/outreach-reply-handler.ts";
import { parseBounce, type BounceInfo } from "../_shared/outreach-bounce.ts";
import { htmlToPlainText } from "../_shared/outreach-template.ts";
import { shouldAutoPause } from "../_shared/outreach-dispatch-logic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") || "";
const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";
const DAY_MS = 86_400_000;
const PER_MAILBOX = 30;

interface Casella { id: string; email: string }
interface MsgIn {
  messageId: string | null;
  from: string;
  subject: string;
  text: string;
  inReplyTo: string | null;
  references: string[];
  headers: Record<string, string>;
}

/** Estrae l'indirizzo bare da "Nome <email@x.com>" o "email@x.com". Lowercase. */
function addrOf(from: string): string {
  const m = (from || "").match(/<([^>]+)>/);
  return (m ? m[1] : from || "").trim().toLowerCase();
}

async function applicaBounce(admin: any, mb: Casella, b: BounceInfo): Promise<void> {
  if (b.failedEmails.length === 0) {
    console.warn(`[outreach-imap-poll] ${mb.email}: NDR senza destinatario riconoscibile (${b.reason ?? "?"})`);
    return;
  }
  for (const email of b.failedEmails) {
    if (b.hard) {
      await admin.from("email_suppressions").upsert(
        { company_id: PLATFORM_COMPANY, email, reason: "hard_bounce", notes: `NDR su ${mb.email}: ${(b.reason ?? "").slice(0, 120)}` },
        { onConflict: "company_id,email_normalized,reason" },
      );
    }
    const { data: contatti } = await admin.from("marketing_contacts").select("id")
      .eq("company_id", PLATFORM_COMPANY).ilike("email", email);
    const ids = ((contatti ?? []) as Array<{ id: string }>).map((c) => c.id);
    if (!ids.length) continue;
    const { data: enrs } = await admin.from("outreach_enrollments").select("id")
      .eq("company_id", PLATFORM_COMPANY).in("contact_id", ids).in("status", ["active", "paused"]);
    const eids = ((enrs ?? []) as Array<{ id: string }>).map((e) => e.id);
    if (!eids.length) continue;
    if (b.hard) {
      // Indirizzo inesistente: la sequenza si ferma, i follow-up in coda spariscono.
      await admin.from("outreach_enrollments")
        .update({ status: "bounced", next_action_at: null, stop_reason: "hard_bounce" }).in("id", eids);
      await admin.from("outreach_send_queue")
        .update({ status: "cancelled", last_error: "hard bounce" }).in("enrollment_id", eids).eq("status", "queued");
    } else {
      console.warn(`[outreach-imap-poll] ${mb.email}: bounce temporaneo per ${email} (${b.reason ?? "?"}), sequenza lasciata attiva`);
    }
  }
  if (b.hard) {
    const { data: row } = await admin.from("outreach_sender_accounts")
      .select("bounce_count, complaint_count").eq("id", mb.id).maybeSingle();
    const bc = ((row?.bounce_count as number | null) ?? 0) + 1;
    const patch: Record<string, unknown> = { bounce_count: bc };
    if (shouldAutoPause(bc, (row?.complaint_count as number | null) ?? 0)) patch.status = "paused";
    await admin.from("outreach_sender_accounts").update(patch).eq("id", mb.id);
  }
}

/** Tra gli indirizzi candidati, quelli a cui la casella ha spedito (30 gg). */
async function destinatariRecenti(admin: any, senderId: string, emails: string[]): Promise<string[]> {
  const puliti = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s,]+@[^\s,]+$/.test(e)))].slice(0, 20);
  if (puliti.length === 0) return [];
  const { data } = await admin.from("outreach_send_queue").select("to_email")
    .eq("sender_account_id", senderId).eq("status", "sent")
    .gte("sent_at", new Date(Date.now() - 30 * DAY_MS).toISOString())
    .or(puliti.map((e) => `to_email.ilike.${e}`).join(","))
    .limit(50);
  const spediti = new Set(((data ?? []) as Array<{ to_email: string | null }>).map((r) => String(r.to_email ?? "").toLowerCase()));
  return puliti.filter((e) => spediti.has(e));
}

/** Un messaggio arrivato nella casella: bounce, risposta di un prospect o rumore. */
async function processa(admin: any, mb: Casella, msg: MsgIn): Promise<"bounce" | "risposta" | "ignorato"> {
  const bounce = parseBounce({ from: msg.from, subject: msg.subject, text: msg.text, ignoreEmails: [mb.email] });
  if (bounce.isBounce) {
    // Contano SOLO gli indirizzi a cui questa casella ha davvero scritto negli
    // ultimi 30 giorni: il classificatore gira anche sulla posta personale
    // delle caselle OAuth (newsletter, notifiche) e il testo libero e' pieno
    // di indirizzi che non c'entrano.
    const noti = await destinatariRecenti(admin, mb.id, bounce.failedEmails);
    if (noti.length === 0) return "ignorato";
    await applicaBounce(admin, mb, { ...bounce, failedEmails: noti });
    return "bounce";
  }

  const addr = addrOf(msg.from);
  if (!addr || addr === mb.email.toLowerCase()) return "ignorato";
  const { data: cands } = await admin.from("marketing_contacts").select("id, email")
    .eq("company_id", PLATFORM_COMPANY).ilike("email", addr);
  const match = matchReplyToContact(
    { from: msg.from, inReplyTo: msg.inReplyTo, references: msg.references },
    (cands ?? []) as KnownContact[],
  );
  if (!match) return "ignorato";
  const { data: enr } = await admin.from("outreach_enrollments").select("id")
    .eq("company_id", PLATFORM_COMPANY).eq("contact_id", match.id).eq("status", "active").limit(1).maybeSingle();
  await handleInboundReply(admin, {
    contactId: match.id, enrollmentId: enr?.id ?? null,
    from: msg.from, subject: msg.subject, text: msg.text, messageId: msg.messageId, headers: msg.headers,
  });
  return "risposta";
}

Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const authorized = (!!token && token === SERVICE_ROLE) || (!!CRON_SECRET && cronHeader === CRON_SECRET);
  if (!authorized) return json({ error: "unauthorized" }, 401, cors);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
  const esito = { checked: 0, replies: 0, bounces: 0, ignored: 0, errors: [] as string[] };
  const conta = (r: "bounce" | "risposta" | "ignorato") => {
    if (r === "bounce") esito.bounces++; else if (r === "risposta") esito.replies++; else esito.ignored++;
  };

  try {
    // A. Caselle SMTP con IMAP (attive O in warm-up), connessione sana.
    const { data: smtpBoxes, error: mErr } = await admin
      .from("outreach_sender_accounts")
      .select("id, email, imap_host, imap_port, imap_secure, smtp_username, secret_ref, last_imap_check_at, last_imap_uid")
      .eq("provider", "smtp").in("status", ["active", "warming"]).eq("connection_status", "ok")
      .not("imap_host", "is", null);
    if (mErr) throw mErr;

    for (const mb of (smtpBoxes ?? []) as any[]) {
      try {
        if (!mb.secret_ref) { esito.errors.push(`${mb.email}: secret_ref mancante`); continue; }
        const { data: password, error: secErr } = await admin.rpc("outreach_mailbox_secret", { p_ref: mb.secret_ref });
        if (secErr || !password) { esito.errors.push(`${mb.email}: segreto non risolto`); continue; }
        const cfg: ImapConfig = { host: mb.imap_host, port: mb.imap_port, secure: mb.imap_secure, username: mb.smtp_username ?? mb.email, password };
        const since = mb.last_imap_check_at ? new Date(mb.last_imap_check_at) : new Date(Date.now() - DAY_MS);
        const lastUid = parseInt(String(mb.last_imap_uid ?? ""), 10);
        const messages = await imapFetchUnreadSince(cfg, since, PER_MAILBOX, Number.isFinite(lastUid) && lastUid > 0 ? lastUid : null);
        esito.checked++;
        let maxUid = Number.isFinite(lastUid) ? lastUid : 0;
        for (const m of messages) {
          const n = parseInt(m.uid, 10);
          if (Number.isFinite(n) && n > maxUid) maxUid = n;
          try {
            conta(await processa(admin, mb, {
              messageId: m.messageId || null, from: m.from, subject: m.subject,
              text: m.text || (m.html ? htmlToPlainText(m.html) : ""),
              inReplyTo: m.inReplyTo, references: m.references ?? [], headers: m.headers ?? {},
            }));
          } catch (e) { esito.errors.push(`${mb.email}/${m.uid}: ${e instanceof Error ? e.message : String(e)}`); }
        }
        const upd: Record<string, unknown> = { last_imap_check_at: new Date().toISOString() };
        if (maxUid > 0) upd.last_imap_uid = String(maxUid);
        await admin.from("outreach_sender_accounts").update(upd).eq("id", mb.id);
      } catch (e) {
        esito.errors.push(`${mb.email}: IMAP fallito — ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    // B. Caselle Gmail/Outlook (OAuth): la posta e' gia' in email_inbox.
    const { data: oauthBoxes, error: oErr } = await admin
      .from("outreach_sender_accounts")
      .select("id, email, oauth_connection_id, last_imap_check_at")
      .in("provider", ["gmail", "outlook"]).in("status", ["active", "warming"])
      .not("oauth_connection_id", "is", null);
    if (oErr) throw oErr;

    for (const mb of (oauthBoxes ?? []) as any[]) {
      try {
        const sinceIso = mb.last_imap_check_at ?? new Date(Date.now() - DAY_MS).toISOString();
        const { data: rows, error: rErr } = await admin
          .from("email_inbox")
          .select("id, message_id, from_email, from_name, subject, raw_text, raw_html, received_at, created_at, in_reply_to, references_ids, headers")
          .eq("oauth_connection_id", mb.oauth_connection_id)
          .or("mailbox_folder.eq.inbox,mailbox_folder.is.null")
          // cursore su created_at (inserimento), non received_at: un messaggio
          // scaricato in ritardo con data vecchia non deve sparire
          .gt("created_at", sinceIso)
          .order("created_at", { ascending: true })
          .limit(PER_MAILBOX);
        if (rErr) throw rErr;
        esito.checked++;
        let ultimo: string | null = null;
        for (const r of (rows ?? []) as any[]) {
          ultimo = r.created_at ?? ultimo;
          const from = r.from_name ? `${r.from_name} <${r.from_email}>` : String(r.from_email ?? "");
          const headers: Record<string, string> = {};
          if (r.headers && typeof r.headers === "object") {
            for (const [k, v] of Object.entries(r.headers as Record<string, unknown>)) headers[k.toLowerCase()] = String(v ?? "");
          }
          try {
            conta(await processa(admin, mb, {
              messageId: r.message_id || null, from, subject: String(r.subject ?? ""),
              text: r.raw_text || (r.raw_html ? htmlToPlainText(r.raw_html) : ""),
              inReplyTo: r.in_reply_to ?? null, references: (r.references_ids ?? []) as string[], headers,
            }));
          } catch (e) { esito.errors.push(`${mb.email}/${r.id}: ${e instanceof Error ? e.message : String(e)}`); }
        }
        if (ultimo) await admin.from("outreach_sender_accounts").update({ last_imap_check_at: ultimo }).eq("id", mb.id);
      } catch (e) {
        esito.errors.push(`${mb.email}: lettura posta OAuth fallita — ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return json(esito, 200, cors);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e), ...esito }, 500, cors);
  }
});

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
