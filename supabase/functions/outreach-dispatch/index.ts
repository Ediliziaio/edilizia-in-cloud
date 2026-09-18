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
import { assignSenders, cadenzaCasella, dailyCapWithVariance, remainingToday, sentToday, type Assignment, type SenderState, statoPerPrimiContatti, unaAssegnazionePerCasella, unaEmailPerDestinatario } from "../_shared/outreach-dispatch-logic.ts";
import { componiCorpo, haFraseUscita } from "../_shared/outreach-uscita.ts";
import { renderTemplate, contactToVars, hashSeed, htmlToPlainText } from "../_shared/outreach-template.ts";
import { DEFAULT_SEND_WINDOW, finestraDelBrand, isWithinSendWindow, minutoDelGiorno, orarioFollowUp, orarioTroppoVicino, type SendWindow } from "../_shared/outreach-schedule.ts";
import { classificaRifiuto } from "../_shared/outreach-bounce.ts";
import { parseVariants, pickVariant } from "../_shared/outreach-abz.ts";
import { nextEmailStep, computeStepSchedule, applyJitter, spostaFuoriWeekend, ritardoDalPrecedente, type SeqStep } from "../_shared/outreach-sequence.ts";
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
import { buildFollowupHeaders, citazionePrecedente, type SentStep } from "../_shared/outreach-threading.ts";
import { sendViaNativeSender, isNativeProvider, getOauthAccessToken, rifiutoPerSpam } from "../_shared/outreachMailboxSend.ts";
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
// Caselle servite in parallelo nello stesso tick (una assegnazione per casella):
// con 60 caselle e ~12 s a invio, 12 alla volta chiudono il giro in un minuto.
const CONCORRENZA_CASELLE = 12;

async function inParallelo<T>(items: T[], limite: number, fn: (x: T) => Promise<void>): Promise<void> {
  let i = 0;
  const worker = async () => { while (i < items.length) { const x = items[i++]; await fn(x); } };
  await Promise.all(Array.from({ length: Math.min(limite, items.length) }, worker));
}
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
      .select("message_id,subject,provider_thread_id,sent_at,sender_account_id,body")
      .eq("enrollment_id", enrId).eq("status", "sent").eq("channel", "email").eq("kind", "send")
      .order("sent_at", { ascending: true });
    return ((data ?? []) as any[]).map((r) => ({
      messageId: r.message_id ?? null, subject: r.subject ?? null, threadId: r.provider_thread_id ?? null, senderId: r.sender_account_id ?? null,
      body: r.body ?? null, sentAt: r.sent_at ?? null,
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
  finestra: SendWindow = DEFAULT_SEND_WINDOW,
): Promise<void> {
  const when = computeStepSchedule(baseAt, delayDays, delayHours);
  // Mai alla stessa ora del messaggio appena spedito: con almeno un giorno di mezzo
  // il follow-up va nell'altra metà della giornata, ad almeno 3 ore di distanza.
  // Sotto il giorno resta il jitter umano (2..90 min al SECONDO) e decide il
  // controllo al momento dell'invio. Finestra business applicata a valle.
  const orario = Math.trunc(delayDays ?? 0) >= 1
    ? orarioFollowUp(when, baseAt, finestra, Math.random())
    : applyJitter(when, 90, Math.random(), { minMinutes: 2, stepSeconds: 1 });
  const whenJ = spostaFuoriWeekend(orario).toISOString();
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
    primo_contatto: false,
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
  finestra: SendWindow = DEFAULT_SEND_WINDOW,
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
  await enqueuePlanned(supabase, enr, contact, plan.node, plan.kind, plan.delayDays, plan.delayHours, baseAt, brandId, finestra);
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
  finestra: SendWindow = DEFAULT_SEND_WINDOW,
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
    await advanceGraph(supabase, enr, nodes, fromId, contact, sentAt, brandId, finestra);
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
  // Ritardi lineari cumulativi dall'iscrizione: si aggiunge la differenza col
  // passo appena spedito (vedi ritardoDalPrecedente).
  const appenaSpedito = (nodes as unknown as SeqStep[]).find((s) => s.step_order === enr.current_step) ?? null;
  const rit = ritardoDalPrecedente(appenaSpedito, next);
  const when = computeStepSchedule(sentAt, rit.giorni, rit.ore);
  // Mai alla stessa ora dell'email appena spedita: con almeno un giorno di mezzo il
  // follow-up va nell'altra metà della giornata, ad almeno 3 ore di distanza. Sotto
  // il giorno resta il jitter umano (2..90 min al SECONDO). La finestra di invio
  // resta a valle, e al momento dell'invio c'è comunque il controllo sull'orario.
  const orario = rit.giorni >= 1
    ? orarioFollowUp(when, sentAt, finestra, Math.random())
    : applyJitter(when, 90, Math.random(), { minMinutes: 2, stepSeconds: 1 });
  const whenJ = spostaFuoriWeekend(orario).toISOString();
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

  // Il motore gira tutti i giorni: giorni e orari li decide ogni brand
  // (finestraDelBrand; senza una sua, lun–ven 8–19). Per non lavorare a vuoto
  // di notte e nel weekend si esce subito se adesso non c'è nessun brand
  // attivo in finestra. Prima qui c'era una finestra di piattaforma lun–ven
  // che fermava tutto prima di guardare il brand: il sabato di ThermoDMR,
  // impostato apposta, non partiva mai.
  try {
    const { data: attivi } = await supabase
      .from("outreach_brands").select("send_window").eq("status", "active");
    const qualcunoAperto = isWithinSendWindow(now, DEFAULT_SEND_WINDOW) ||
      (attivi ?? []).some((b: { send_window: unknown }) => isWithinSendWindow(now, finestraDelBrand(b.send_window)));
    if (!qualcunoAperto) {
      return json({ ...result, note: "nessun brand in finestra d'invio" }, 200, cors);
    }
  } catch { /* nel dubbio si prosegue: il controllo riga per riga resta */ }
  // Base dei link di tracking/disiscrizione: un dominio proprio (setting
  // outreach_tracking_base_url, es. https://link.tuodominio.it) invece di
  // *.supabase.co dentro ogni email da casella vera.
  // Ordine: dominio del brand (outreach_brands.tracking_base_url, es.
  // https://link.thermodmr.it/l) → impostazione di piattaforma → *.supabase.co.
  // L'ultimo è un dominio estraneo al mittente dentro ogni email, anche
  // nell'intestazione List-Unsubscribe: i filtri lo contano.
  const brandById = new Map<string, { name?: string | null; status?: string | null; from_name: string | null; reply_to: string | null; signature: string | null; footer_address: string | null; send_window?: unknown; tracking_base_url?: string | null; new_per_day?: number | null; stile_umano?: boolean | null; frase_uscita?: string | null; frase_uscita_automatica?: boolean | null }>();
  const trackingBasePiattaforma = String((await getPlatformSetting("outreach_tracking_base_url").catch(() => null)) || `${SUPABASE_URL}/functions/v1`).replace(/\/+$/, "");
  const trackingBasePerBrand = (brandId: string | null): string => {
    const b = brandId ? brandById.get(brandId) : undefined;
    const proprio = String(b?.tracking_base_url ?? "").trim().replace(/\/+$/, "");
    return /^https:\/\//i.test(proprio) ? proprio : trackingBasePiattaforma;
  };

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
    // Due letture separate — follow-up e primi contatti — ognuna coi suoi BATCH
    // più vecchi. Con una lettura sola ordinata per scheduled_for, un arretrato
    // di primi contatti (una lista grande appena arruolata matura più in fretta
    // di quanto le caselle smaltiscano) riempiva tutto il batch: i follow-up,
    // dovuti più tardi, non entravano mai nel giro e restavano fermi per mesi.
    // I follow-up vanno davanti: sono thread già aperti.
    //
    // E una lettura PER BRAND. Con la lettura unica, un brand con un arretrato
    // vecchio riempiva il batch e gli altri non entravano mai nel giro: il
    // 16/09/2026 ThermoDMR aveva 2.063 primi contatti dovuti dall'11/09, e le
    // prime email di Marketing Edile ed Edilizia in Cloud, appena accesi, non
    // sarebbero partite per settimane con le loro caselle libere.
    let queue: any[] | null = null;
    {
      // `undefined` = nessun filtro sul brand (ripiego se i brand non si leggono).
      const sel = (primo: boolean, brandId: string | null | undefined, quante: number) => {
        let q = supabase
          .from("outreach_send_queue")
          .select("id, to_email, subject, body, attempts, max_attempts, contact_id, enrollment_id, brand_id, primo_contatto")
          .eq("status", "queued").eq("channel", "email").eq("primo_contatto", primo)
          .lte("scheduled_for", now.toISOString());
        if (brandId === null) q = q.is("brand_id", null);
        else if (brandId !== undefined) q = q.eq("brand_id", brandId);
        return q.order("scheduled_for", { ascending: true }).limit(quante);
      };
      const leggi = async (primo: boolean, brandId: string | null | undefined, quante: number): Promise<any[]> => {
        const r = await sel(primo, brandId, quante).eq("kind", "send");
        if (!r.error) return r.data ?? [];
        // 'kind' assente (pre-migrazione grafo): riprova senza il filtro.
        const r2 = await sel(primo, brandId, quante);
        if (r2.error) throw r2.error;
        return r2.data ?? [];
      };
      // I brand in pausa o archiviati non spediscono (vedi sotto): non si leggono.
      const { data: brandInGiro, error: bgErr } = await supabase
        .from("outreach_brands").select("id").not("status", "in", "(paused,archived)");
      const idBrand = ((brandInGiro ?? []) as Array<{ id: string }>).map((b) => b.id);
      // Il totale resta intorno ai BATCH di prima: gli id della coda finiscono
      // in filtri `in (…)` dentro l'URL, e un giro serve al massimo una email
      // per casella. Le righe senza brand sono un residuo: ne bastano poche.
      const gruppi: Array<{ brandId: string | null | undefined; quante: number }> = bgErr
        ? [{ brandId: undefined, quante: BATCH }]
        : [
            { brandId: null, quante: 10 },
            ...idBrand.map((id) => ({ brandId: id, quante: Math.max(20, Math.floor(BATCH / Math.max(1, idBrand.length))) })),
          ];
      const [seguiti, primi] = await Promise.all([
        Promise.all(gruppi.map((g) => leggi(false, g.brandId, g.quante))),
        Promise.all(gruppi.map((g) => leggi(true, g.brandId, g.quante))),
      ]);
      queue = [...seguiti.flat(), ...primi.flat()];
    }
    if (!queue || queue.length === 0) { await logRun(supabase, "outreach-dispatch", now, { ...result, note: "coda vuota" }); return json({ ...result, note: "coda vuota" }, 200, cors); }

    // 2. caselle del pool
    const { data: sendersRaw, error: sErr } = await supabase
      .from("outreach_sender_accounts")
      .select("id,status,daily_cap_target,warmup_base,warmup_step,warmup_day,daily_sent,daily_sent_date,last_sent_at,email,display_name,brand_id,sending_domain_id,provider,smtp_host,smtp_port,smtp_secure,smtp_username,secret_ref,connection_status,oauth_connection_id,signature,complaint_count")
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
    // DOMINIO PRONTO: una casella spedisce solo da un dominio 'active' (SPF e
    // DKIM verificati). Prima lo stato del dominio era decorativo: i domini
    // «verifying», senza DKIM trovato, spedivano lo stesso.
    {
      const { data: domsStato } = await supabase.from("outreach_sending_domains").select("id,domain,status");
      const statoDom = new Map<string, { domain: string; status: string }>();
      for (const d of (domsStato ?? []) as any[]) statoDom.set(d.id, { domain: d.domain, status: d.status });
      const fermati = new Map<string, string[]>();
      for (let i = senders.length - 1; i >= 0; i--) {
        const dom = senders[i].sending_domain_id ? statoDom.get(senders[i].sending_domain_id) : null;
        if (dom && dom.status !== "active") {
          fermati.set(dom.domain, [...(fermati.get(dom.domain) ?? []), senders[i].email]);
          senders.splice(i, 1);
        }
      }
      for (const [dom, caselle] of fermati) {
        await alertOutreach(supabase, {
          chiave: `dominio:${dom}`, tipo: "outreach_dominio_non_pronto", ogniOre: 24,
          titolo: `Dominio ${dom} non pronto: ${caselle.length} caselle ferme`,
          testo: "SPF o DKIM non verificati: le caselle di questo dominio non spediscono finché la verifica DNS non passa. Scrivi il selettore DKIM del provider sul dominio e premi «Verifica DNS».",
          url: "/admin/marketing?tab=deliverability",
        });
      }
    }
    if (senders.length === 0) { await logRun(supabase, "outreach-dispatch", now, { ...result, note: "nessuna casella attiva" }); return json({ ...result, note: "nessuna casella attiva" }, 200, cors); }

    const senderById = new Map(senders.map((s) => [s.id, s]));
    const queueById = new Map(queue.map((q) => [q.id, q]));

    // identità per brand (from_name / reply_to override) + firma e indirizzo footer
    const { data: brandsRaw } = await supabase.from("outreach_brands").select("id,status,from_name,reply_to,signature,footer_address,send_window,tracking_base_url,new_per_day,stile_umano,frase_uscita,frase_uscita_automatica,name");
    for (const b of brandsRaw || []) brandById.set(b.id, b);

    // vars dei contatti per la personalizzazione (variabili + spintax al send)
    const contactIds = [...new Set(queue.map((q) => q.contact_id).filter(Boolean))];
    const contactById = new Map<string, any>();
    if (contactIds.length) {
      const { data: cs } = await supabase
        .from("marketing_contacts")
        // province e region: alimentano le var `zona` («in provincia di X») e
        // `regione` («Lombardia»), vedi contactToVars.
        .select("id,first_name,last_name,company_name,email,phone,optout_email,province,region,website").in("id", contactIds);
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
    // Ultimo invio riuscito di ogni iscrizione: il follow-up non parte a meno di 3
    // ore, come orario del giorno, dall'email precedente allo stesso contatto.
    const ultimoInvioByEnrollment = new Map<string, Date>();
    if (enrollmentIds.length) {
      try {
        const { data: primi } = await supabase
          .from("outreach_send_queue").select("enrollment_id,sender_account_id,sent_at")
          .in("enrollment_id", enrollmentIds).eq("status", "sent").eq("kind", "send").eq("channel", "email")
          .not("sender_account_id", "is", null).order("sent_at", { ascending: true });
        for (const r of (primi ?? []) as any[]) {
          if (!stickyByEnrollment.has(r.enrollment_id)) stickyByEnrollment.set(r.enrollment_id, r.sender_account_id);
          if (r.sent_at) ultimoInvioByEnrollment.set(r.enrollment_id, new Date(r.sent_at));
        }
      } catch { /* pre-migrazione grafo: nessuno sticky */ }
    }
    // Primi contatti già spediti oggi, per casella: è il budget «nuovi al
    // giorno» del brand (new_per_day), separato dal tetto totale.
    const nuoviOggiPerCasella = new Map<string, number>();
    try {
      const { data: primiOggi } = await supabase
        .from("outreach_send_queue").select("sender_account_id")
        .eq("status", "sent").eq("primo_contatto", true)
        .gte("sent_at", `${today}T00:00:00Z`);
      for (const r of (primiOggi ?? []) as Array<{ sender_account_id: string | null }>) {
        if (r.sender_account_id) nuoviOggiPerCasella.set(r.sender_account_id, (nuoviOggiPerCasella.get(r.sender_account_id) ?? 0) + 1);
      }
    } catch { /* senza conteggio vale il solo tetto totale */ }

    for (const [brand, ids] of itemsByBrand) {
      const brandSenders = sendersByBrand.get(brand) ?? [];
      const nuoviAlGiorno = brandById.get(brand)?.new_per_day ?? null;
      if (brandSenders.length === 0) { result.deferred += ids.length; continue; } // nessuna casella per quel brand
      // Brand in pausa: nessun invio (le righe restano in coda). Prima lo stato
      // del brand era solo un'etichetta: il pannello «Prontezza» diceva «non
      // spedisce finché non è attivo», ma il dispatcher non lo leggeva.
      const statoBrand = brandById.get(brand)?.status;
      if (statoBrand === "paused" || statoBrand === "archived") { result.deferred += ids.length; continue; }
      const brandIds = new Set(brandSenders.map((s) => s.id));
      // CADENZA per casella: il tetto del giorno si spalma sulla finestra di
      // invio (vedi cadenzaCasella). Una casella non ancora "pronta" salta il
      // giro, anche se in coda c'è altro da mandare.
      const fin = finestraDelBrand(brandById.get(brand)?.send_window);
      const minutiFinestra = (fin.endHour - fin.startHour) * 60;
      const minutiDallApertura = minutoDelGiorno(now, fin.timeZone) - fin.startHour * 60;
      const pronte = new Set(brandSenders.filter((s) => {
        const ultimo = (s as SenderState & { last_sent_at?: string | null }).last_sent_at;
        return cadenzaCasella({
          senderId: s.id, dateKey: today,
          capGiorno: dailyCapWithVariance(s, today),
          inviatiOggi: sentToday(s, today),
          ultimoInvio: ultimo ? new Date(ultimo) : null,
          ora: now, minutiFinestra, minutiDallApertura,
        }).pronta;
      }).map((s) => s.id));
      const brandSendersPronti = brandSenders.filter((s) => pronte.has(s.id));
      const usati = new Map<string, number>();
      const usatiPrimi = new Map<string, number>();
      const liberi: string[] = [];
      for (const qid of ids) {
        const q = queueById.get(qid);
        // Mai alla stessa ora dell'email precedente a questo contatto: a meno di 3
        // ore di distanza (come orario del giorno) la riga aspetta un giro più avanti.
        const ultimoInvio = q?.enrollment_id ? ultimoInvioByEnrollment.get(q.enrollment_id) : undefined;
        if (ultimoInvio && orarioTroppoVicino(now, ultimoInvio, fin.timeZone)) { result.deferred++; continue; }
        const sid = q?.enrollment_id ? stickyByEnrollment.get(q.enrollment_id) : undefined;
        if (sid && brandIds.has(sid)) {
          // Il follow-up parte solo dalla sua casella: se non è ancora pronta, aspetta.
          if (!pronte.has(sid)) { result.deferred++; continue; }
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
      const conUsati = (lista: SenderState[]) => lista.map((s) => usati.has(s.id)
        ? { ...s, daily_sent: sentToday(s, today) + (usati.get(s.id) ?? 0), daily_sent_date: today }
        : s);
      // Prima i PRIMI contatti, col tetto dei nuovi (se il brand ne ha uno):
      // così i follow-up non possono mai mangiarsi il budget degli sconosciuti,
      // e viceversa i nuovi non sfondano il tetto totale.
      const primi = liberi.filter((qid) => queueById.get(qid)?.primo_contatto === true);
      const seguiti = liberi.filter((qid) => queueById.get(qid)?.primo_contatto !== true);
      if (primi.length) {
        const statiPrimi = conUsati(brandSendersPronti).map((s) =>
          statoPerPrimiContatti(s, nuoviAlGiorno, (nuoviOggiPerCasella.get(s.id) ?? 0) + (usatiPrimi.get(s.id) ?? 0), today, today));
        // Senza seme: la variazione del tetto è già dentro statoPerPrimiContatti.
        // Applicarla di nuovo qui toglieva l'ultimo posto dei nuovi (16/09/2026).
        const rp = assignSenders(primi, statiPrimi, today);
        for (const a of rp.assignments) {
          usati.set(a.senderId, (usati.get(a.senderId) ?? 0) + 1);
          usatiPrimi.set(a.senderId, (usatiPrimi.get(a.senderId) ?? 0) + 1);
        }
        assignments.push(...rp.assignments);
        result.deferred += primi.length - rp.assignments.length;

        // CANE DA GUARDIA (16/09/2026). ThermoDMR è rimasto fermo dalle 14:38
        // alle 20 con caselle libere e duemila primi contatti dovuti, e se n'è
        // accorto il titolare la sera. Se in questo giro non parte nessun primo
        // contatto, ci sono caselle con posti liberi per i nuovi, la finestra è
        // aperta da due ore e il brand non spedisce da due ore, non è un limite
        // del giorno: avviso, anche su Gmail, al massimo ogni 6 ore.
        if (rp.assignments.length === 0 && brand !== "__none__" && nuoviAlGiorno
            && minutiDallApertura >= 120 && minutiDallApertura <= minutiFinestra - 30) {
          const conPostiLiberi = brandSenders.filter((s) =>
            (nuoviOggiPerCasella.get(s.id) ?? 0) < nuoviAlGiorno && remainingToday(s, today, today) > 0);
          if (conPostiLiberi.length > 0) {
            try {
              const { data: ultimo } = await supabase.from("outreach_send_queue").select("sent_at")
                .eq("brand_id", brand).eq("status", "sent").order("sent_at", { ascending: false }).limit(1).maybeSingle();
              const oreFerme = ultimo?.sent_at ? (now.getTime() - new Date(ultimo.sent_at).getTime()) / 3_600_000 : Infinity;
              if (oreFerme >= 2) {
                await alertOutreach(supabase, {
                  chiave: `brand-fermo:${brand}`, tipo: "outreach_brand_fermo", ogniOre: 6,
                  titolo: `${brandById.get(brand)?.name ?? "Un brand"}: nessuna email partita da ${Number.isFinite(oreFerme) ? `${Math.floor(oreFerme)} ore` : "inizio giornata"}`,
                  testo: `Ci sono ${primi.length} primi contatti dovuti e ${conPostiLiberi.length} caselle con posti liberi per i nuovi, ma il motore non ne assegna nessuno. Non è il limite del giorno: va controllato.`,
                  url: "/admin/marketing?tab=deliverability",
                });
              }
            } catch { /* il cane da guardia non deve fermare il giro */ }
          }
        }
      }
      if (seguiti.length) {
        const r = assignSenders(seguiti, conUsati(brandSendersPronti), today, today);
        assignments.push(...r.assignments);
        result.deferred += seguiti.length - r.assignments.length;
      }
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

    // UNA SOLA email per destinatario per tick: lo stesso indirizzo in più
    // iscrizioni non riceve più email nello stesso minuto (vedi
    // unaEmailPerDestinatario). Le altre ripartono al giro dopo.
    {
      const { kept, deferred } = unaEmailPerDestinatario(assignments, (id) => queueById.get(id)?.to_email);
      assignments.length = 0;
      assignments.push(...kept);
      result.deferred += deferred;
    }

    // UN SOLO invio per casella per tick (vedi outreach-dispatch-logic.ts):
    // le altre assegnazioni alla stessa casella in questo giro tornano in coda
    // e ripartono al tick successivo, distanziate per davvero.
    {
      const { kept, deferred } = unaAssegnazionePerCasella(assignments);
      assignments.length = 0;
      assignments.push(...kept);
      result.deferred += deferred;
    }

    // Running total per casella, seminato dallo snapshot iniziale. Il contatore
    // viene scritto DOPO OGNI invio (non a fine tick): se il tick viene ucciso
    // dal timeout, i daily_sent già spediti non si perdono e il warm-up cap
    // resta rispettato al tick successivo.
    // Il contatore giornaliero e' incrementato da outreach_prenota_invio PRIMA
    // dell'invio (atomico): niente piu' snapshot letto a inizio tick e riscritto.

    // Le caselle spediscono IN PARALLELO, sempre una per casella per tick: il
    // giro sequenziale con una pausa bloccante di 8-25 s dopo ogni invio metteva
    // un soffitto di ~400 email al giorno a TUTTO il pool, qualunque fosse il
    // numero di caselle. Ogni invio parte con un ritardo casuale di qualche
    // secondo, così le connessioni non si aprono tutte nello stesso istante.
    let fermaTick = false;
    const lavora = async (a: Assignment): Promise<void> => {
      if (fermaTick) return;
      await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 8_000)));
      if (fermaTick) return;
      // Time-budget: usciamo puliti prima del limite 150s della edge. Le righe
      // non ancora prese restano 'queued' per il tick successivo; nessuna resta
      // orfana in 'sending' (le prendiamo solo col CAS appena prima dell'invio).
      if (Date.now() - startedAt > TICK_BUDGET_MS) { result.budgetHit = true; fermaTick = true; return; }
      result.processed++;
      const item = queueById.get(a.queueId);
      const sender = senderById.get(a.senderId);
      if (!item || !sender || !item.to_email) { result.skipped++; return; }

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
          return;
        }
      }

      // gating iscrizione: pausa → resta in coda; terminata → annulla; opt-out → ferma
      const enr = item.enrollment_id ? enrollmentById.get(item.enrollment_id) : null;
      if (enr) {
        if (enr.status === "paused") { result.deferred++; return; }
        // "In pausa" sulla SEQUENZA: prima il dispatcher non la leggeva e
        // continuava a spedire; le righe restano in coda finche' si riprende.
        const st = statoSequenza.get(enr.sequence_id);
        if (st === "paused" || st === "archived") { result.deferred++; return; }
        if (TERMINAL_ENROLLMENT.has(enr.status)) {
          await supabase.from("outreach_send_queue")
            .update({ status: "cancelled", last_error: `enrollment ${enr.status}` }).eq("id", item.id);
          result.skipped++;
          return;
        }
      }
      const contactPre = item.contact_id ? contactById.get(item.contact_id) : null;
      if (contactPre?.optout_email) {
        await supabase.from("outreach_send_queue")
          .update({ status: "cancelled", last_error: "optout_email" }).eq("id", item.id);
        if (enr) await supabase.from("outreach_enrollments")
          .update({ status: "opted_out", next_action_at: null, stop_reason: "optout_email" }).eq("id", enr.id);
        result.skipped++;
        return;
      }

      // Finestra di invio del BRAND (senza una sua, lun–ven 8–19): fuori orario la riga aspetta.
      {
        const bw = sender.brand_id ? brandById.get(sender.brand_id)?.send_window : null;
        if (!isWithinSendWindow(now, finestraDelBrand(bw))) { result.deferred++; return; }
      }

      // CLAIM ATOMICO (compare-and-swap): passiamo a 'sending' SOLO se la riga è
      // ancora 'queued'. `.select()` ritorna le righe effettivamente aggiornate:
      // se un altro run del dispatcher (cron sovrapposto / invocazione manuale)
      // l'ha già presa, qui otteniamo 0 righe → la saltiamo. Senza questo check
      // due tick concorrenti spedirebbero la STESSA email due volte.
      const { data: claimed } = await supabase.from("outreach_send_queue")
        .update({ status: "sending" }).eq("id", item.id).eq("status", "queued").select("id");
      if (!claimed || claimed.length === 0) { result.skipped++; return; }
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
        // «Stile umano» (default): l'email deve sembrare scritta da una persona
        // dal suo client di posta. Niente List-Unsubscribe (Gmail lo mostra come
        // «Annulla iscrizione», e dichiara l'invio massivo): la via d'uscita è
        // una frase nel corpo che invita a rispondere «no», letta dal poller.
        // Se chi scrive non l'ha messa, la mette il motore, prima della firma.
        const stileUmano = brand?.stile_umano !== false;
        const firma = sender.signature || brand?.signature;
        // La frase d'uscita del motore arriva nell'email ma non conta nel
        // controllo di lunghezza: vedi componiCorpo.
        const composto = componiCorpo({
          corpo,
          // Il brand può spegnerla (ThermoDMR, 15/09/2026: «non ci deve essere»):
          // chi risponde «no» viene fermato lo stesso dal gestore delle risposte.
          aggiungiUscita: Boolean(stileUmano && enr && brand?.frase_uscita_automatica !== false && !haFraseUscita(htmlToPlainText(corpo))),
          frase: brand?.frase_uscita,
          firma: firma ? renderTemplate(firma, vars, { seed }) : null,
        });
        corpo = composto.html;
        const testoCorpo = htmlToPlainText(corpo);
        const testoDaControllare = htmlToPlainText(composto.htmlDaControllare);

        // ── THREADING: i follow-up restano nel thread del primo messaggio ──
        const precedenti = enr ? await inviatiPrecedenti(supabase, enr.id) : [];
        // Rete di sicurezza della regola «mai alla stessa ora»: l'assegnazione la
        // controlla sull'ultimo invio letto in blocco, qui si rilegge il thread vero.
        const ultimoDelThread = precedenti.length ? precedenti[precedenti.length - 1].sentAt : null;
        if (ultimoDelThread && orarioTroppoVicino(new Date(), new Date(ultimoDelThread), finestraDelBrand(brand?.send_window).timeZone)) {
          await supabase.from("outreach_send_queue").update({ status: "queued" }).eq("id", item.id).eq("status", "sending");
          result.deferred++;
          return;
        }
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
        const rilievi = lintEmail(subjectFinale, testoDaControllare, { touch: thr.touch });
        if (!puoPartire(rilievi)) {
          const motivi = rilievi.filter((r) => r.gravita === "blocco").map((r) => r.regola).join(", ");
          await supabase.from("outreach_send_queue")
            .update({ status: "skipped", sender_account_id: sender.id, last_error: `copy bloccata dal linter: ${motivi}` })
            .eq("id", item.id);
          console.error(`[outreach-dispatch] COPY BLOCCATA (${motivi}) — riga ${item.id}. Correggi il testo della sequenza.`);
          result.skipped++;
          return;
        }

        // ── FOOTER compliance: indirizzo postale + disiscrizione firmata ──
        let html = corpo;
        let unsubscribeUrl: string | undefined;
        if (item.contact_id) {
          unsubscribeUrl = await appendTrackingSig(
            `${trackingBasePerBrand(item.brand_id ?? null)}/email-tracking?type=unsub&rid=${item.contact_id}&co=${PLATFORM_COMPANY}`,
            { co: PLATFORM_COMPANY, rid: item.contact_id, type: "unsub" },
          );
        }
        // «Stile umano» (default): l'email deve sembrare scritta da una persona dal
        // suo client di posta. Niente link di disiscrizione tracciato — nessuno lo
        // mette in un'email scritta a mano — ma una frase che invita a rispondere:
        // la risposta la legge il poller, che classifica l'intento (not_interested
        // ferma la sequenza, unsubscribe fa opt-out e blocklist). Niente pixel,
        // niente List-Unsubscribe. E i follow-up citano il messaggio precedente.
        const ultimoPrecedente = precedenti.length ? precedenti[precedenti.length - 1] : null;
        let citazione = { testo: "", html: "" };
        if (stileUmano && ultimoPrecedente && thr.inReplyTo) {
          const mittentePrecedente = senderById.get(String(ultimoPrecedente.senderId ?? "")) as { email?: string; display_name?: string | null } | undefined;
          citazione = citazionePrecedente(
            {
              ...ultimoPrecedente,
              // In coda resta il MODELLO («Buongiorno {{nome}},»): si cita il testo come
              // l'ha ricevuto il contatto, con le sue variabili e lo stesso seed dello
              // spintax dell'invio. Fino al 15/09/2026 i 15 follow-up partiti citavano
              // «> Buongiorno {{nome}},» e «serramentisti {{zona}}».
              body: renderTemplate(ultimoPrecedente.body ?? "", vars, { seed }),
              fromEmail: mittentePrecedente?.email ?? sender.email,
              fromName: mittentePrecedente?.display_name ?? brand?.from_name ?? null,
            },
            htmlToPlainText,
          );
          html += citazione.html;
        }
        const addr = brand?.footer_address ? `${brand.footer_address} · ` : "";
        // Base giuridica in una riga (B2B, indirizzi aziendali): trasparenza
        // GDPR art. 13/14 senza informativa a parte. Solo nelle sequenze cold,
        // e SOLO fuori dallo stile umano: chi scrive «stile umano» chiede già
        // nel corpo di rispondere (schema fisso del brand, «poi firma e
        // numero. Nient'altro» — nessuna riga extra dopo la firma), e
        // aggiungerne un'altra automatica rompeva proprio quello schema.
        const gdpr = enr && !stileUmano ? "Ti scrivo perché la tua impresa opera pubblicamente nel settore edile (legittimo interesse, art. 6.1.f GDPR). " : "";
        const unsubHtml = !item.contact_id
          ? ""
          : stileUmano
            ? ""
            : `${gdpr}Non vuoi più ricevere queste email? <a href="${unsubscribeUrl}" style="color:#9ca3af">Disiscriviti</a>.`;
        const footerHtml = (addr || unsubHtml) ? `<p style="font-size:11px;color:#9ca3af;margin-top:24px">${addr}${unsubHtml}</p>` : "";
        html += footerHtml;
        // Part text/plain: corpo + firma, poi la citazione con «> » davanti (come
        // la scrive un client di posta), poi il footer. PRIMA del pixel.
        const text = citazione.testo
          ? htmlToPlainText(corpo) + citazione.testo + (footerHtml ? `\n\n${htmlToPlainText(footerHtml)}` : "")
          : htmlToPlainText(html);
        const seqIdForItem = enr?.sequence_id ?? null;
        const trackOpens = seqIdForItem ? (trackOpensBySequence.get(seqIdForItem) ?? false) : false;
        const plainOnly = seqIdForItem ? (plainTextBySequence.get(seqIdForItem) ?? false) : false;
        if (trackOpens && !plainOnly && !stileUmano) {
          const pixelUrl = await outreachOpenPixelUrl(trackingBasePerBrand(item.brand_id ?? null), item.id);
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
          return;
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
            return;
          }
        }

        // ── INVIO: caselle native (gmail/outlook/smtp) dal loro provider, il
        //    resto (Elastic Email ecc.) via sendEmailUnified come prima ──
        const unsubHeaders = unsubscribeUrl && !stileUmano
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
            fermaTick = true; return;
          }
          // Recapito rifiutato (soppresso, hard fail): non ritentare E fermare l'iscrizione.
          const testoRifiuto = JSON.stringify(esito.body ?? "skipped");
          await supabase.from("outreach_send_queue")
            .update({ status: "skipped", sender_account_id: sender.id, last_error: testoRifiuto })
            .eq("id", item.id);
          // Il server ha risposto che l'indirizzo non esiste (550 5.1.1, user unknown…):
          // come per i rimbalzi letti nella casella, blocklist e DND email sul contatto,
          // così nessun altro invio riparte verso un indirizzo che non va più bene.
          const indirizzoMorto = classificaRifiuto(testoRifiuto).dnd;
          if (indirizzoMorto) {
            await supabase.from("email_suppressions").upsert(
              { company_id: PLATFORM_COMPANY, email: item.to_email, reason: "hard_bounce", notes: `Rifiuto all'invio da ${sender.email}: ${testoRifiuto.slice(0, 120)}` },
              { onConflict: "company_id,email_normalized,reason" },
            );
            if (item.contact_id) {
              await supabase.from("marketing_contacts")
                .update({ optout_email: true, optout_at: new Date().toISOString(), optout_reason: "hard_bounce" })
                .eq("id", item.contact_id).not("optout_email", "is", true);
            }
          }
          if (enr) {
            await supabase.from("outreach_enrollments")
              .update(indirizzoMorto
                ? { status: "bounced", next_action_at: null, stop_reason: "hard_bounce" }
                : { status: "stopped", next_action_at: null, stop_reason: "send_rejected" })
              .eq("id", enr.id);
          }
          result.skipped++;
          return;
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
        // avanza la cadenza: prossimo step email o completamento iscrizione
        if (enr) {
          try { await advanceEnrollment(supabase, enr, contactById.get(item.contact_id), now, item.brand_id ?? null, finestraDelBrand(item.brand_id ? brandById.get(item.brand_id)?.send_window : null)); }
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
        const messaggioErrore = e instanceof Error ? e.message : String(e);
        // Rifiuto per contenuto o reputazione (tipico: «550 Spam Rejected» di
        // Microsoft): non ferma il giro — l'indirizzo è valido e si ritenta —
        // ma se capita spesso alla stessa casella è la sua reputazione che
        // scricchiola, e allora conviene dirlo.
        if (rifiutoPerSpam(messaggioErrore)) {
          await supabase.from("outreach_sender_accounts")
            .update({ complaint_count: (sender.complaint_count ?? 0) + 1 })
            .eq("id", sender.id);
          const { count: rifiutiOggi } = await supabase
            .from("outreach_send_queue")
            .select("id", { count: "exact", head: true })
            .eq("sender_account_id", sender.id)
            .gte("updated_at", new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString())
            .ilike("last_error", "%spam%");
          if ((rifiutiOggi ?? 0) + 1 >= 5) {
            await alertOutreach(supabase, {
              chiave: `reputazione:${sender.id}`, tipo: "outreach_casella_reputazione",
              titolo: `Messaggi rifiutati come spam: ${sender.email}`,
              testo: `${(rifiutiOggi ?? 0) + 1} rifiuti nelle ultime 24 ore (ultimo: ${messaggioErrore.slice(0, 120)}). Gli invii continuano: controlla testo e riscaldamento della casella.`,
              url: "/admin/marketing?tab=deliverability",
            });
          }
        }
        // Retry con backoff esponenziale (15min·2^attempts): niente martellamento
        // ravvicinato di un provider magari in rate-limit. Al tentativo finale
        // fermiamo anche l'iscrizione, altrimenti resta 'active' bloccata.
        const backoffMin = 15 * Math.pow(2, attempts - 1);
        const nextAt = new Date(now.getTime() + backoffMin * 60_000).toISOString();
        await supabase.from("outreach_send_queue").update({
          status: isFinal ? "failed" : "queued",
          attempts,
          scheduled_for: isFinal ? item.scheduled_for : nextAt,
          last_error: messaggioErrore,
        }).eq("id", item.id);
        if (isFinal && enr) {
          await supabase.from("outreach_enrollments")
            .update({ status: "stopped", next_action_at: null, stop_reason: "send_failed" }).eq("id", enr.id);
        }
        result.failed++;
      }
    };
    await inParallelo(assignments, CONCORRENZA_CASELLE, lavora);

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
