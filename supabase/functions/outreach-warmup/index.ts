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
import { warmupTargetForDay, buildWarmupPairs, type WarmupBox } from "../_shared/outreach-warmup.ts";
import { selectReplyIndexes } from "../_shared/outreach-warmup-engage.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") || "";
const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";

const SUBJECTS = ["Due parole", "Come va?", "Aggiornamento veloce", "Ci sentiamo", "Un saluto"];
const BODIES = [
  "Ciao, volevo solo restare in contatto. Buona giornata!",
  "Tutto bene da queste parti, ci aggiorniamo presto.",
  "Grazie del confronto dell'altra volta, a presto.",
  "Ti scrivo per tenere viva la conversazione. A presto!",
];

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
  const result = { boxes: 0, pairs: 0, sent: 0, failed: 0, replied: 0 };
  const REPLY_RATE = 0.4; // frazione di email di warm-up che riceve una risposta

  try {
    const { data: raw, error } = await supabase
      .from("outreach_sender_accounts")
      .select("id,email,display_name,warmup_day,status,warmup_started_on")
      .in("status", ["active", "warming"]);
    if (error) throw error;
    const boxes = (raw || []) as any[];
    result.boxes = boxes.length;
    if (boxes.length < 2) return json({ ...result, note: "pool troppo piccolo per il warm-up" }, 200, cors);

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
    let n = 0;
    for (const p of pairs) {
      const from = byId.get(p.fromId);
      const fromAddr = from?.display_name ? `${from.display_name} <${p.fromEmail}>` : p.fromEmail;
      const subject = SUBJECTS[n % SUBJECTS.length];
      const body = BODIES[n % BODIES.length];
      n++;
      try {
        const res = await sendEmailUnified({
          companyId: PLATFORM_COMPANY,
          stream: "marketing",
          to: p.toEmail,
          subject,
          html: `<p>${body}</p>`,
          senderOverride: { from: fromAddr, replyTo: p.fromEmail, source: "outreach_warmup" },
          metadata: { warmup: true, from_box: p.fromId, to_box: p.toId },
        });
        if (res && res.ok === false) result.failed++; else result.sent++;
      } catch {
        result.failed++;
      }
    }

    // engagement a due vie: chi ha ricevuto risponde a una frazione delle email
    // (segnale di reputazione forte, in uscita dal pool, senza IMAP)
    for (const idx of selectReplyIndexes(pairs.length, REPLY_RATE)) {
      const p = pairs[idx];
      const replier = byId.get(p.toId);
      const replierAddr = replier?.display_name ? `${replier.display_name} <${p.toEmail}>` : p.toEmail;
      const origSubject = SUBJECTS[idx % SUBJECTS.length];
      try {
        const res = await sendEmailUnified({
          companyId: PLATFORM_COMPANY,
          stream: "marketing",
          to: p.fromEmail,
          subject: `Re: ${origSubject}`,
          html: "<p>Ricevuto, grazie! Ci sentiamo presto.</p>",
          senderOverride: { from: replierAddr, replyTo: p.toEmail, source: "outreach_warmup_reply" },
          metadata: { warmup: true, reply: true, from_box: p.toId, to_box: p.fromId },
        });
        if (!(res && res.ok === false)) result.replied++;
      } catch { /* best effort */ }
    }

    return json(result, 200, cors);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500, cors);
  }
});

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
