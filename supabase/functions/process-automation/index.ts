import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { decryptMaybeEncrypted, getEncryptionKey } from "../_shared/encryption.ts";
import { resolveWhatsAppSender } from "../_shared/resolveWhatsAppSender.ts";
import { sendOpenWaMessage, OPENWA_PLATFORM_COMPANY_ID } from "../_shared/openwaSend.ts";
import { sendViaProviderWithFailover, loadProviderSettings, sanitizeFromName } from "../_shared/emailProvider.ts";
import { addEmailCredits, deductEmailCredits } from "../_shared/emailCredits.ts";
import { logEmailDelivery } from "../_shared/email-log.ts";
import { resolveSender } from "../_shared/resolveSender.ts";
import { getReplyAddress } from "../_shared/replyRoutes.ts";
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
    // Trigger CRM riattivati/aggiunti (audit automazioni 2026-07-02):
    contatto_assegnato: "contact_assigned",
    tag_aggiunto: "tag_added",
    tag_rimosso: "tag_removed",
    appuntamento_confermato: "appointment_confirmed",
    appuntamento_completato: "appointment_completed",
    appuntamento_no_show: "appointment_no_show",
    appuntamento_annullato: "appointment_canceled",
    opportunita_stale: "opportunity_stale",
    compleanno_contatto: "birthday_reminder",
    costo_in_scadenza: "cost_due",
    data_personalizzata: "custom_date",
    cantiere_fase_completata: "site_phase_completed",
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
    documento_hr_in_scadenza: "hr_document_expiring", // SCHEDULED (emesso da hr-check-scadenze)
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

  // Normalizza anche l'evento IN INGRESSO: TestFlowDialog e altri chiamanti
  // frontend mandano l'id catalogo italiano (es. "contatto_creato") — prima
  // non matchava mai il nome canonico risolto dal nodo.
  const canonicalEvent = TRIGGER_EVENT_MAP[trigger_event as string] ?? trigger_event;
  const enrollmentIds: string[] = [];

  for (const flow of flows) {
    // Use in-memory lookup instead of per-flow query
    const nodes = nodesByFlow.get(flow.id) ?? [];
    const matchingTrigger = nodes.find((n: AutomationNode) => {
      // Risolve l'evento del nodo da: trigger_event (canonico), oppure item_id
      // (builder), oppure trigger_type (template) — mappati all'evento canonico.
      const nodeEvent =
        n.config_json?.trigger_event ??
        TRIGGER_EVENT_MAP[n.config_json?.item_id as string] ??
        TRIGGER_EVENT_MAP[n.config_json?.trigger_type as string] ??
        n.config_json?.item_id ??
        n.config_json?.trigger_type;
      if (!nodeEvent) return false;
      if (nodeEvent === trigger_event || nodeEvent === canonicalEvent) return true;
      return legacyEvents.includes(nodeEvent);
    });

    if (!matchingTrigger) continue;

    // Check if trigger filters match (basic evaluation).
    // Il flow-builder salva i filtri in `trigger_filters`; supportiamo anche `filters`.
    const filters = matchingTrigger.config_json?.filters ?? matchingTrigger.config_json?.trigger_filters;
    if (filters && filters.conditions?.length > 0) {
      if (!evaluateFilters(filters, enrichedPayload)) continue;
    }

    // Filtri RAPIDI del trigger (configSchema del catalogo): prima erano
    // IGNORATI → es. il template "Alert Costo > €500" scattava su OGNI costo.
    const tcfg = matchingTrigger.config_json ?? {};
    const ep = enrichedPayload as Record<string, unknown>;
    // Soglia importo: chiavi payload diverse per emettitore (costo=importo,
    // ordine=total_amount, opportunità=value) — prima leggeva solo `importo`
    // e su ordine_creato/opportunita_creata il filtro spegneva il trigger.
    const sogliaRaw = tcfg.importo_minimo ?? tcfg.importo_soglia ?? tcfg.valore_minimo;
    if (sogliaRaw != null && sogliaRaw !== "") {
      const soglia = Number(sogliaRaw);
      const importo = Number(ep?.importo ?? ep?.total_amount ?? ep?.value);
      if (Number.isFinite(soglia) && !(Number.isFinite(importo) && importo >= soglia)) continue;
    }
    // Stato di arrivo (ordine_stato_cambiato / ticket_stato_cambiato): confronto
    // normalizzato (minuscole, spazi→underscore) su status E status_name, perché
    // le aziende hanno stati con nomi propri. Prima era IGNORATO: scattava su
    // ogni cambio stato.
    if (typeof tcfg.stato_a === "string" && tcfg.stato_a !== "") {
      const normStato = (s: unknown) => String(s ?? "").toLowerCase().trim().replace(/\s+/g, "_");
      const want = normStato(tcfg.stato_a);
      const got = [ep?.status, ep?.status_name, ep?.new_status].map(normStato);
      if (!got.includes(want)) continue;
    }
    // Priorità (ticket_creato / task_creato): prima ignorata.
    if (typeof tcfg.priorita_filtro === "string" && tcfg.priorita_filtro !== "") {
      if (String(ep?.priority ?? "").toLowerCase() !== tcfg.priorita_filtro.toLowerCase()) continue;
    }
    // Campagna (email_aperta): prima ignorata.
    if (tcfg.campagna_id && String(ep?.campaign_id ?? "") !== String(tcfg.campagna_id)) continue;
    // Form (form_compilato): prima ignorato.
    if (tcfg.form_id && String(ep?.form_id ?? "") !== String(tcfg.form_id)) continue;
    // Campo cambiato (contatto_aggiornato): richiede changed_fields nel payload
    // (emesso da fire_marketing_automation). Se il payload non lo porta (eventi
    // vecchi), il filtro non blocca.
    if (typeof tcfg.campo_filtro === "string" && tcfg.campo_filtro !== "" && Array.isArray(ep?.changed_fields)) {
      if (!(ep.changed_fields as unknown[]).map(String).includes(tcfg.campo_filtro)) continue;
    }
    // Tipo appuntamento (appuntamento_creato): richiede appointment_type nel payload.
    if (typeof tcfg.tipo_filtro === "string" && tcfg.tipo_filtro !== "" && ep?.appointment_type != null) {
      if (String(ep.appointment_type).toLowerCase() !== tcfg.tipo_filtro.toLowerCase()) continue;
    }
    // Fonte lead (contatto_creato → fonte_filtro)
    if (typeof tcfg.fonte_filtro === "string" && tcfg.fonte_filtro !== "") {
      const src = String((enrichedPayload as Record<string, unknown>)?.source ?? "").toLowerCase();
      if (!src.includes(tcfg.fonte_filtro.toLowerCase())) continue;
    }
    // Stage da/a (opportunita_stage_cambiato)
    if (tcfg.stage_a && String((enrichedPayload as Record<string, unknown>)?.stage_id ?? "") !== String(tcfg.stage_a)) continue;
    if (tcfg.stage_da && String((enrichedPayload as Record<string, unknown>)?.old_stage_id ?? "") !== String(tcfg.stage_da)) continue;
    // Pagina/moduli Facebook (campagna_facebook_lead → page_id / form_ids,
    // stile GHL): il payload dell'evento porta page_id e form_id dal
    // processore lead (meta-process-leads).
    if (tcfg.page_id && String((enrichedPayload as Record<string, unknown>)?.page_id ?? "") !== String(tcfg.page_id)) continue;
    if (Array.isArray(tcfg.form_ids) && tcfg.form_ids.length > 0) {
      const evFormId = String((enrichedPayload as Record<string, unknown>)?.form_id ?? "");
      if (!tcfg.form_ids.map(String).includes(evFormId)) continue;
    }
    // Tipo documento HR (documento_hr_in_scadenza → categoria_documento)
    if (tcfg.categoria_documento && tcfg.categoria_documento !== "tutte"
        && String((enrichedPayload as Record<string, unknown>)?.categoria ?? "") !== String(tcfg.categoria_documento)) continue;

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
      // Onestà nel Registro: un enrollment fallito era invisibile (solo
      // console.error) — così il CHECK entity_type ha nascosto per mesi il
      // fatto che i trigger operativi non arruolavano MAI (fix 20271127000000).
      await supabase.from("automation_execution_log").insert({
        flow_id: flow.id,
        company_id,
        node_id: matchingTrigger.id,
        node_type: "trigger",
        status: "error",
        input_json: { trigger_event, entity_id, entity_type },
        error_message: `Iscrizione fallita: ${enrollErr.message ?? enrollErr}`,
      });
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
      // In test mode chiudi come 'canceled': 'completed' bloccherebbe il
      // futuro arruolamento REALE del contatto (blockedStatuses).
      const leafStatus = payload?.test_mode || payload?.dry_run ? "canceled" : "completed";
      await supabase
        .from("automation_enrollments")
        .update({ status: leafStatus, updated_at: new Date().toISOString() })
        .eq("id", enrollment.id);
      await completeExecutionRun(supabase, enrollment.id, "completed");
    }

    enrolled++;
    enrollmentIds.push(enrollment.id);
  }

  // enrollment_id(s) in risposta: TestFlowDialog li usa per l'overlay
  // "percorso sul canvas" (prima non venivano restituiti e l'overlay era
  // codice morto).
  return jsonResponse({
    message: `Triggered`,
    enrolled,
    enrollment_ids: enrollmentIds,
    enrollment_id: enrollmentIds[0] ?? null,
  });
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

      if (!result.success && result.defer) {
        // Back-pressure: esito transiente (pool WhatsApp Locale saturo / fuori
        // finestra oraria / throttle). Rinvia SENZA consumare i tentativi, così
        // il messaggio attende la capacità invece di fallire in pochi minuti.
        // Cap a 48 rinvii (~2 giorni a 1h) per evitare loop infiniti.
        const ctx = item.context_json || {};
        const deferCount = (ctx._defer_count || 0) + 1;
        if (deferCount > 48) {
          await markQueueItem(supabase, item.id, "failed", result.error || "Rinviato troppe volte (pool saturo)");
          await supabase.from("automation_enrollments").update({ status: "failed", updated_at: now }).eq("id", item.enrollment_id);
          await completeExecutionRun(supabase, item.enrollment_id, "error", result.error || "Pool saturo");
        } else {
          const deferMs = Math.max(1, result.deferMinutes ?? 60) * 60000;
          await supabase
            .from("automation_queue")
            .update({ status: "pending", execute_at: new Date(Date.now() + deferMs).toISOString(), last_error: result.error, context_json: { ...ctx, _defer_count: deferCount }, updated_at: now })
            .eq("id", item.id);
        }
      } else if (!result.success) {
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
          // Chiudi con onestà: prima l'iscrizione restava "active" e la run
          // "running" PER SEMPRE dopo un fallimento definitivo (status 'failed'
          // ammesso dal CHECK, migration 20271214000000).
          await supabase
            .from("automation_enrollments")
            .update({ status: "failed", updated_at: now })
            .eq("id", item.enrollment_id);
          await completeExecutionRun(supabase, item.enrollment_id, "error", result.error || "Fallimento dopo max tentativi");
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

      // If node type is "goal" or "end_automation", complete enrollment.
      // item_id incluso: il builder salva l'id catalogo lì, non in action_type.
      if (
        node.node_type === "goal" ||
        node.config_json?.action_type === "end_automation" ||
        node.config_json?.item_id === "end_automation"
      ) {
        // In test mode 'canceled': 'completed' bloccherebbe il futuro
        // arruolamento reale del contatto (blockedStatuses).
        const doneStatus = item.context_json?.payload?.test_mode || item.context_json?.payload?.dry_run
          ? "canceled" : "completed";
        await supabase
          .from("automation_enrollments")
          .update({ status: doneStatus, updated_at: now })
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
// Minuti-del-giorno correnti e weekday (0=Dom) in Europe/Rome: il "fino alle
// 09:00" dell'utente è ora italiana, non UTC del runtime.
function romeNowParts(at: Date): { minutesOfDay: number; weekday: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome", hour12: false,
    weekday: "short", hour: "2-digit", minute: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  const h = parseInt(get("hour"), 10) % 24;
  const m = parseInt(get("minute"), 10);
  return { minutesOfDay: h * 60 + m, weekday: wd < 0 ? at.getUTCDay() : wd };
}

function executeDelay(cfg: Record<string, any>) {
  // Schema del BUILDER (DelayConfigPanel): delay_tipo 'attendi'|'fino_a',
  // delay_durata + delay_unita (minuti|ore|giorni|settimane), delay_orario
  // 'HH:MM', delay_giorni_settimana [0..6] (0=Dom). PRIMA il motore leggeva
  // solo giorni/ore/minuti (schema catalogo) → OGNI attesa configurata dal
  // builder cadeva nel default di 1 ora ("aspetta 3 giorni" = 1 ora).
  let delayMs = 0;

  if (cfg.delay_tipo === "fino_a" && typeof cfg.delay_orario === "string" && /^\d{1,2}:\d{2}$/.test(cfg.delay_orario)) {
    // Prossima occorrenza dell'orario (ora italiana): oggi se futuro, sennò domani.
    const [th, tm] = cfg.delay_orario.split(":").map((n: string) => parseInt(n, 10));
    const targetMin = (th % 24) * 60 + tm;
    const { minutesOfDay } = romeNowParts(new Date());
    let deltaMin = targetMin - minutesOfDay;
    if (deltaMin <= 0) deltaMin += 24 * 60;
    delayMs = deltaMin * 60_000;
  } else if (cfg.delay_durata != null || cfg.delay_unita) {
    const durata = Math.max(1, parseInt(cfg.delay_durata) || 1);
    const MS: Record<string, number> = { minuti: 60_000, ore: 3_600_000, giorni: 86_400_000, settimane: 604_800_000 };
    delayMs = durata * (MS[String(cfg.delay_unita)] ?? 86_400_000);
  }

  // Schema catalogo giorni/ore/minuti (nodi creati da template o a mano)
  if (delayMs <= 0) {
    const giorni = parseInt(cfg.giorni) || 0;
    const ore = parseInt(cfg.ore) || 0;
    const minuti = parseInt(cfg.minuti) || 0;
    delayMs = giorni * 86400000 + ore * 3600000 + minuti * 60000;
  }
  // Retro-compat con il vecchio schema delay_value/delay_unit
  if (delayMs <= 0 && (cfg.delay_value != null || cfg.delay_unit != null)) {
    const value = parseInt(cfg.delay_value) || 1;
    const unit = cfg.delay_unit || "hours";
    delayMs = unit === "days" ? value * 86400000
      : unit === "minutes" ? value * 60000
      : value * 3600000;
  }
  if (delayMs <= 0) delayMs = 3600000; // default difensivo: 1 ora

  // "Solo in questi giorni": se l'attesa atterra su un giorno non consentito,
  // slitta di 24h alla volta fino al primo giorno attivo (stessa ora).
  const giorniOk: number[] = Array.isArray(cfg.delay_giorni_settimana)
    ? cfg.delay_giorni_settimana.filter((d: unknown) => typeof d === "number")
    : [];
  if (giorniOk.length > 0 && giorniOk.length < 7) {
    let guard = 0;
    while (!giorniOk.includes(romeNowParts(new Date(Date.now() + delayMs)).weekday) && guard < 7) {
      delayMs += 86_400_000;
      guard++;
    }
  }

  return {
    success: true,
    output: { delay_ms: delayMs, execute_at: new Date(Date.now() + delayMs).toISOString() },
    isDelay: true,
    delayMs,
  };
}

// ── Condition (If/Else) ──
async function executeCondition(supabase: any, cfg: Record<string, any>, entityId: string, companyId: string) {
  // Il BUILDER (ConditionConfigPanel) salva: `condizioni` = array di
  // {campo:"contatto.email", operatore:"uguale", valore} + `operatore_logico`
  // AND|OR. PRIMA il motore leggeva SOLO condition_field/operator/value →
  // ogni nodo Se/Altrimenti creato dal builder valutava undefined e finiva
  // SEMPRE sul ramo "no". Ora: array + logica + operatori italiani + campi
  // con prefisso entità. Il vecchio schema resta supportato (fallback).
  type Row = { campo?: string; operatore?: string; valore?: unknown };
  const rows: Row[] = Array.isArray(cfg.condizioni) && cfg.condizioni.length > 0
    ? cfg.condizioni
    : (cfg.condition_field
      ? [{ campo: String(cfg.condition_field), operatore: String(cfg.condition_operator ?? "equals"), valore: cfg.condition_value }]
      : []);
  if (rows.length === 0) {
    return { success: true, output: { branch: "no", reason: "Nessuna condizione configurata" }, branch: "no" };
  }
  const logic: "AND" | "OR" = cfg.operatore_logico === "OR" ? "OR" : "AND";

  // Risolve il record per prefisso campo (cache per non rifare le query).
  // contatto.* → il contatto (entityId); opportunita.*/appuntamento.* → il più
  // recente del contatto; ordine.*/ticket.* → il record se l'entità del flusso
  // È quell'oggetto (trigger operativi).
  const cache: Record<string, any> = {};
  const load = async (prefix: string) => {
    if (prefix in cache) return cache[prefix];
    let row: any = null;
    try {
      if (prefix === "contatto") {
        row = (await supabase.from("marketing_contacts").select("*").eq("id", entityId).eq("company_id", companyId).maybeSingle()).data;
      } else if (prefix === "opportunita") {
        row = (await supabase.from("marketing_opportunities").select("*").eq("contact_id", entityId).eq("company_id", companyId).order("updated_at", { ascending: false }).limit(1).maybeSingle()).data;
      } else if (prefix === "appuntamento") {
        row = (await supabase.from("appointments").select("*").eq("contact_id", entityId).eq("company_id", companyId).order("created_at", { ascending: false }).limit(1).maybeSingle()).data;
      } else if (prefix === "ordine") {
        row = (await supabase.from("orders").select("*").eq("id", entityId).eq("company_id", companyId).maybeSingle()).data;
      } else if (prefix === "ticket") {
        row = (await supabase.from("tickets").select("*").eq("id", entityId).eq("company_id", companyId).maybeSingle()).data;
      }
    } catch (_e) { row = null; }
    cache[prefix] = row;
    return row;
  };

  const evalRow = async (r: Row): Promise<boolean> => {
    const raw = String(r.campo ?? "").trim();
    if (!raw) return false;
    const dot = raw.indexOf(".");
    const prefix = dot > 0 ? raw.slice(0, dot) : "contatto";
    const field = dot > 0 ? raw.slice(dot + 1) : raw;
    const rec = await load(prefix);
    const actual = rec ? rec[field] : undefined;
    const value = r.valore;
    const sa = String(actual ?? "");
    const sv = String(value ?? "");
    switch (String(r.operatore ?? "uguale")) {
      case "uguale": case "equals": return sa === sv;
      case "diverso": case "not_equals": return sa !== sv;
      case "contiene": case "contains": return sa.toLowerCase().includes(sv.toLowerCase());
      case "non_contiene": return !sa.toLowerCase().includes(sv.toLowerCase());
      case "inizia_con": return sa.toLowerCase().startsWith(sv.toLowerCase());
      case "vuoto": case "is_empty": return actual == null || sa === "";
      case "non_vuoto": case "is_not_empty": return !(actual == null || sa === "");
      case "maggiore": case "gt": return Number(actual) > Number(value);
      case "minore": case "lt": return Number(actual) < Number(value);
      case "maggiore_uguale": case "gte": return Number(actual) >= Number(value);
      case "minore_uguale": case "lte": return Number(actual) <= Number(value);
      default: return false;
    }
  };

  const details: Array<{ campo?: string; ok: boolean }> = [];
  let result: boolean;
  if (logic === "AND") {
    result = true;
    for (const r of rows) {
      const ok = await evalRow(r);
      details.push({ campo: r.campo, ok });
      if (!ok) { result = false; break; }
    }
  } else {
    result = false;
    for (const r of rows) {
      const ok = await evalRow(r);
      details.push({ campo: r.campo, ok });
      if (ok) { result = true; break; }
    }
  }

  return { success: true, output: { branch: result ? "yes" : "no", logic, conditions: details }, branch: result ? "yes" : "no" };
}

// ── Split ──
function executeSplit(cfg: Record<string, any>) {
  // Il builder salva `percentuali` come stringa "60,40": prima era ignorata
  // e lo split era sempre 50/50. split_a resta prioritario (schema legacy).
  let splitA = parseInt(cfg.split_a);
  if (!Number.isFinite(splitA) && typeof cfg.percentuali === "string") {
    const first = parseInt(cfg.percentuali.split(/[,;|]/)[0]);
    if (Number.isFinite(first) && first > 0 && first < 100) splitA = first;
  }
  if (!Number.isFinite(splitA) || splitA <= 0 || splitA >= 100) splitA = 50;
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
    invia_whatsapp_locale: "send_whatsapp_locale",
    invia_sms: "send_sms",
    invia_notifica_inapp: "send_notification",
    notifica_interna: "internal_notification",
    aggiorna_punteggio: "update_contact_score",
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
    // invia_notifica_inapp: il catalogo salva user_id, l'executor legge
    // notification_recipient — senza ponte il destinatario scelto era ignorato.
    if (c.user_id && !c.notification_recipient) c.notification_recipient = c.user_id;
    // aggiorna_task: il catalogo salva `stato`, l'executor legge task_status.
    if (c.stato && !c.task_status) c.task_status = c.stato;
    // Email fields
    if (c.destinatario && !c.email_to) c.email_to = c.destinatario;
    if (c.oggetto && !c.email_subject) c.email_subject = c.oggetto;
    if (c.corpo && !c.email_body) c.email_body = c.corpo;
    // Mittente dal builder (EmailConfigPanel scrive da_nome/da_email:
    // prima erano ignorati e si usava sempre il default di piattaforma)
    if (c.da_nome && !c.from_name) c.from_name = c.da_nome;
    if (c.da_email && !c.from_email) c.from_email = c.da_email;
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

  // ── MODALITÀ TEST (TestFlowDialog invia payload.test_mode/dry_run) ──
  // PRIMA era ignorata: il "test" spediva email/WhatsApp/SMS VERI ai contatti.
  // In test le azioni con effetti esterni vengono simulate (successo + flag),
  // così il percorso nel Registro è reale ma nessun messaggio parte davvero.
  const testMode = queueItem?.context_json?.payload?.test_mode === true
    || queueItem?.context_json?.payload?.dry_run === true;
  const EXTERNAL_ACTIONS = new Set([
    "send_email", "send_whatsapp", "send_whatsapp_locale", "send_sms", "send_ai_message",
    "webhook_out", "call_with_ai_agent",
    "invia_email_admin_azienda", "crea_account_azienda", "invia_fattura",
  ]);
  if (testMode && EXTERNAL_ACTIONS.has(actionType)) {
    return { success: true, output: { action: actionType, simulated: true, test_mode: true } };
  }

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
          // Chiave esatta, poi fallback sull'ultimo segmento: i template usano
          // {{costo.importo}} ma gli emettitori DB mettono chiavi PIATTE
          // (importo, descrizione…) nel payload.
          const v = pPayload[k] ?? pPayload[k.split(".").pop() as string];
          return v == null ? "" : String(v);
        })
      : s;
  const subjectCompanyId: string = (pPayload["azienda.id"] as string) || entityId;
  const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";

  switch (actionType) {
    case "add_tag": {
      // Il builder salva `tags` come ARRAY (multi-select): prima veniva
      // applicato solo il primo. Applica tutti i tag configurati.
      const tags: string[] = (Array.isArray(ncfg.tags) ? ncfg.tags : [ncfg.tag_name])
        .filter((t: unknown): t is string => typeof t === "string" && t.trim() !== "");
      if (tags.length === 0) return { success: false, error: "No tag_name configured" };
      // Il contatto DEVE esistere: `.single()` con maybeSingle-like silenzioso
      // faceva partire una update su zero righe e il nodo dichiarava comunque
      // successo. Su Suntech i 7 lead risultavano taggati nel Registro e nel
      // CRM avevano tags vuoti: un'azione che mente è peggio di una che fallisce.
      const { data: contact, error: readErr } = await supabase
        .from("marketing_contacts")
        .select("tags")
        .eq("id", entityId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (readErr) return { success: false, error: `Lettura contatto fallita: ${readErr.message}` };
      if (!contact) return { success: false, error: "Contatto non trovato per questa azienda" };
      const currentTags: string[] = contact?.tags || [];
      const merged = [...new Set([...currentTags, ...tags])];
      if (merged.length !== currentTags.length) {
        const { data: righe, error: upErr } = await supabase
          .from("marketing_contacts")
          .update({ tags: merged })
          .eq("id", entityId)
          .eq("company_id", companyId)
          .select("id");
        if (upErr) return { success: false, error: `Tag non salvati: ${upErr.message}` };
        if (!righe || righe.length === 0) {
          return { success: false, error: "Tag non salvati: nessuna riga aggiornata" };
        }
      }
      return { success: true, output: { action: "add_tag", tags, applied: merged } };
    }

    case "remove_tag": {
      const tags: string[] = (Array.isArray(ncfg.tags) ? ncfg.tags : [ncfg.tag_name])
        .filter((t: unknown): t is string => typeof t === "string" && t.trim() !== "");
      if (tags.length === 0) return { success: false, error: "No tag_name configured" };
      const { data: contact, error: readErr } = await supabase
        .from("marketing_contacts")
        .select("tags")
        .eq("id", entityId)
        .eq("company_id", companyId)
        .maybeSingle();
      if (readErr) return { success: false, error: `Lettura contatto fallita: ${readErr.message}` };
      if (!contact) return { success: false, error: "Contatto non trovato per questa azienda" };
      const currentTags: string[] = contact?.tags || [];
      const { error: upErr } = await supabase
        .from("marketing_contacts")
        .update({ tags: currentTags.filter((t: string) => !tags.includes(t)) })
        .eq("id", entityId)
        .eq("company_id", companyId);
      if (upErr) return { success: false, error: `Tag non rimossi: ${upErr.message}` };
      return { success: true, output: { action: "remove_tag", tags } };
    }

    case "update_field": {
      const field = ncfg.field_name || ncfg.campo;
      const value = ncfg.field_value || ncfg.valore;
      if (!field) return { success: false, error: "No field_name configured" };
      // Il catalogo espone `tabella` (contatto/opportunità/ticket/task/ordine/
      // fattura): PRIMA veniva ignorata e si scriveva SEMPRE su
      // marketing_contacts. Whitelist → niente tabelle arbitrarie.
      const TABLE_MAP: Record<string, string> = {
        contacts: "marketing_contacts",
        opportunities: "marketing_opportunities",
        tickets: "tickets",
        tasks: "tasks",
        orders: "orders",
        invoices: "invoices",
      };
      const requested = String(ncfg.tabella ?? "contacts");
      const table = TABLE_MAP[requested];
      if (!table) return { success: false, error: `Tabella non supportata: ${requested}` };
      const { error: ufErr } = await supabase
        .from(table)
        .update({ [field]: value })
        .eq("id", entityId)
        .eq("company_id", companyId);
      if (ufErr) return { success: false, error: `update_field su ${table}: ${ufErr.message}` };
      return { success: true, output: { action: "update_field", table, field, value } };
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
      // Stessa storia di add_tag: l'esito della scrittura non veniva letto e il
      // nodo diceva "assegnato" comunque. E `assigned_to` era uno dei 13 campi
      // che il trigger fire_marketing_automation rifiutava (fix db87a5a5d):
      // ogni assegnazione automatica di un lead a un venditore falliva in
      // silenzio, e nel CRM il lead restava senza titolare.
      const { data: righeAss, error: assErr } = await supabase
        .from("marketing_contacts")
        .update({ assigned_to: userId })
        .eq("id", entityId)
        .eq("company_id", companyId)
        .select("id");
      if (assErr) return { success: false, error: `Assegnazione non salvata: ${assErr.message}` };
      if (!righeAss || righeAss.length === 0) {
        return { success: false, error: "Assegnazione non salvata: contatto non trovato per questa azienda" };
      }
      return { success: true, output: { action: "assign_user", userId, strategia } };
    }

    case "create_opportunity": {
      // Variabili in nome/valore/fonte: PRIMA i campi contatto (resolveContactText
      // gestisce {{contatto.X}}/{{contact.X}} + campi personalizzati), POI il
      // payload del trigger (rv). L'ordine conta: rv() azzera i token che non
      // conosce, quindi se girasse per primo cancellerebbe {{contatto.full_name}}.
      const { data: oppContact } = await supabase
        .from("marketing_contacts")
        .select("*")
        .eq("id", entityId)
        .eq("company_id", companyId)
        .maybeSingle();
      const resolveOppText = async (s: unknown): Promise<string> => {
        if (typeof s !== "string" || s === "") return "";
        const withContact = oppContact ? await resolveContactText(supabase, s, oppContact, companyId) : s;
        return rv(withContact);
      };
      const name = (await resolveOppText(ncfg.opportunity_name)).trim() || "Nuova Opportunità";
      const value = Number((await resolveOppText(ncfg.opportunity_value)).replace(",", ".")) || 0;
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
      if (ncfg.assegnato_a) insertData.assigned_to = ncfg.assegnato_a;
      if (ncfg.call_center_id) insertData.call_center_id = ncfg.call_center_id;
      const fonte = await resolveOppText(ncfg.fonte);
      if (fonte) insertData.source = fonte.slice(0, 100);

      const { error } = await supabase
        .from("marketing_opportunities")
        .insert(insertData);
      if (error) return { success: false, error: error.message };
      return { success: true, output: { action: "create_opportunity", name } };
    }

    case "move_opportunity": {
      const stageId = ncfg.target_stage_id || ncfg.stage_id || ncfg.stage;
      if (!stageId) return { success: false, error: "No target_stage_id configured" };
      // stage_id è un UUID FK su marketing_pipeline_stages: gli slug del
      // vecchio catalogo ('vinto', 'contattato'…) facevano fallire l'update.
      if (!UUID_RE.test(String(stageId))) {
        return { success: false, error: `Fase non valida ("${stageId}"): riconfigura l'azione scegliendo pipeline e fase reali` };
      }
      let moveQ = supabase
        .from("marketing_opportunities")
        .update({ stage_id: stageId, stage_changed_at: new Date().toISOString() })
        .eq("company_id", companyId);
      // opportunita_id esplicito (uuid) → solo quella; altrimenti tutte le
      // aperte del contatto (comportamento storico).
      if (ncfg.opportunita_id && UUID_RE.test(String(ncfg.opportunita_id))) {
        moveQ = moveQ.eq("id", ncfg.opportunita_id);
      } else {
        moveQ = moveQ.eq("contact_id", entityId).eq("status", "open");
      }
      const { error: moveErr } = await moveQ;
      if (moveErr) return { success: false, error: moveErr.message };
      return { success: true, output: { action: "move_opportunity", stageId } };
    }

    case "create_task": {
      // rv(): risolve i {{placeholder}} dal payload (prima titolo/note
      // uscivano letterali sui trigger operativi, es. {{costo.descrizione}}).
      // task_due_days (builder: scadenza_giorni) → due_date; prima era ignorato.
      const dueDays = Number(ncfg.task_due_days);
      // en-CA = YYYY-MM-DD; timezone esplicita: le edge fn girano in UTC ma la
      // scadenza deve cadere sul giorno ITALIANO (convenzione anti UTC-drift).
      const dueDate = Number.isFinite(dueDays) && dueDays > 0
        ? new Date(Date.now() + dueDays * 86_400_000).toLocaleDateString("en-CA", { timeZone: "Europe/Rome" })
        : null;
      const { error } = await supabase.from("tasks").insert({
        company_id: companyId,
        title: rv(ncfg.task_title || "Attività automatica"),
        notes: rv(ncfg.task_notes || null),
        priority: ncfg.task_priority || "normale",
        category: ncfg.task_category || "generale",
        assigned_to: await resolveTaskAssignee(supabase, ncfg.task_assigned_to, entityId, companyId, queueItem?.flow_id),
        due_date: dueDate,
        status: "da_fare",
        // Collega il task al contatto del flusso: prima il task nasceva
        // "orfano" e non compariva nella timeline del contatto. Guard UUID:
        // le entity dei trigger cron sono stringhe sintetiche ("cron:...").
        contact_id: (!queueItem?.entity_type || queueItem?.entity_type === "contact") && UUID_RE.test(String(entityId))
          ? entityId
          : null,
        created_by: "00000000-0000-0000-0000-000000000000",
      });
      if (error) return { success: false, error: error.message };
      return { success: true, output: { action: "create_task", title: ncfg.task_title } };
    }

    case "update_task": {
      // Aggiorna il task GIUSTO: se l'entità del flusso È un task (trigger
      // task_creato/task_scaduto) usa direttamente quell'id; altrimenti il
      // task più recente COLLEGATO al contatto. Prima prendeva il task più
      // recente di TUTTA l'azienda, ignorando l'entità del flusso.
      let taskId: string | null = null;
      if (queueItem?.entity_type === "task") {
        taskId = entityId;
      } else {
        const { data: existingTask } = await supabase
          .from("tasks")
          .select("id")
          .eq("company_id", companyId)
          .eq("contact_id", entityId)
          .neq("status", "completato")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        taskId = existingTask?.id ?? null;
      }

      if (!taskId) return { success: false, error: "Nessuna attività trovata da aggiornare per questa entità" };

      const updateData: Record<string, any> = {};
      if (ncfg.task_title) updateData.title = rv(ncfg.task_title);
      if (ncfg.task_notes) updateData.notes = rv(ncfg.task_notes);
      if (ncfg.task_priority) updateData.priority = ncfg.task_priority;
      if (ncfg.task_assigned_to) {
        const resolvedAssignee = await resolveTaskAssignee(supabase, ncfg.task_assigned_to, entityId, companyId, queueItem?.flow_id);
        if (resolvedAssignee) updateData.assigned_to = resolvedAssignee;
      }
      if (ncfg.task_status) updateData.status = ncfg.task_status;
      if (ncfg.task_due_days != null) {
        // Giorno ITALIANO, non UTC (convenzione anti UTC-drift, come create_task).
        const days = parseInt(ncfg.task_due_days) || 0;
        updateData.due_date = new Date(Date.now() + days * 86_400_000)
          .toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
      }

      const { error } = await supabase.from("tasks").update(updateData).eq("id", taskId).eq("company_id", companyId);
      if (error) return { success: false, error: error.message };
      return { success: true, output: { action: "update_task", task_id: taskId, updated: Object.keys(updateData) } };
    }

    case "internal_notification": {
      // "Notifica interna" (stile GHL): avvisa il TEAM (non il contatto) via
      // email / notifica in-app / SMS, con messaggio personalizzabile con le
      // variabili del contatto che ha attivato il flusso.
      const tipo = String(ncfg.tipo || "email");
      const { data: notifContact } = await supabase
        .from("marketing_contacts")
        .select("*")
        .eq("id", entityId)
        .eq("company_id", companyId)
        .maybeSingle();
      const resolveNotifText = async (s: unknown): Promise<string> => {
        if (typeof s !== "string" || s === "") return "";
        const withContact = notifContact ? await resolveContactText(supabase, s, notifContact, companyId) : s;
        return rv(withContact);
      };
      const messaggio = (await resolveNotifText(ncfg.messaggio || ncfg.testo)).trim();
      if (!messaggio) return { success: false, error: "Nessun messaggio configurato" };
      const oggetto = (await resolveNotifText(ncfg.oggetto)).trim() || "Notifica automazione";

      const teamUserIds: string[] = (Array.isArray(ncfg.destinatari_utenti) ? ncfg.destinatari_utenti : [])
        .filter((x: unknown): x is string => typeof x === "string" && x.trim() !== "");
      const extras: string[] = String(ncfg.destinatari_extra ?? "")
        .split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

      if (tipo === "app") {
        if (teamUserIds.length === 0) return { success: false, error: "Seleziona almeno un utente del team" };
        const { error: inErr } = await supabase.from("lifecycle_notifications").insert({
          company_id: companyId,
          notification_type: "automation",
          notification_date: null,
          title: oggetto,
          message: messaggio,
          metadata: { entity_id: entityId, automation: true, recipient_type: "specific_users", user_ids: teamUserIds },
        });
        if (inErr) return { success: false, error: inErr.message };
        return { success: true, output: { action: "internal_notification", tipo, recipients: teamUserIds.length } };
      }

      // Recapiti (email/telefono) degli utenti del team selezionati
      let teamProfiles: Array<{ id: string; email: string | null; phone: string | null }> = [];
      if (teamUserIds.length > 0) {
        const { data } = await supabase
          .from("profiles")
          .select("id, email, phone")
          .in("id", teamUserIds)
          .eq("company_id", companyId);
        teamProfiles = data ?? [];
      }

      if (tipo === "email") {
        const recipients = [...new Set([
          ...extras.filter((e) => e.includes("@")),
          ...teamProfiles.map((p) => p.email).filter((e): e is string => !!e),
        ])];
        if (recipients.length === 0) return { success: false, error: "Nessun destinatario email configurato" };
        const escapeNotif = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

        // Dati azienda per intestazione + footer con indirizzo fisico reale:
        // un indirizzo postale nel footer è un requisito di deliverability
        // (linee guida Gmail bulk / CAN-SPAM) e riduce la probabilità spam.
        const { data: companyRow } = await supabase
          .from("companies")
          .select("name, business_name, legal_address, operational_address")
          .eq("id", companyId)
          .maybeSingle();
        const mittenteNome = escapeNotif(companyRow?.business_name || companyRow?.name || "La tua azienda");
        const indirizzoAzienda = escapeNotif(companyRow?.legal_address || companyRow?.operational_address || "");
        const bodyLines = messaggio
          .split("\n")
          .map((l) => `<p style="margin:0 0 10px;line-height:1.55;color:#1f2937">${escapeNotif(l) || "&nbsp;"}</p>`)
          .join("");
        const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="it"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="light"/></head>
<body style="margin:0;padding:0;background:#f4f5f7;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;">
      <tr><td style="padding:20px 28px;border-bottom:1px solid #eef0f2;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#111827;">${mittenteNome}</td></tr>
      <tr><td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;">${bodyLines}</td></tr>
      <tr><td style="padding:8px 28px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#111827" style="border-radius:8px;">
          <a href="https://app.ediliziaincloud.com/azienda/attivita" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">Apri in Edilizia in Cloud</a>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:16px 28px 22px;border-top:1px solid #eef0f2;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#8a94a3;">
        Notifica automatica del flusso di lavoro di ${mittenteNome}.${indirizzoAzienda ? `<br/>${indirizzoAzienda}` : ""}<br/>
        Inviata tramite Edilizia in Cloud.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
        // Flusso MARKETING (decisione 16/07): a scala le notifiche non possono
        // pesare sul canale transazionale di piattaforma (costo Resend e
        // reputazione del dominio EiC a carico nostro). Escono dal provider
        // marketing (Elastic Email) con mittente risolto PER AZIENDA
        // (dominio custom se verificato, altrimenti fallback mkt.*) e
        // scalano i crediti email dell'azienda come ogni invio marketing.
        // Niente pixel/unsubscribe: i destinatari sono il team, non i lead.
        try {
          const provider = await loadProviderSettings("marketing");
          if (!provider.apiKey) {
            return { success: false, error: "Provider email marketing non configurato" };
          }
          const notifSender = await resolveSender(companyId, "marketing", supabase).catch(() => null);

          let deductedNotifCost = 0;
          try {
            const { data: priceSetting } = await supabase
              .from("platform_settings")
              .select("value")
              .eq("key", "credits_email_price_per_email")
              .maybeSingle();
            const costPerEmail = parseFloat(priceSetting?.value || "0.003");
            const totalCost = costPerEmail * recipients.length;
            await deductEmailCredits(companyId, totalCost, {
              description: `Notifica automazione: ${oggetto}`,
              metadata: { entity_id: entityId, automation: true, internal_notification: true, recipients: recipients.length },
            });
            deductedNotifCost = totalCost;
          } catch (creditErr) {
            // Non blocca: la notifica al team è più importante del contatore.
            console.warn(
              `[internal_notification] deduzione crediti fallita per ${companyId}:`,
              creditErr instanceof Error ? creditErr.message : creditErr,
            );
          }

          const r = await sendViaProviderWithFailover("marketing", provider, {
            from: notifSender?.from ?? provider.fromDefault,
            replyTo: notifSender?.replyTo,
            to: recipients,
            subject: oggetto,
            html,
          }, {
            domain: notifSender?.domain ?? provider.domain ?? undefined,
            stream: "marketing",
            disableNativeTracking: true,
            // Notifica operativa interna: classe transactional su Elastic Email
            // (niente footer unsubscribe bulk, consegna in inbox migliore),
            // pur restando sul provider/crediti marketing dell'azienda.
            elasticTransactionalClass: true,
          });

          await logEmailDelivery(supabase, {
            company_id: companyId,
            recipient: recipients.join(", "),
            subject: oggetto,
            template_name: "automation_internal_notification",
            status: r.ok ? "sent" : "failed",
            provider: r.providerUsed ?? provider.provider,
            stream: "marketing",
            provider_id: r.providerMessageId ?? null,
            error_message: r.ok ? undefined : JSON.stringify(r.body),
            cost_eur: 0,
            charged_eur: deductedNotifCost,
            metadata: { entity_id: entityId, automation: true, internal_notification: true },
          });

          if (!r.ok) {
            if (deductedNotifCost > 0) {
              await addEmailCredits(companyId, deductedNotifCost, "refund", {
                description: `Rimborso notifica automazione fallita: ${oggetto}`,
                metadata: { entity_id: entityId, automation: true, internal_notification: true },
                adminClient: supabase,
              }).catch((refundErr) => {
                console.error("[internal_notification] rimborso crediti fallito:", refundErr);
              });
            }
            return { success: false, error: `Invio email fallito: ${(r as any).error ?? (r as any).status ?? "provider"}` };
          }
        } catch (e) {
          return { success: false, error: e instanceof Error ? e.message : String(e) };
        }
        return { success: true, output: { action: "internal_notification", tipo, recipients: recipients.length } };
      }

      if (tipo === "sms") {
        const numbers = [...new Set([
          ...extras.filter((e) => !e.includes("@")),
          ...teamProfiles.map((p) => p.phone).filter((t): t is string => !!t),
        ])];
        if (numbers.length === 0) return { success: false, error: "Nessun numero destinatario configurato" };
        const supabaseUrl2 = Deno.env.get("SUPABASE_URL")!;
        const cronKey2 = Deno.env.get("INTERNAL_CRON_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        let sent = 0;
        const errors: string[] = [];
        for (const to of numbers) {
          try {
            const smsRes = await fetch(`${supabaseUrl2}/functions/v1/telnyx-proxy`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-cron-secret": cronKey2 },
              body: JSON.stringify({ action: "send_sms", company_id: companyId, payload: { to, body: messaggio, contact_id: null } }),
            });
            const smsResult = await smsRes.json();
            if (!smsRes.ok || smsResult?.error) errors.push(`${to}: ${smsResult?.error || smsRes.status}`);
            else sent++;
          } catch (e) {
            errors.push(`${to}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        if (sent === 0) return { success: false, error: errors.join("; ").slice(0, 400) || "Invio SMS fallito" };
        return { success: true, output: { action: "internal_notification", tipo, recipients: sent, errors: errors.length ? errors : undefined } };
      }

      return { success: false, error: `Tipo notifica non supportato: ${tipo}` };
    }

    case "send_notification": {
      // Insert real notification into lifecycle_notifications.
      // rv(): risolve i {{placeholder}} dal payload del trigger (prima il
      // titolo usciva letterale, es. "Costo anomalo: €{{costo.importo}}").
      const title = rv(ncfg.notification_title || "Notifica automazione");
      const message = rv(ncfg.notification_message || "");
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

      // Insert notification. notification_date=NULL: l'indice unico
      // (company, type, date) serve ai digest lifecycle 1/giorno — con la
      // data di default la SECONDA notifica di automazione del giorno
      // collideva (duplicate key) e il nodo andava in retry-loop. I NULL
      // sono distinti nell'indice → nessun limite (migration 20271128000000).
      const { error: notifErr } = await supabase.from("lifecycle_notifications").insert({
        company_id: companyId,
        notification_type: "automation",
        notification_date: null,
        title,
        message,
        // user_ids nel metadata: lifecycle_notifications non ha una colonna
        // destinatario — senza questi id la scelta assegnatario/admin/specifico
        // era puramente cosmetica (notifica sempre company-wide).
        metadata: { entity_id: entityId, automation: true, recipient_type: ncfg.notification_recipient, user_ids: targetUserIds },
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

    case "send_whatsapp_locale": {
      return await executeSendWhatsAppLocale(supabase, ncfg, entityId, companyId);
    }

    case "send_email": {
      return await executeSendEmail(supabase, ncfg, entityId, companyId);
    }

    case "send_sms": {
      // Get contact (telefono + dati per la personalizzazione)
      const { data: smsContact } = await supabase
        .from("marketing_contacts")
        .select("id, phone, first_name, last_name, email, city, province, company_name, source, optout_sms, opt_out")
        .eq("id", entityId)
        .eq("company_id", companyId)
        .maybeSingle();

      // Numero esplicito dal builder (campo "numero"): prima era IGNORATO e
      // si inviava sempre al telefono del contatto.
      const smsOverrideTo = typeof ncfg.sms_to === "string" && ncfg.sms_to.trim() !== "" && !ncfg.sms_to.includes("{{")
        ? ncfg.sms_to.trim()
        : null;
      if (!smsOverrideTo && !smsContact?.phone) {
        return { success: false, error: "Contatto senza numero di telefono" };
      }
      // Consenso: l'opt-out vale quando si scrive AL CONTATTO.
      if (!smsOverrideTo && (smsContact.optout_sms || smsContact.opt_out)) {
        return { success: false, error: "Contact has opted out of SMS" };
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
              to: smsOverrideTo ?? smsContact.phone,
              body: smsBody,
              contact_id: smsOverrideTo ? null : entityId,
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

      // Il catalogo espone `metodo` (POST/PUT/PATCH/GET) e `headers` (JSON):
      // PRIMA erano ignorati (sempre POST, niente header custom).
      const method = ["GET", "POST", "PUT", "PATCH"].includes(String(ncfg.metodo ?? "").toUpperCase())
        ? String(ncfg.metodo).toUpperCase()
        : "POST";
      const extraHeaders: Record<string, string> = {};
      try {
        const h = typeof ncfg.headers === "string" ? JSON.parse(ncfg.headers) : ncfg.headers;
        if (h && typeof h === "object" && !Array.isArray(h)) {
          for (const [k, v] of Object.entries(h)) {
            if (typeof v === "string" && k.length <= 100 && v.length <= 500) extraHeaders[k] = v;
          }
        }
      } catch { /* headers malformati: ignora, si usa solo Content-Type */ }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10_000);
        const resp = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json", ...extraHeaders },
          body: method === "GET" ? undefined : JSON.stringify({ entity_id: entityId, company_id: companyId, config: ncfg }),
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        const text = await resp.text();
        return { success: resp.ok, output: { action: "webhook_out", method, status: resp.status, body: text.slice(0, 500) }, error: resp.ok ? undefined : `HTTP ${resp.status}` };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }

    // ── 6 New cross-domain handlers (FLOW-EXT-04) ──

    case "crea_bozza_ordine": {
      // Colonne REALI di orders (prima: title/contact_id/notes inesistenti →
      // errore Postgres a ogni esecuzione). Dati cliente denormalizzati dal
      // contatto del flusso, come fa crea_cantiere.
      const title = rv(ncfg.titolo || ncfg.task_title || "Nuovo ordine automatico");
      const importo = parseFloat(String(ncfg.importo || 0)) || 0;
      const { data: ordContact } = await supabase
        .from("marketing_contacts")
        .select("first_name, last_name, email, phone, customer_profile_id")
        .eq("id", entityId).eq("company_id", companyId).maybeSingle();
      const ordClientName = ordContact
        ? [ordContact.first_name, ordContact.last_name].filter(Boolean).join(" ").trim()
        : "";
      const { data, error } = await supabase.from("orders").insert({
        company_id: companyId,
        description: ncfg.note ? `${title} — ${rv(String(ncfg.note))}` : title,
        total_amount: importo,
        status: "bozza",
        customer_id: ordContact?.customer_profile_id || null,
        client_name: ordClientName || null,
        client_email: ordContact?.email || null,
        client_phone: ordContact?.phone || null,
      }).select("id").single();
      if (error) return { success: false, error: error.message };
      return { success: true, output: { action: "crea_bozza_ordine", ordine_id: data?.id } };
    }

    case "crea_bozza_preventivo": {
      // quotes richiede quote_number (RPC generate_quote_number) e created_by
      // NOT NULL (chi ha creato il flusso). Prima l'insert falliva SEMPRE.
      const title = rv(ncfg.titolo || "Nuovo preventivo automatico");
      const { data: qNum } = await supabase.rpc("generate_quote_number", { p_company_id: companyId });
      const { data: qFlow } = await supabase
        .from("automation_flows").select("created_by").eq("id", queueItem?.flow_id).maybeSingle();
      if (!qFlow?.created_by) return { success: false, error: "Flusso senza creatore: impossibile intestare il preventivo" };
      const { data: qContact } = await supabase
        .from("marketing_contacts")
        .select("first_name, last_name, email, phone, company_name")
        .eq("id", entityId).eq("company_id", companyId).maybeSingle();
      const { data, error } = await supabase.from("quotes").insert({
        company_id: companyId,
        quote_number: qNum || `AUTO-${crypto.randomUUID().slice(0, 8)}`,
        title,
        status: "bozza",
        contact_id: UUID_RE.test(String(entityId)) ? entityId : null,
        client_name: qContact ? ([qContact.first_name, qContact.last_name].filter(Boolean).join(" ").trim() || null) : null,
        client_email: qContact?.email || null,
        client_phone: qContact?.phone || null,
        client_company: qContact?.company_name || null,
        validity_days: parseInt(String(ncfg.validita_giorni)) || 30,
        created_by: qFlow.created_by,
        assigned_to: ncfg.assegnato_a && UUID_RE.test(String(ncfg.assegnato_a)) ? ncfg.assegnato_a : null,
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
        // Giorno ITALIANO, non UTC (convenzione anti UTC-drift).
        work_start_date: workStart.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" }),
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
      // Giorno ITALIANO, non UTC (convenzione anti UTC-drift).
      const appointmentDateStr = new Date(Date.now() + giorniDaOggi * 86_400_000)
        .toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
      const { data, error } = await supabase.from("appointments").insert({
        company_id: companyId,
        title,
        contact_id: ncfg.contact_id || entityId,
        appointment_date: appointmentDateStr,
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
      // Colonne/enum reali di tickets (prima: description/contact_id
      // inesistenti + status "open" e priority "media" fuori enum → falliva
      // sempre). customer_id solo se esplicito e uuid (FK, l'entity del
      // flusso è un marketing_contact, non un customer).
      const oggetto = rv(ncfg.oggetto || "Ticket automatico");
      const TICKET_PRIORITY = new Set(["bassa", "normale", "alta", "urgente"]);
      const ticketPriority = TICKET_PRIORITY.has(String(ncfg.priorita)) ? String(ncfg.priorita) : "normale";
      const { data, error } = await supabase.from("tickets").insert({
        company_id: companyId,
        subject: oggetto,
        descrizione: ncfg.descrizione ? rv(String(ncfg.descrizione)) : null,
        priority: ticketPriority,
        customer_id: ncfg.cliente_id && UUID_RE.test(String(ncfg.cliente_id)) ? ncfg.cliente_id : null,
        status: "aperto",
        fonte: "api",
      }).select("id").single();
      if (error) return { success: false, error: error.message };
      return { success: true, output: { action: "crea_ticket", ticket_id: data?.id } };
    }

    case "crea_fattura": {
      const importo = parseFloat(String(ncfg.importo || 0)) || 0;
      const scadenzaGiorni = parseInt(ncfg.scadenza_giorni) || 30;
      // Giorno ITALIANO, non UTC (convenzione anti UTC-drift).
      const scadenzaStr = new Date(Date.now() + scadenzaGiorni * 86_400_000)
        .toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
      // Colonne reali di invoices (prima: contact_id/total_amount/description
      // inesistenti e client_company_name NOT NULL mancante → falliva sempre).
      const { data: invContact } = await supabase
        .from("marketing_contacts")
        .select("first_name, last_name, email, company_name")
        .eq("id", entityId).eq("company_id", companyId).maybeSingle();
      const invClientName = invContact
        ? ([invContact.first_name, invContact.last_name].filter(Boolean).join(" ").trim())
        : "";
      const { data, error } = await supabase.from("invoices").insert({
        company_id: companyId,
        client_company_name: invContact?.company_name || invClientName || "Cliente",
        client_email: invContact?.email || null,
        subtotal: importo,
        total: importo,
        notes: rv(String(ncfg.descrizione ?? "Fattura automatica")),
        due_date: scadenzaStr,
        status: "draft",
      }).select("id").single();
      if (error) return { success: false, error: error.message };
      return { success: true, output: { action: "crea_fattura", fattura_id: data?.id } };
    }

    case "end_automation":
      return { success: true, output: { action: "end_automation" } };

    case "attendi":
      // Nodo "Attendi" creato per errore come AZIONE (dialog AI o inserimento
      // dal catalogo sbagliato): prima cadeva nel default "Not implemented"
      // e l'attesa non avveniva mai (il flusso proseguiva subito). Delega la
      // semantica al delay: queueNextNodes gestisce result.isDelay.
      return executeDelay(ncfg);

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
        // Giorno ITALIANO, non UTC (convenzione anti UTC-drift).
        dueDate = new Date(Date.now() + dueDays * 86_400_000)
          .toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
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
      // Prima: success:true con "Not implemented yet". Un'azione sconosciuta
      // veniva contata come riuscita, il flusso proseguiva e il Registro
      // mostrava tutto verde: e' il meccanismo che ha tenuto nascosti per mesi
      // i trigger che non arruolavano. Fallire e' l'unico modo per accorgersene.
      return {
        success: false,
        error: `Azione "${actionType}" non riconosciuta dal motore: il nodo non e' stato eseguito.`,
      };
  }
}

// ────────────────────────────────────────────────────
// QUEUE NEXT NODES
// ────────────────────────────────────────────────────
async function queueNextNodes(supabase: any, queueItem: any, node: AutomationNode, result: any) {
  // In test mode le iscrizioni si chiudono come 'canceled': 'completed'
  // bloccherebbe il futuro arruolamento REALE del contatto (blockedStatuses).
  const doneStatus = queueItem?.context_json?.payload?.test_mode || queueItem?.context_json?.payload?.dry_run
    ? "canceled" : "completed";
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
      .update({ status: doneStatus, updated_at: new Date().toISOString() })
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
      // condition branches: il motore produce "yes"/"no", ma il builder salva
      // gli archi come "Sì"/"No" (i flussi AI/legacy come yes/no) → PRIMA il
      // match falliva su OGNI condizione disegnata nel builder e il flusso
      // terminava lì. Normalizza il label prima del confronto.
      const normBranch = (l: string | null) => {
        const v = String(l ?? "").trim().toLowerCase();
        if (v === "sì" || v === "si" || v === "yes" || v === "vero" || v === "true") return "yes";
        if (v === "no" || v === "falso" || v === "false") return "no";
        return v;
      };
      nextConns = connections.filter((c: AutomationConnection) => normBranch(c.label) === result.branch);
    }
    if (nextConns.length === 0) {
      // FIX ROUTING: il vecchio fallback "segui TUTTE le connessioni" faceva
      // proseguire il flusso sul ramo SBAGLIATO quando il ramo perdente non
      // aveva archi in uscita (es. condizione "no" che semplicemente finisce
      // lì → il contatto seguiva comunque il ramo "yes"). Ora: fallback SOLO
      // se nessun arco ha label (flussi legacy non etichettati); se i label
      // esistono ma il ramo non ha uscite, il flusso termina qui.
      const anyLabeled = connections.some((c: AutomationConnection) => !!c.label);
      if (!anyLabeled) {
        nextConns = connections;
      } else {
        await supabase
          .from("automation_enrollments")
          .update({ status: doneStatus, updated_at: new Date().toISOString() })
          .eq("id", queueItem.enrollment_id);
        return;
      }
    }
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

    // Crea l'item "waiting" con timeout. Rami: label "timeout" se presente;
    // FALLBACK sugli archi SENZA label (il builder disegna un solo arco non
    // etichettato → prima NESSUN item veniva creato e il flusso restava
    // bloccato in waiting per sempre, anche se l'evento arrivava).
    const timeoutConns = nextConns.filter((c: AutomationConnection) => c.label === "timeout");
    const waitConns = timeoutConns.length > 0
      ? timeoutConns
      : nextConns.filter((c: AutomationConnection) => !c.label);

    if (waitConns.length === 0) {
      // Nessuna uscita: attesa "terminale" — su timeout l'iscrizione si chiude.
      await supabase.from("automation_queue").insert({
        enrollment_id: queueItem.enrollment_id,
        flow_id: queueItem.flow_id,
        company_id: queueItem.company_id,
        current_node_id: node.id,
        entity_id: queueItem.entity_id,
        entity_type: queueItem.entity_type,
        status: "waiting",
        execute_at: timeoutAt,
        context_json: { ...queueItem.context_json, branch: "timeout", terminal_wait: true, await_event: result.awaitEvent, waiting_for: result.awaitEvent, wait_node_id: node.id },
      });
    } else {
      for (const conn of waitConns) {
        await supabase.from("automation_queue").insert({
          enrollment_id: queueItem.enrollment_id,
          flow_id: queueItem.flow_id,
          company_id: queueItem.company_id,
          current_node_id: conn.to_node_id,
          entity_id: queueItem.entity_id,
          entity_type: queueItem.entity_type,
          status: "waiting",
          execute_at: timeoutAt,
          context_json: { ...queueItem.context_json, branch: conn.label || "timeout", await_event: result.awaitEvent, waiting_for: result.awaitEvent, wait_node_id: node.id },
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
  const dayMs = 86_400_000;
  const results = filters.conditions.map((c: any) => {
    if (c.logic) return evaluateFilters(c, payload); // Nested group
    const actual = payload[c.field];
    const sa = String(actual ?? "").toLowerCase();
    const sv = String(c.value ?? "").toLowerCase();
    const na = Number(actual);
    const nv = Number(c.value);
    const da = actual != null ? new Date(String(actual)).getTime() : NaN;
    const dv = c.value != null ? new Date(String(c.value)).getTime() : NaN;
    let match = false;
    // Il TriggerConditionBuilder offre TUTTI questi operatori: prima solo 5
    // erano implementati e il resto cadeva nel default → condizione sempre
    // vera in silenzio (es. "valore > 1000" scattava per qualsiasi valore).
    switch (c.operator) {
      case "equals": match = String(actual) === String(c.value); break;
      case "not_equals": match = String(actual) !== String(c.value); break;
      case "contains": match = sa.includes(sv); break;
      case "not_contains": match = !sa.includes(sv); break;
      case "starts_with": match = sa.startsWith(sv); break;
      case "ends_with": match = sa.endsWith(sv); break;
      case "is_empty": match = !actual; break;
      case "is_not_empty": match = !!actual; break;
      case "gt": match = Number.isFinite(na) && na > nv; break;
      case "gte": match = Number.isFinite(na) && na >= nv; break;
      case "lt": match = Number.isFinite(na) && na < nv; break;
      case "lte": match = Number.isFinite(na) && na <= nv; break;
      case "between": {
        const [lo, hi] = String(c.value ?? "").split(/[,;|]/).map((x: string) => Number(x.trim()));
        match = Number.isFinite(na) && Number.isFinite(lo) && Number.isFinite(hi) && na >= lo && na <= hi;
        break;
      }
      case "is_true": match = actual === true || sa === "true" || sa === "1"; break;
      case "is_false": match = actual === false || sa === "false" || sa === "0"; break;
      case "is_assigned": match = actual != null && String(actual) !== ""; break;
      case "is_not_assigned": match = actual == null || String(actual) === ""; break;
      case "on": match = Number.isFinite(da) && Number.isFinite(dv) && new Date(da).toDateString() === new Date(dv).toDateString(); break;
      case "before": match = Number.isFinite(da) && Number.isFinite(dv) && da < dv; break;
      case "after": match = Number.isFinite(da) && Number.isFinite(dv) && da > dv; break;
      case "today": match = Number.isFinite(da) && new Date(da).toDateString() === new Date().toDateString(); break;
      case "yesterday": match = Number.isFinite(da) && new Date(da).toDateString() === new Date(Date.now() - dayMs).toDateString(); break;
      case "in_last_x_days": match = Number.isFinite(da) && Number.isFinite(nv) && da >= Date.now() - nv * dayMs && da <= Date.now(); break;
      case "in_next_x_days": match = Number.isFinite(da) && Number.isFinite(nv) && da >= Date.now() && da <= Date.now() + nv * dayMs; break;
      default: match = true; // operatore sconosciuto: fail-open come prima
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

      // Segna processed SOLO in caso di successo: un errore transitorio (es.
      // enrollment del lead FB fallito) non deve marcare l'evento come fatto,
      // altrimenti l'automazione va persa in silenzio. Restando processed=false
      // il cron (ogni minuto) lo riprova.
      await supabase
        .from("automation_trigger_events")
        .update({ processed: true })
        .eq("id", evt.id);
    } catch (err: any) {
      console.error(`Trigger event ${evt.id} error:`, err);
      // NON marcare processed: l'evento resta in coda e verrà ritentato.
      // RISCHIO NOTO: automation_trigger_events non ha un contatore di tentativi,
      // quindi un evento che fallisce SEMPRE (es. payload corrotto) verrà
      // ritentato all'infinito e, essendo il più vecchio (order created_at ASC,
      // limit 100), resta in testa alla batch. Se diventa un problema, aggiungere
      // una colonna attempt_count con cap ~5 e marcarlo processed oltre soglia.
      // Per ora si preferisce il retry alla perdita silenziosa dell'automazione.
    }
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
        // Ramo "event" se etichettato; FALLBACK sugli archi senza label
        // (il builder disegna un solo arco non etichettato → l'evento
        // riprende il flusso dal nodo successivo).
        let eventConns = connections.filter((c: any) => c.from_node_id === parentNodeId && c.label === "event");
        if (eventConns.length === 0) {
          eventConns = connections.filter((c: any) => c.from_node_id === parentNodeId && !c.label);
        }
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

    // Attesa "terminale" (nodo wait senza uscite): il timeout chiude
    // l'iscrizione, senza ri-eseguire il nodo di attesa (loop infinito).
    if (item.context_json?.terminal_wait) {
      await supabase
        .from("automation_enrollments")
        .update({ status: "completed", updated_at: now })
        .eq("id", item.enrollment_id);
      continue;
    }

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

    // Destinatario override (campo "destinatario" del builder, con supporto
    // {{placeholder}}): PRIMA era ignorato e si inviava sempre al contatto.
    // Default (vuoto o uguale) = email del contatto, comportamento invariato.
    let toAddress: string = contact.email;
    if (typeof cfg.email_to === "string" && cfg.email_to.trim() !== "") {
      const resolvedTo = (await resolveContactText(supabase, cfg.email_to, contact, companyId)).trim();
      if (resolvedTo && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(resolvedTo)) {
        toAddress = resolvedTo;
      }
    }

    const suppressed = await getSuppressedEmailMap(
      supabase,
      [toAddress],
      companyId,
      stream,
    );
    if (suppressed.has(normalizeEmailAddress(toAddress))) {
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
    // Reply GHL-style: Reply-To = indirizzo unico del contatto (attivo solo se
    // email_reply_domain è configurato) → la risposta rientra nel CRM in
    // tempo reale via edge email-inbound-reply, senza caselle collegate.
    const routeReplyTo = await getReplyAddress(supabase, companyId, contact.id);
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
      replyTo: routeReplyTo ?? resolvedSender?.replyTo,
      to: [toAddress],
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
      recipient: toAddress,
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
// WhatsApp Locale (canale non-ufficiale OpenWA): SOLO automazioni della piattaforma.
// Guardia di sicurezza multi-tenant: i numeri del pool NON vanno mai esposti alle
// automazioni delle aziende clienti.
async function executeSendWhatsAppLocale(supabase: any, cfg: Record<string, any>, entityId: string, companyId: string) {
  if (companyId !== OPENWA_PLATFORM_COMPANY_ID) {
    return { success: false, error: "WhatsApp Locale è disponibile solo per le automazioni della piattaforma." };
  }
  const { data: contact } = await supabase
    .from("marketing_contacts")
    .select("id, phone, first_name, last_name, tags, optout_whatsapp")
    .eq("id", entityId)
    .single();
  if (!contact?.phone) return { success: false, error: "Contatto senza numero di telefono" };
  if (contact.optout_whatsapp) return { success: false, error: "Contatto in opt-out WhatsApp" };

  const resolvedText = await resolveContactText(supabase, cfg.whatsapp_text || "", contact, companyId);
  if (!resolvedText) return { success: false, error: "Nessun testo configurato per il messaggio WhatsApp Locale" };

  const res = await sendOpenWaMessage(supabase, {
    contactId: contact.id,
    to: contact.phone,
    text: resolvedText,
    contactTags: contact.tags ?? [],
  });
  if (!res.ok) {
    // 409 = esito TRANSIENTE (nessun numero disponibile: cap/warm-up/throttle
    // esauriti o fuori finestra oraria). Non è un errore vero: chiedi al motore
    // di rinviare senza consumare i tentativi (back-pressure sul pool).
    if (res.status === 409) {
      return { success: false, defer: true, deferMinutes: 60, error: res.error };
    }
    return { success: false, error: res.error ?? "Invio WhatsApp Locale fallito" };
  }
  return { success: true };
}

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
    region: contact?.region ?? "",
    regione: contact?.region ?? "",
    address: contact?.address ?? "",
    indirizzo: contact?.address ?? "",
    postal_code: contact?.postal_code ?? "",
    cap: contact?.postal_code ?? "",
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

/**
 * Il builder salva l'assegnatario dei task come SENTINELLA
 * ("contatto_owner" / "utente_corrente" / "specifico") oppure come uuid.
 * tasks.assigned_to è una FK uuid su profiles: senza risoluzione l'insert
 * falliva appena l'utente toccava il select.
 */
async function resolveTaskAssignee(
  supabase: any,
  raw: unknown,
  entityId: string,
  companyId: string,
  flowId?: string,
): Promise<string | null> {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (!v) return null;
  if (UUID_RE.test(v)) return v;
  if (v === "contatto_owner") {
    const { data } = await supabase
      .from("marketing_contacts")
      .select("assigned_to")
      .eq("id", entityId)
      .eq("company_id", companyId)
      .maybeSingle();
    return data?.assigned_to ?? null;
  }
  // "utente_corrente" / "specifico" (senza picker) → chi ha creato il flusso
  if (flowId) {
    const { data } = await supabase
      .from("automation_flows")
      .select("created_by")
      .eq("id", flowId)
      .maybeSingle();
    return data?.created_by ?? null;
  }
  return null;
}

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
