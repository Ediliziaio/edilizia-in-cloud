/**
 * outreach-dispatch — dispatcher cold (cron). Drena outreach_send_queue
 * rispettando warm-up e cap per-casella, ruotando le caselle del pool.
 *
 * Per ogni tick:
 *   1. prende i messaggi 'queued' dovuti (scheduled_for <= now)
 *   2. prende le caselle attive/in warm-up del pool
 *   3. assegna in round-robin entro i cap (logica pura testata: outreach-dispatch-logic)
 *   4. invia via sendEmailUnified (stream 'marketing' + senderOverride = casella del pool)
 *   5. aggiorna stato coda + contatori giornalieri della casella
 *
 * Auth: solo cron interno (service role bearer o x-cron-secret). Mai pubblico.
 * NB: richiede le tabelle outreach_* (migrazione 20270815000000). Idempotente
 * sul singolo messaggio (status 'sending' → 'sent'/'failed').
 */

// deno-lint-ignore-file no-explicit-any

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/headers.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { assignSenders, type SenderState } from "../_shared/outreach-dispatch-logic.ts";
import { renderTemplate, contactToVars, hashSeed } from "../_shared/outreach-template.ts";
import { isWithinSendWindow } from "../_shared/outreach-schedule.ts";
import { parseVariants, pickVariant } from "../_shared/outreach-abz.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") || "";
const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";
const BATCH = 200;

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
  const result = { processed: 0, sent: 0, failed: 0, skipped: 0, deferred: 0 };

  // finestra di invio: niente cold di notte o nel weekend (default Lun-Ven 8-19 Europe/Rome)
  if (!isWithinSendWindow(now)) {
    return json({ ...result, note: "fuori finestra di invio" }, 200, cors);
  }

  try {
    // 1. coda dovuta
    const { data: queue, error: qErr } = await supabase
      .from("outreach_send_queue")
      .select("id, to_email, subject, body, attempts, max_attempts, contact_id")
      .eq("status", "queued").eq("channel", "email")
      .lte("scheduled_for", now.toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(BATCH);
    if (qErr) throw qErr;
    if (!queue || queue.length === 0) return json({ ...result, note: "coda vuota" }, 200, cors);

    // 2. caselle del pool
    const { data: sendersRaw, error: sErr } = await supabase
      .from("outreach_sender_accounts")
      .select("id,status,daily_cap_target,warmup_base,warmup_step,warmup_day,daily_sent,daily_sent_date,email,display_name")
      .in("status", ["active", "warming"]);
    if (sErr) throw sErr;
    const senders = (sendersRaw || []) as any[];
    if (senders.length === 0) return json({ ...result, note: "nessuna casella attiva" }, 200, cors);

    const senderById = new Map(senders.map((s) => [s.id, s]));
    const queueById = new Map(queue.map((q) => [q.id, q]));

    // vars dei contatti per la personalizzazione (variabili + spintax al send)
    const contactIds = [...new Set(queue.map((q) => q.contact_id).filter(Boolean))];
    const contactById = new Map<string, any>();
    if (contactIds.length) {
      const { data: cs } = await supabase
        .from("marketing_contacts")
        .select("id,first_name,last_name,company_name,email,phone").in("id", contactIds);
      for (const c of cs || []) contactById.set(c.id, c);
    }

    // 3. assegnazione round-robin entro i cap (logica pura testata)
    const { assignments } = assignSenders(queue.map((q) => q.id), senders as SenderState[], today);
    result.deferred = queue.length - assignments.length;

    const incr = new Map<string, number>(); // invii riusciti per casella in questo tick

    for (const a of assignments) {
      result.processed++;
      const item = queueById.get(a.queueId);
      const sender = senderById.get(a.senderId);
      if (!item || !sender || !item.to_email) { result.skipped++; continue; }

      // lock ottimistico
      await supabase.from("outreach_send_queue").update({ status: "sending" }).eq("id", item.id);
      try {
        const from = sender.display_name ? `${sender.display_name} <${sender.email}>` : sender.email;
        // personalizzazione al send: variabili + spintax, seed stabile per destinatario
        const contact = item.contact_id ? contactById.get(item.contact_id) : null;
        const vars = contact ? contactToVars(contact) : {};
        const seed = hashSeed(item.to_email || item.id);
        // A/Z testing: l'oggetto può contenere più varianti separate da "==="
        const chosen = pickVariant(parseVariants(item.subject || ""), seed);
        const variantIndex = chosen ? chosen.index : null;
        const res = await sendEmailUnified({
          companyId: PLATFORM_COMPANY,
          stream: "marketing",
          to: item.to_email,
          subject: renderTemplate(chosen ? chosen.text : (item.subject || ""), vars, { seed }),
          html: renderTemplate(item.body || "", vars, { seed }),
          senderOverride: { from, replyTo: sender.email, source: "outreach_pool" },
          metadata: { outreach_queue_id: item.id, sender_account_id: sender.id, variant_index: variantIndex },
        });
        if (res && res.ok === false) {
          // recapito non riuscito a livello provider (es. soppresso): non ritentare
          await supabase.from("outreach_send_queue")
            .update({ status: "skipped", sender_account_id: sender.id, last_error: JSON.stringify(res.body ?? "skipped") })
            .eq("id", item.id);
          result.skipped++;
          continue;
        }
        await supabase.from("outreach_send_queue")
          .update({ status: "sent", sent_at: now.toISOString(), sender_account_id: sender.id, variant_index: variantIndex })
          .eq("id", item.id);
        incr.set(sender.id, (incr.get(sender.id) || 0) + 1);
        result.sent++;
      } catch (e) {
        const attempts = (item.attempts || 0) + 1;
        const isFinal = attempts >= (item.max_attempts || 3);
        await supabase.from("outreach_send_queue").update({
          status: isFinal ? "failed" : "queued",
          attempts,
          last_error: e instanceof Error ? e.message : String(e),
        }).eq("id", item.id);
        result.failed++;
      }
    }

    // 4. contatori giornalieri delle caselle (reset implicito se cambia il giorno)
    for (const [sid, n] of incr) {
      const s = senderById.get(sid);
      const base = s && s.daily_sent_date === today ? (s.daily_sent || 0) : 0;
      await supabase.from("outreach_sender_accounts").update({
        daily_sent: base + n, daily_sent_date: today, last_sent_at: now.toISOString(),
      }).eq("id", sid);
    }

    return json(result, 200, cors);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500, cors);
  }
});

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
