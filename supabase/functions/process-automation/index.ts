import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { decryptMaybeEncrypted, getEncryptionKey } from "../_shared/encryption.ts";
import { resolveWhatsAppSender } from "../_shared/resolveWhatsAppSender.ts";
import { sendViaProviderWithFailover, loadProviderSettings, sanitizeFromName } from "../_shared/emailProvider.ts";
import { addEmailCredits, deductEmailCredits } from "../_shared/emailCredits.ts";
import { logEmailDelivery } from "../_shared/email-log.ts";
import { resolveSender } from "../_shared/resolveSender.ts";
import { getSuppressedEmailMap, normalizeEmailAddress } from "../_shared/emailSuppression.ts";

import { getCorsHeaders, secureHeaders } from "../_shared/headers.ts";
import { appendTrackingSig } from "../_shared/emailTrackingSignature.ts";
import { isInternalRequest, isSuperAdminEmailAllowed, requireAuth, requireCompanyAccess, requireInternalSecret, resolveUserEmail } from "../_shared/auth.ts";
import { aiRouterComplete } from "../_shared/aiRouter.ts";
import {
  COMPANY_ONLY_ACTION_IDS,
  isPlatformCompany,
  isPlatformEvent,
  PLATFORM_ACTION_IDS,
  PLATFORM_ADMIN_COMPANY_ID,
  PLATFORM_TRIGGER_EVENT_MAP,
} from "../_shared/platformAutomation.ts";
import { sendEmailUnified } from "../_shared/sendEmailUnified.ts";
import { brandEmailBody } from "../_shared/brandEmailBody.ts";
import { loadContactCustomFieldResolver, applyContactCustomFields } from "../_shared/contactCustomFields.ts";

interface AutomationNode {
  id: string;
  flow_id: string;
  company_id: string;
  node_type: string;
  config_json: Record<string, any>;
  label: string | null;
}

interface AutomationConnection {
  id: string;
  flow_id: string;
  from_node_id: string;
  to_node_id: string;
  label: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const corsH = getCorsHeaders(req);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  try {
    const body = await req.json();
    const { action } = body;

    // ── 1. Trigger: fire a new automation ──
    if (action === "trigger") {
      if (!isInternalRequest(req)) {
        const { userId, supabaseAdmin } = await requireAuth(req, corsH);
        if (!body.company_id || typeof body.company_id !== "string") {
          return new Response(JSON.stringify({ error: "company_id required" }), {
            status: 400,
            headers: { ...corsH, "Content-Type": "application/json" },
          });
        }
        await requireCompanyAccess(supabaseAdmin, userId, body.company_id, corsH);
      }
      return await handleTrigger(supabase, body);
    }

    // ── 2. Process queue: poll pending trigger events, then execute queue items ──
    if (action === "process_queue") {
      requireInternalSecret(req, corsH);
      // First process any pending trigger events from DB triggers
      await processTriggerEvents(supabase);
      return await processQueue(supabase);
    }

    return new Response(JSON.stringify({ error: "Unknown action" }), {
      status: 400,
      headers: { ...corsH, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error("process-automation error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsH, "Content-Type": "application/json" },
    });
  }
});

// ────────────────────────────────────────────────────
// TRIGGER: Find matching published flows and enroll
// ────────────────────────────────────────────────────
async function handleTrigger(supabase: any, body: any) {
  const { trigger_event, company_id, entity_id, entity_type, payload } = body;

  if (!trigger_event || !company_id || !entity_id) {
    return jsonResponse({ error: "Missing trigger_event, company_id, or entity_id" }, 400);
  }

  // ── SEPARAZIONE AREA (trigger) ──
  // Un evento PLATFORM_* deve arruolare SOLO i flussi della platform-admin
  // company. Se arriva con un company_id di un'azienda è un errore o un
  // tentativo di leak cross-area → rifiuta. I flussi azienda non ricevono mai
  // questi eventi perché gli emettitori li scrivono con company_id piattaforma.
  if (isPlatformEvent(trigger_event) && !isPlatformCompany(company_id)) {
    return jsonResponse({
      message: "Platform trigger rejected outside platform context",
      enrolled: 0,
    });
  }

  // Find published flows for this company that have a trigger node matching this event
  const { data: flows, error: flowErr } = await supabase
    .from("automation_flows")
    .select("id, version, config_json")
    .eq("company_id", company_id)
    .eq("status", "published");

  if (flowErr) throw flowErr;
  if (!flows || flows.length === 0) {
    return jsonResponse({ message: "No published flows", enrolled: 0 });
  }

  const flowIds = flows.map((f: any) => f.id);

  // Batch pre-fetch: 3 queries total instead of 3N
  const [nodesResult, enrollmentsResult, connectionsResult] = await Promise.all([
    supabase.from("automation_nodes").select("*").in("flow_id", flowIds).eq("node_type", "trigger"),
    supabase.from("automation_enrollments").select("id, status, flow_id").in("flow_id", flowIds).eq("entity_id", entity_id),
    supabase.from("automation_connections").select("*").in("flow_id", flowIds),
  ]);

  // Build lookup maps
  const nodesByFlow = new Map<string, AutomationNode[]>();
  for (const node of (nodesResult.data ?? [])) {
    if (!nodesByFlow.has(node.flow_id)) nodesByFlow.set(node.flow_id, []);
    nodesByFlow.get(node.flow_id)!.push(node);
  }

  // Tutte le iscrizioni esistenti per flow (non solo l'ultima riga: con la
  // mappa "last-one-wins" un enrollment "active" poteva essere mascherato da
  // una riga successiva con status diverso, causando doppi arruolamenti).
  const enrollmentsByFlow = new Map<string, Array<{ id: string; status: string }>>();
  for (const e of (enrollmentsResult.data ?? [])) {
    if (!enrollmentsByFlow.has(e.flow_id)) enrollmentsByFlow.set(e.flow_id, []);
    enrollmentsByFlow.get(e.flow_id)!.push(e);
  }

  const connectionsByFlow = new Map<string, AutomationConnection[]>();
  for (const c of (connectionsResult.data ?? [])) {
    if (!connectionsByFlow.has(c.flow_id)) connectionsByFlow.set(c.flow_id, []);
    connectionsByFlow.get(c.flow_id)!.push(c);
  }

  // Pre-fetch contact data once (per entity_id, not per flow)
  let enrichedPayload = payload || {};
  if (entity_id && (entity_type === "contact" || !entity_type)) {
    const { data: contactData } = await supabase
      .from("marketing_contacts")
      .select("*")
      .eq("id", entity_id)
      .eq("company_id", company_id)
      .maybeSingle();
    if (contactData) {
      enrichedPayload = { ...contactData, ...enrichedPayload };
    }
  }

  let enrolled = 0;

  // P0-7: supporto `payload.legacy_events` per consolidamento multi-trigger.
  // Un evento può dichiarare alias legacy (es. whatsapp_received consolida
  // anche customer_replied). Un flusso configurato su uno qualsiasi di
  // questi nomi matcha. Non introduce false positive: se `legacy_events`
  // non è un array valido, si degrada all'ugaglianza stretta.
  const legacyEventsRaw = (payload as { legacy_events?: unknown })?.legacy_events;
  const legacyEvents: string[] = Array.isArray(legacyEventsRaw)
    ? legacyEventsRaw.filter((v): v is string => typeof v === "string")
    : [];

  // Il flow-builder salva l'id catalogo (italiano) in `config_json.item_id`,
  // mentre gli emettitori producono l'evento canonico (inglese). Mappa qui gli
  // id ad alta confidenza già emessi, con fallback a trigger_event/item_id.
  const TRIGGER_EVENT_MAP: Record<string, string> = {
    contatto_creato: "contact_created",
    contatto_aggiornato: "contact_updated",
    opportunita_creata: "opportunity_created",
    opportunita_stage_cambiato: "pipeline_stage_change",
    opportunita_vinta: "opportunity_won",
    opportunita_persa: "opportunity_lost",
    appuntamento_creato: "appointment_booked",
    email_aperta: "email_opened",
    email_cliccata: "email_clicked",
    form_compilato: "form_submitted",
    whatsapp_ricevuto: "whatsapp_message_received",
    campagna_facebook_lead: "facebook_lead_received",

    // ── Trigger OPERATIVI (area azienda). Eventi emessi dai DB-trigger della
    // migration 20270616110000 e dal cron check-scheduled-triggers. Mappano
    // l'id catalogo italiano all'evento canonico inglese in automation_trigger_events.
    // Ordini / cantieri (un cantiere è un record orders → stesso evento order_created)
    ordine_creato: "order_created",
    cantiere_creato: "order_created",
    ordine_stato_cambiato: "order_status_changed",
    ordine_in_ritardo: "order_overdue",            // SCHEDULED
    cantiere_in_ritardo: "site_overdue",            // SCHEDULED
    // Fatturazione & incassi
    fattura_creata: "invoice_created",
    fattura_scaduta: "invoice_overdue",             // SCHEDULED (azienda, ≠ fattura_piattaforma_scaduta)
    pagamento_ricevuto: "payment_received",
    costo_registrato: "cost_registered",
    // Preventivi
    preventivo_creato: "quote_created",
    preventivo_accettato: "quote_accepted",
    preventivo_rifiutato: "quote_rejected",
    preventivo_in_scadenza: "quote_expiring",       // SCHEDULED
    // Assistenza / ticket
    ticket_creato: "ticket_created",
    ticket_stato_cambiato: "ticket_status_changed",
    ticket_senza_risposta: "ticket_unanswered",     // SCHEDULED
    // Magazzino
    scorta_minima: "stock_below_minimum",
    prodotto_esaurito: "stock_out",
    carico_magazzino: "stock_received",
    // HR
    dipendente_creato: "employee_created",
    contratto_in_scadenza: "contract_expiring",     // SCHEDULED
    ferie_richiesta: "leave_requested",
    // Task
    task_creato: "task_created",
    task_completato: "task_completed",
    task_scaduto: "task_overdue",                   // SCHEDULED
    // Agenda
    appuntamento_imminente: "appointment_reminder", // SCHEDULED
    // Cron generici (enrollment diretto in check-scheduled-triggers; qui per robustezza)
    cron_giornaliero: "cron_daily",
    cron_settimanale: "cron_weekly",
    cron_mensile: "cron_monthly",
    manuale: "manual_run",
    // Trigger di PIATTAFORMA (id catalogo italiano → nome canonico PLATFORM_*).
    // Fonte unica: _shared/platformAutomation.ts.
    ...PLATFORM_TRIGGER_EVENT_MAP,
  };

  for (const flow of flows) {
    // Use in-memory lookup instead of per-flow query
    const nodes = nodesByFlow.get(flow.id) ?? [];
    const matchingTrigger = nodes.find((n: AutomationNode) => {
      const nodeEvent =
        n.config_json?.trigger_event ??
        TRIGGER_EVENT_MAP[n.config_json?.item_id as string] ??
        n.config_json?.item_id;
      if (!nodeEvent) return false;
      if (nodeEvent === trigger_event) return true;
      return legacyEvents.includes(nodeEvent);
    });

    if (!matchingTrigger) continue;

    // Check if trigger filters match (basic evaluation)
    const filters = matchingTrigger.config_json?.filters;
    if (filters && filters.conditions?.length > 0) {
      if (!evaluateFilters(filters, enrichedPayload)) continue;
    }

    // Check re-enrollment settings (from flow config or trigger config)
    const flowSettings = flow.config_json?.settings || {};
    const allowReEnrollment = flowSettings.enable_reenrollment === true || matchingTrigger.config_json?.allow_re_enrollment === true;

    // Use in-memory lookup instead of per-flow query.
    // Blocca se QUALSIASI iscrizione esistente è in uno stato bloccante.
    const existingEnrollments = enrollmentsByFlow.get(flow.id) ?? [];
    if (existingEnrollments.length > 0) {
      const blockedStatuses = allowReEnrollment ? ["active"] : ["active", "completed"];
      if (existingEnrollments.some((e) => blockedStatuses.includes(e.status))) continue; // Already enrolled or completed (no re-enrollment)
    }

    // Create enrollment
    const { data: enrollment, error: enrollErr } = await supabase
      .from("automation_enrollments")
      .insert({
        flow_id: flow.id,
        company_id,
        entity_id,
        entity_type: entity_type || "contact",
        flow_version: flow.version,
        status: "active",
      })
      .select("id")
      .single();

    if (enrollErr) {
      console.error("Enrollment error:", enrollErr);
      continue;
    }

    // Find the first node after the trigger (in-memory lookup + filter)
    const connections = (connectionsByFlow.get(flow.id) ?? []).filter(
      (c: AutomationConnection) => c.from_node_id === matchingTrigger.id
    );

    if (connections.length > 0) {
      for (const conn of connections) {
        await supabase.from("automation_queue").insert({
          enrollment_id: enrollment.id,
          flow_id: flow.id,
          company_id,
          current_node_id: conn.to_node_id,
          entity_id,
          entity_type: entity_type || "contact",
          status: "pending",
          execute_at: new Date().toISOString(),
          context_json: { payload: payload || {}, branch: conn.label },
        });
      }
    }

    // Log trigger execution
    await supabase.from("automation_execution_log").insert({
      flow_id: flow.id,
      company_id,
      enrollment_id: enrollment.id,
      node_id: matchingTrigger.id,
      node_type: "trigger",
      status: "success",
      input_json: { trigger_event, entity_id, payload },
      output_json: { enrolled: true },
    });

    // Create execution run record for tracking
    await supabase.from("flow_execution_runs").insert({
      flow_id: flow.id,
      company_id,
      enrollment_id: enrollment.id,
      trigger_type: trigger_event,
      trigger_data: { entity_id, entity_type, payload },
      status: "running",
    });

    // Nodo trigger "foglia" (nessuna connessione in uscita): non c'è nulla da
    // accodare, quindi chiudi subito l'enrollment e la run — altrimenti
    // resterebbero per sempre "active"/"running" (stesso comportamento dei
    // nodi goal/end_automation e dei nodi foglia in queueNextNodes).
    if (connections.length === 0) {
      await supabase
        .from("automation_enrollments")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", enrollment.id);
      await completeExecutionRun(supabase, enrollment.id, "completed");
    }

    enrolled++;
  }

  return jsonResponse({ message: `Triggered`, enrolled });
}

// ────────────────────────────────────────────────────
// PROCESS QUEUE: Execute pending queue items
// ────────────────────────────────────────────────────
async function processQueue(supabase: any) {
  const now = new Date().toISOString();

  // Fetch up to 50 pending items ready to execute
  const { data: items, error } = await supabase
    .from("automation_queue")
    .select("*")
    .eq("status", "pending")
    .lte("execute_at", now)
    .order("execute_at", { ascending: true })
    .limit(50);

  if (error) throw error;
  if (!items || items.length === 0) {
    return jsonResponse({ processed: 0 });
  }

  let processed = 0;

  for (const item of items) {
    try {
      // Mark as processing
      await supabase
        .from("automation_queue")
        .update({ status: "processing", updated_at: now })
        .eq("id", item.id);

      // Get the node — distingue errore DB (transiente) da nodo davvero inesistente
      const { data: node, error: nodeErr } = await supabase
        .from("automation_nodes")
        .select("*")
        .eq("id", item.current_node_id)
        .maybeSingle();

      if (nodeErr) {
        console.error(`Queue item ${item.id}: errore DB nel fetch del nodo ${item.current_node_id}:`, nodeErr.message);
        await markQueueItem(supabase, item.id, "failed", `Errore DB: ${nodeErr.message}`);
        continue;
      }

      if (!node) {
        await markQueueItem(supabase, item.id, "failed", "Node not found");
        continue;
      }

      // Execute the node
      const result: any = await executeNode(supabase, node, item);

      // Log execution
      await supabase.from("automation_execution_log").insert({
        flow_id: item.flow_id,
        company_id: item.company_id,
        enrollment_id: item.enrollment_id,
        node_id: node.id,
        node_type: node.node_type,
        status: result.success ? "success" : "error",
        input_json: { entity_id: item.entity_id, config: node.config_json },
        output_json: result.output || {},
        error_message: result.error || null,
      });

      if (!result.success) {
        // Retry logic
        const attempts = item.attempts + 1;
        if (attempts < item.max_attempts) {
          const retryAt = new Date(Date.now() + attempts * 60000).toISOString();
          await supabase
            .from("automation_queue")
            .update({ status: "pending", attempts, execute_at: retryAt, last_error: result.error, updated_at: now })
            .eq("id", item.id);
        } else {
          // Permanent failure — write to dead letter queue before marking failed
          await markQueueItem(supabase, item.id, "failed", result.error);
          await supabase.from("automation_dead_letter").insert({
            flow_id: item.flow_id,
            company_id: item.company_id,
            enrollment_id: item.enrollment_id,
            node_id: item.current_node_id,
            node_type: node?.node_type || "unknown",
            entity_id: item.entity_id,
            entity_type: item.entity_type,
            context_json: item.context_json || {},
            error_message: result.error || "Unknown error after max retries",
            attempts,
            first_failed_at: item.created_at || now,
            last_failed_at: now,
          }).then(() => {}).catch((dlErr: any) => {
            console.error("Dead letter insert failed:", dlErr?.message);
          });
        }
        continue;
      }

      // Mark current item as done
      await markQueueItem(supabase, item.id, "completed");

      // If node type is "goal" or "end_automation", complete enrollment
      if (node.node_type === "goal" || node.config_json?.action_type === "end_automation") {
        await supabase
          .from("automation_enrollments")
          .update({ status: "completed", updated_at: now })
          .eq("id", item.enrollment_id);
        // Complete the execution run
        await completeExecutionRun(supabase, item.enrollment_id, "completed");
        continue;
      }

      // Queue next nodes
      await queueNextNodes(supabase, item, node, result);

      processed++;
    } catch (err: any) {
      console.error(`Queue item ${item.id} error:`, err);
      await markQueueItem(supabase, item.id, "failed", err.message);
      await completeExecutionRun(supabase, item.enrollment_id, "error", err.message);
      // Write uncaught exception to dead letter queue
      await supabase.from("automation_dead_letter").insert({
        flow_id: item.flow_id,
        company_id: item.company_id,
        enrollment_id: item.enrollment_id,
        node_id: item.current_node_id,
        node_type: "unknown",
        entity_id: item.entity_id,
        entity_type: item.entity_type,
        context_json: item.context_json || {},
        error_message: `Uncaught exception: ${err.message}`,
        attempts: item.attempts + 1,
        first_failed_at: item.created_at || now,
        last_failed_at: now,
      }).then(() => {}).catch((dlErr: any) => {
        console.error("Dead letter insert (catch) failed:", dlErr?.message);
      });
    }
  }

  return jsonResponse({ processed });
}

// ────────────────────────────────────────────────────
// EXECUTE NODE
// ────────────────────────────────────────────────────
async function executeNode(supabase: any, node: AutomationNode, queueItem: any) {
  const cfg = node.config_json || {};
  const entityId = queueItem.entity_id;
  const companyId = queueItem.company_id;

  switch (node.node_type) {
    case "delay":
      return executeDelay(cfg);

    case "condition":
      return await executeCondition(supabase, cfg, entityId, companyId);

    case "split":
      return executeSplit(cfg);

    case "action":
      return await executeActionSafe(supabase, cfg, entityId, companyId, queueItem);

    case "goal":
      return { success: true, output: { reached: true } };

    default:
      return { success: true, output: { skipped: true, reason: `Unknown node_type: ${node.node_type}` } };
  }
}

// ── Delay ──
function executeDelay(cfg: Record<string, any>) {
  // Schema UI del nodo "Attendi": giorni/ore/minuti (catalogo). Si sommano.
  const giorni = parseInt(cfg.giorni) || 0;
  const ore = parseInt(cfg.ore) || 0;
  const minuti = parseInt(cfg.minuti) || 0;
  let delayMs = giorni * 86400000 + ore * 3600000 + minuti * 60000;

  // Retro-compat con il vecchio schema delay_value/delay_unit (e usato come
  // fallback se i campi giorni/ore/minuti sono tutti a zero/assenti).
  if (delayMs <= 0 && (cfg.delay_value != null || cfg.delay_unit != null)) {
    const value = parseInt(cfg.delay_value) || 1;
    const unit = cfg.delay_unit || "hours";
    delayMs = unit === "days" ? value * 86400000
      : unit === "minutes" ? value * 60000
      : value * 3600000;
  }
  if (delayMs <= 0) delayMs = 3600000; // default difensivo: 1 ora

  return {
    success: true,
    output: { delay_ms: delayMs, execute_at: new Date(Date.now() + delayMs).toISOString() },
    isDelay: true,
    delayMs,
  };
}

// ── Condition (If/Else) ──
async function executeCondition(supabase: any, cfg: Record<string, any>, entityId: string, companyId: string) {
  // Get contact data
  const { data: contact } = await supabase
    .from("marketing_contacts")
    .select("*")
    .eq("id", entityId)
    .eq("company_id", companyId)
    .maybeSingle();

  if (!contact) {
    return { success: true, output: { branch: "no", reason: "Contact not found" }, branch: "no" };
  }

  const field = cfg.condition_field;
  const operator = cfg.condition_operator;
  const value = cfg.condition_value;

  const contactValue = contact[field];
  let result = false;

  switch (operator) {
    case "equals": result = String(contactValue) === String(value); break;
    case "not_equals": result = String(contactValue) !== String(value); break;
    case "contains": result = String(contactValue || "").includes(String(value)); break;
    case "is_empty": result = !contactValue; break;
    case "is_not_empty": result = !!contactValue; break;
    case "gt": result = Number(contactValue) > Number(value); break;
    case "lt": result = Number(contactValue) < Number(value); break;
    default: result = false;
  }

  return { success: true, output: { branch: result ? "yes" : "no", field, operator, value }, branch: result ? "yes" : "no" };
}

// ── Split ──
function executeSplit(cfg: Record<string, any>) {
  const splitA = parseInt(cfg.split_a) || 50;
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  const rand = (arr[0] / 0xFFFFFFFF) * 100;
  const branch = rand < splitA ? "a" : "b";

  return { success: true, output: { branch, random: rand, split_a: splitA }, branch };
}

// ── Action (safe wrapper with error boundary) ──
async function executeActionSafe(supabase: any, cfg: Record<string, any>, entityId: string, companyId: string, queueItem?: any) {
  try {
    return await executeAction(supabase, cfg, entityId, companyId, queueItem);
  } catch (err: any) {
    const msg = err?.message || String(err);
    console.error(`[executeActionSafe] unhandled error for action_type=${cfg.action_type}:`, msg);
    return { success: false, error: `Unhandled exception in action "${cfg.action_type}": ${msg}` };
  }
}

function queueSafeId(cfg: Record<string, any>, queueItem?: any): string {
  const raw = queueItem?.id ?? cfg.queue_item_id ?? cfg.id ?? cfg.node_id ?? crypto.randomUUID();
  return String(raw).replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);
}

// ── Helpers per azioni di PIATTAFORMA ──
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Esegue una promise best-effort ingoiando qualsiasi errore (rollback/side-effects). */
async function swallow(p: Promise<unknown>): Promise<void> {
  try { await p; } catch { /* ignore */ }
}

/** Password temporanea robusta per il provisioning automatico. */
function generateTempPassword(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  const base = btoa(String.fromCharCode(...bytes)).replace(/[+/=]/g, "").slice(0, 20);
  return `${base}aA1!`;
}

/**
 * Guardia allowlist per le azioni di piattaforma più sensibili: l'autore del
 * flusso (automation_flows.created_by) deve essere un super_admin in allowlist
 * (_shared/auth.ts). Fail-closed: senza autore certo → false.
 */
async function flowAuthorIsAllowedSuperAdmin(supabase: any, flowId: string | undefined): Promise<boolean> {
  if (!flowId) return false;
  const { data: flow } = await supabase
    .from("automation_flows")
    .select("created_by")
    .eq("id", flowId)
    .maybeSingle();
  if (!flow?.created_by) return false;
  const email = await resolveUserEmail(supabase, flow.created_by);
  return isSuperAdminEmailAllowed(email);
}

// ── Action ──
async function executeAction(supabase: any, cfg: Record<string, any>, entityId: string, companyId: string, queueItem?: any) {
  // ── Normalize Italian action IDs to internal handler IDs ──
  const ACTION_ALIASES: Record<string, string> = {
    crea_task: "create_task",
    aggiorna_task: "update_task",
    invia_email: "send_email",
    invia_whatsapp: "send_whatsapp",
    invia_sms: "send_sms",
    invia_notifica_inapp: "send_notification",
    aggiungi_tag: "add_tag",
    rimuovi_tag: "remove_tag",
    crea_opportunita: "create_opportunity",
    sposta_opportunita: "move_opportunity",
    assegna_agente: "assign_user",
    aggiorna_campo: "update_field",
    chiama_webhook: "webhook_out",
    esegui_agente_ai: "send_ai_message",
    chiama_ai: "call_with_ai_agent",
  };

  // ── Normalize Italian config field names to internal names ──
  function normalizeConfig(actionType: string, raw: Record<string, any>): Record<string, any> {
    const c = { ...raw };
    // Task fields
    if (c.titolo && !c.task_title) c.task_title = c.titolo;
    if (c.priorita && !c.task_priority) c.task_priority = c.priorita;
    if (c.note && !c.task_notes) c.task_notes = c.note;
    if (c.descrizione && !c.task_notes) c.task_notes = c.descrizione;
    if (c.scadenza_giorni != null && !c.task_due_days) c.task_due_days = c.scadenza_giorni;
    if (c.assegnato_a && !c.task_assigned_to) c.task_assigned_to = c.assegnato_a;
    // Notification fields
    if (c.titolo && !c.notification_title) c.notification_title = c.titolo;
    if (c.testo && !c.notification_message) c.notification_message = c.testo;
    // Email fields
    if (c.destinatario && !c.email_to) c.email_to = c.destinatario;
    if (c.oggetto && !c.email_subject) c.email_subject = c.oggetto;
    if (c.corpo && !c.email_body) c.email_body = c.corpo;
    // WhatsApp fields
    if (c.numero && !c.whatsapp_to) c.whatsapp_to = c.numero;
    if (c.messaggio && !c.whatsapp_body && !c.whatsapp_text) c.whatsapp_text = c.messaggio;
    // SMS fields
    if (c.numero && !c.sms_to) c.sms_to = c.numero;
    if (c.testo && !c.sms_body && !c.message) c.sms_body = c.testo;
    // Tag fields
    if (c.tags && !c.tag_name) c.tag_name = Array.isArray(c.tags) ? c.tags[0] : c.tags;
    // Opportunity fields
    if (c.nome && !c.opportunity_name) c.opportunity_name = c.nome;
    if (c.valore && !c.opportunity_value) c.opportunity_value = c.valore;
    // Webhook fields
    if (c.url && !c.webhook_url) c.webhook_url = c.url;
    return c;
  }

  // Il flow-builder salva l'id catalogo in `item_id`: usalo come fallback se
  // `action_type` non è impostato (nodi creati a mano, non da template).
  const rawActionType = cfg.action_type ?? cfg.item_id;
  const actionType = ACTION_ALIASES[rawActionType] || rawActionType;
  const ncfg = normalizeConfig(actionType, cfg);

  // ── SEPARAZIONE AREA (azioni) ──
  // Le azioni di PIATTAFORMA girano SOLO se il flusso appartiene alla
  // platform-admin company; le azioni esclusive AZIENDA (ordini/preventivi/
  // cantieri/assistenza/fatturazione) NON girano nel contesto piattaforma.
  const isPlatformCtx = isPlatformCompany(companyId);
  if (PLATFORM_ACTION_IDS.has(rawActionType)) {
    if (!isPlatformCtx) {
      return { success: false, error: `Azione di piattaforma "${rawActionType}" non eseguibile in un contesto azienda` };
    }
  } else if (COMPANY_ONLY_ACTION_IDS.has(rawActionType) && isPlatformCtx) {
    return { success: false, error: `Azione azienda "${rawActionType}" non eseguibile nel contesto piattaforma` };
  }

  // Payload del trigger (chiavi namespacing es. "azienda.id") + resolver {{var}}.
  // Usati dalle azioni di piattaforma per risolvere i placeholder.
  const pPayload: Record<string, any> = (queueItem?.context_json?.payload as Record<string, any>) || {};
  // Chiavi derivate "nome completo": se il trigger non le emette, le ricaviamo da
  // first_name+last_name (es. contatto.full_name) e da nome+cognome (nome_completo),
  // così {{contatto.full_name}} / {{nome_completo}} si risolvono sempre.
  const setFullName = (firstKey: string, lastKey: string, targetKey: string) => {
    if (pPayload[targetKey] != null && String(pPayload[targetKey]).trim() !== "") return;
    const full = [pPayload[firstKey], pPayload[lastKey]]
      .filter((x) => x != null && String(x).trim() !== "")
      .map((x) => String(x).trim())
      .join(" ")
      .trim();
    if (full) pPayload[targetKey] = full;
  };
  for (const k of Object.keys(pPayload)) {
    const m = k.match(/^(.+)\.first_name$/);
    if (m) setFullName(`${m[1]}.first_name`, `${m[1]}.last_name`, `${m[1]}.full_name`);
  }
  setFullName("nome", "cognome", "nome_completo");
  const rv = (s: any): any =>
    typeof s === "string"
      ? s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m: string, k: string) => {
          const v = pPayload[k];
          return v == null ? "" : String(v);
        })
      : s;
  const subjectCompanyId: string = (pPayload["azienda.id"] as string) || entityId;
  const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

  switch (actionType) {
    case "add_tag": {
      const tag = ncfg.tag_name;
      if (!tag) return { success: false, error: "No tag_name configured" };
      const { data: contact } = await supabase
        .from("marketing_contacts")
        .select("tags")
        .eq("id", entityId)
        .eq("company_id", companyId)
        .single();
      const currentTags: string[] = contact?.tags || [];
      if (!currentTags.includes(tag)) {
        await supabase
          .from("marketing_contacts")
          .update({ tags: [...currentTags, tag] })
          .eq("id", entityId)
          .eq("company_id", companyId);
      }
      return { success: true, output: { action: "add_tag", tag } };
    }

    case "remove_tag": {
      const tag = ncfg.tag_name;
      if (!tag) return { success: false, error: "No tag_name configured" };
      const { data: contact } = await supabase
        .from("marketing_contacts")
        .select("tags")
        .eq("id", entityId)
        .eq("company_id", companyId)
        .single();
      const currentTags: string[] = contact?.tags || [];
      await supabase
        .from("marketing_contacts")
        .update({ tags: currentTags.filter((t: string) => t !== tag) })
        .eq("id", entityId)
        .eq("company_id", companyId);
      return { success: true, output: { action: "remove_tag", tag } };
    }

    case "update_field": {
      const field = ncfg.field_name || ncfg.campo;
      const value = ncfg.field_value || ncfg.valore;
      if (!field) return { success: false, error: "No field_name configured" };
      await supabase
        .from("marketing_contacts")
        .update({ [field]: value })
        .eq("id", entityId)
        .eq("company_id", companyId);
      return { success: true, output: { action: "update_field", field, value } };
    }

    case "assign_user": {
      const strategia = ncfg.strategia || "specifico";
      let userId: string | null = null;

      if (strategia === "round_robin" || strategia === "meno_carico") {
        let candidates: string[] = Array.isArray(ncfg.agenti_ids)
          ? ncfg.agenti_ids.filter((x: any) => typeof x === "string" && x)
          : [];
        // retro-compat: se non è stata configurata la lista, usa l'agente singolo
        if (candidates.length === 0 && (ncfg.agente_id || ncfg.assign_to_user_id)) {
          candidates = [ncfg.agente_id || ncfg.assign_to_user_id];
        }
        if (candidates.length === 0) {
          return { success: false, error: "Nessun agente candidato per l'assegnazione (configura gli agenti tra cui distribuire)" };
        }
        if (candidates.length === 1) {
          userId = candidates[0];
        } else if (strategia === "round_robin") {
          // rotazione atomica per (flow_id, node_id)
          let idx = 0;
          const flowId = queueItem?.flow_id;
          const nodeId = queueItem?.current_node_id;
          if (flowId && nodeId) {
            const { data: rr } = await supabase.rpc("automation_assign_next", {
              p_flow_id: flowId, p_node_id: nodeId, p_n: candidates.length,
            });
            if (typeof rr === "number") idx = ((rr % candidates.length) + candidates.length) % candidates.length;
          }
          userId = candidates[idx];
        } else {
          // meno_carico: agente con meno opportunità aperte
          const { data: opps } = await supabase
            .from("marketing_opportunities")
            .select("assigned_to")
            .eq("company_id", companyId)
            .eq("status", "open")
            .in("assigned_to", candidates);
          const counts: Record<string, number> = {};
          for (const c of candidates) counts[c] = 0;
          for (const o of (opps ?? [])) {
            if (o.assigned_to && counts[o.assigned_to] != null) counts[o.assigned_to]++;
          }
          userId = candidates.reduce((best, c) => (counts[c] < counts[best] ? c : best), candidates[0]);
        }
      } else {
        userId = ncfg.assign_to_user_id || ncfg.agente_id || null;
      }

      if (!userId) return { success: false, error: "No assign_to_user_id configured" };
      await supabase
        .from("marketing_contacts")
        .update({ assigned_to: userId })
        .eq("id", entityId)
        .eq("company_id", companyId);
      return { success: true, output: { action: "assign_user", userId, strategia } };
    }

    case "create_opportunity": {
      const name = ncfg.opportunity_name || "Nuova Opportunità";
      const value = ncfg.opportunity_value || 0;
      const pipelineId = ncfg.pipeline_id;
      const stageId = ncfg.stage_id || ncfg.stage;

      const insertData: any = {
        name,
        value,
        contact_id: entityId,
        company_id: companyId,
        status: "open",
      };
      if (pipelineId) insertData.pipeline_id = pipelineId;
      if (stageId) insertData.stage_id = stageId;

      const { error } = await supabase
        .from("marketing_opportunities")
        .insert(insertData);
      if (error) return { success: false, error: error.message };
      return { success: true, output: { action: "create_opportunity", name } };
    }

    case "move_opportunity": {
      const stageId = ncfg.target_stage_id || ncfg.stage;
      if (!stageId) return { success: false, error: "No target_stage_id configured" };
      await supabase
        .from("marketing_opportunities")
        .update({ stage_id: stageId })
        .eq("contact_id", entityId)
        .eq("company_id", companyId)
        .eq("status", "open");
      return { success: true, output: { action: "move_opportunity", stageId } };
    }

    case "create_task": {
      const { error } = await supabase.from("tasks").insert({
        company_id: companyId,
        title: ncfg.task_title || "Attività automatica",
        notes: ncfg.task_notes || null,
        priority: ncfg.task_priority || "normale",
        category: ncfg.task_category || "generale",
        assigned_to: ncfg.task_assigned_to || null,
        status: "da_fare",
        created_by: "00000000-0000-0000-0000-000000000000",
      });
      if (error) return { success: false, error: error.message };
      return { success: true, output: { action: "create_task", title: ncfg.task_title } };
    }

    case "update_task": {
      // Find the most recent non-completed task for this entity
      const { data: existingTask } = await supabase
        .from("tasks")
        .select("id")
        .eq("company_id", companyId)
        .neq("status", "completato")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!existingTask) return { success: false, error: "Nessuna attività trovata da aggiornare" };

      const updateData: Record<string, any> = {};
      if (ncfg.task_title) updateData.title = ncfg.task_title;
      if (ncfg.task_notes) updateData.notes = ncfg.task_notes;
      if (ncfg.task_priority) updateData.priority = ncfg.task_priority;
      if (ncfg.task_assigned_to) updateData.assigned_to = ncfg.task_assigned_to;
      if (ncfg.task_status) updateData.status = ncfg.task_status;
      if (ncfg.task_due_days != null) {
        const due = new Date();
        due.setDate(due.getDate() + (parseInt(ncfg.task_due_days) || 0));
        updateData.due_date = due.toISOString().split("T")[0];
      }

      const { error } = await supabase.from("tasks").update(updateData).eq("id", existingTask.id);
      if (error) return { success: false, error: error.message };
      return { success: true, output: { action: "update_task", task_id: existingTask.id, updated: Object.keys(updateData) } };
    }

    case "send_notification": {
      // Insert real notification into lifecycle_notifications
      const title = ncfg.notification_title || "Notifica automazione";
      const message = ncfg.notification_message || "";
      const recipient = ncfg.notification_recipient || "assigned";

      // Determine which company users should receive the notification
      let targetUserIds: string[] = [];
      if (recipient === "assigned") {
        const { data: contact } = await supabase
          .from("marketing_contacts")
          .select("assigned_to")
          .eq("id", entityId)
          .eq("company_id", companyId)
          .maybeSingle();
        if (contact?.assigned_to) targetUserIds = [contact.assigned_to];
      } else if (recipient === "all_admins") {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id")
          .eq("company_id", companyId);
        if (profiles) {
          const { data: adminRoles } = await supabase
            .from("user_roles")
            .select("user_id")
            .eq("role", "company_admin")
            .in("user_id", profiles.map((p: any) => p.id));
          if (adminRoles) targetUserIds = adminRoles.map((r: any) => r.user_id);
        }
      } else {
        // Specific user ID
        targetUserIds = [recipient];
      }

      // Insert notification
      const { error: notifErr } = await supabase.from("lifecycle_notifications").insert({
        company_id: companyId,
        notification_type: "automation",
        title,
        message,
        metadata: { entity_id: entityId, automation: true, recipient_type: ncfg.notification_recipient },
      });
      if (notifErr) return { success: false, error: notifErr.message };
      return { success: true, output: { action: "send_notification", title, recipients: targetUserIds.length } };
    }

    case "update_contact_score": {
      const mode = ncfg.score_mode || "add";
      const value = parseInt(ncfg.score_value) || 0;
      if (mode === "set") {
        await supabase.from("marketing_contacts").update({ score: value }).eq("id", entityId).eq("company_id", companyId);
      } else if (mode === "subtract") {
        const { data: c } = await supabase.from("marketing_contacts").select("score").eq("id", entityId).eq("company_id", companyId).single();
        const newScore = Math.max(0, (c?.score || 0) - value);
        await supabase.from("marketing_contacts").update({ score: newScore }).eq("id", entityId).eq("company_id", companyId);
      } else {
        // add
        const { data: c } = await supabase.from("marketing_contacts").select("score").eq("id", entityId).eq("company_id", companyId).single();
        const newScore = (c?.score || 0) + value;
        await supabase.from("marketing_contacts").update({ score: newScore }).eq("id", entityId).eq("company_id", companyId);
      }
      return { success: true, output: { action: "update_contact_score", mode, value } };
    }

    case "send_whatsapp": {
      return await executeSendWhatsApp(supabase, ncfg, entityId, companyId);
    }

    case "send_email": {
      return await executeSendEmail(supabase, ncfg, entityId, companyId);
    }

    case "send_sms": {
      // Get contact (telefono + dati per la personalizzazione)
      const { data: smsContact } = await supabase
        .from("marketing_contacts")
        .select("id, phone, first_name, last_name, email, city, province, company_name, source")
        .eq("id", entityId)
        .eq("company_id", companyId)
        .maybeSingle();

      if (!smsContact?.phone) {
        return { success: false, error: "Contatto senza numero di telefono" };
      }

      // Personalizza il testo SMS (prima era inviato grezzo, con i {{...}} letterali).
      const smsBody = await resolveContactText(
        supabase,
        ncfg.sms_body || ncfg.message || "Messaggio automatico",
        smsContact,
        companyId,
      );
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const cronKey = Deno.env.get("INTERNAL_CRON_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

      try {
        const smsRes = await fetch(`${supabaseUrl}/functions/v1/telnyx-proxy`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-cron-secret": cronKey,
          },
          body: JSON.stringify({
            action: "send_sms",
            company_id: companyId,
            payload: {
              to: smsContact.phone,
              body: smsBody,
              contact_id: entityId,
            },
          }),
        });
        const smsResult = await smsRes.json();
        if (!smsRes.ok || smsResult?.error) {
          return { success: false, error: smsResult?.error || `HTTP ${smsRes.status}` };
        }
        return { success: true, output: { action: "send_sms", message_id: smsResult?.message_id } };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }

    case "send_ai_message": {
      try {
        // 1. Load contact data for context
        const { data: aiContact } = await supabase
          .from("marketing_contacts")
          .select("first_name, last_name, email, phone, company_name, tags, score")
          .eq("id", entityId)
          .eq("company_id", companyId)
          .maybeSingle();

        if (!aiContact) return { success: false, error: "Contatto non trovato" };

        const aiPrompt = ncfg.ai_prompt || ncfg.prompt || "Scrivi un messaggio di follow-up.";
        const aiTone = ncfg.ai_tone || "professional";
        const aiLanguage = ncfg.ai_language || "it";
        const aiMaxLength = parseInt(ncfg.ai_max_length) || 500;
        const aiChannel = ncfg.ai_channel || "email";

        const toneMap: Record<string, string> = {
          professional: "professionale e cortese",
          friendly: "amichevole e informale",
          formal: "formale e istituzionale",
        };
        const langMap: Record<string, string> = { it: "italiano", en: "inglese" };

        const systemPrompt = `Sei un assistente marketing. Genera un messaggio per il canale "${aiChannel}".
Tono: ${toneMap[aiTone] || aiTone}. Lingua: ${langMap[aiLanguage] || aiLanguage}.
Lunghezza massima: ${aiMaxLength} caratteri.
${aiChannel === "email" ? "Genera subject (max 60 char) e body separati. Formato:\nSUBJECT: ...\nBODY: ..." : "Genera solo il testo del messaggio."}
Non usare markdown. Non aggiungere saluti generici se non richiesto.`;

        const userPrompt = `Contatto: ${aiContact.first_name} ${aiContact.last_name}
Email: ${aiContact.email || "N/A"}, Telefono: ${aiContact.phone || "N/A"}
Azienda: ${aiContact.company_name || "N/A"}, Score: ${aiContact.score || 0}
Tags: ${(aiContact.tags || []).join(", ") || "nessuno"}

Istruzione: ${aiPrompt}`;

        const aiResult = await aiRouterComplete({
          supabase,
          taskKey: "automation_message_generate",
          companyId,
          userId: null,
          idempotencyKey: `automation_message_generate_${companyId}_${entityId}_${queueSafeId(ncfg, queueItem)}`,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          params: { max_tokens: 1024, temperature: 0.35 },
        });

        const generatedText = aiResult.content || "";
        if (!generatedText) return { success: false, error: "AI non ha generato testo" };

        // 3. Dispatch to channel
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

        if (aiChannel === "email") {
          let subject = "Messaggio automatico";
          let body = generatedText;
          const subjectMatch = generatedText.match(/SUBJECT:\s*(.+?)(?:\n|$)/i);
          const bodyMatch = generatedText.match(/BODY:\s*([\s\S]+)/i);
          if (subjectMatch) subject = subjectMatch[1].trim();
          if (bodyMatch) body = bodyMatch[1].trim();

          return await executeSendEmail(supabase, { ...ncfg, email_subject: subject, email_body: body }, entityId, companyId);
        } else if (aiChannel === "whatsapp") {
          return await executeSendWhatsApp(supabase, { ...ncfg, whatsapp_body: generatedText }, entityId, companyId);
        } else if (aiChannel === "sms") {
          if (!aiContact.phone) return { success: false, error: "Contatto senza telefono" };
          const aiSmsCronKey = Deno.env.get("INTERNAL_CRON_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const smsRes = await fetch(`${supabaseUrl}/functions/v1/telnyx-proxy`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-cron-secret": aiSmsCronKey },
            body: JSON.stringify({
              action: "send_sms", company_id: companyId,
              payload: { to: aiContact.phone, body: generatedText, contact_id: entityId },
            }),
          });
          const smsResult = await smsRes.json();
          if (!smsRes.ok || smsResult?.error) return { success: false, error: smsResult?.error || `HTTP ${smsRes.status}` };
          return { success: true, output: { action: "send_ai_message", channel: "sms", message_id: smsResult?.message_id } };
        }

        return { success: true, output: { action: "send_ai_message", channel: aiChannel, generated: true } };
      } catch (aiErr: any) {
        console.error("[send_ai_message] error:", aiErr);
        return { success: false, error: aiErr.message };
      }
    }

    case "remove_from_automation": {
      const targetFlowId = ncfg.target_flow_id;
      if (!targetFlowId) return { success: false, error: "No target_flow_id configured" };
      // Remove active enrollments for this entity in the target flow
      const { data: removed, error: removeErr } = await supabase
        .from("automation_enrollments")
        .update({ status: "removed", updated_at: new Date().toISOString() })
        .eq("flow_id", targetFlowId)
        .eq("entity_id", entityId)
        .eq("status", "active")
        .select("id");
      if (removeErr) return { success: false, error: removeErr.message };
      // Also cancel any pending queue items for these enrollments
      if (removed && removed.length > 0) {
        for (const enrollment of removed) {
          await supabase
            .from("automation_queue")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("enrollment_id", enrollment.id)
            .eq("status", "pending");
        }
      }
      return { success: true, output: { action: "remove_from_automation", target_flow_id: targetFlowId, removed_count: removed?.length || 0 } };
    }

    case "wait_for_event": {
      // This action puts the enrollment in a "waiting" state
      // The actual waiting is handled by setting a delayed queue item
      // When the awaited event fires, processTriggerEvents will check for waiting enrollments
      return {
        success: true,
        output: { action: "wait_for_event", waiting: true, await_event: ncfg.await_event, timeout_days: ncfg.timeout_days || 7 },
        isWaiting: true,
        awaitEvent: ncfg.await_event,
        timeoutDays: parseInt(ncfg.timeout_days) || 7,
      };
    }

    case "webhook_out": {
      const url = ncfg.webhook_url;
      if (!url) return { success: false, error: "No webhook_url configured" };

      // SSRF protection
      try {
        const parsed = new URL(url);
        const BLOCKED_HOSTS = ["localhost", "127.0.0.1", "0.0.0.0", "169.254.169.254", "[::1]"];
        const BLOCKED_PREFIXES = ["10.", "172.16.", "172.17.", "172.18.", "172.19.", "172.20.", "172.21.", "172.22.", "172.23.", "172.24.", "172.25.", "172.26.", "172.27.", "172.28.", "172.29.", "172.30.", "172.31.", "192.168."];
        if (
          BLOCKED_HOSTS.includes(parsed.hostname) ||
          BLOCKED_PREFIXES.some(p => parsed.hostname.startsWith(p)) ||
          parsed.protocol === "file:"
        ) {
          return { success: false, error: `Webhook verso indirizzo non permesso: ${parsed.hostname}` };
        }
      } catch {
        return { success: false, error: `URL non valido: ${url}` };
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10_000);
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entity_id: entityId, company_id: companyId, config: ncfg }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const text = await resp.text();
        return { success: resp.ok, output: { action: "webhook_out", status: resp.status, body: text.slice(0, 500) }, error: resp.ok ? undefined : `HTTP ${resp.status}` };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }

    // ── 6 New cross-domain handlers (FLOW-EXT-04) ──

    case "crea_bozza_ordine": {
      const title = ncfg.titolo || ncfg.task_title || "Nuovo ordine automatico";
      const clienteId = ncfg.cliente_id || entityId;
      const importo = parseFloat(String(ncfg.importo || 0)) || 0;
      const { data, error } = await supabase.from("orders").insert({
        company_id: companyId,
        title,
        contact_id: clienteId,
        total_amount: importo,
        status: "draft",
        notes: ncfg.note || null,
      }).select("id").single();
      if (error) return { success: false, error: error.message };
      return { success: true, output: { action: "crea_bozza_ordine", ordine_id: data?.id } };
    }

    case "crea_bozza_preventivo": {
      const title = ncfg.titolo || "Nuovo preventivo automatico";
      const clienteId = ncfg.cliente_id || entityId;
      const { data, error } = await supabase.from("quotes").insert({
        company_id: companyId,
        title,
        contact_id: clienteId,
        status: "draft",
      }).select("id").single();
      if (error) return { success: false, error: error.message };
      return { success: true, output: { action: "crea_bozza_preventivo", preventivo_id: data?.id } };
    }

    case "crea_cantiere": {
      // Un "cantiere"/commessa è un record della tabella `orders` (order_type='cliente').
      // Rispecchia il path ufficiale preventivo→cantiere (migration converti_preventivo_cantiere
      // + RPC sr_converti_in_ordine): customer_id nullable, dati cliente denormalizzati nei
      // campi client_*, status testuale 'confermato'.
      const nome = ncfg.nome || "Cantiere automatico";
      const importo = parseFloat(String(ncfg.importo ?? 0)) || 0;

      // Arricchisci dai dati del contatto marketing (entity del flow), se disponibile.
      const { data: cantiereContact } = await supabase
        .from("marketing_contacts")
        .select("first_name, last_name, email, phone, company_name, address, customer_profile_id")
        .eq("id", entityId)
        .eq("company_id", companyId)
        .maybeSingle();

      const clientName = cantiereContact
        ? [cantiereContact.first_name, cantiereContact.last_name].filter(Boolean).join(" ").trim() || null
        : null;

      // `customer_id` referenzia profiles(id): l'entity del flow è un marketing_contact,
      // quindi usa il profilo collegato se esiste, altrimenti lascia null (i dati cliente
      // restano nei campi client_*). Mai assegnare l'id del contatto a customer_id (FK su profiles).
      const customerId = cantiereContact?.customer_profile_id || null;

      // data_inizio = giorni da oggi (default catalogo: 7)
      const parsedStart = parseInt(String(ncfg.data_inizio));
      const startOffsetDays = Number.isFinite(parsedStart) ? Math.max(parsedStart, 0) : 7;
      const workStart = new Date(Date.now() + startOffsetDays * 86400000);

      const cantierePayload: Record<string, any> = {
        company_id: companyId,
        description: nome,
        total_amount: importo,
        balance_amount: importo,
        order_type: "cliente",
        status: "confermato",
        customer_id: customerId,
        client_name: clientName,
        client_email: cantiereContact?.email || null,
        client_phone: cantiereContact?.phone || null,
        client_company: cantiereContact?.company_name || null,
        client_address: cantiereContact?.address || null,
        work_start_date: workStart.toISOString().split("T")[0],
        internal_notes: "Cantiere aperto automaticamente da un'automazione.",
      };
      // user_select → id profilo/utente valido; assigned_to ha FK su profiles ON DELETE SET NULL.
      if (ncfg.responsabile_id) cantierePayload.assigned_to = ncfg.responsabile_id;

      const { data, error } = await supabase
        .from("orders")
        .insert(cantierePayload)
        .select("id")
        .single();
      if (error) return { success: false, error: error.message };
      return { success: true, output: { action: "crea_cantiere", cantiere_id: data?.id, nome } };
    }

    case "crea_appuntamento": {
      const title = ncfg.titolo || "Appuntamento automatico";
      const giorniDaOggi = parseInt(ncfg.giorni_da_oggi) || 1;
      const appointmentDate = new Date();
      appointmentDate.setDate(appointmentDate.getDate() + giorniDaOggi);
      const { data, error } = await supabase.from("appointments").insert({
        company_id: companyId,
        title,
        contact_id: ncfg.contact_id || entityId,
        appointment_date: appointmentDate.toISOString().split("T")[0],
        appointment_time: ncfg.orario || "10:00",
        appointment_type: ncfg.tipo || "in_sede",
        assigned_to: ncfg.assegnato_a || null,
        status: "confermato",
        created_by: "00000000-0000-0000-0000-000000000000",
      }).select("id").single();
      if (error) return { success: false, error: error.message };
      return { success: true, output: { action: "crea_appuntamento", appuntamento_id: data?.id } };
    }

    case "crea_ticket": {
      const oggetto = ncfg.oggetto || "Ticket automatico";
      const { data, error } = await supabase.from("tickets").insert({
        company_id: companyId,
        subject: oggetto,
        description: ncfg.descrizione || null,
        priority: ncfg.priorita || "media",
        contact_id: ncfg.cliente_id || entityId,
        status: "open",
      }).select("id").single();
      if (error) return { success: false, error: error.message };
      return { success: true, output: { action: "crea_ticket", ticket_id: data?.id } };
    }

    case "crea_fattura": {
      const importo = parseFloat(String(ncfg.importo || 0)) || 0;
      const scadenzaGiorni = parseInt(ncfg.scadenza_giorni) || 30;
      const scadenza = new Date();
      scadenza.setDate(scadenza.getDate() + scadenzaGiorni);
      const { data, error } = await supabase.from("invoices").insert({
        company_id: companyId,
        contact_id: ncfg.cliente_id || entityId,
        total_amount: importo,
        description: ncfg.descrizione || "Fattura automatica",
        due_date: scadenza.toISOString().split("T")[0],
        status: "draft",
      }).select("id").single();
      if (error) return { success: false, error: error.message };
      return { success: true, output: { action: "crea_fattura", fattura_id: data?.id } };
    }

    case "end_automation":
      return { success: true, output: { action: "end_automation" } };

    case "sync_google":
      return await executeSyncGoogle(supabase, ncfg, entityId, companyId);

    case "sync_meta_lead":
      return await executeSyncMetaLead(supabase, ncfg, entityId, companyId);

    case "call_with_ai_agent": {
      const aiAgentId = ncfg.ai_agent_id;
      if (!aiAgentId) return { success: false, error: "No ai_agent_id configured" };
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const resp = await fetch(`${supabaseUrl}/functions/v1/initiate-outbound-call`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceKey}`,
          },
          // company_id + user_id sono obbligatori sul ramo service di
          // initiate-outbound-call: senza company_id la ricerca agente falliva.
          body: JSON.stringify({ agent_id: aiAgentId, contact_id: entityId, company_id: companyId, user_id: SYSTEM_USER_ID }),
        });
        const result = await resp.json();
        if (!resp.ok) return { success: false, error: result?.error || `HTTP ${resp.status}` };
        return { success: true, output: { action: "call_with_ai_agent", agent_id: aiAgentId, ...result } };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }

    case "vai_a": {
      // Salta a un nodo specifico del flow invece di seguire gli archi del grafo.
      // Il vero accodamento è gestito da queueNextNodes (result.isJump), con validazione
      // del nodo destinazione e backstop anti-loop.
      const targetNodeId = ncfg.target_node_id;
      if (!targetNodeId) return { success: false, error: "No target_node_id configured" };
      return {
        success: true,
        output: { action: "vai_a", target_node_id: String(targetNodeId), label: ncfg.label || null },
        isJump: true,
        jumpToNodeId: String(targetNodeId),
      };
    }

    case "drip_sequenza": {
      // Sequenza a goccia: accoda i nodi successori N volte a intervalli crescenti.
      // L'accodamento temporizzato è gestito da queueNextNodes (result.isDrip).
      const intervalHours = parseInt(String(ncfg.intervallo_ore)) || 24;
      const count = Math.min(Math.max(parseInt(String(ncfg.num_messaggi)) || 1, 1), 20);
      return {
        success: true,
        output: { action: "drip_sequenza", num_messaggi: count, intervallo_ore: intervalHours, label: ncfg.label || null },
        isDrip: true,
        dripCount: count,
        dripIntervalMs: intervalHours * 3600000,
      };
    }

    // ═══════════════════════════════════════════════════════════════════
    // AZIONI DI PIATTAFORMA (solo area superadmin)
    // La guardia di contesto sopra garantisce isPlatformCtx === true qui.
    // Le 3 più sensibili richiedono in più l'autore super_admin in allowlist.
    // ═══════════════════════════════════════════════════════════════════
    case "invia_email_admin_azienda": {
      let to = String(rv(ncfg.email_to) || rv(cfg.destinatario) || pPayload["azienda.email"] || "").trim();
      if (!to) {
        const { data: comp } = await supabase.from("companies").select("email").eq("id", subjectCompanyId).maybeSingle();
        to = String(comp?.email || "").trim();
      }
      if (!to) return { success: false, error: "Email admin azienda non determinabile" };
      const subject = rv(cfg.oggetto) || "Comunicazione dalla piattaforma";
      const branded = await brandEmailBody(supabase, subjectCompanyId, rv(cfg.corpo) || "", subject);
      const res = await sendEmailUnified({
        companyId: subjectCompanyId,
        stream: "transactional",
        to,
        subject,
        html: branded.html,
        text: branded.text,
        adminClient: supabase,
        metadata: { source: "platform_automation", action: "invia_email_admin_azienda" },
      });
      if (!res?.ok) return { success: false, error: `Invio email fallito (status ${res?.status ?? "?"})` };
      return { success: true, output: { action: "invia_email_admin_azienda", to } };
    }

    case "crea_cs_task": {
      const PRIO: Record<string, string> = { urgente: "urgent", alta: "high", media: "medium", bassa: "low" };
      let dueDate: string | null = null;
      const dueDays = cfg.scadenza_giorni != null ? parseInt(String(cfg.scadenza_giorni)) : NaN;
      if (!Number.isNaN(dueDays)) {
        const d = new Date(); d.setDate(d.getDate() + dueDays); dueDate = d.toISOString().split("T")[0];
      }
      const { data, error } = await supabase.from("cs_tasks").insert({
        company_id: subjectCompanyId,
        title: rv(cfg.titolo) || "CS Task",
        description: rv(cfg.descrizione) || null,
        priority: PRIO[String(cfg.priorita)] || "medium",
        status: "open",
        task_type: "automation",
        due_date: dueDate,
        assigned_to: UUID_RE.test(String(cfg.assegnato_a || "")) ? cfg.assegnato_a : null,
        created_by: SYSTEM_USER_ID,
      }).select("id").maybeSingle();
      if (error) return { success: false, error: error.message };
      return { success: true, output: { action: "crea_cs_task", "cs_task.id": data?.id } };
    }

    case "cambia_piano_azienda": {
      if (!(await flowAuthorIsAllowedSuperAdmin(supabase, queueItem?.flow_id))) {
        return { success: false, error: "Autorizzazione super_admin (allowlist) richiesta per cambiare piano" };
      }
      const planRef = String(rv(cfg.nuovo_piano) || "").trim().toLowerCase().replace(/[^\w \-]/g, "");
      if (!planRef) return { success: false, error: "Piano non specificato" };
      const { data: plan } = await supabase
        .from("subscription_plans")
        .select("id, name, slug")
        .or(`slug.eq.${planRef},name.ilike.${planRef}`)
        .limit(1)
        .maybeSingle();
      if (!plan?.id) return { success: false, error: `Piano "${planRef}" non trovato` };
      const { error } = await supabase.from("companies").update({ subscription_plan_id: plan.id }).eq("id", subjectCompanyId);
      if (error) return { success: false, error: error.message };
      return { success: true, output: { action: "cambia_piano_azienda", plan: plan.slug } };
    }

    case "aggiungi_nota_azienda": {
      const content = rv(cfg.testo) || "";
      if (!content) return { success: false, error: "Nota vuota" };
      const { error } = await supabase.from("company_notes").insert({
        company_id: subjectCompanyId,
        author_id: SYSTEM_USER_ID,
        content,
      });
      if (error) return { success: false, error: error.message };
      return { success: true, output: { action: "aggiungi_nota_azienda" } };
    }

    case "invia_notifica_team_admin": {
      const message = rv(cfg.messaggio) || "Notifica piattaforma";
      const { data: admins } = await supabase.from("user_roles").select("user_id").eq("role", "super_admin");
      const ids: string[] = Array.from(new Set((admins || []).map((r: any) => r.user_id).filter(Boolean)));
      if (ids.length === 0) {
        return { success: true, output: { action: "invia_notifica_team_admin", notified: 0, note: "Nessun super_admin trovato" } };
      }
      const rows = ids.map((uid) => ({
        company_id: PLATFORM_ADMIN_COMPANY_ID,
        user_id: uid,
        type: "platform_automation",
        title: String(message).slice(0, 120),
        body: message,
        entity_type: "company",
        entity_id: UUID_RE.test(String(subjectCompanyId)) ? subjectCompanyId : null,
      }));
      const { error } = await supabase.from("notifications").insert(rows);
      if (error) return { success: false, error: error.message };
      return { success: true, output: { action: "invia_notifica_team_admin", notified: ids.length } };
    }

    case "crea_account_azienda": {
      if (!(await flowAuthorIsAllowedSuperAdmin(supabase, queueItem?.flow_id))) {
        return { success: false, error: "Autorizzazione super_admin (allowlist) richiesta per il provisioning" };
      }
      const email = String(rv(cfg.email) || pPayload["contatto.email"] || pPayload["azienda.email"] || "").trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { success: false, error: "Email admin non valida per il provisioning" };
      const name = String(rv(cfg.nome) || pPayload["azienda.name"] || pPayload["contatto.company_name"] || `Azienda ${email.split("@")[0]}`).slice(0, 120);
      const planRef = String(rv(cfg.piano) || "").trim().toLowerCase().replace(/[^\w \-]/g, "");
      let planId: string | null = null;
      let trialDays = parseInt(String(cfg.trial_giorni ?? 0)) || 0;
      if (planRef) {
        const { data: plan } = await supabase.from("subscription_plans").select("id, trial_days").or(`slug.eq.${planRef},name.ilike.${planRef}`).limit(1).maybeSingle();
        if (plan?.id) { planId = plan.id; if (!cfg.trial_giorni && plan.trial_days) trialDays = plan.trial_days; }
      }
      const trialEndsAt = trialDays > 0 ? new Date(Date.now() + trialDays * 86400000).toISOString() : null;
      const password = generateTempPassword();
      const { data: authData, error: authErr } = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
      if (authErr || !authData?.user?.id) return { success: false, error: `Creazione utente fallita: ${authErr?.message || "unknown"}` };
      const newUserId = authData.user.id;
      const { data: companyRow, error: compErr } = await supabase.from("companies").insert({
        name, email, sector: "altro",
        status: trialDays > 0 ? "trial" : "active",
        trial_ends_at: trialEndsAt,
        subscription_plan_id: planId,
      }).select("id").single();
      if (compErr || !companyRow?.id) {
        await swallow(supabase.auth.admin.deleteUser(newUserId));
        return { success: false, error: `Creazione azienda fallita: ${compErr?.message || "unknown"}` };
      }
      const newCompanyId = companyRow.id;
      const { error: profErr } = await supabase.from("profiles").insert({
        id: newUserId, email, first_name: "Admin", last_name: name, company_id: newCompanyId,
      });
      if (profErr) {
        await swallow(supabase.from("companies").delete().eq("id", newCompanyId));
        await swallow(supabase.auth.admin.deleteUser(newUserId));
        return { success: false, error: `Creazione profilo fallita: ${profErr.message}` };
      }
      await swallow(supabase.from("user_roles").insert({ user_id: newUserId, role: "company_admin" }));
      if (cfg.invia_credenziali !== "no") {
        await swallow(sendEmailUnified({
          companyId: newCompanyId, stream: "transactional", to: email,
          subject: "Il tuo account EdiliziaInCloud è pronto",
          html: `<p>Benvenuto, ${name}.</p><p>Accedi con:<br/>Email: <b>${email}</b><br/>Password temporanea: <b>${password}</b></p><p>Cambia la password al primo accesso.</p>`,
          adminClient: supabase, metadata: { source: "platform_automation", action: "crea_account_azienda" },
        }));
      }
      return { success: true, output: { action: "crea_account_azienda", "nuovo_account.id": newCompanyId, "nuovo_account.email_admin": email } };
    }

    case "invia_fattura": {
      if (!(await flowAuthorIsAllowedSuperAdmin(supabase, queueItem?.flow_id))) {
        return { success: false, error: "Autorizzazione super_admin (allowlist) richiesta per fatturare" };
      }
      const importo = Number(cfg.importo);
      if (!Number.isFinite(importo) || importo < 0) return { success: false, error: "Importo fattura non valido" };
      const scadenzaGiorni = parseInt(String(cfg.scadenza_giorni ?? 30)) || 30;
      const now = new Date();
      const periodEnd = new Date(now.getTime() + scadenzaGiorni * 86400000);
      const synthId = `manual_${crypto.randomUUID()}`;
      const { data, error } = await supabase.from("subscription_invoices").insert({
        company_id: subjectCompanyId,
        stripe_invoice_id: synthId,
        amount_due: Math.round(importo * 100),
        amount_paid: 0,
        currency: "eur",
        status: "open",
        period_start: now.toISOString(),
        period_end: periodEnd.toISOString(),
      }).select("id").maybeSingle();
      if (error) return { success: false, error: error.message };
      if (cfg.invia_email !== "no") {
        const { data: comp } = await supabase.from("companies").select("email").eq("id", subjectCompanyId).maybeSingle();
        const to = String(pPayload["azienda.email"] || comp?.email || "").trim();
        if (to) {
          await swallow(sendEmailUnified({
            companyId: subjectCompanyId, stream: "transactional", to,
            subject: "Nuova fattura EdiliziaInCloud",
            html: `<p>${rv(cfg.descrizione) || "Fattura"}</p><p>Importo: € ${importo.toFixed(2)}</p>`,
            adminClient: supabase, metadata: { source: "platform_automation", action: "invia_fattura" },
          }));
        }
      }
      return { success: true, output: { action: "invia_fattura", "fattura.id": data?.id, "fattura.numero": synthId } };
    }

    case "attiva_onboarding": {
      const { data: tpl } = await supabase
        .from("onboarding_templates")
        .select("id")
        .order("is_default", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!tpl?.id) {
        return { success: true, output: { action: "attiva_onboarding", skipped: true, reason: "Nessun onboarding_template disponibile" } };
      }
      const { error } = await supabase.from("company_onboarding").insert({
        company_id: subjectCompanyId,
        template_id: tpl.id,
        assigned_cs: UUID_RE.test(String(cfg.assegna_cs || "")) ? cfg.assegna_cs : null,
        status: "in_progress",
      });
      if (error) {
        if (String(error.code) === "23505" || /duplicate|unique/i.test(error.message || "")) {
          return { success: true, output: { action: "attiva_onboarding", already_active: true } };
        }
        return { success: false, error: error.message };
      }
      return { success: true, output: { action: "attiva_onboarding", template_id: tpl.id } };
    }

    default:
      return { success: true, output: { action: actionType, skipped: true, reason: "Not implemented yet" } };
  }
}

// ────────────────────────────────────────────────────
// QUEUE NEXT NODES
// ────────────────────────────────────────────────────
async function queueNextNodes(supabase: any, queueItem: any, node: AutomationNode, result: any) {
  // ── vai_a (Go To): salta a un nodo specifico ignorando gli archi del grafo ──
  // Va prima del controllo "nessuna connessione": un nodo vai_a può non avere archi uscenti.
  if (result.isJump && result.jumpToNodeId) {
    // Il nodo destinazione deve esistere e appartenere a questo flow.
    const { data: targetNode } = await supabase
      .from("automation_nodes")
      .select("id")
      .eq("id", result.jumpToNodeId)
      .eq("flow_id", queueItem.flow_id)
      .maybeSingle();

    if (!targetNode) {
      await supabase
        .from("automation_enrollments")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", queueItem.enrollment_id);
      await completeExecutionRun(supabase, queueItem.enrollment_id, "error", `vai_a: nodo destinazione ${result.jumpToNodeId} non trovato nel flow`);
      return;
    }

    // Backstop anti-loop: limita il numero totale di salti per iscrizione.
    const jumpCount = (Number(queueItem.context_json?._jump_count) || 0) + 1;
    if (jumpCount > 200) {
      await supabase
        .from("automation_enrollments")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("id", queueItem.enrollment_id);
      await completeExecutionRun(supabase, queueItem.enrollment_id, "error", "vai_a: limite massimo di salti raggiunto (possibile loop nel flow)");
      return;
    }

    await supabase.from("automation_queue").insert({
      enrollment_id: queueItem.enrollment_id,
      flow_id: queueItem.flow_id,
      company_id: queueItem.company_id,
      current_node_id: result.jumpToNodeId,
      entity_id: queueItem.entity_id,
      entity_type: queueItem.entity_type,
      status: "pending",
      execute_at: new Date().toISOString(),
      context_json: { ...queueItem.context_json, _jump_count: jumpCount, jumped_from: node.id, prev_result: result.output },
    });
    return;
  }

  // Get all connections from this node
  const { data: connections } = await supabase
    .from("automation_connections")
    .select("*")
    .eq("flow_id", queueItem.flow_id)
    .eq("from_node_id", node.id);

  if (!connections || connections.length === 0) {
    // No next node — complete enrollment
    await supabase
      .from("automation_enrollments")
      .update({ status: "completed", updated_at: new Date().toISOString() })
      .eq("id", queueItem.enrollment_id);
    await completeExecutionRun(supabase, queueItem.enrollment_id, "completed");
    return;
  }

  // For branching nodes, filter connections by branch label
  let nextConns = connections;
  if (result.branch && (node.node_type === "condition" || node.node_type === "split")) {
    if (node.node_type === "split") {
      // executeSplit returns "a" or "b"; connection labels are "A: 50%" / "B: 50%"
      nextConns = connections.filter((c: AutomationConnection) =>
        c.label?.toLowerCase().charAt(0) === result.branch.toLowerCase()
      );
    } else {
      // condition branches: labels are "yes" / "no"
      nextConns = connections.filter((c: AutomationConnection) => c.label === result.branch);
    }
    // If no labeled connections found, fall back to all connections
    if (nextConns.length === 0) nextConns = connections;
  }

  // Handle wait_for_event: create a "waiting" queue item with timeout
  if (result.isWaiting) {
    const timeoutMs = (result.timeoutDays || 7) * 86400000;
    const timeoutAt = new Date(Date.now() + timeoutMs).toISOString();

    // Update enrollment status to "waiting"
    await supabase
      .from("automation_enrollments")
      .update({ status: "waiting", updated_at: new Date().toISOString() })
      .eq("id", queueItem.enrollment_id);

    // Create a timeout queue item that will fire on the "timeout" branch
    for (const conn of nextConns) {
      if (conn.label === "timeout") {
        await supabase.from("automation_queue").insert({
          enrollment_id: queueItem.enrollment_id,
          flow_id: queueItem.flow_id,
          company_id: queueItem.company_id,
          current_node_id: conn.to_node_id,
          entity_id: queueItem.entity_id,
          entity_type: queueItem.entity_type,
          status: "waiting",
          execute_at: timeoutAt,
          context_json: { ...queueItem.context_json, branch: "timeout", await_event: result.awaitEvent, waiting_for: result.awaitEvent, wait_node_id: node.id },
        });
      }
    }
    return;
  }

  // ── drip_sequenza: accoda i nodi successori `dripCount` volte a intervalli crescenti ──
  if (result.isDrip) {
    const count = result.dripCount || 1;
    const intervalMs = result.dripIntervalMs || 86400000;
    for (const conn of nextConns) {
      for (let step = 0; step < count; step++) {
        const executeAt = new Date(Date.now() + step * intervalMs).toISOString();
        await supabase.from("automation_queue").insert({
          enrollment_id: queueItem.enrollment_id,
          flow_id: queueItem.flow_id,
          company_id: queueItem.company_id,
          current_node_id: conn.to_node_id,
          entity_id: queueItem.entity_id,
          entity_type: queueItem.entity_type,
          status: "pending",
          execute_at: executeAt,
          context_json: { ...queueItem.context_json, branch: conn.label, drip_step: step + 1, drip_total: count, prev_result: result.output },
        });
      }
    }
    return;
  }

  for (const conn of nextConns) {
    const executeAt = result.isDelay
      ? new Date(Date.now() + (result.delayMs || 0)).toISOString()
      : new Date().toISOString();

    await supabase.from("automation_queue").insert({
      enrollment_id: queueItem.enrollment_id,
      flow_id: queueItem.flow_id,
      company_id: queueItem.company_id,
      current_node_id: conn.to_node_id,
      entity_id: queueItem.entity_id,
      entity_type: queueItem.entity_type,
      status: "pending",
      execute_at: executeAt,
      context_json: { ...queueItem.context_json, branch: conn.label, prev_result: result.output },
    });
  }
}

// ────────────────────────────────────────────────────
// FILTER EVALUATION (basic)
// ────────────────────────────────────────────────────
function evaluateFilters(filters: any, payload: Record<string, any>): boolean {
  if (!filters || !filters.conditions) return true;
  const logic = filters.logic || "AND";
  const results = filters.conditions.map((c: any) => {
    if (c.logic) return evaluateFilters(c, payload); // Nested group
    const actual = payload[c.field];
    let match = false;
    switch (c.operator) {
      case "equals": match = String(actual) === String(c.value); break;
      case "not_equals": match = String(actual) !== String(c.value); break;
      case "contains": match = String(actual || "").includes(String(c.value)); break;
      case "is_empty": match = !actual; break;
      case "is_not_empty": match = !!actual; break;
      default: match = true;
    }
    return c.negate ? !match : match;
  });
  return logic === "AND" ? results.every(Boolean) : results.some(Boolean);
}

// ────────────────────────────────────────────────────
// PROCESS TRIGGER EVENTS (from DB triggers)
// ────────────────────────────────────────────────────
async function processTriggerEvents(supabase: any) {
  const { data: events } = await supabase
    .from("automation_trigger_events")
    .select("*")
    .eq("processed", false)
    .order("created_at", { ascending: true })
    .limit(100);

  if (!events || events.length === 0) return;

  for (const evt of events) {
    try {
      // Check if any enrollments are waiting for this event
      await resolveWaitingEnrollments(supabase, evt);

      await handleTrigger(supabase, {
        trigger_event: evt.trigger_event,
        company_id: evt.company_id,
        entity_id: evt.entity_id,
        entity_type: evt.entity_type,
        payload: evt.payload,
      });
    } catch (err: any) {
      console.error(`Trigger event ${evt.id} error:`, err);
    }
    // Mark as processed regardless
    await supabase
      .from("automation_trigger_events")
      .update({ processed: true })
      .eq("id", evt.id);
  }

  // Process waiting queue items that have timed out
  await processWaitingTimeouts(supabase);
}

// ────────────────────────────────────────────────────
// RESOLVE WAITING ENROLLMENTS (wait_for_event)
// ────────────────────────────────────────────────────
async function resolveWaitingEnrollments(supabase: any, evt: any) {
  // Find waiting queue items for this entity and event
  const { data: waitingItems } = await supabase
    .from("automation_queue")
    .select("*")
    .eq("entity_id", evt.entity_id)
    .eq("status", "waiting")
    .limit(50);

  if (!waitingItems || waitingItems.length === 0) return;

  for (const item of waitingItems) {
    const awaitEvent = item.context_json?.waiting_for || item.context_json?.await_event;
    if (awaitEvent !== evt.trigger_event) continue;

    // Event matched! Get the connections from the wait_for_event node's "event" branch
    const { data: connections } = await supabase
      .from("automation_connections")
      .select("*")
      .eq("flow_id", item.flow_id);

    // Find the node that produced this waiting item - look for connections with label "event" or default
    // Cancel the timeout queue item
    await supabase
      .from("automation_queue")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("enrollment_id", item.enrollment_id)
      .eq("status", "waiting");

    // Reactivate enrollment
    await supabase
      .from("automation_enrollments")
      .update({ status: "active", updated_at: new Date().toISOString() })
      .eq("id", item.enrollment_id);

    // Find the "event" branch connections
    if (connections) {
      // Get the action node that created this wait - we need the parent node
      const parentNodeId = item.context_json?.wait_node_id;
      if (parentNodeId) {
        const eventConns = connections.filter((c: any) => c.from_node_id === parentNodeId && c.label === "event");
        for (const conn of eventConns) {
          await supabase.from("automation_queue").insert({
            enrollment_id: item.enrollment_id,
            flow_id: item.flow_id,
            company_id: item.company_id,
            current_node_id: conn.to_node_id,
            entity_id: item.entity_id,
            entity_type: item.entity_type,
            status: "pending",
            execute_at: new Date().toISOString(),
            context_json: { ...item.context_json, branch: "event", resolved_event: evt.trigger_event },
          });
        }
      }
    }
  }
}

// ────────────────────────────────────────────────────
// PROCESS WAITING TIMEOUTS
// ────────────────────────────────────────────────────
async function processWaitingTimeouts(supabase: any) {
  const now = new Date().toISOString();

  // Find waiting items whose execute_at has passed (timeout)
  const { data: timedOut } = await supabase
    .from("automation_queue")
    .select("*")
    .eq("status", "waiting")
    .lte("execute_at", now)
    .limit(50);

  if (!timedOut || timedOut.length === 0) return;

  for (const item of timedOut) {
    // Mark as completed (timeout fired)
    await supabase
      .from("automation_queue")
      .update({ status: "completed", updated_at: now })
      .eq("id", item.id);

    // Reactivate enrollment
    await supabase
      .from("automation_enrollments")
      .update({ status: "active", updated_at: now })
      .eq("id", item.enrollment_id);

    // The timeout branch node is already set as current_node_id, so execute it
    // Re-insert as pending for immediate processing
    await supabase.from("automation_queue").insert({
      enrollment_id: item.enrollment_id,
      flow_id: item.flow_id,
      company_id: item.company_id,
      current_node_id: item.current_node_id,
      entity_id: item.entity_id,
      entity_type: item.entity_type,
      status: "pending",
      execute_at: now,
      context_json: { ...item.context_json, timeout_fired: true },
    });
  }
}

// ────────────────────────────────────────────────────
// SEND EMAIL (real provider integration)
// ────────────────────────────────────────────────────
async function executeSendEmail(supabase: any, cfg: Record<string, any>, entityId: string, companyId: string) {
  try {
    // Get contact info
    const { data: contact } = await supabase
      .from("marketing_contacts")
      .select("id, email, first_name, last_name, phone, city, province, company_name, source, unsubscribed, optout_email")
      .eq("id", entityId)
      .single();

    if (!contact?.email) {
      return { success: false, error: "Contact has no email address" };
    }
    if (contact.unsubscribed || contact.optout_email) {
      return { success: false, error: "Contact has opted out of email" };
    }

    // Determine stream (default: marketing)
    const stream = cfg.stream || "marketing";
    const settings = await loadProviderSettings(stream);

    if (!settings.apiKey) {
      return { success: false, error: `No API key configured for ${stream} email provider` };
    }

    const suppressed = await getSuppressedEmailMap(
      supabase,
      [contact.email],
      companyId,
      stream,
    );
    if (suppressed.has(normalizeEmailAddress(contact.email))) {
      return { success: false, error: "Contact is suppressed for this email stream" };
    }

    // Build email content
    let html = cfg.email_body || cfg.html || "<p>No content</p>";
    let subject = cfg.email_subject || cfg.subject || "Messaggio";

    // Personalizzazione completa: {{contatto.X}} (picker IT), {{contact.X}} (EN),
    // nomi nudi e CAMPI PERSONALIZZATI. Anche l'oggetto viene personalizzato.
    html = await resolveContactText(supabase, html, contact, companyId);
    subject = await resolveContactText(supabase, subject, contact, companyId);

    // Inject tracking pixel and unsubscribe link for marketing emails.
    // SEC: link firmati HMAC (vedi emailTrackingSignature.ts). L'URL di unsub
    // firmato è riusato sotto nell'header List-Unsubscribe per coerenza.
    let automationUnsubUrl = "";
    if (stream === "marketing") {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const openPixelUrl = await appendTrackingSig(
        `${supabaseUrl}/functions/v1/email-tracking?type=automation_open&rid=${contact.id}&co=${companyId}`,
        { co: companyId, rid: contact.id, type: "automation_open" },
      );
      automationUnsubUrl = await appendTrackingSig(
        `${supabaseUrl}/functions/v1/email-tracking?type=automation_unsub&rid=${contact.id}&co=${companyId}`,
        { co: companyId, rid: contact.id, type: "automation_unsub" },
      );
      const trackingPixel = `<img src="${openPixelUrl}" width="1" height="1" style="display:none" alt="" />`;

      // Inject pixel before </body> or at end
      if (html.includes("</body>")) {
        html = html.replace("</body>", `${trackingPixel}</body>`);
      } else {
        html += trackingPixel;
      }

      // Inject unsubscribe link if placeholder exists
      html = html.replace(/\{\{unsubscribe_url\}\}/g, automationUnsubUrl);
    }

    const resolvedSender = cfg.from_email
      ? null
      : await resolveSender(companyId, stream, supabase).catch(() => null);
    const safeFromName = sanitizeFromName(cfg.from_name);
    const fromAddress = cfg.from_email
      ? safeFromName ? `${safeFromName} <${cfg.from_email}>` : cfg.from_email
      : resolvedSender?.from ?? settings.fromDefault;
    const providerDomain = cfg.from_email?.includes("@")
      ? cfg.from_email.split("@").pop() ?? null
      : resolvedSender?.domain ?? settings.domain ?? null;

    // Deduct 1 credit for marketing emails (1 credit = cost per email from platform_settings)
    let deductedEmailCost = 0;
    if (stream === "marketing") {
      try {
        // Get price per email from platform_settings
        const { data: priceSetting } = await supabase
          .from("platform_settings")
          .select("value")
          .eq("key", "credits_email_price_per_email")
          .maybeSingle();
        const costPerEmail = parseFloat(priceSetting?.value || "0.003");

        await deductEmailCredits(companyId, costPerEmail, {
          description: `Automazione email: ${subject}`,
          metadata: { contact_id: contact.id, stream, automation: true },
        });
        deductedEmailCost = costPerEmail;
      } catch (creditErr: any) {
        console.warn(`Credit deduction failed for company ${companyId}:`, creditErr.message);
        // Continue sending — don't block automation on credit failure
      }
    }

    const result = await sendViaProviderWithFailover(stream, settings, {
      from: fromAddress,
      to: [contact.email],
      subject,
      html,
      headers: stream === "marketing"
        ? {
            // SEC: stesso URL di unsub firmato HMAC iniettato nel corpo.
            "List-Unsubscribe": `<${automationUnsubUrl}>`,
            "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : undefined,
    }, {
      domain: providerDomain ?? undefined,
      stream,
      disableNativeTracking: stream === "marketing",
    });

    if (!result.ok && deductedEmailCost > 0) {
      await addEmailCredits(companyId, deductedEmailCost, "refund", {
        description: `Rimborso automazione email fallita: ${subject}`,
        metadata: { contact_id: contact.id, stream, automation: true, provider_status: result.status },
        adminClient: supabase,
      }).catch((refundErr) => {
        console.error("[process-automation] email refund failed:", refundErr);
      });
    }

    // Mirror to unified email_delivery_log for SuperAdmin P&L/audit
    await logEmailDelivery(supabase, {
      company_id: companyId,
      recipient: contact.email,
      subject,
      template_name: "automation_send",
      status: result.ok ? "sent" : "failed",
      provider: result.providerUsed ?? settings.provider,
      stream,
      provider_id: result.providerMessageId ?? null,
      error_message: result.ok ? undefined : JSON.stringify(result.body),
      cost_eur: 0,
      charged_eur: 0,
      metadata: { contact_id: contact.id, automation: true },
    });

    // Fire-and-forget auto-topup check after marketing send
    if (stream === "marketing") {
      try {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
        fetch(`${supabaseUrl}/functions/v1/auto-topup-check`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${anonKey}`,
          },
          body: JSON.stringify({ company_id: companyId }),
        }).catch(() => { /* intentionally ignored */ });
      } catch { /* intentionally ignored */ }
    }

    return {
      success: result.ok,
      output: { action: "send_email", provider: result.providerUsed ?? settings.provider, status: result.status },
      error: result.ok ? undefined : `Provider returned ${result.status}`,
    };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ────────────────────────────────────────────────────
// SEND WHATSAPP (real Meta API integration)
// ────────────────────────────────────────────────────
async function executeSendWhatsApp(supabase: any, cfg: Record<string, any>, entityId: string, companyId: string) {
  // 1. Get WhatsApp config for the company (nuovo multi-numero, fallback legacy)
  const sender = await resolveWhatsAppSender(supabase, companyId);
  if (!sender) {
    return { success: false, error: "WhatsApp non configurato o non attivo per questa azienda" };
  }

  // 2. Get contact phone + DND check
  const { data: contact } = await supabase
    .from("marketing_contacts")
    .select("id, phone, first_name, last_name, email, city, province, company_name, source, optout_whatsapp")
    .eq("id", entityId)
    .single();

  if (!contact?.phone) {
    return { success: false, error: "Contatto senza numero di telefono" };
  }
  if (contact.optout_whatsapp) {
    return { success: false, error: "Contact has opted out of WhatsApp" };
  }

  // 3. Access token (già decifrato dall'helper)
  const accessToken = sender.accessToken;

  const cleanPhone = contact.phone.replace(/[^0-9]/g, "");

  // 4. Build message payload
  let messagePayload: Record<string, unknown>;

  if (cfg.whatsapp_template) {
    // Template message (Meta-approved)
    const components: any[] = [];
    if (cfg.whatsapp_text) {
      const resolvedText = await resolveContactText(supabase, cfg.whatsapp_text, contact, companyId);
      components.push({
        type: "body",
        parameters: [{ type: "text", text: resolvedText }],
      });
    }
    messagePayload = {
      messaging_product: "whatsapp",
      to: cleanPhone,
      type: "template",
      template: {
        name: cfg.whatsapp_template,
        language: { code: cfg.whatsapp_language || "it" },
        components: components.length > 0 ? components : undefined,
      },
    };
  } else {
    // Free-text message (only for open 24h conversations)
    const resolvedText = await resolveContactText(supabase, cfg.whatsapp_text || "", contact, companyId);
    if (!resolvedText) {
      return { success: false, error: "Nessun testo configurato per il messaggio WhatsApp" };
    }
    messagePayload = {
      messaging_product: "whatsapp",
      to: cleanPhone,
      type: "text",
      text: { body: resolvedText },
    };
  }

  // 5. Call Meta API
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${sender.phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messagePayload),
    }
  );

  const result = await res.json();

  if (!res.ok) {
    console.error("[send_whatsapp] Meta API error:", result);
    return { success: false, error: result.error?.message || "Errore Meta API" };
  }

  // 6. Log in contact_messages
  await supabase.from("contact_messages").insert({
    contact_id: entityId,
    company_id: companyId,
    channel: "whatsapp",
    content: cfg.whatsapp_text || cfg.whatsapp_template || "",
    status: "sent",
  });

  // 7. Log activity
  await supabase.from("marketing_contact_activities").insert({
    contact_id: entityId,
    company_id: companyId,
    activity_type: "message_sent",
    description: `Messaggio WhatsApp automatico inviato`,
    metadata: { channel: "whatsapp", status: "sent", meta_message_id: result.messages?.[0]?.id },
  });

  return { success: true, output: { whatsapp_message_id: result.messages?.[0]?.id } };
}

/**
 * Risolve i placeholder nei contenuti dei messaggi (email/WhatsApp/SMS) usando i
 * dati del contatto + i CAMPI PERSONALIZZATI. Accetta TUTTI i formati che il
 * picker del builder può inserire:
 *   • {{contatto.X}}  (italiano, formato standard del picker)
 *   • {{contact.X}}   (inglese, retro-compatibilità)
 *   • {{X}}           (nome nudo: first_name, full_name, ecc.)
 *   • {{contact.<campo_personalizzato>}}  (via marketing_contact_field_values)
 * Fail-safe: non lancia mai; le variabili sconosciute diventano stringa vuota
 * (coerente con il resolver rv() di piattaforma).
 */
async function resolveContactText(
  supabase: any,
  text: string,
  contact: Record<string, any>,
  companyId: string,
): Promise<string> {
  if (!text) return text ?? "";
  let out = String(text);
  const contactId = contact?.id;

  // 1) Campi personalizzati ({{contact.<key>}}) — no-op se non referenziati.
  if (out.includes("{{") && contactId) {
    try {
      const resolver = await loadContactCustomFieldResolver(supabase, companyId, [contactId], [out]);
      out = applyContactCustomFields(out, contactId, resolver);
    } catch { /* fail-open: non bloccare l'invio per i custom field */ }
  }

  // 2) Campi standard del contatto.
  const fullName = [contact?.first_name, contact?.last_name]
    .filter((x) => x != null && String(x).trim() !== "")
    .map((x) => String(x).trim())
    .join(" ")
    .trim();
  const map: Record<string, string> = {
    id: contact?.id != null ? String(contact.id) : "",
    first_name: contact?.first_name ?? "",
    last_name: contact?.last_name ?? "",
    full_name: fullName,
    name: fullName,
    email: contact?.email ?? "",
    phone: contact?.phone ?? "",
    city: contact?.city ?? "",
    province: contact?.province ?? "",
    company_name: contact?.company_name ?? "",
    contact_company: contact?.company_name ?? "",
    source: contact?.source ?? "",
  };
  // {{contatto.X}} / {{contact.X}} → valore mappato (sconosciuto → "").
  out = out.replace(/\{\{\s*(?:contatto|contact)\.(\w+)\s*\}\}/g, (_m, k: string) =>
    Object.prototype.hasOwnProperty.call(map, k) ? map[k] : "");
  // Nomi nudi noti (non tocca {{unsubscribe_url}} o altri token speciali).
  out = out.replace(
    /\{\{\s*(first_name|last_name|full_name|name|email|phone|city|province|company_name|contact_company)\s*\}\}/g,
    (_m, k: string) => map[k] ?? "",
  );
  return out;
}

// ────────────────────────────────────────────────────
// HELPERS
// ────────────────────────────────────────────────────

async function completeExecutionRun(supabase: any, enrollmentId: string, status: "completed" | "error", errorMessage?: string) {
  try {
    const now = new Date();
    // Find the running execution run for this enrollment
    const { data: run } = await supabase
      .from("flow_execution_runs")
      .select("id, started_at")
      .eq("enrollment_id", enrollmentId)
      .eq("status", "running")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!run) return;

    const durationMs = now.getTime() - new Date(run.started_at).getTime();

    // Count executed nodes from execution log
    const { count } = await supabase
      .from("automation_execution_log")
      .select("id", { count: "exact", head: true })
      .eq("enrollment_id", enrollmentId);

    await supabase
      .from("flow_execution_runs")
      .update({
        status,
        ended_at: now.toISOString(),
        duration_ms: durationMs,
        nodes_executed: count ?? 0,
        error_message: errorMessage ?? null,
      })
      .eq("id", run.id);
  } catch (err: any) {
    console.error("completeExecutionRun error:", err.message);
  }
}

async function markQueueItem(supabase: any, id: string, status: string, error?: string) {
  await supabase
    .from("automation_queue")
    .update({ status, last_error: error || null, updated_at: new Date().toISOString() })
    .eq("id", id);
}

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...secureHeaders },
  });
}

// ────────────────────────────────────────────────────
// SYNC GOOGLE CALENDAR
// ────────────────────────────────────────────────────
async function executeSyncGoogle(supabase: any, cfg: Record<string, any>, entityId: string, companyId: string) {
  const syncAction = cfg.sync_action || "sync_event";

  if (syncAction === "sync_contact") {
    // Google Calendar doesn't have a contact sync concept — log and succeed
    console.log(`[sync_google] sync_contact for entity=${entityId} — logged (no GCal contact API)`);
    return { success: true, output: { action: "sync_google", sync_action: "sync_contact", logged: true } };
  }

  // sync_event: find the most recent appointment for this contact, then push to Google Calendar
  const { data: appointment } = await supabase
    .from("appointments")
    .select("*")
    .eq("contact_id", entityId)
    .eq("company_id", companyId)
    .order("appointment_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!appointment) {
    return { success: true, output: { action: "sync_google", sync_action: "sync_event", skipped: true, reason: "No appointment found for contact" } };
  }

  // Find a Google Calendar connection for this company
  const { data: gcalConn } = await supabase
    .from("google_calendar_connections")
    .select("id, user_id, calendar_id")
    .eq("company_id", companyId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (!gcalConn) {
    return { success: false, error: "No active Google Calendar connection for this company" };
  }

  // Call the existing google-calendar-sync edge function
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/google-calendar-sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        action: "push-event",
        connectionId: gcalConn.id,
        appointmentId: appointment.id,
        companyId,
      }),
    });

    const text = await resp.text();
    let body: any;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }

    if (!resp.ok) {
      return { success: false, error: `Google Calendar sync failed: HTTP ${resp.status}`, output: body };
    }

    return { success: true, output: { action: "sync_google", sync_action: "sync_event", appointment_id: appointment.id, gcal_response: body } };
  } catch (e: any) {
    return { success: false, error: `Google Calendar sync error: ${e.message}` };
  }
}

// ────────────────────────────────────────────────────
// SYNC META LEAD
// ────────────────────────────────────────────────────
async function executeSyncMetaLead(supabase: any, cfg: Record<string, any>, entityId: string, companyId: string) {
  const syncAction = cfg.sync_action || "resync_lead";

  if (syncAction === "sync_contact") {
    console.log(`[sync_meta_lead] sync_contact for entity=${entityId} — logged`);
    return { success: true, output: { action: "sync_meta_lead", sync_action: "sync_contact", logged: true } };
  }

  // resync_lead: call meta-process-leads to re-process leads for this company
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // Get the Meta config for this company
  const { data: metaConfig } = await supabase
    .from("meta_ad_accounts")
    .select("id, ad_account_id")
    .eq("company_id", companyId)
    .limit(1)
    .maybeSingle();

  if (!metaConfig) {
    return { success: true, output: { action: "sync_meta_lead", sync_action: "resync_lead", skipped: true, reason: "No Meta ad account configured" } };
  }

  try {
    const resp = await fetch(`${supabaseUrl}/functions/v1/meta-process-leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        action: "process",
        companyId,
        adAccountId: metaConfig.ad_account_id,
      }),
    });

    const text = await resp.text();
    let body: any;
    try { body = JSON.parse(text); } catch { body = { raw: text.slice(0, 500) }; }

    if (!resp.ok) {
      return { success: false, error: `Meta lead sync failed: HTTP ${resp.status}`, output: body };
    }

    return { success: true, output: { action: "sync_meta_lead", sync_action: "resync_lead", meta_response: body } };
  } catch (e: any) {
    return { success: false, error: `Meta lead sync error: ${e.message}` };
  }
}
