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
import { assignSenders, dailyCapWithVariance, remainingToday, sentToday, type SenderState } from "../_shared/outreach-dispatch-logic.ts";
import { renderTemplate, contactToVars, hashSeed, htmlToPlainText } from "../_shared/outreach-template.ts";
import { isWithinSendWindow, parseSendWindow, type SendWindow } from "../_shared/outreach-schedule.ts";
import { parseVariants, pickVariant } from "../_shared/outreach-abz.ts";
import { nextEmailStep, computeStepSchedule, applyJitter, spostaFuoriWeekend, type SeqStep } from "../_shared/outreach-sequence.ts";
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
import { lintEmail, puoPartire } from "../_shared/outreach-linter.ts";
import { getPlatformSetting } from "../_shared/getPlatformSetting.ts";
import { buildFollowupHeaders, type SentStep } from "../_shared/outreach-threading.ts";
import { pauseBetweenSendsMs } from "../_shared/outreach-spread.ts";
import { sendViaNativeSender, isNativeProvider, getOauthAccessToken } from "../_shared/outreachMailboxSend.ts";
import { alertOutreach, logRun } from "../_shared/outreachAlert.ts";

import { serveConMetriche } from "../_shared/withMetrics.ts";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("PROACTIVE_CRON_SECRET") || "";
const PLATFORM_COMPANY = "00000000-0000-0000-0000-000000000001";

/**
 * Distingue un guasto DELL'ACCOUNT da un rifiuto DEL DESTINATARIO.
 *
 * Perché esiste: il 25/07/2026 il piano Elastic Email è scaduto e il provider
 * ha risposto "Your plan expired" a ogni invio. Il codice trattava quella
 * risposta come un rifiuto del destinatario: 200 righe marcate 'skipped' e —
 * molto peggio — 200 iscrizioni chiuse con stop_reason='send_rejected'.
 * Rinnovare il piano non le avrebbe fatte ripartire: 200 prospect persi per
 * un problema di fatturazione, in silenzio.
 *
 * Un guasto di account NON è colpa del contatto: la riga resta in coda,
 * l'iscrizione resta viva, il tick si ferma (inutile bruciare le altre 199) e
 * la casella va in connection_status='error', che il pannello Caselle mostra
 * già in rosso con il messaggio del provider.
 */
function isAccountLevelFailure(body: unknown): string | null {
  const txt = (typeof body === "string" ? body : JSON.stringify(body ?? "")).toLowerCase();
  const segnali = [
    "plan expired", "plan_expired", "renew your account", "subscription",
    "insufficient credit", "not enough credit", "quota exceeded", "over quota",
    "account disabled", "account suspended", "unauthorized", "invalid api key",
    "authentication failed", "payment required", "billing",
    // SMTP/OAuth delle caselle proprie: Gmail e Microsoft NON dicono "authentication failed"
    "username and password not accepted", "authentication unsuccessful", "invalid credentials",
    "invalid login", "smtp_unexpected: 535", "smtp_unexpected: 534", "smtp_unexpected: 530",
    "token_refresh_failed", "invalid_grant", "refresh_token_missing", "oauth_not_configured",
    "gmail_send_401", "gmail_send_403", "gmail_send_429", "outlook_send_401", "outlook_send_403", "outlook_send_429",
  ];
  const hit = segnali.find((s) => txt.includes(s));
  return hit ? (typeof body === "string" ? body : JSON.stringify(body)).slice(0, 300) : null;
}

/**
 * Gruppo MX del dominio destinatario, con cache su outreach_mx_map.
 *
 * Perche' serve: nel B2B edile italiano cinquanta domini destinatari diversi
 * risolvono spesso sullo STESSO server. edilrossi.it, costruzionibianchi.it e
 * impresaverdi.it stanno tutti su mx.aruba.it. Il nostro sistema crede di aver
 * contattato cinquanta aziende; Aruba vede cinquanta messaggi dallo stesso IP
 * in un'ora, cioe' esattamente il pattern di un attacco spam.
 *
 * Il limite quindi non va messo per dominio destinatario ma per SERVER di
 * destinazione. La mappa si popola da sola al primo invio verso ogni dominio.
 */
async function mxGroupDi(supabase: any, dominio: string): Promise<string> {
  try {
    const { data } = await supabase.from("outreach_mx_map").select("mx_group").eq("email_domain", dominio).maybeSingle();
    if (data?.mx_group) return String(data.mx_group);
  } catch { /* prosegue con la risoluzione */ }

  let host: string | null = null;
  try {
    const rec = await Deno.resolveDns(dominio, "MX");
    host = rec.sort((a, b) => a.preference - b.preference)[0]?.exchange ?? null;
  } catch { /* dominio senza MX o DNS irraggiungibile */ }

  const { data: g } = await supabase.rpc("outreach_mx_group_of", { p_host: host });
  const gruppo = String(g ?? "altro");
  try {
    await supabase.from("outreach_mx_map")
      .upsert({ email_domain: dominio, mx_host: host, mx_group: gruppo, risolto_at: new Date().toISOString() },
              { onConflict: "email_domain" });
  } catch { /* la cache e' un'ottimizzazione, non un requisito */ }
  return gruppo;
}
// Batch per tick: tenuto basso perché il loop invii è sequenziale e ogni item
// costa più roundtrip DB (+ handshake SMTP per le caselle proprie). Con 100 e il
// time-budget sotto, un tick chiude sempre entro il limite 150s della edge.
const BATCH = 100;
// Budget di tempo del tick: sopra questa soglia interrompiamo il loop e usciamo
// puliti (le righe non ancora prese restano 'queued' per il tick successivo).
// Sotto il limite 150s della edge function, con margine per l'update finale.
const TICK_BUDGET_MS = 110_000;
// Righe rimaste 'sending' oltre questa età = orfane (tick precedente ucciso dal
// timeout o crashato): il reaper le rimette in coda così non si perdono.
const REAP_STUCK_MS = 15 * 60_000;
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
    // Le autorisposte (fuori sede, mailer-daemon) non sono "ha risposto".
    const { data: rep } = await supabase
      .from("outreach_replies").select("id").eq("enrollment_id", enrId)
      .or("intent.is.null,intent.neq.auto_reply").limit(1).maybeSingle();
    hasReply = !!rep?.id;
  } catch { /* tabella/colonna assente → nessuna risposta */ }
  return { lastEmailOpened, hasReply };
}

/** Passi email gia' spediti di un'iscrizione, in ordine: servono al threading dei follow-up. */
async function inviatiPrecedenti(supabase: any, enrId: string): Promise<SentStep[]> {
  try {
    const { data } = await supabase
      .from("outreach_send_queue")
      .select("message_id,subject,provider_thread_id,sent_at,sender_account_id")
      .eq("enrollment_id", enrId).eq("status", "sent").eq("channel", "email").eq("kind", "send")
      .order("sent_at", { ascending: true });
    return ((data ?? []) as any[]).map((r) => ({
      messageId: r.message_id ?? null, subject: r.subject ?? null, threadId: r.provider_thread_id ?? null, senderId: r.sender_account_id ?? null,
    }));
  } catch { return []; }
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
  // Jitter umano: 2..90 min al SECONDO (non sul minuto tondo) → i follow-up non
  // partono tutti allo stesso minuto del tick. Finestra business applicata a valle.
  const whenJ = spostaFuoriWeekend(applyJitter(when, 90, Math.random(), { minMinutes: 2, stepSeconds: 1 })).toISOString();
  // Canale della riga = canale del nodo d'invio (email/whatsapp/sms). Le righe
  // 'advance' (wait) restano sul canale 'email' (riga di solo instradamento, non
  // spedita: il CHECK su channel è soddisfatto, il pass advance le pesca per kind).
  const ch: OutreachChannel = kind === "send" ? (channelForNodeType(nodeType(node)) ?? "email") : "email";
  // whatsapp/sms/call recapitano sul TELEFONO (to_phone); email su to_email.
  const isMsg = ch === "whatsapp" || ch === "sms" || ch === "call";
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
  // Jitter umano: spalma il follow-up su 2..90 min al SECONDO così i passi successivi
  // non partono tutti allo stesso minuto del tick. La finestra di invio resta a valle.
  const whenJ = spostaFuoriWeekend(applyJitter(when, 90, Math.random(), { minMinutes: 2, stepSeconds: 1 })).toISOString();
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

    // CLAIM ATOMICO (compare-and-swap), come il pass email: passa a 'sending'
    // solo se ancora 'queued'; 0 righe aggiornate = già preso da un altro run → skip.
    const { data: claimedMsg } = await supabase.from("outreach_send_queue")
      .update({ status: "sending" }).eq("id", item.id).eq("status", "queued").select("id");
    if (!claimedMsg || claimedMsg.length === 0) { result.skipped++; continue; }
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

/**
 * PASS CALL — righe 'call' dovute (kind='send', channel='call'). Un nodo 'call'
 * NON invia nulla: crea un promemoria di chiamata in outreach_call_tasks per il
 * commerciale, poi AVANZA la cadenza (identico agli altri canali).
 *
 * Per ogni riga: gate iscrizione (pausa→lascia; terminale→annulla), poi
 * planChannelSend('call', contact) — serve un telefono e nessun optout_call:
 *   • non azionabile (telefono mancante / optout_call) → 'skipped' + advance;
 *   • azionabile → lock 'sending', INSERT del task chiamata (note = body del
 *     nodo renderizzato), riga 'done_task' → 'sent', advance.
 *
 * Non tocca provider/casella/warm-up. Isolato dal pass email (channel='call' non
 * viene mai pescato dal select email). Best-effort: se channel 'call' non è
 * ammesso (pre-migrazione) il select non trova righe → no-op.
 */
async function processCallQueue(
  supabase: any,
  now: Date,
  result: { processed: number; sent: number; failed: number; skipped: number; deferred: number },
): Promise<void> {
  const { data: rows, error } = await supabase
    .from("outreach_send_queue")
    .select("id, to_phone, body, contact_id, enrollment_id, brand_id, node_id")
    .eq("status", "queued").eq("kind", "send").eq("channel", "call")
    .lte("scheduled_for", now.toISOString())
    .order("scheduled_for", { ascending: true })
    .limit(BATCH);
  if (error) throw error;
  if (!rows || rows.length === 0) return;

  const enrIds = [...new Set(rows.map((r: any) => r.enrollment_id).filter(Boolean))];
  const enrById = new Map<string, EnrRow & { status: string }>();
  if (enrIds.length) {
    const r = await supabase.from("outreach_enrollments")
      .select("id,status,sequence_id,current_step,current_node_id").in("id", enrIds);
    for (const e of (r.error ? [] : r.data) || []) enrById.set(e.id, e);
  }

  const contactIds = [...new Set(rows.map((r: any) => r.contact_id).filter(Boolean))];
  const contactById = new Map<string, any>();
  if (contactIds.length) {
    const { data: cs } = await supabase.from("marketing_contacts")
      .select("id,first_name,last_name,company_name,email,phone,optout_call").in("id", contactIds);
    for (const c of cs || []) contactById.set(c.id, c);
  }

  for (const item of rows) {
    result.processed++;
    const enr = item.enrollment_id ? enrById.get(item.enrollment_id) : null;
    if (enr) {
      if (enr.status === "paused") { result.deferred++; continue; }
      if (TERMINAL_ENROLLMENT.has(enr.status)) {
        await supabase.from("outreach_send_queue")
          .update({ status: "cancelled", last_error: `enrollment ${enr.status}` }).eq("id", item.id);
        result.skipped++;
        continue;
      }
    }

    const contact = item.contact_id ? contactById.get(item.contact_id) : null;
    // telefono presente + nessun optout_call? Altrimenti SALTA e AVANZA.
    const plan = planChannelSend("call", contact);
    if (!plan.ok) {
      await supabase.from("outreach_send_queue")
        .update({ status: "skipped", last_error: plan.skipReason ?? "non azionabile" }).eq("id", item.id);
      result.skipped++;
      if (enr) {
        try { await advanceEnrollment(supabase, enr, contact, now, item.brand_id ?? null); }
        catch (e) { console.warn("[outreach-dispatch] advance post-skip call fallito:", e instanceof Error ? e.message : e); }
      }
      continue;
    }

    // claim atomico (idempotenza anti-doppio task)
    const { data: claimed } = await supabase.from("outreach_send_queue")
      .update({ status: "sending" }).eq("id", item.id).eq("status", "queued").select("id");
    if (!claimed || claimed.length === 0) { result.skipped++; continue; }
    try {
      const vars = contact ? contactToVars(contact) : {};
      const seed = hashSeed(plan.phone || item.id);
      const note = renderTemplate(item.body || "", vars, { seed });
      const contactName = contact
        ? [contact.first_name, contact.last_name].filter(Boolean).join(" ") || null
        : null;
      await supabase.from("outreach_call_tasks").insert({
        company_id: PLATFORM_COMPANY,
        enrollment_id: item.enrollment_id ?? null,
        contact_id: item.contact_id ?? null,
        sequence_id: enr?.sequence_id ?? null,
        node_id: item.node_id ?? null,
        phone: plan.phone,
        contact_name: contactName,
        company_name: contact?.company_name ?? null,
        note: note || null,
        status: "pending",
        due_at: now.toISOString(),
      });
      await supabase.from("outreach_send_queue")
        .update({ status: "sent", sent_at: now.toISOString(), to_phone: plan.phone }).eq("id", item.id);
      result.sent++;
      if (enr) {
        try { await advanceEnrollment(supabase, enr, contact, now, item.brand_id ?? null); }
        catch (e) { console.warn("[outreach-dispatch] advance post-call fallito:", e instanceof Error ? e.message : e); }
      }
    } catch (e) {
      // il task non è stato creato: rimetti in coda (retry al prossimo tick).
      await supabase.from("outreach_send_queue")
        .update({ status: "queued", last_error: e instanceof Error ? e.message : String(e) }).eq("id", item.id);
      result.failed++;
    }
  }
}

serveConMetriche("outreach-dispatch", async (req) => {
  const cors = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
  const cronHeader = req.headers.get("x-cron-secret") || "";
  const authorized = (!!token && token === SERVICE_ROLE) || (!!CRON_SECRET && cronHeader === CRON_SECRET);
  if (!authorized) return json({ error: "unauthorized" }, 401, cors);

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);
  const now = new Date();
  const startedAt = Date.now();
  const today = now.toISOString().slice(0, 10);
  // providerBlocked: valorizzato SOLO da un guasto di account (piano scaduto,
  // credenziali, quota). Serve a distinguere "non c'era niente da mandare" da
  // "non si poteva mandare": il primo e' normale, il secondo va guardato subito.
  const result = { processed: 0, sent: 0, failed: 0, skipped: 0, deferred: 0, reaped: 0, budgetHit: false, providerBlocked: null as string | null };

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
  // Base dei link di tracking/disiscrizione: un dominio proprio (setting
  // outreach_tracking_base_url, es. https://link.tuodominio.it) invece di
  // *.supabase.co dentro ogni email da casella vera.
  const trackingBase = String((await getPlatformSetting("outreach_tracking_base_url").catch(() => null)) || `${SUPABASE_URL}/functions/v1`).replace(/\/+$/, "");

  try {
    // 0-ter. REAPER — righe rimaste 'sending' oltre REAP_STUCK_MS sono orfane
    // (tick precedente ucciso dal timeout 150s o crashato prima di scrivere
    // 'sent'/'failed'): senza questo pass non tornano MAI in coda (il select
    // filtra solo 'queued') → email perse a ogni kill. Le rimettiamo 'queued'
    // incrementando attempts (così un messaggio davvero problematico finisce
    // comunque 'failed' dopo max_attempts invece di ciclare all'infinito).
    try {
      const stuckBefore = new Date(now.getTime() - REAP_STUCK_MS).toISOString();
      const { data: reaped } = await supabase
        .from("outreach_send_queue")
        .update({ status: "queued", last_error: "reaped: stuck in sending" })
        .eq("status", "sending")
        .lt("updated_at", stuckBefore)
        .select("id");
      result.reaped = reaped?.length ?? 0;
    } catch (reapErr) {
      console.warn("[outreach-dispatch] reaper skip:", reapErr instanceof Error ? reapErr.message : reapErr);
    }

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

    // 0-ter. PASS CALL — righe 'call' dovute (kind='send', channel='call'): non
    // spediscono, creano un task chiamata in outreach_call_tasks e avanzano la
    // cadenza. Isolato dal path email. Best-effort: pre-migrazione → no-op.
    try {
      await processCallQueue(supabase, now, result);
    } catch (callErr) {
      console.warn("[outreach-dispatch] call-pass skip:", callErr instanceof Error ? callErr.message : callErr);
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
    if (!queue || queue.length === 0) { await logRun(supabase, "outreach-dispatch", now, { ...result, note: "coda vuota" }); return json({ ...result, note: "coda vuota" }, 200, cors); }

    // 2. caselle del pool
    const { data: sendersRaw, error: sErr } = await supabase
      .from("outreach_sender_accounts")
      .select("id,status,daily_cap_target,warmup_base,warmup_step,warmup_day,daily_sent,daily_sent_date,email,display_name,brand_id,sending_domain_id,provider,smtp_host,smtp_port,smtp_secure,smtp_username,secret_ref,connection_status,oauth_connection_id,signature")
      .in("status", ["active", "warming"]);
    if (sErr) throw sErr;
    // Una casella in errore NON entra in rotazione: prima veniva scelta lo
    // stesso, falliva, e ogni fallimento chiudeva un'iscrizione. Le OAuth si
    // riprovano da sole (token), le SMTP tornano con "Testa" dal pannello.
    const senders: any[] = [];
    for (const s of (sendersRaw || []) as any[]) {
      if (s.connection_status === "error") {
        if ((s.provider === "gmail" || s.provider === "outlook") && s.oauth_connection_id) {
          try {
            await getOauthAccessToken(supabase, s.oauth_connection_id);
            s.connection_status = "ok";
            await supabase.from("outreach_sender_accounts")
              .update({ connection_status: "ok", connection_error: null, connection_checked_at: now.toISOString() }).eq("id", s.id);
          } catch (e) {
            // Resta in errore, ma con il motivo scritto (token scaduto, revoca):
            // e' cio' che la card mostra e che dice "ricollega la casella".
            await supabase.from("outreach_sender_accounts")
              .update({ connection_error: `OAuth: ${e instanceof Error ? e.message : String(e)}`.slice(0, 300), connection_checked_at: now.toISOString() })
              .eq("id", s.id);
            await alertOutreach(supabase, {
              chiave: `oauth:${s.id}`, tipo: "outreach_oauth_scaduto", ogniOre: 12,
              titolo: `Casella ${s.email}: accesso Google/Microsoft scaduto`,
              testo: "Il token OAuth non si rinnova: ricollega la casella da Impostazioni → Email, poi premi \"Testa\" nel pool.",
              url: "/admin/impostazioni/mio-profilo?tab=email",
            });
            continue;
          }
        } else if (s.provider === "smtp") {
          continue;
        }
      }
      senders.push(s);
    }
    if (senders.length === 0) { await logRun(supabase, "outreach-dispatch", now, { ...result, note: "nessuna casella attiva" }); return json({ ...result, note: "nessuna casella attiva" }, 200, cors); }

    const senderById = new Map(senders.map((s) => [s.id, s]));
    const queueById = new Map(queue.map((q) => [q.id, q]));

    // identità per brand (from_name / reply_to override) + firma e indirizzo footer
    const { data: brandsRaw } = await supabase.from("outreach_brands").select("id,from_name,reply_to,signature,footer_address,send_window");
    const brandById = new Map<string, { from_name: string | null; reply_to: string | null; signature: string | null; footer_address: string | null; send_window?: unknown }>();
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
    const plainTextBySequence = new Map<string, boolean>();
    const statoSequenza = new Map<string, string>();
    const sequenceIds = [...new Set([...enrollmentById.values()].map((e) => e.sequence_id).filter(Boolean))];
    if (sequenceIds.length) {
      const { data: seqs } = await supabase
        .from("outreach_sequences").select("id,track_opens,plain_text_only,status").in("id", sequenceIds);
      for (const s of seqs || []) {
        trackOpensBySequence.set(s.id, s.track_opens === true);
        plainTextBySequence.set(s.id, s.plain_text_only === true);
        statoSequenza.set(s.id, String(s.status ?? "active"));
      }
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
    // Mittente "sticky": il follow-up parte dalla STESSA casella del primo
    // messaggio (stesso thread, stessa persona; Gmail rifiuta un threadId di
    // un'altra casella). Se quella casella oggi non ha capacita' il follow-up
    // aspetta; se non e' piu' nel pool si riparte da capo con un'altra.
    const stickyByEnrollment = new Map<string, string>();
    if (enrollmentIds.length) {
      try {
        const { data: primi } = await supabase
          .from("outreach_send_queue").select("enrollment_id,sender_account_id,sent_at")
          .in("enrollment_id", enrollmentIds).eq("status", "sent").eq("kind", "send").eq("channel", "email")
          .not("sender_account_id", "is", null).order("sent_at", { ascending: true });
        for (const r of (primi ?? []) as any[]) {
          if (!stickyByEnrollment.has(r.enrollment_id)) stickyByEnrollment.set(r.enrollment_id, r.sender_account_id);
        }
      } catch { /* pre-migrazione grafo: nessuno sticky */ }
    }
    for (const [brand, ids] of itemsByBrand) {
      const brandSenders = sendersByBrand.get(brand) ?? [];
      if (brandSenders.length === 0) { result.deferred += ids.length; continue; } // nessuna casella per quel brand
      const brandIds = new Set(brandSenders.map((s) => s.id));
      const usati = new Map<string, number>();
      const liberi: string[] = [];
      for (const qid of ids) {
        const q = queueById.get(qid);
        const sid = q?.enrollment_id ? stickyByEnrollment.get(q.enrollment_id) : undefined;
        if (sid && brandIds.has(sid)) {
          const s = senderById.get(sid) as SenderState;
          const rem = remainingToday(s, today, today) - (usati.get(sid) ?? 0);
          if (rem > 0) { assignments.push({ queueId: qid, senderId: sid }); usati.set(sid, (usati.get(sid) ?? 0) + 1); }
          else result.deferred++;
          continue;
        }
        liberi.push(qid);
      }
      // varianceKey=today: il tetto per-casella varia leggermente per casella+giorno
      // (sempre ≤ cap effettivo) → volume "umano", non un numero tondo fisso ogni giorno.
      const brandSendersAdj = brandSenders.map((s) => usati.has(s.id)
        ? { ...s, daily_sent: sentToday(s, today) + (usati.get(s.id) ?? 0), daily_sent_date: today }
        : s);
      const r = assignSenders(liberi, brandSendersAdj, today, today);
      assignments.push(...r.assignments);
      result.deferred += liberi.length - r.assignments.length;
    }

    // Cap per DOMINIO (outreach_sending_domains.daily_cap): prima era solo
    // decorativo. Somma degli invii di oggi delle caselle del dominio + quelli
    // di questo giro; oltre il tetto le righe aspettano domani.
    try {
      const { data: doms } = await supabase.from("outreach_sending_domains").select("id,daily_cap");
      const capDom = new Map<string, number>();
      for (const d of (doms ?? []) as any[]) if (d.daily_cap != null && Number(d.daily_cap) > 0) capDom.set(d.id, Number(d.daily_cap));
      if (capDom.size) {
        const usato = new Map<string, number>();
        for (const s of senders) if (s.sending_domain_id && capDom.has(s.sending_domain_id)) {
          usato.set(s.sending_domain_id, (usato.get(s.sending_domain_id) ?? 0) + sentToday(s as SenderState, today));
        }
        const tenuti: typeof assignments = [];
        for (const a of assignments) {
          const dom = senderById.get(a.senderId)?.sending_domain_id as string | null | undefined;
          if (dom && capDom.has(dom)) {
            const u = usato.get(dom) ?? 0;
            if (u >= (capDom.get(dom) ?? 0)) { result.deferred++; continue; }
            usato.set(dom, u + 1);
          }
          tenuti.push(a);
        }
        assignments.length = 0;
        assignments.push(...tenuti);
      }
    } catch { /* cap dominio best-effort */ }

    // Running total per casella, seminato dallo snapshot iniziale. Il contatore
    // viene scritto DOPO OGNI invio (non a fine tick): se il tick viene ucciso
    // dal timeout, i daily_sent già spediti non si perdono e il warm-up cap
    // resta rispettato al tick successivo.
    // Il contatore giornaliero e' incrementato da outreach_prenota_invio PRIMA
    // dell'invio (atomico): niente piu' snapshot letto a inizio tick e riscritto.

    for (const a of assignments) {
      // Time-budget: usciamo puliti prima del limite 150s della edge. Le righe
      // non ancora prese restano 'queued' per il tick successivo; nessuna resta
      // orfana in 'sending' (le prendiamo solo col CAS appena prima dell'invio).
      if (Date.now() - startedAt > TICK_BUDGET_MS) { result.budgetHit = true; break; }
      result.processed++;
      const item = queueById.get(a.queueId);
      const sender = senderById.get(a.senderId);
      if (!item || !sender || !item.to_email) { result.skipped++; continue; }

      // GUARDIA BRAND → DOMINIO → CASELLA.
      // L'assegnazione raggruppa gia' per brand, ma una casella con brand
      // corretto e nessun dominio collegato spedirebbe dal proprio dominio
      // qualunque esso sia. Con 5 brand che devono sembrare 5 aziende diverse,
      // una mail di Marketing Edile partita da un dominio di Edilizia in Cloud
      // e' il danno peggiore possibile: il prospect capisce tutto.
      if (item.brand_id) {
        if (sender.brand_id !== item.brand_id || !sender.sending_domain_id) {
          const perche = sender.brand_id !== item.brand_id
            ? `casella del brand ${sender.brand_id ?? "nessuno"} per un invio del brand ${item.brand_id}`
            : `casella ${sender.email} senza dominio di invio collegato`;
          await supabase.from("outreach_send_queue")
            .update({ status: "queued", last_error: `guardia brand: ${perche}` }).eq("id", item.id);
          console.error(`[outreach-dispatch] GUARDIA BRAND — invio bloccato: ${perche}`);
          result.deferred++;
          continue;
        }
      }

      // gating iscrizione: pausa → resta in coda; terminata → annulla; opt-out → ferma
      const enr = item.enrollment_id ? enrollmentById.get(item.enrollment_id) : null;
      if (enr) {
        if (enr.status === "paused") { result.deferred++; continue; }
        // "In pausa" sulla SEQUENZA: prima il dispatcher non la leggeva e
        // continuava a spedire; le righe restano in coda finche' si riprende.
        const st = statoSequenza.get(enr.sequence_id);
        if (st === "paused" || st === "archived") { result.deferred++; continue; }
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

      // Finestra di invio del BRAND (se impostata): fuori orario la riga aspetta.
      {
        const bw = sender.brand_id ? brandById.get(sender.brand_id)?.send_window : null;
        if (bw && !isWithinSendWindow(now, parseSendWindow(bw))) { result.deferred++; continue; }
      }

      // CLAIM ATOMICO (compare-and-swap): passiamo a 'sending' SOLO se la riga è
      // ancora 'queued'. `.select()` ritorna le righe effettivamente aggiornate:
      // se un altro run del dispatcher (cron sovrapposto / invocazione manuale)
      // l'ha già presa, qui otteniamo 0 righe → la saltiamo. Senza questo check
      // due tick concorrenti spedirebbero la STESSA email due volte.
      const { data: claimed } = await supabase.from("outreach_send_queue")
        .update({ status: "sending" }).eq("id", item.id).eq("status", "queued").select("id");
      if (!claimed || claimed.length === 0) { result.skipped++; continue; }
      let capPrenotato = false;
      try {
        const brand = sender.brand_id ? brandById.get(sender.brand_id) : null;
        // Identita': la CASELLA vince sul brand (20 caselle non possono firmare tutte "Mario Rossi").
        const fromName = sender.display_name || brand?.from_name;
        const from = fromName ? `${fromName} <${sender.email}>` : sender.email;
        // Caselle native: il Reply-To e' la casella stessa. Un reply_to di brand
        // esterno manderebbe le risposte dove il poll non guarda mai.
        const replyTo = isNativeProvider(sender.provider) ? sender.email : (brand?.reply_to || sender.email);
        // personalizzazione al send: variabili + spintax, seed stabile per destinatario
        const contact = item.contact_id ? contactById.get(item.contact_id) : null;
        const vars = contact ? contactToVars(contact) : {};
        const seed = hashSeed(item.to_email || item.id);
        // A/Z testing: l'oggetto può contenere più varianti separate da "==="
        const chosen = pickVariant(parseVariants(item.subject || ""), seed);
        const variantIndex = chosen ? chosen.index : null;
        // Unsubscribe firmato (HMAC; legacy-mode senza secret) + header List-Unsubscribe:
        // compliance/deliverability del cold. Serve il contatto (rid) per la soppressione.
        // ── CORPO scritto dall'utente (+ firma brand), SENZA footer ──────────
        let corpo = renderTemplate(item.body || "", vars, { seed });
        const firma = sender.signature || brand?.signature;
        if (firma) corpo += `<br><br>${renderTemplate(firma, vars, { seed })}`;
        const testoCorpo = htmlToPlainText(corpo);

        // ── THREADING: i follow-up restano nel thread del primo messaggio ──
        const precedenti = enr ? await inviatiPrecedenti(supabase, enr.id) : [];
        const oggettoStep = renderTemplate(chosen ? chosen.text : (item.subject || ""), vars, { seed });
        const thr = buildFollowupHeaders(precedenti, oggettoStep);
        // Casella diversa dal primo passo (sticky non disponibile): niente
        // header di thread, sarebbe una "risposta" da un'altra persona.
        if (precedenti.length && precedenti[0].senderId && precedenti[0].senderId !== sender.id) {
          thr.inReplyTo = null; thr.references = []; thr.threadId = null;
        }
        const subjectFinale = thr.subject;

        // GATE DI CONTENUTO sul corpo, con il touch REALE. Prima si lintava il
        // testo COMPLETO di footer: il link di disiscrizione aggiunto dal motore
        // faceva scattare "zero link" e bloccava OGNI email (200/200 a luglio).
        const rilievi = lintEmail(subjectFinale, testoCorpo, { touch: thr.touch });
        if (!puoPartire(rilievi)) {
          const motivi = rilievi.filter((r) => r.gravita === "blocco").map((r) => r.regola).join(", ");
          await supabase.from("outreach_send_queue")
            .update({ status: "skipped", sender_account_id: sender.id, last_error: `copy bloccata dal linter: ${motivi}` })
            .eq("id", item.id);
          console.error(`[outreach-dispatch] COPY BLOCCATA (${motivi}) — riga ${item.id}. Correggi il testo della sequenza.`);
          result.skipped++;
          continue;
        }

        // ── FOOTER compliance: indirizzo postale + disiscrizione firmata ──
        let html = corpo;
        let unsubscribeUrl: string | undefined;
        if (item.contact_id) {
          unsubscribeUrl = await appendTrackingSig(
            `${trackingBase}/email-tracking?type=unsub&rid=${item.contact_id}&co=${PLATFORM_COMPANY}`,
            { co: PLATFORM_COMPANY, rid: item.contact_id, type: "unsub" },
          );
        }
        const addr = brand?.footer_address ? `${brand.footer_address} · ` : "";
        // Base giuridica in una riga (B2B, indirizzi aziendali): trasparenza
        // GDPR art. 13/14 senza informativa a parte. Solo nelle sequenze cold.
        const gdpr = enr ? "Ti scrivo perché la tua impresa opera pubblicamente nel settore edile (legittimo interesse, art. 6.1.f GDPR). " : "";
        const unsubHtml = item.contact_id ? `${gdpr}Non vuoi più ricevere queste email? <a href="${unsubscribeUrl}" style="color:#9ca3af">Disiscriviti</a>.` : "";
        if (addr || unsubHtml) {
          html += `<p style="font-size:11px;color:#9ca3af;margin-top:24px">${addr}${unsubHtml}</p>`;
        }
        // Part text/plain: dall'HTML assemblato (corpo + firma + footer), PRIMA del pixel.
        const text = htmlToPlainText(html);
        const seqIdForItem = enr?.sequence_id ?? null;
        const trackOpens = seqIdForItem ? (trackOpensBySequence.get(seqIdForItem) ?? false) : false;
        const plainOnly = seqIdForItem ? (plainTextBySequence.get(seqIdForItem) ?? false) : false;
        if (trackOpens && !plainOnly) {
          const pixelUrl = await outreachOpenPixelUrl(trackingBase, item.id);
          if (pixelUrl) {
            html += `<img src="${pixelUrl}" alt="" width="1" height="1" style="display:none;width:1px;height:1px;border:0;overflow:hidden" />`;
          } else {
            console.warn("[outreach-dispatch] track_opens attivo ma EMAIL_TRACKING_SECRET assente — pixel non iniettato per", item.id);
          }
        }

        // ── PRENOTAZIONE ATOMICA DEL CAP (prima era read-modify-write) ──
        const capOggi = dailyCapWithVariance(sender as SenderState, today);
        const { data: prenotato, error: prenErr } = await supabase.rpc("outreach_prenota_invio", {
          p_sender_id: sender.id, p_today: today, p_cap: capOggi,
        });
        if (prenErr) throw prenErr;
        capPrenotato = prenotato === true;
        if (prenotato === false) {
          await supabase.from("outreach_send_queue")
            .update({ status: "queued", last_error: `rimandato: cap giornaliero di ${sender.email} raggiunto` })
            .eq("id", item.id);
          result.deferred++;
          continue;
        }

        // THROTTLING PER SERVER DI DESTINAZIONE (non per dominio): max 4/ora
        // dalla stessa casella verso lo stesso gruppo MX (Aruba, Register…).
        const domDest = String(item.to_email).split("@")[1]?.toLowerCase() ?? "";
        if (domDest) {
          const gruppo = await mxGroupDi(supabase, domDest);
          const { data: viaLibera } = await supabase.rpc("outreach_mx_try_consume", {
            p_mx_group: gruppo, p_sender_key: sender.email, p_max_ora: 4,
          });
          if (viaLibera === false) {
            // Cap gia' prenotato: torna indietro, la riga riparte al tick dopo.
            await supabase.rpc("outreach_rilascia_invio", { p_sender_id: sender.id, p_today: today });
            capPrenotato = false;
            await supabase.from("outreach_send_queue")
              .update({ status: "queued", last_error: `rimandato: quota oraria ${gruppo} esaurita per ${sender.email}` })
              .eq("id", item.id);
            result.deferred++;
            continue;
          }
        }

        // ── INVIO: caselle native (gmail/outlook/smtp) dal loro provider, il
        //    resto (Elastic Email ecc.) via sendEmailUnified come prima ──
        const unsubHeaders = unsubscribeUrl
          ? { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
          : undefined;
        const meta = { outreach_queue_id: item.id, sender_account_id: sender.id, variant_index: variantIndex, unsubscribe_url: unsubscribeUrl, touch: thr.touch };
        let esito: { ok: boolean; body?: unknown; messageId: string | null; threadId: string | null; accountFailure: boolean };
        if (isNativeProvider(sender.provider)) {
          const r = await sendViaNativeSender(supabase, sender, {
            companyId: PLATFORM_COMPANY, to: item.to_email, subject: subjectFinale,
            html: plainOnly ? null : html, text, fromName: fromName ?? null, replyTo,
            inReplyTo: thr.inReplyTo, references: thr.references, threadIdHint: thr.threadId,
            headers: unsubHeaders, metadata: meta,
          });
          esito = { ok: r.ok, body: r.error ?? r.body, messageId: r.messageId, threadId: r.threadId, accountFailure: r.accountFailure === true };
        } else {
          const res = await sendEmailUnified({
            companyId: PLATFORM_COMPANY,
            stream: "marketing",
            to: item.to_email,
            subject: subjectFinale,
            html,
            text,
            headers: unsubHeaders,
            senderOverride: { from, replyTo, source: "outreach_pool" },
            metadata: meta,
          });
          esito = { ok: !(res && res.ok === false), body: res?.body, messageId: res?.providerMessageId ?? null, threadId: null, accountFailure: false };
        }

        if (!esito.ok) {
          // Non e' partito nulla: la prenotazione del cap torna indietro.
          await supabase.rpc("outreach_rilascia_invio", { p_sender_id: sender.id, p_today: today });
          capPrenotato = false;
          const guastoAccount = esito.accountFailure
            ? String(typeof esito.body === "string" ? esito.body : JSON.stringify(esito.body ?? "guasto account")).slice(0, 300)
            : isAccountLevelFailure(esito.body);
          if (guastoAccount) {
            // Non è il destinatario: è l'account che non può spedire. La riga
            // torna in coda intatta, l'iscrizione NON si tocca, e si ferma qui
            // il tick — le altre righe fallirebbero identiche.
            await supabase.from("outreach_send_queue")
              .update({ status: "queued", sender_account_id: sender.id, last_error: `account: ${guastoAccount}` })
              .eq("id", item.id);
            await supabase.from("outreach_sender_accounts")
              .update({ connection_status: "error", connection_error: guastoAccount, connection_checked_at: now.toISOString() })
              .eq("id", sender.id);
            console.error(`[outreach-dispatch] GUASTO ACCOUNT su ${sender.email}: ${guastoAccount} — tick interrotto, coda preservata`);
            result.deferred++;
            result.providerBlocked = `${sender.email}: ${guastoAccount}`;
            await alertOutreach(supabase, {
              chiave: `casella:${sender.id}`, tipo: "outreach_casella_errore",
              titolo: `Casella outreach in errore: ${sender.email}`,
              testo: `${guastoAccount.slice(0, 160)} — il giro si e' fermato, la coda e' intatta. Apri Deliverability e usa "Testa" o ricollega la casella.`,
              url: "/admin/marketing?tab=deliverability",
            });
            break;
          }
          // Recapito rifiutato (soppresso, hard fail): non ritentare E fermare l'iscrizione.
          await supabase.from("outreach_send_queue")
            .update({ status: "skipped", sender_account_id: sender.id, last_error: JSON.stringify(esito.body ?? "skipped") })
            .eq("id", item.id);
          if (enr) {
            await supabase.from("outreach_enrollments")
              .update({ status: "stopped", next_action_at: null, stop_reason: "send_rejected" }).eq("id", enr.id);
          }
          result.skipped++;
          continue;
        }
        // Invio riuscito: se la casella era in errore, si riabilita da sola.
        if (sender.connection_status === "error") {
          await supabase.from("outreach_sender_accounts")
            .update({ connection_status: "ok", connection_error: null, connection_checked_at: now.toISOString() })
            .eq("id", sender.id);
        }
        await supabase.from("outreach_send_queue")
          .update({
            status: "sent", sent_at: new Date().toISOString(), sender_account_id: sender.id, variant_index: variantIndex,
            // oggetto DAVVERO spedito e Message-ID: e' da qui che il follow-up costruisce "Re:" e In-Reply-To
            subject: subjectFinale,
            message_id: esito.messageId && esito.messageId.trim().startsWith("<") ? esito.messageId : null,
            provider_thread_id: esito.threadId,
          })
          .eq("id", item.id);
        result.sent++;
        // Cadenza umana: una pausa variabile tra un invio e l'altro (prima: nessuna).
        await new Promise((r) => setTimeout(r, pauseBetweenSendsMs()));
        // avanza la cadenza: prossimo step email o completamento iscrizione
        if (enr) {
          try { await advanceEnrollment(supabase, enr, contactById.get(item.contact_id), now, item.brand_id ?? null); }
          catch (advErr) { console.warn("[outreach-dispatch] advance fallito:", advErr instanceof Error ? advErr.message : advErr); }
        }
      } catch (e) {
        // Eccezione (transitorio, rete): la prenotazione del cap va restituita,
        // altrimenti ogni retry consumava un invio del giorno.
        if (capPrenotato) {
          try { await supabase.rpc("outreach_rilascia_invio", { p_sender_id: sender.id, p_today: today }); } catch { /* best effort */ }
        }
        const attempts = (item.attempts || 0) + 1;
        const isFinal = attempts >= (item.max_attempts || 3);
        // Retry con backoff esponenziale (15min·2^attempts): niente martellamento
        // ravvicinato di un provider magari in rate-limit. Al tentativo finale
        // fermiamo anche l'iscrizione, altrimenti resta 'active' bloccata.
        const backoffMin = 15 * Math.pow(2, attempts - 1);
        const nextAt = new Date(now.getTime() + backoffMin * 60_000).toISOString();
        await supabase.from("outreach_send_queue").update({
          status: isFinal ? "failed" : "queued",
          attempts,
          scheduled_for: isFinal ? item.scheduled_for : nextAt,
          last_error: e instanceof Error ? e.message : String(e),
        }).eq("id", item.id);
        if (isFinal && enr) {
          await supabase.from("outreach_enrollments")
            .update({ status: "stopped", next_action_at: null, stop_reason: "send_failed" }).eq("id", enr.id);
        }
        result.failed++;
      }
    }

    // I contatori giornalieri delle caselle sono già scritti per-invio nel loop
    // (sopravvivono al timeout del tick): niente flush finale da fare qui.

    { await logRun(supabase, "outreach-dispatch", now, result); return json(result, 200, cors); }
  } catch (e) {
    await logRun(supabase, "outreach-dispatch", now, result, e instanceof Error ? e.message : String(e));
    return json({ error: e instanceof Error ? e.message : String(e) }, 500, cors);
  }
});

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
