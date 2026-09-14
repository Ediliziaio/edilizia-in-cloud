/**
 * outreach-warmup — riscaldamento caselle (cron). Le caselle del pool si
 * scambiano email di warm-up tra loro per costruire reputazione (rete tipo
 * Instantly), con volume crescente per giorno. Avanza anche warmup_day in base
 * a warmup_started_on (così il cap del dispatcher sale nel tempo).
 *
 * Auth: cron interno (service role o x-cron-secret). Richiede tabelle outreach_*.
 * NB: il warm-up COMPLETO prevede anche apertura+risposta automatica lato
 * destinatario (via IMAP): qui c'è lo scambio in uscita; l'auto-engagement
 * IMAP è il passo successivo.
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { isNativeProvider, sendViaNativeSender } from "../_shared/outreachMailboxSend.ts";
import { warmupTargetForDay, buildWarmupPairs, warmupMessage, warmupReply, type WarmupBox } from "../_shared/outreach-warmup.ts";
import { engageMailbox } from "../_shared/outreachWarmupEngage.ts";
import { logRun } from "../_shared/outreachAlert.ts";
import { selectReplyIndexes } from "../_shared/outreach-warmup-engage.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") || "";
const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";


Deno.serve(async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const authorized = (!!token && token === SERVICE_ROLE) || (!!CRON_SECRET && cronHeader === CRON_SECRET);
  if (!authorized) return json({ error: "unauthorized" }, 401, cors);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const result = { boxes: 0, pairs: 0, sent: 0, failed: 0, replied: 0, spam_recuperate: 0, lette: 0, engage_errori: [] as string[] };
  const REPLY_RATE = 0.4; // frazione di email di warm-up che riceve una risposta

  try {
    const { data: raw, error } = await supabase
      .from("outreach_sender_accounts")
      .select("id,email,display_name,warmup_day,status,warmup_started_on,provider,smtp_host,smtp_port,smtp_secure,smtp_username,secret_ref,oauth_connection_id,connection_status,daily_cap_target")
      .in("status", ["active", "warming"]);
    if (error) throw error;

    // Caselle in errore: non scaldano e non ricevono (un warm-up su una casella
    // morta e' un bounce in piu').
    const boxes = ((raw || []) as any[]).filter((b) => b.connection_status !== "error");
    result.boxes = boxes.length;

    const secretCache = new Map<string, string | null>();
    const mailboxFor = async (box: any) => {
      if (!box || box.provider !== "smtp" || !box.secret_ref || !box.smtp_host || !box.smtp_port) return undefined;
      let pwd = secretCache.get(box.secret_ref);
      if (pwd === undefined) {
        const { data } = await supabase.rpc("outreach_mailbox_secret", { p_ref: box.secret_ref });
        pwd = (data as string | null) ?? null;
        secretCache.set(box.secret_ref, pwd);
      }
      if (!pwd) return undefined;
      return { host: box.smtp_host, port: box.smtp_port, secure: box.smtp_secure ?? true, username: box.smtp_username ?? box.email, password: pwd };
    };

    // Un invio: casella nativa dal suo provider, altrimenti provider marketing.
    const invia = async (box: any, to: string, subject: string, body: string, opts: { inReplyTo?: string | null; references?: string[]; meta: Record<string, unknown> }) => {
      if (isNativeProvider(box.provider)) {
        const r = await sendViaNativeSender(supabase, box, {
          companyId: PLATFORM_COMPANY, to, subject, html: `<p>${body}</p>`, text: body,
          fromName: box.display_name ?? null, replyTo: box.email,
          inReplyTo: opts.inReplyTo ?? null, references: opts.references ?? [], metadata: opts.meta,
        });
        return { ok: r.ok, messageId: r.messageId };
      }
      const fromAddr = box.display_name ? `${box.display_name} <${box.email}>` : box.email;
      const res = await sendEmailUnified({
        companyId: PLATFORM_COMPANY, stream: "marketing", to, subject, html: `<p>${body}</p>`, text: body,
        senderOverride: { from: fromAddr, replyTo: box.email, source: "outreach_warmup" },
        mailboxOverride: await mailboxFor(box),
        headers: opts.inReplyTo ? { "In-Reply-To": opts.inReplyTo, "References": (opts.references ?? [opts.inReplyTo]).join(" ") } : undefined,
        metadata: opts.meta,
      });
      const ok = !(res && res.ok === false);
      return { ok, messageId: ok ? (res?.providerMessageId ?? null) : null };
    };

    if (boxes.length >= 2) {
      // avanza warmup_day in base a warmup_started_on (o inizializza la casella)
      for (const b of boxes) {
        if (!b.warmup_started_on) {
          await supabase.from("outreach_sender_accounts").update({ warmup_started_on: today, warmup_day: 0 }).eq("id", b.id);
          b.warmup_day = 0;
        } else {
          const day = Math.max(0, Math.floor((now.getTime() - new Date(b.warmup_started_on).getTime()) / 86400000));
          if (day !== b.warmup_day) {
            await supabase.from("outreach_sender_accounts").update({ warmup_day: day }).eq("id", b.id);
            b.warmup_day = day;
          }
        }
      }

      const pairs = buildWarmupPairs(boxes as WarmupBox[], (b) => warmupTargetForDay(b.warmup_day));
      result.pairs = pairs.length;
      const byId = new Map(boxes.map((b) => [b.id, b]));
      // Message-ID e oggetto del giro: la "risposta" resta NEL THREAD.
      const spediti = new Map<number, { messageId: string | null; subject: string }>();
      let n = 0;
      for (const p of pairs) {
        const from = byId.get(p.fromId);
        const { subject, body } = warmupMessage(n + now.getDate() * 3, Math.random);
        n++;
        // Il warm-up NON consuma il tetto delle email ai clienti (decisione del
        // titolare, 14/09/2026). Lo consumava dall'11/09: con le caselle nuove il
        // tetto del giorno è piccolo (3, poi +1 al giorno) e il warm-up cresce
        // allo stesso passo (2, poi +1), quindi a ogni casella restava UNA email
        // al giorno per i clienti — 9 in tutto il pool — per quasi due settimane.
        // Prenotare aggiornava anche last_sent_at, e la cadenza del dispatcher
        // allontanava l'invio vero successivo. Il volume del warm-up resta
        // limitato dalla sua curva (warmupTargetForDay, massimo 8 al giorno).
        try {
          const r = await invia(from, p.toEmail, subject, body, { meta: { warmup: true, from_box: p.fromId, to_box: p.toId } });
          if (r.ok) { result.sent++; spediti.set(n - 1, { messageId: r.messageId, subject }); } else result.failed++;
        } catch { result.failed++; }
      }

      // engagement a due vie: chi ha ricevuto risponde nel thread a una frazione delle email
      for (const idx of selectReplyIndexes(pairs.length, REPLY_RATE)) {
        const p = pairs[idx];
        const replier = byId.get(p.toId);
        const orig = spediti.get(idx);
        if (!orig) continue;
        try {
          const r = await invia(replier, p.fromEmail, `Re: ${orig.subject}`, warmupReply(), {
            inReplyTo: orig.messageId && orig.messageId.startsWith("<") ? orig.messageId : null,
            references: orig.messageId && orig.messageId.startsWith("<") ? [orig.messageId] : [],
            meta: { warmup: true, reply: true, from_box: p.toId, to_box: p.fromId },
          });
          if (r.ok) result.replied++;
        } catch { /* best effort */ }
      }
    }

    // Engagement REALE lato inbox (Gmail/Outlook via OAuth): le email di warm-up
    // finite nello spam tornano in inbox e vengono segnate lette. E' cio' che
    // insegna al provider che quel mittente e' gradito.
    const poolEmails = boxes.map((b) => String(b.email).toLowerCase());
    for (const b of boxes) {
      if (!b.oauth_connection_id || !(b.provider === "gmail" || b.provider === "outlook")) continue;
      try {
        const e = await engageMailbox(supabase, b, poolEmails);
        result.spam_recuperate += e.recuperate;
        result.lette += e.lette;
        if (e.errore) result.engage_errori.push(`${b.email}: ${e.errore}`);
      } catch (e) {
        result.engage_errori.push(`${b.email}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    await logRun(supabase, "outreach-warmup", now, result);
    return json(boxes.length < 2 ? { ...result, note: "pool troppo piccolo per lo scambio, fatto solo l'engagement" } : result, 200, cors);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await logRun(supabase, "outreach-warmup", now, result, msg);
    return json({ error: msg }, 500, cors);
  }
});

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
