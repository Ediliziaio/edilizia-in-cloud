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
import { isWithinSendWindow, parseSendWindow, type SendWindow } from "../_shared/outreach-schedule.ts";
import { parseVariants, pickVariant } from "../_shared/outreach-abz.ts";
import { nextEmailStep, computeStepSchedule, type SeqStep } from "../_shared/outreach-sequence.ts";
import { appendTrackingSig } from "../_shared/emailTrackingSignature.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") || "";
const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";
const BATCH = 200;
// Iscrizioni "chiuse": i loro messaggi in coda non vanno spediti.
const TERMINAL_ENROLLMENT = new Set(["stopped", "completed", "replied", "bounced", "opted_out"]);

/**
 * Avanza la cadenza dopo un invio riuscito: accoda il prossimo step email
 * (a sent_at + delay) oppure marca l'iscrizione 'completed'. Se nel frattempo
 * manca l'email o è arrivato un opt-out, ferma l'iscrizione.
 */
async function advanceEnrollment(
  supabase: any,
  enr: { id: string; sequence_id: string; current_step: number },
  contact: any,
  sentAt: Date,
  brandId: string | null,
): Promise<void> {
  const { data: stepsRaw } = await supabase
    .from("outreach_sequence_steps")
    .select("step_order,channel,delay_days,delay_hours,subject,body")
    .eq("sequence_id", enr.sequence_id).order("step_order", { ascending: true });
  const next = nextEmailStep((stepsRaw || []) as SeqStep[], enr.current_step);
  if (!next) {
    await supabase.from("outreach_enrollments")
      .update({ status: "completed", next_action_at: null }).eq("id", enr.id);
    return;
  }
  if (!contact?.email || contact?.optout_email) {
    await supabase.from("outreach_enrollments").update({
      status: contact?.optout_email ? "opted_out" : "stopped",
      next_action_at: null,
      stop_reason: contact?.optout_email ? "optout_email" : "no_email",
    }).eq("id", enr.id);
    return;
  }
  const when = computeStepSchedule(sentAt, next.delay_days, next.delay_hours).toISOString();
  await supabase.from("outreach_send_queue").insert({
    company_id: PLATFORM_COMPANY,
    enrollment_id: enr.id,
    contact_id: contact.id,
    brand_id: brandId,
    channel: "email",
    to_email: contact.email,
    subject: next.subject ?? "",
    body: next.body ?? "",
    status: "queued",
    scheduled_for: when,
  });
  await supabase.from("outreach_enrollments")
    .update({ current_step: next.step_order, next_action_at: when }).eq("id", enr.id);
}

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

  // finestra di invio configurabile (platform_settings.outreach_send_window);
  // default Lun-Ven 8-19 Europe/Rome. Niente cold di notte o nel weekend.
  let sendWindow: SendWindow | undefined;
  try {
    const { data: ws } = await supabase
      .from("platform_settings").select("value").eq("key", "outreach_send_window").maybeSingle();
    if (ws?.value) sendWindow = parseSendWindow(ws.value);
  } catch { /* default */ }
  if (!isWithinSendWindow(now, sendWindow)) {
    return json({ ...result, note: "fuori finestra di invio" }, 200, cors);
  }

  try {
    // 1. coda dovuta
    const { data: queue, error: qErr } = await supabase
      .from("outreach_send_queue")
      .select("id, to_email, subject, body, attempts, max_attempts, contact_id, enrollment_id, brand_id")
      .eq("status", "queued").eq("channel", "email")
      .lte("scheduled_for", now.toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(BATCH);
    if (qErr) throw qErr;
    if (!queue || queue.length === 0) return json({ ...result, note: "coda vuota" }, 200, cors);

    // 2. caselle del pool
    const { data: sendersRaw, error: sErr } = await supabase
      .from("outreach_sender_accounts")
      .select("id,status,daily_cap_target,warmup_base,warmup_step,warmup_day,daily_sent,daily_sent_date,email,display_name,brand_id,provider,smtp_host,smtp_port,smtp_secure,smtp_username,secret_ref")
      .in("status", ["active", "warming"]);
    if (sErr) throw sErr;
    const senders = (sendersRaw || []) as any[];
    if (senders.length === 0) return json({ ...result, note: "nessuna casella attiva" }, 200, cors);

    const senderById = new Map(senders.map((s) => [s.id, s]));
    const queueById = new Map(queue.map((q) => [q.id, q]));

    // identità per brand (from_name / reply_to override) + firma e indirizzo footer
    const { data: brandsRaw } = await supabase.from("outreach_brands").select("id,from_name,reply_to,signature,footer_address");
    const brandById = new Map<string, { from_name: string | null; reply_to: string | null; signature: string | null; footer_address: string | null }>();
    for (const b of brandsRaw || []) brandById.set(b.id, b);

    // vars dei contatti per la personalizzazione (variabili + spintax al send)
    const contactIds = [...new Set(queue.map((q) => q.contact_id).filter(Boolean))];
    const contactById = new Map<string, any>();
    if (contactIds.length) {
      const { data: cs } = await supabase
        .from("marketing_contacts")
        .select("id,first_name,last_name,company_name,email,phone,optout_email").in("id", contactIds);
      for (const c of cs || []) contactById.set(c.id, c);
    }

    // stato iscrizioni del batch: non spedire se in pausa (resta in coda) o terminata (annulla)
    const enrollmentIds = [...new Set(queue.map((q) => q.enrollment_id).filter(Boolean))];
    const enrollmentById = new Map<string, { id: string; status: string; sequence_id: string; current_step: number }>();
    if (enrollmentIds.length) {
      const { data: es } = await supabase
        .from("outreach_enrollments")
        .select("id,status,sequence_id,current_step").in("id", enrollmentIds);
      for (const e of es || []) enrollmentById.set(e.id, e);
    }

    // 3. assegnazione round-robin PER BRAND: ogni item è spedito SOLO dalle
    // caselle del suo brand (pool isolati → reputazione separata). Item e caselle
    // senza brand condividono il pool "__none__".
    const bkey = (b: string | null | undefined) => b ?? "__none__";
    const sendersByBrand = new Map<string, SenderState[]>();
    for (const s of senders) {
      const k = bkey(s.brand_id);
      const arr = sendersByBrand.get(k) ?? [];
      arr.push(s as SenderState);
      sendersByBrand.set(k, arr);
    }
    const assignments: Array<{ queueId: string; senderId: string }> = [];
    const itemsByBrand = new Map<string, string[]>();
    for (const q of queue) {
      const k = bkey(q.brand_id);
      const arr = itemsByBrand.get(k) ?? [];
      arr.push(q.id);
      itemsByBrand.set(k, arr);
    }
    for (const [brand, ids] of itemsByBrand) {
      const brandSenders = sendersByBrand.get(brand) ?? [];
      if (brandSenders.length === 0) { result.deferred += ids.length; continue; } // nessuna casella per quel brand
      const r = assignSenders(ids, brandSenders, today);
      assignments.push(...r.assignments);
      result.deferred += ids.length - r.assignments.length;
    }

    const incr = new Map<string, number>(); // invii riusciti per casella in questo tick

    for (const a of assignments) {
      result.processed++;
      const item = queueById.get(a.queueId);
      const sender = senderById.get(a.senderId);
      if (!item || !sender || !item.to_email) { result.skipped++; continue; }

      // gating iscrizione: pausa → resta in coda; terminata → annulla; opt-out → ferma
      const enr = item.enrollment_id ? enrollmentById.get(item.enrollment_id) : null;
      if (enr) {
        if (enr.status === "paused") { result.deferred++; continue; }
        if (TERMINAL_ENROLLMENT.has(enr.status)) {
          await supabase.from("outreach_send_queue")
            .update({ status: "cancelled", last_error: `enrollment ${enr.status}` }).eq("id", item.id);
          result.skipped++;
          continue;
        }
      }
      const contactPre = item.contact_id ? contactById.get(item.contact_id) : null;
      if (contactPre?.optout_email) {
        await supabase.from("outreach_send_queue")
          .update({ status: "cancelled", last_error: "optout_email" }).eq("id", item.id);
        if (enr) await supabase.from("outreach_enrollments")
          .update({ status: "opted_out", next_action_at: null, stop_reason: "optout_email" }).eq("id", enr.id);
        result.skipped++;
        continue;
      }

      // lock ottimistico
      await supabase.from("outreach_send_queue").update({ status: "sending" }).eq("id", item.id);
      try {
        const brand = sender.brand_id ? brandById.get(sender.brand_id) : null;
        const fromName = brand?.from_name || sender.display_name;
        const from = fromName ? `${fromName} <${sender.email}>` : sender.email;
        const replyTo = brand?.reply_to || sender.email;
        // personalizzazione al send: variabili + spintax, seed stabile per destinatario
        const contact = item.contact_id ? contactById.get(item.contact_id) : null;
        const vars = contact ? contactToVars(contact) : {};
        const seed = hashSeed(item.to_email || item.id);
        // A/Z testing: l'oggetto può contenere più varianti separate da "==="
        const chosen = pickVariant(parseVariants(item.subject || ""), seed);
        const variantIndex = chosen ? chosen.index : null;
        // Unsubscribe firmato (HMAC; legacy-mode senza secret) + header List-Unsubscribe:
        // compliance/deliverability del cold. Serve il contatto (rid) per la soppressione.
        let html = renderTemplate(item.body || "", vars, { seed });
        // firma del brand (sign-off): passa da renderTemplate → supporta variabili/spintax
        if (brand?.signature) {
          html += `<br><br>${renderTemplate(brand.signature, vars, { seed })}`;
        }
        // footer compliance: indirizzo postale (CAN-SPAM) + disiscrizione
        let unsubscribeUrl: string | undefined;
        if (item.contact_id) {
          unsubscribeUrl = await appendTrackingSig(
            `${SUPABASE_URL}/functions/v1/email-tracking?type=unsub&rid=${item.contact_id}&co=${PLATFORM_COMPANY}`,
            { co: PLATFORM_COMPANY, rid: item.contact_id, type: "unsub" },
          );
        }
        const addr = brand?.footer_address ? `${brand.footer_address} · ` : "";
        const unsubHtml = item.contact_id ? `Non vuoi più ricevere queste email? <a href="${unsubscribeUrl}" style="color:#9ca3af">Disiscriviti</a>.` : "";
        if (addr || unsubHtml) {
          html += `<p style="font-size:11px;color:#9ca3af;margin-top:24px">${addr}${unsubHtml}</p>`;
        }
        // Casella SMTP reale: instrada l'invio sul suo server (la password sta in
        // Vault, recuperata via RPC). Caselle EE legacy: mailboxOverride resta
        // undefined → comportamento invariato (invio via API Elastic Email).
        let mailboxOverride: { host: string; port: number; secure: boolean; username: string; password: string } | undefined;
        if (sender.provider === "smtp" && sender.secret_ref) {
          const { data: pwd } = await supabase.rpc("outreach_mailbox_secret", { p_ref: sender.secret_ref });
          if (pwd && sender.smtp_host && sender.smtp_port) {
            mailboxOverride = { host: sender.smtp_host, port: sender.smtp_port, secure: sender.smtp_secure ?? true, username: sender.smtp_username ?? sender.email, password: pwd as string };
          }
        }
        const res = await sendEmailUnified({
          companyId: PLATFORM_COMPANY,
          stream: "marketing",
          to: item.to_email,
          subject: renderTemplate(chosen ? chosen.text : (item.subject || ""), vars, { seed }),
          html,
          senderOverride: { from, replyTo, source: "outreach_pool" },
          mailboxOverride,
          metadata: { outreach_queue_id: item.id, sender_account_id: sender.id, variant_index: variantIndex, unsubscribe_url: unsubscribeUrl },
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
        // avanza la cadenza: prossimo step email o completamento iscrizione
        if (enr) {
          try { await advanceEnrollment(supabase, enr, contactById.get(item.contact_id), now, item.brand_id ?? null); }
          catch (advErr) { console.warn("[outreach-dispatch] advance fallito:", advErr instanceof Error ? advErr.message : advErr); }
        }
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
