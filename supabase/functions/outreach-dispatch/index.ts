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
import { nextEmailStep, computeStepSchedule, applyJitter, type SeqStep } from "../_shared/outreach-sequence.ts";
import {
  isGraphSequence,
  entryNode,
  nodeById,
  nodeType,
  planNextAction,
  type FlowNode,
  type FlowActivity,
} from "../_shared/outreach-flow.ts";
import { channelForNodeType, planChannelSend, hasTemplate, orderTemplateParams, type OutreachChannel } from "../_shared/outreach-channel.ts";
import { sendOnChannel, type OutreachWhatsAppTemplate } from "../_shared/outreachChannelSend.ts";
import { appendTrackingSig, outreachOpenPixelUrl } from "../_shared/emailTrackingSignature.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") || "";
const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";
const BATCH = 200;
// Iscrizioni "chiuse": i loro messaggi in coda non vanno spediti.
const TERMINAL_ENROLLMENT = new Set(["stopped", "completed", "replied", "bounced", "opted_out"]);

/** Tipo iscrizione arricchito col nodo grafo corrente (null = legacy lineare). */
type EnrRow = { id: string; sequence_id: string; current_step: number; current_node_id?: string | null };

/** Colonne step caricate dal dispatcher (cadenza + flusso grafo + template WA). */
const STEP_COLS = "id,step_order,channel,delay_days,delay_hours,subject,body,node_type,condition_type,next_default,next_alt,template_name,template_language,template_params";

/**
 * Ferma l'iscrizione se il contatto non è (più) contattabile. Ritorna true se ha
 * fermato (il chiamante non deve accodare nulla). Condivisa legacy/grafo.
 */
async function stopIfUncontactable(supabase: any, enrId: string, contact: any): Promise<boolean> {
  if (contact?.email && !contact?.optout_email) return false;
  await supabase.from("outreach_enrollments").update({
    status: contact?.optout_email ? "opted_out" : "stopped",
    next_action_at: null,
    stop_reason: contact?.optout_email ? "optout_email" : "no_email",
  }).eq("id", enrId);
  return true;
}

/**
 * Segnali del destinatario per le condizioni del grafo:
 *   • lastEmailOpened: l'ULTIMA riga 'sent' di questo enrollment ha open_count>0
 *     (richiede track_opens; senza dato = non aperto).
 *   • hasReply: esiste una risposta legata all'enrollment (outreach_replies).
 * Best-effort: su errore (colonne assenti pre-migrazione) ricade su segnali falsi.
 */
async function computeActivity(supabase: any, enrId: string): Promise<FlowActivity> {
  let lastEmailOpened = false;
  let hasReply = false;
  try {
    const { data: lastSent } = await supabase
      .from("outreach_send_queue")
      .select("open_count")
      .eq("enrollment_id", enrId).eq("status", "sent")
      .order("sent_at", { ascending: false }).limit(1).maybeSingle();
    lastEmailOpened = (lastSent?.open_count ?? 0) > 0;
  } catch { /* tracking assente → non aperto */ }
  try {
    const { data: rep } = await supabase
      .from("outreach_replies").select("id").eq("enrollment_id", enrId).limit(1).maybeSingle();
    hasReply = !!rep?.id;
  } catch { /* tabella/colonna assente → nessuna risposta */ }
  return { lastEmailOpened, hasReply };
}

/**
 * Accoda l'azione pianificata dal grafo (send o advance) e aggiorna il nodo
 * corrente dell'iscrizione. 'send' → riga email spedibile (come legacy); 'advance'
 * → riga di SOLO instradamento differito (per i nodi 'wait'): non viene spedita,
 * il dispatcher la riprende a scadenza e continua la traversata.
 */
async function enqueuePlanned(
  supabase: any,
  enr: EnrRow,
  contact: any,
  node: FlowNode,
  kind: "send" | "advance",
  delayDays: number,
  delayHours: number,
  baseAt: Date,
  brandId: string | null,
): Promise<void> {
  const when = computeStepSchedule(baseAt, delayDays, delayHours);
  const whenJ = applyJitter(when, 90, Math.random()).toISOString();
  // Canale della riga = canale del nodo d'invio (email/whatsapp/sms). Le righe
  // 'advance' (wait) restano sul canale 'email' (riga di solo instradamento, non
  // spedita: il CHECK su channel è soddisfatto, il pass advance le pesca per kind).
  const ch: OutreachChannel = kind === "send" ? (channelForNodeType(nodeType(node)) ?? "email") : "email";
  const isMsg = ch === "whatsapp" || ch === "sms";
  await supabase.from("outreach_send_queue").insert({
    company_id: PLATFORM_COMPANY,
    enrollment_id: enr.id,
    contact_id: contact.id,
    brand_id: brandId,
    channel: ch,
    kind,
    node_id: node.id,
    // recapito sul campo del canale: email → to_email, whatsapp/sms → to_phone.
    to_email: isMsg ? null : contact.email,
    to_phone: isMsg ? (contact.phone ?? null) : null,
    // SMS/WhatsApp non hanno oggetto; il corpo è il body del nodo (renderizzato al send).
    subject: kind === "send" && ch === "email" ? (node.subject ?? "") : null,
    body: kind === "send" ? (node.body ?? "") : "",
    status: "queued",
    scheduled_for: whenJ,
  });
  await supabase.from("outreach_enrollments")
    .update({ current_step: node.step_order, current_node_id: node.id, next_action_at: whenJ }).eq("id", enr.id);
}

/**
 * Avanza la cadenza a GRAFO dopo aver "consumato" il nodo corrente `fromNodeId`
 * (l'email appena inviata, oppure il wait appena scaduto). Risolve la catena
 * condition/end immediata e accoda l'email successiva (send) o l'instradamento
 * differito del prossimo wait (advance); se la catena finisce → 'completed'.
 */
async function advanceGraph(
  supabase: any,
  enr: EnrRow,
  nodes: FlowNode[],
  fromNodeId: string | null,
  contact: any,
  baseAt: Date,
  brandId: string | null,
): Promise<void> {
  const fromNode = nodeById(nodes, fromNodeId);
  // successore: next_default del nodo consumato (le email/wait hanno un solo
  // successore; le condition sono già state risolte dentro planNextAction quando
  // sono il punto di partenza — ma qui partiamo sempre da un email o un wait).
  const startId = fromNode?.next_default ?? null;
  const activity = await computeActivity(supabase, enr.id);
  const plan = planNextAction(nodes, startId, activity);
  if (plan.aborted) {
    console.warn("[outreach-dispatch] guardia anti-loop grafo: completo enrollment", enr.id);
  }
  if (plan.kind === "complete" || !plan.node) {
    await supabase.from("outreach_enrollments")
      .update({ status: "completed", current_node_id: fromNode?.id ?? enr.current_node_id ?? null, next_action_at: null })
      .eq("id", enr.id);
    return;
  }
  // Un'EMAIL da spedire richiede un contatto contattabile via email (gate legacy).
  // I nodi messaggio (whatsapp/sms) NON usano l'email: il loro requisito (telefono
  // presente, opt-out di canale) è valutato al momento dell'invio nel pass dedicato,
  // dove un telefono mancante → skip + avanzamento (non si ferma l'iscrizione).
  // Un 'advance' (wait) non richiede contattabilità.
  const planChannel = plan.kind === "send" ? channelForNodeType(nodeType(plan.node)) : null;
  if (plan.kind === "send" && planChannel === "email" && await stopIfUncontactable(supabase, enr.id, contact)) return;
  await enqueuePlanned(supabase, enr, contact, plan.node, plan.kind, plan.delayDays, plan.delayHours, baseAt, brandId);
}

/**
 * Avanza la cadenza dopo un invio riuscito. Sceglie la traversata:
 *   • GRAFO   se la sequenza ha rami (next_*) o l'iscrizione ha già current_node_id
 *             → segue i nodi (email/wait/condition/end).
 *   • LINEARE (legacy) altrimenti → percorso step_order ATTUALE, invariato.
 */
async function advanceEnrollment(
  supabase: any,
  enr: EnrRow,
  contact: any,
  sentAt: Date,
  brandId: string | null,
): Promise<void> {
  const { data: stepsRaw } = await supabase
    .from("outreach_sequence_steps")
    .select(STEP_COLS)
    .eq("sequence_id", enr.sequence_id).order("step_order", { ascending: true });
  const nodes = (stepsRaw || []) as FlowNode[];

  // Routing grafo vs legacy: zero regressioni sul lineare.
  if (isGraphSequence(nodes) || enr.current_node_id) {
    // Nodo appena inviato: quello tracciato (current_node_id) o, al primo passo
    // di una sequenza a grafo ancora "legacy-enrolled", l'entry node.
    const fromId = enr.current_node_id ?? entryNode(nodes)?.id ?? null;
    await advanceGraph(supabase, enr, nodes, fromId, contact, sentAt, brandId);
    return;
  }

  // ── Percorso LINEARE legacy (invariato) ──────────────────────────────────
  const next = nextEmailStep(nodes as unknown as SeqStep[], enr.current_step);
  if (!next) {
    await supabase.from("outreach_enrollments")
      .update({ status: "completed", next_action_at: null }).eq("id", enr.id);
    return;
  }
  if (await stopIfUncontactable(supabase, enr.id, contact)) return;
  const when = computeStepSchedule(sentAt, next.delay_days, next.delay_hours);
  // Jitter umano: spalma il follow-up su una finestra di 0..90 min così i passi
  // successivi non partono tutti allo stesso minuto. La finestra di invio resta a valle.
  const whenJ = applyJitter(when, 90, Math.random()).toISOString();
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
    scheduled_for: whenJ,
  });
  await supabase.from("outreach_enrollments")
    .update({ current_step: next.step_order, next_action_at: whenJ }).eq("id", enr.id);
}

/**
 * PASS GRAFO — instradamenti differiti (righe 'advance' dovute). Una riga
 * 'advance' viene creata quando la traversata incontra un nodo 'wait': scaduto il
 * delay, qui riprendiamo il grafo DAL wait (node_id), valutando le condizioni a
 * valle con segnali aggiornati (aperture/risposte maturate nel frattempo).
 *
 * Per ogni riga: gate iscrizione (pausa→lascia in coda; terminale→annulla;
 * opt-out→ferma), poi marca la riga 'sent' (consumata, idempotenza anti-doppio) e
 * chiama advanceGraph. NON spedisce nulla. Best-effort: il chiamante cattura
 * l'errore se la colonna 'kind' non esiste (pre-migrazione).
 */
async function processAdvanceQueue(
  supabase: any,
  now: Date,
  result: { processed: number; deferred: number; skipped: number },
): Promise<void> {
  const { data: rows, error } = await supabase
    .from("outreach_send_queue")
    .select("id, enrollment_id, contact_id, brand_id, node_id")
    .eq("status", "queued").eq("kind", "advance")
    .lte("scheduled_for", now.toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(BATCH);
  if (error) throw error; // 'kind' assente → gestito dal chiamante
  if (!rows || rows.length === 0) return;

  // carica iscrizioni, contatti e step delle sequenze coinvolte
  const enrIds = [...new Set(rows.map((r: any) => r.enrollment_id).filter(Boolean))];
  const enrById = new Map<string, EnrRow & { status: string }>();
  if (enrIds.length) {
    const { data: es } = await supabase.from("outreach_enrollments")
      .select("id,status,sequence_id,current_step,current_node_id").in("id", enrIds);
    for (const e of es || []) enrById.set(e.id, e);
  }
  const contactIds = [...new Set(rows.map((r: any) => r.contact_id).filter(Boolean))];
  const contactById = new Map<string, any>();
  if (contactIds.length) {
    // phone incluso: dopo un 'wait' la traversata può portare a un nodo whatsapp/sms,
    // e enqueuePlanned ha bisogno del telefono per popolare to_phone della riga.
    const { data: cs } = await supabase.from("marketing_contacts")
      .select("id,email,phone,optout_email").in("id", contactIds);
    for (const c of cs || []) contactById.set(c.id, c);
  }
  const seqIds = [...new Set([...enrById.values()].map((e) => e.sequence_id).filter(Boolean))];
  const nodesBySeq = new Map<string, FlowNode[]>();
  if (seqIds.length) {
    const { data: steps } = await supabase.from("outreach_sequence_steps")
      .select(STEP_COLS).in("sequence_id", seqIds).order("step_order", { ascending: true });
    for (const s of (steps || []) as any[]) {
      const arr = nodesBySeq.get(s.sequence_id) ?? [];
      arr.push(s as FlowNode);
      nodesBySeq.set(s.sequence_id, arr);
    }
  }

  for (const row of rows) {
    result.processed++;
    const enr = row.enrollment_id ? enrById.get(row.enrollment_id) : null;
    if (!enr) {
      await supabase.from("outreach_send_queue")
        .update({ status: "cancelled", last_error: "advance senza enrollment" }).eq("id", row.id);
      result.skipped++;
      continue;
    }
    if (enr.status === "paused") { result.deferred++; continue; } // resta in coda
    if (TERMINAL_ENROLLMENT.has(enr.status)) {
      await supabase.from("outreach_send_queue")
        .update({ status: "cancelled", last_error: `enrollment ${enr.status}` }).eq("id", row.id);
      result.skipped++;
      continue;
    }
    const contact = row.contact_id ? contactById.get(row.contact_id) : null;
    // consuma la riga (idempotenza: una sola volta), poi continua la traversata.
    await supabase.from("outreach_send_queue")
      .update({ status: "sent", sent_at: now.toISOString() }).eq("id", row.id);
    try {
      const nodes = nodesBySeq.get(enr.sequence_id) ?? [];
      // riprendiamo DAL nodo 'wait' (row.node_id): advanceGraph parte dal suo
      // next_default e risolve le condizioni a valle.
      await advanceGraph(supabase, { ...enr }, nodes, row.node_id ?? enr.current_node_id ?? null, contact, now, row.brand_id ?? null);
    } catch (e) {
      console.warn("[outreach-dispatch] advance grafo fallito:", e instanceof Error ? e.message : e);
    }
  }
}

/**
 * PASS MULTICANALE — righe d'invio NON-email dovute (channel in 'whatsapp'|'sms',
 * kind='send'). Speculare al pass email ma SENZA casella/pool/warm-up: il mittente
 * è il numero del provider (Telnyx/Meta), gestito da outreachChannelSend.
 *
 * Per ogni riga: gate iscrizione (pausa→lascia in coda; terminale→annulla), poi
 * planChannelSend (telefono presente? opt-out di canale?):
 *   • non spedibile (telefono mancante / opt-out) → riga 'skipped' con last_error +
 *     AVANZA la cadenza (il telefono mancante NON deve bloccare la sequenza);
 *   • spedibile → lock 'sending', render del body (variabili+spintax), invio via
 *     provider; ok → 'sent' + advanceEnrollment; ko → retry/failed come l'email.
 *
 * Idempotenza: lock ottimistico 'sending' come il pass email. Best-effort: se la
 * colonna 'kind'/'to_phone' non esiste (pre-migrazione) il select fallisce → il
 * chiamante cattura e prosegue col cold email.
 */
async function processMessageChannelQueue(
  supabase: any,
  now: Date,
  result: { processed: number; sent: number; failed: number; skipped: number; deferred: number },
): Promise<void> {
  const { data: rows, error } = await supabase
    .from("outreach_send_queue")
    .select("id, channel, to_phone, body, attempts, max_attempts, contact_id, enrollment_id, brand_id, node_id")
    .eq("status", "queued").eq("kind", "send")
    .in("channel", ["whatsapp", "sms"])
    .lte("scheduled_for", now.toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(BATCH);
  if (error) throw error; // colonna assente (pre-migrazione) → gestito dal chiamante
  if (!rows || rows.length === 0) return;

  // iscrizioni del batch (gate pausa/terminale + advance dopo invio)
  const enrIds = [...new Set(rows.map((r: any) => r.enrollment_id).filter(Boolean))];
  const enrById = new Map<string, EnrRow & { status: string }>();
  if (enrIds.length) {
    let es: any[] | null = null;
    const r = await supabase.from("outreach_enrollments")
      .select("id,status,sequence_id,current_step,current_node_id").in("id", enrIds);
    es = r.error ? null : r.data;
    for (const e of es || []) enrById.set(e.id, e);
  }

  // contatti: telefono + opt-out di canale (skip se mancante/optato)
  const contactIds = [...new Set(rows.map((r: any) => r.contact_id).filter(Boolean))];
  const contactById = new Map<string, any>();
  if (contactIds.length) {
    const { data: cs } = await supabase.from("marketing_contacts")
      .select("id,first_name,last_name,company_name,email,phone,optout_email,optout_sms,optout_whatsapp").in("id", contactIds);
    for (const c of cs || []) contactById.set(c.id, c);
  }

  // Template WhatsApp del nodo (compliance Meta cold): caricato dallo step via node_id.
  // Single source of truth = lo step (nessuna duplicazione sulla coda). Best-effort:
  // se le colonne template_* non esistono (pre-migrazione) il select fallisce → mappa
  // vuota → nessun template → testo libero solo in finestra (comportamento legacy).
  const nodeIds = [...new Set(rows.map((r: any) => r.node_id).filter(Boolean))];
  const templateByNode = new Map<string, { name: string | null; language: string | null; params: any }>();
  if (nodeIds.length) {
    const r = await supabase.from("outreach_sequence_steps")
      .select("id,template_name,template_language,template_params").in("id", nodeIds);
    if (!r.error) {
      for (const s of r.data || []) {
        templateByNode.set(s.id, { name: s.template_name ?? null, language: s.template_language ?? null, params: s.template_params ?? null });
      }
    }
  }

  for (const item of rows) {
    result.processed++;
    const channel = item.channel as OutreachChannel;
    const enr = item.enrollment_id ? enrById.get(item.enrollment_id) : null;
    if (enr) {
      if (enr.status === "paused") { result.deferred++; continue; } // resta in coda
      if (TERMINAL_ENROLLMENT.has(enr.status)) {
        await supabase.from("outreach_send_queue")
          .update({ status: "cancelled", last_error: `enrollment ${enr.status}` }).eq("id", item.id);
        result.skipped++;
        continue;
      }
    }

    const contact = item.contact_id ? contactById.get(item.contact_id) : null;
    // telefono presente + nessun opt-out di canale? Altrimenti SALTA e AVANZA.
    const plan = planChannelSend(channel, contact);
    if (!plan.ok) {
      await supabase.from("outreach_send_queue")
        .update({ status: "skipped", last_error: plan.skipReason ?? "non spedibile" }).eq("id", item.id);
      result.skipped++;
      // la cadenza prosegue: il nodo è stato "consumato" (saltato), si avanza il grafo.
      if (enr) {
        try { await advanceEnrollment(supabase, enr, contact, now, item.brand_id ?? null); }
        catch (e) { console.warn("[outreach-dispatch] advance post-skip msg fallito:", e instanceof Error ? e.message : e); }
      }
      continue;
    }

    // lock ottimistico (idempotenza anti-doppio, come il pass email)
    await supabase.from("outreach_send_queue").update({ status: "sending" }).eq("id", item.id);
    try {
      // personalizzazione al send: variabili + spintax, seed stabile per destinatario.
      // SMS/WhatsApp non hanno oggetto: si invia solo il body renderizzato.
      const vars = contact ? contactToVars(contact) : {};
      const seed = hashSeed(plan.phone || item.id);
      const text = renderTemplate(item.body || "", vars, { seed });
      // Template WhatsApp (compliance Meta cold): se il nodo ne ha uno, costruiamo il
      // payload type:"template" coi parametri renderizzati (variabili del contatto →
      // valore). SMS lo ignora. Senza template, sendOutreachWhatsApp invia testo libero
      // SOLO in finestra 24h (a freddo salta con errore chiaro → si avanza la cadenza).
      let waTemplate: OutreachWhatsAppTemplate | null = null;
      if (channel === "whatsapp" && item.node_id) {
        const tpl = templateByNode.get(item.node_id);
        if (tpl && hasTemplate({ name: tpl.name })) {
          const params = orderTemplateParams(tpl.params).map((p) => renderTemplate(p, vars, { seed }));
          waTemplate = { name: tpl.name as string, language: tpl.language, params };
        }
      }
      const res = await sendOnChannel(supabase, channel === "sms" ? "sms" : "whatsapp", plan.phone, text, waTemplate);
      if (!res.ok) {
        // recapito non riuscito a livello provider: non ritentare (come l'email su ok=false).
        await supabase.from("outreach_send_queue")
          .update({ status: "skipped", to_phone: plan.phone, last_error: (res.error ?? "invio non riuscito").slice(0, 500) })
          .eq("id", item.id);
        result.skipped++;
        // best-effort: avanza comunque la cadenza (il nodo è stato tentato).
        if (enr) {
          try { await advanceEnrollment(supabase, enr, contact, now, item.brand_id ?? null); }
          catch (e) { console.warn("[outreach-dispatch] advance post-skip provider fallito:", e instanceof Error ? e.message : e); }
        }
        continue;
      }
      await supabase.from("outreach_send_queue")
        .update({ status: "sent", sent_at: now.toISOString(), to_phone: plan.phone, last_error: res.providerMessageId ? `mid:${res.providerMessageId}` : null })
        .eq("id", item.id);
      result.sent++;
      if (enr) {
        try { await advanceEnrollment(supabase, enr, contact, now, item.brand_id ?? null); }
        catch (e) { console.warn("[outreach-dispatch] advance post-send msg fallito:", e instanceof Error ? e.message : e); }
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
    // 0. PASS GRAFO — instradamenti differiti dovuti (righe 'advance', tipiche dei
    // nodi 'wait'): NON si spediscono, riprendono la traversata valutando le
    // condizioni con segnali aggiornati. Best-effort: se la colonna 'kind' non
    // esiste (migrazione grafo non applicata) il select fallisce → skip silenzioso.
    try {
      await processAdvanceQueue(supabase, now, result);
    } catch (advErr) {
      // colonna kind assente o errore non fatale: il cold lineare prosegue.
      console.warn("[outreach-dispatch] advance-pass skip:", advErr instanceof Error ? advErr.message : advErr);
    }

    // 0-bis. PASS MULTICANALE — righe d'invio whatsapp/sms dovute (kind='send',
    // channel != email). Gestite a parte dal pass email: mittente del provider,
    // niente casella/warm-up. Telefono mancante/opt-out → skip + avanzamento.
    // Best-effort: se 'kind'/'to_phone' non esiste (pre-migrazione) → skip silenzioso.
    try {
      await processMessageChannelQueue(supabase, now, result);
    } catch (msgErr) {
      console.warn("[outreach-dispatch] message-channel-pass skip:", msgErr instanceof Error ? msgErr.message : msgErr);
    }

    // 1. coda dovuta — SOLO righe spedibili (kind='send'). Le righe 'advance' sono
    // gestite sopra. Filtro tollerante: se 'kind' non esiste ricade su tutte le
    // righe (legacy), che sono comunque send.
    let queue: any[] | null = null;
    {
      const sel = () => supabase
        .from("outreach_send_queue")
        .select("id, to_email, subject, body, attempts, max_attempts, contact_id, enrollment_id, brand_id")
        .eq("status", "queued").eq("channel", "email")
        .lte("scheduled_for", now.toISOString())
        .order("scheduled_for", { ascending: true })
        .limit(BATCH);
      const r = await sel().eq("kind", "send");
      if (r.error) {
        // 'kind' assente (pre-migrazione grafo): riprova senza il filtro.
        const r2 = await sel();
        if (r2.error) throw r2.error;
        queue = r2.data;
      } else {
        queue = r.data;
      }
    }
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
    const enrollmentById = new Map<string, { id: string; status: string; sequence_id: string; current_step: number; current_node_id?: string | null }>();
    if (enrollmentIds.length) {
      // current_node_id (grafo) caricato in modo tollerante: se la colonna non
      // esiste (pre-migrazione) ricade sul select base → percorso legacy.
      let es: any[] | null = null;
      const r = await supabase.from("outreach_enrollments")
        .select("id,status,sequence_id,current_step,current_node_id").in("id", enrollmentIds);
      if (r.error) {
        const r2 = await supabase.from("outreach_enrollments")
          .select("id,status,sequence_id,current_step").in("id", enrollmentIds);
        es = r2.data;
      } else {
        es = r.data;
      }
      for (const e of es || []) enrollmentById.set(e.id, e);
    }

    // Open-tracking per-sequenza (opt-in, default OFF). Carichiamo track_opens per
    // le sequenze del batch: il pixel verrà iniettato SOLO per gli invii la cui
    // sequenza ha track_opens=true. Best-effort: se la colonna manca (migrazione
    // 20270821000000 non applicata) il select fallisce → la mappa resta vuota →
    // nessun pixel ovunque (comportamento cold sicuro).
    const trackOpensBySequence = new Map<string, boolean>();
    const sequenceIds = [...new Set([...enrollmentById.values()].map((e) => e.sequence_id).filter(Boolean))];
    if (sequenceIds.length) {
      const { data: seqs } = await supabase
        .from("outreach_sequences").select("id,track_opens").in("id", sequenceIds);
      for (const s of seqs || []) trackOpensBySequence.set(s.id, s.track_opens === true);
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
        // Open-tracking (opt-in, default OFF): inietta il pixel 1×1 firmato SOLO se la
        // sequenza dell'invio ha track_opens=true. Senza enrollment/sequenza, o con
        // track_opens=false → nessun pixel (cold protetto). outreachOpenPixelUrl ritorna
        // null anche se EMAIL_TRACKING_SECRET manca (fail-safe): in quel caso log + invio
        // prosegue senza pixel, mai blocchiamo lo spedito.
        const seqIdForItem = enr?.sequence_id ?? null;
        const trackOpens = seqIdForItem ? (trackOpensBySequence.get(seqIdForItem) ?? false) : false;
        if (trackOpens) {
          const pixelUrl = await outreachOpenPixelUrl(`${SUPABASE_URL}/functions/v1`, item.id);
          if (pixelUrl) {
            html += `<img src="${pixelUrl}" alt="" width="1" height="1" style="display:none;width:1px;height:1px;border:0;overflow:hidden" />`;
          } else {
            console.warn("[outreach-dispatch] track_opens attivo ma EMAIL_TRACKING_SECRET assente — pixel non iniettato per", item.id);
          }
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
