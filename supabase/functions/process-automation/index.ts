/**
 * process-automation — esegue i nodi delle automazioni (trigger, delay, azioni).
 *
 * NB sulle notifiche interne (azione `notifica_interna`): l'invio ha una catena
 * di ripiego sul mittente, non un tentativo solo. Il perche' e il costo di non
 * averla sono documentati sul punto, cercare "Catena di ripiego sul MITTENTE".
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { decryptMaybeEncrypted, getEncryptionKey } from "../_shared/encryption.ts";
import { resolveWhatsAppSender } from "../_shared/resolveWhatsAppSender.ts";
import { romeMinuti, sendOpenWaMessage, OPENWA_PLATFORM_COMPANY_ID } from "../_shared/openwaSend.ts";
import { leggiFasceOrarie, minutiAllaFascia } from "../_shared/openwaFinestraInvio.ts";
import { minutiAllApertura } from "../_shared/finestraFlusso.ts";
import { sendViaProviderWithFailover, loadProviderSettings, sanitizeFromName } from "../_shared/emailProvider.ts";
import { addEmailCredits, deductEmailCredits } from "../_shared/emailCredits.ts";
import { logEmailDelivery } from "../_shared/email-log.ts";
import { resolveSender } from "../_shared/resolveSender.ts";
import { getReplyAddress } from "../_shared/replyRoutes.ts";
import { getSuppressedEmailMap, normalizeEmailAddress } from "../_shared/emailSuppression.ts";

import { getCorsHeaders, secureHeaders } from "../_shared/headers.ts";
import { appendTrackingSig } from "../_shared/emailTrackingSignature.ts";
import { arcoDelRamo, inizioGiornoRoma, leggiPercentuali, letteraRamo, modalitaSplit, ramoEquilibrato, ramoPerNumero } from "../_shared/splitRami.ts";
import { nomeOpportunitaPulito, personeDaAvvisare, tagsUniti, testoNotaAggiornamento } from "../_shared/creaAggiornaOpportunita.ts";
import { conLinkCliccabili, fusoDelFlusso, invioEmailDaRimandare, MINUTI_RINVIO_EMAIL, numeroWhatsApp, schedaAndataAvanti, senzaSpazioPrimaDellaVirgola } from "../_shared/sequenzaContatto.ts";
import { mittenteDelPasso, dominiAmmessi, soloDominiDellAzienda } from "../_shared/mittenteAutomazione.ts";
import { calendarioDelGiorno, giornoAmmesso, leggiSettimane } from "../_shared/attesaCalendario.ts";
import { romaVersoUtc, urlGestione } from "../_shared/appuntamentiPubblici.ts";
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
import { costruisciVariabiliCommessa, scegliFatturaDaAllegare, sostituisciVariabiliCommessa } from "../_shared/variabiliCommessa.ts";

import { serveConMetriche } from "../_shared/withMetrics.ts";
import { prendiInCarico } from "../_shared/presaInCarico.ts";
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

serveConMetriche("process-automation", async (req) => {
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
    .select("id, version, config_json, allow_reentry")
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
    // Un contatto ha scritto per email (20/09/2026): lo emettono
    // email-poll-inbox e email-inbound-reply, vedi _shared/emailRicevutaEvento.ts.
    email_ricevuta: "email_received",
    campagna_facebook_lead: "facebook_lead_received",

    // ── Trigger OPERATIVI (area azienda). Eventi emessi dai DB-trigger della
    // migration 20270616110000 e dal cron check-scheduled-triggers. Mappano
    // l'id catalogo italiano all'evento canonico inglese in automation_trigger_events.
    // Ordini / cantieri (un cantiere è un record orders → stesso evento order_created)
    ordine_creato: "order_created",
    cantiere_creato: "order_created",
    ordine_stato_cambiato: "order_status_changed",
    // Emesso da fire_order_automation quando si fissa o si sposta la data di
    // posa prevista (orders.expected_date).
    commessa_data_installazione: "order_installation_date_set",
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
    preventivo_senza_risposta: "quote_unanswered",  // SCHEDULED
    // Assistenza e cantieri: tre trigger che i template pronti promettevano
    // da mesi con id inventati, quindi non scattavano mai.
    manutenzione_in_scadenza: "manutenzione_scheduled",           // SCHEDULED
    contratto_manutenzione_in_scadenza: "contratto_manut_expiring", // SCHEDULED
    cantiere_lavori_conclusi: "order_work_completed",             // SCHEDULED
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
    // Selezione candidati (emettitori: migration 20280902130000)
    candidato_creato: "candidate_created",
    candidato_fase_cambiata: "candidate_stage_changed",
    candidato_assunto: "candidate_hired",
    colloquio_fissato: "interview_scheduled",
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
      const importo = Number(ep?.importo ?? ep?.total_amount ?? ep?.value ?? ep?.total);
      if (Number.isFinite(soglia) && !(Number.isFinite(importo) && importo >= soglia)) continue;
    }
    // Stato di arrivo (ordine_stato_cambiato / ticket_stato_cambiato): confronto
    // normalizzato (minuscole, spazi→underscore) su status E status_name, perché
    // le aziende hanno stati con nomi propri. Prima era IGNORATO: scattava su
    // ogni cambio stato.
    if (typeof tcfg.stato_a === "string" && tcfg.stato_a !== "") {
      const normStato = (s: unknown) => String(s ?? "").toLowerCase().trim().replace(/\s+/g, "_");
      const want = normStato(tcfg.stato_a);
      // current_status_id: il builder salva l'id della fase (i nomi le aziende
      // li cambiano, l'id resta).
      const got = [ep?.status, ep?.status_name, ep?.new_status, ep?.current_status_id].map(normStato);
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
    // Calendario (trigger degli appuntamenti): la demo di un marchio non deve
    // far partire il flusso della consulenza di un altro marchio della stessa
    // azienda. calendar_id è nel payload dal 22/09/2026: un evento senza (più
    // vecchio) non passa, perché non si può dire da che calendario arrivi.
    if (typeof tcfg.calendario_id === "string" && tcfg.calendario_id !== "") {
      if (String(ep?.calendar_id ?? "") !== tcfg.calendario_id) continue;
    }
    // Numero WhatsApp Locale (whatsapp_ricevuto): solo i messaggi arrivati a
    // quel numero. Le risposte ai promemoria arrivano al numero degli
    // appuntamenti, e lì un «non posso» va visto subito.
    if (typeof tcfg.numero_whatsapp_id === "string" && tcfg.numero_whatsapp_id !== "") {
      if (String((enrichedPayload as Record<string, unknown>)?.openwa_number_id ?? "") !== tcfg.numero_whatsapp_id) continue;
    }
    // Pipeline (trigger delle opportunità): era solo nell'interfaccia.
    if (typeof tcfg.pipeline_id === "string" && tcfg.pipeline_id !== "" && ep?.pipeline_id !== undefined) {
      if (String(ep.pipeline_id ?? "") !== tcfg.pipeline_id) continue;
    }
    // Fonte (contatto_creato → payload.source; candidato_creato → payload.fonte)
    if (typeof tcfg.fonte_filtro === "string" && tcfg.fonte_filtro !== "") {
      const epf = enrichedPayload as Record<string, unknown>;
      const src = String(epf?.source ?? epf?.fonte ?? "").toLowerCase();
      if (!src.includes(tcfg.fonte_filtro.toLowerCase())) continue;
    }
    // Ruolo del candidato (candidato_creato / candidato_assunto): "contiene".
    if (typeof tcfg.ruolo_filtro === "string" && tcfg.ruolo_filtro !== "") {
      const ruolo = String((enrichedPayload as Record<string, unknown>)?.ruolo ?? "").toLowerCase();
      if (!ruolo.includes(tcfg.ruolo_filtro.toLowerCase())) continue;
    }
    // Fase di arrivo (candidato_fase_cambiata): confronto normalizzato sul nome.
    if (typeof tcfg.fase_a === "string" && tcfg.fase_a !== "") {
      const norm = (s: unknown) => String(s ?? "").toLowerCase().trim();
      if (norm((enrichedPayload as Record<string, unknown>)?.fase_nome) !== norm(tcfg.fase_a)) continue;
    }
    // Tipo richiesta (ferie_richiesta: ferie/permesso/malattia).
    if (typeof tcfg.tipo_richiesta_filtro === "string" && tcfg.tipo_richiesta_filtro !== "") {
      if (String((enrichedPayload as Record<string, unknown>)?.tipo ?? "").toLowerCase() !== tcfg.tipo_richiesta_filtro.toLowerCase()) continue;
    }
    // Tipo colloquio (colloquio_fissato).
    if (typeof tcfg.tipo_colloquio_filtro === "string" && tcfg.tipo_colloquio_filtro !== "") {
      if (String((enrichedPayload as Record<string, unknown>)?.tipo ?? "").toLowerCase() !== tcfg.tipo_colloquio_filtro.toLowerCase()) continue;
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
    // `allow_reentry` è la casella che l'interfaccia mostra nelle impostazioni
    // del flusso: era salvata e mai letta, quindi spostarla non cambiava nulla.
    const allowReEnrollment = flow.allow_reentry === true
      || flowSettings.enable_reenrollment === true
      || matchingTrigger.config_json?.allow_re_enrollment === true;

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

  // "Ferma se risponde": impostazione del flusso che l'interfaccia salvava da
  // sempre e che NESSUNO leggeva. Su una sequenza da 45 email significa che chi
  // risponde "smettete di scrivermi" le riceve tutte lo stesso — il modo più
  // veloce per farsi segnalare come spam e bruciare il dominio.
  //
  // Una risposta = una email in arrivo da quell'indirizzo dopo l'iscrizione.
  // Le impostazioni dei flussi si leggono una volta sola per esecuzione.
  const impostazioniFlusso = new Map<string, { stopOnReply: boolean; pipelineCliente: string | null }>();
  async function fermaSeHaRisposto(item: any): Promise<boolean> {
    if (!item.flow_id || !item.enrollment_id || !item.entity_id) return false;
    try {
      if (!impostazioniFlusso.has(item.flow_id)) {
        const { data: f } = await supabase.from("automation_flows")
          .select("stop_on_reply, stop_on_won_pipeline_id").eq("id", item.flow_id).maybeSingle();
        impostazioniFlusso.set(item.flow_id, {
          stopOnReply: f?.stop_on_reply === true,
          pipelineCliente: typeof f?.stop_on_won_pipeline_id === "string" ? f.stop_on_won_pipeline_id : null,
        });
      }
      const imp = impostazioniFlusso.get(item.flow_id)!;
      if (!imp.stopOnReply && !imp.pipelineCliente) return false;

      const { data: iscr } = await supabase.from("automation_enrollments")
        .select("created_at, status").eq("id", item.enrollment_id).maybeSingle();
      if (!iscr || iscr.status !== "active") return false;

      let motivo: string | null = null;

      // «Si ferma solo se diventa cliente» (19/09/2026, nurturing di Marketing
      // Edile): il flusso ignora risposte e schede spostate e si chiude appena
      // il contatto ha un'opportunità vinta nella pipeline scelta. Un cliente
      // che riceve email di vendita pensa che non stiamo guardando i suoi numeri.
      if (imp.pipelineCliente) {
        const { data: vinta } = await supabase.from("marketing_opportunities")
          .select("id").eq("company_id", item.company_id).eq("contact_id", item.entity_id)
          .eq("pipeline_id", imp.pipelineCliente).not("won_at", "is", null)
          .is("deleted_at", null).limit(1).maybeSingle();
        if (vinta) motivo = "il contatto è diventato cliente";
      }

      const { data: contatto } = imp.stopOnReply && !motivo
        ? await supabase.from("marketing_contacts").select("email").eq("id", item.entity_id).maybeSingle()
        : { data: null };
      const indirizzo = String(contatto?.email ?? "").trim().toLowerCase();

      if (!motivo && indirizzo) {
        const { data: risposta } = await supabase.from("email_inbox")
          .select("id").eq("company_id", item.company_id)
          .ilike("from_email", indirizzo)
          .gt("received_at", iscr.created_at)
          .limit(1).maybeSingle();
        if (risposta) motivo = "il contatto ha risposto";
      }

      // Risposta su WhatsApp Locale (19/09/2026): i numeri della piattaforma
      // passano dal gateway, quindi i messaggi in arrivo li vediamo. Chi
      // risponde su WhatsApp esce dalla sequenza come chi risponde all'email.
      if (!motivo && imp.stopOnReply && item.company_id === OPENWA_PLATFORM_COMPANY_ID) {
        const { data: suWhatsApp } = await supabase.from("openwa_messages")
          .select("id").eq("contact_id", item.entity_id).eq("direction", "inbound")
          .gt("created_at", iscr.created_at)
          .limit(1).maybeSingle();
        if (suWhatsApp) motivo = "il contatto ha risposto su WhatsApp";
      }

      // La scheda andata avanti a mano (19/09/2026). WhatsApp e prenotazioni
      // spesso passano da canali che il CRM non vede (il telefono di chi
      // vende, un calendario esterno): quando qualcuno prende in mano il
      // contatto sposta la sua scheda oltre la prima fase, e da lì la
      // sequenza automatica si ferma. La creazione della scheda non conta.
      if (!motivo && imp.stopOnReply) {
        const { data: opps } = await supabase.from("marketing_opportunities")
          .select("id").eq("company_id", item.company_id).eq("contact_id", item.entity_id)
          .is("deleted_at", null).limit(20);
        const idsOpp = ((opps ?? []) as Array<{ id: string }>).map((o) => o.id);
        if (idsOpp.length) {
          const { data: ingressi } = await supabase.from("marketing_opportunity_stage_history")
            .select("stage_id, entered_at").in("opportunity_id", idsOpp)
            .gt("entered_at", iscr.created_at).limit(50);
          const righe = (ingressi ?? []) as Array<{ stage_id: string; entered_at: string | null }>;
          const fasi = [...new Set(righe.map((r) => r.stage_id))];
          if (fasi.length) {
            const { data: st } = await supabase.from("marketing_pipeline_stages")
              .select("id, position").in("id", fasi);
            const posizioni = new Map(((st ?? []) as Array<{ id: string; position: number | null }>).map((x) => [x.id, x.position]));
            if (schedaAndataAvanti(righe, posizioni, iscr.created_at)) {
              motivo = "la scheda del contatto è andata avanti nella pipeline";
            }
          }
        }
      }
      if (!motivo) return false;

      // Si chiude l'iscrizione e si annulla tutta la coda residua, non solo il
      // passo corrente. Lo stato è «canceled»: «stopped» (usato dal 05/09) non
      // è fra quelli ammessi da automation_enrollments_status_check, l'UPDATE
      // falliva in silenzio e l'iscrizione restava «active» per sempre.
      await supabase.from("automation_enrollments")
        .update({ status: "canceled", updated_at: new Date().toISOString() })
        .eq("id", item.enrollment_id);
      await supabase.from("automation_queue")
        .update({ status: "cancelled", last_error: `fermata: ${motivo}`, updated_at: new Date().toISOString() })
        .eq("enrollment_id", item.enrollment_id).eq("status", "pending");
      // Fermarsi perché il contatto ha risposto è una fine regolare: anche
      // l'esecuzione si chiude, altrimenti resta «in corso» nell'elenco.
      await completeExecutionRun(supabase, item.enrollment_id, "completed");
      console.log(`[process-automation] iscrizione ${item.enrollment_id} fermata: ${motivo}`);
      return true;
    } catch (e) {
      // Fail-open: un controllo che non riesce non deve bloccare la sequenza.
      console.warn("[process-automation] controllo risposta fallito:", (e as Error).message);
      return false;
    }
  }

  for (const item of items) {
    try {
      if (await fermaSeHaRisposto(item)) {
        await supabase.from("automation_queue")
          .update({ status: "cancelled", updated_at: now }).eq("id", item.id).eq("status", "pending");
        continue;
      }

      // Presa in carico ATOMICA (19/09/2026): solo se la riga è ancora
      // «pending». Il cron gira ogni minuto e un giro lento si sovrappone al
      // successivo: prima tutti e due eseguivano gli stessi passi (email doppie,
      // tag doppi, opportunità doppie — visto 13–15/09 e 19/09 in collaudo).
      const passo = await prendiInCarico(supabase, "automation_queue", item.id, "status", "pending",
        { status: "processing", updated_at: now });
      if (passo.errore) console.error(`Queue item ${item.id}: presa in carico fallita:`, passo.errore);
      if (!passo.presa) continue; // l'ha già preso un altro giro (o l'UPDATE è fallito)

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

      // Rinvii di questo passo, compreso questo: oltre 48 il passo fallisce.
      const ctx = item.context_json || {};
      const deferCount = (ctx._defer_count || 0) + 1;
      const rinviato = !result.success && result.defer && deferCount <= 48;

      // Log execution. Un passo rinviato (WhatsApp fuori dalle fasce del passo,
      // numeri tutti occupati) va come «skipped», non «error»: riparte da solo.
      // Contato fra gli errori accendeva il rosso nell'elenco (19/09/2026).
      // Oltre il tetto dei rinvii invece è un errore vero.
      await supabase.from("automation_execution_log").insert({
        flow_id: item.flow_id,
        company_id: item.company_id,
        enrollment_id: item.enrollment_id,
        node_id: node.id,
        node_type: node.node_type,
        status: result.success ? "success" : rinviato || result.fermaIscrizione ? "skipped" : "error",
        input_json: { entity_id: item.entity_id, config: node.config_json },
        output_json: result.output || {},
        error_message: result.error || null,
      });

      if (!result.success && result.fermaIscrizione) {
        // Chi si è tolto dalla lista, o ha un indirizzo che rimbalza, esce
        // dalla sequenza (19/09/2026). Non è un guasto: prima si ritentava tre
        // volte e l'iscrizione finiva fra gli errori e nei falliti, una per
        // ogni disiscrizione, in flussi pensati per girare anni.
        const motivo = String(result.fermaIscrizione);
        await supabase.from("automation_queue")
          .update({ status: "cancelled", last_error: `fermata: ${motivo}`, updated_at: now })
          .eq("enrollment_id", item.enrollment_id).in("status", ["pending", "processing"]);
        await supabase.from("automation_enrollments")
          .update({ status: "canceled", updated_at: now })
          .eq("id", item.enrollment_id);
        await completeExecutionRun(supabase, item.enrollment_id, "completed");
        continue;
      }

      if (!result.success && result.defer) {
        // Back-pressure: esito transiente (pool WhatsApp Locale saturo / fuori
        // finestra oraria / throttle). Rinvia SENZA consumare i tentativi, così
        // il messaggio attende la capacità invece di fallire in pochi minuti.
        // Cap a 48 rinvii (~2 giorni a 1h) per evitare loop infiniti.
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
        // Rinviato NON vuol dire fatto (19/09/2026). Senza questo `continue` il
        // passo, appena rimesso in coda, veniva segnato «completed» qui sotto e
        // il flusso andava avanti come se il WhatsApp fosse partito: fuori
        // orario il messaggio non partiva mai. Visto nel collaudo del PDF.
        continue;
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
      return await executeDelay(cfg, supabase, entityId, companyId);

    case "condition":
      return await executeCondition(supabase, cfg, entityId, companyId);

    case "split":
      return await executeSplit(supabase, cfg, node, queueItem);

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

/** Anno, mese, giorno e giorno della settimana di un istante, a Roma. */
function romeGiorno(at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Rome", year: "numeric", month: "numeric", day: "numeric", weekday: "short",
  }).formatToParts(at);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return {
    anno: parseInt(get("year"), 10),
    mese: parseInt(get("month"), 10),
    giorno: parseInt(get("day"), 10),
    giornoSettimana: wd < 0 ? at.getUTCDay() : wd,
  };
}

async function executeDelay(
  cfg: Record<string, any>,
  supabase?: any,
  entityId?: string,
  companyId?: string,
) {
  // ── Attesa ANCORATA all'appuntamento ────────────────────────────────────
  // "24 ore prima della chiamata" non era esprimibile: le attese erano tutte
  // relative al passo precedente, quindi un promemoria finiva a caso rispetto
  // alla data vera. Con `delay_tipo: "prima_appuntamento"` + `delay_ore` si
  // aspetta fino a N ore prima dell'appuntamento del contatto.
  //
  // Se l'appuntamento non c'e' o e' gia' passato di quella soglia, si va
  // avanti subito invece di bloccare l'iscrizione per sempre: un promemoria in
  // ritardo e' inutile, uno che blocca la sequenza e' dannoso.
  if (cfg.delay_tipo === "prima_appuntamento" && supabase && entityId && companyId) {
    const ore = Math.max(0, parseFloat(cfg.delay_ore ?? cfg.ore ?? "24") || 24);
    try {
      const oggi = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
      const { data: app } = await supabase
        .from("appointments")
        .select("appointment_date, appointment_time")
        .eq("contact_id", entityId).eq("company_id", companyId)
        .gte("appointment_date", oggi)
        .not("status", "in", '("cancelled","canceled","annullato")')
        .order("appointment_date", { ascending: true })
        .order("appointment_time", { ascending: true })
        .limit(1).maybeSingle();
      if (app?.appointment_date) {
        // Data e ora sono italiane (colonne senza fuso). Lette come UTC, d'estate
        // il promemoria «1 ora prima» partiva un'ora DOPO l'inizio.
        const quando = romaVersoUtc(String(app.appointment_date), String(app.appointment_time ?? "09:00").slice(0, 5));
        const bersaglio = quando.getTime() - ore * 3_600_000;
        const attesa = Math.max(0, bersaglio - Date.now());
        return {
          success: true,
          output: { delay_ms: attesa, execute_at: new Date(Date.now() + attesa).toISOString(), ancorata_a: "appuntamento" },
          isDelay: true,
          delayMs: attesa,
        };
      }
    } catch (e) {
      console.warn("[process-automation] attesa prima_appuntamento non calcolata:", (e as Error).message);
    }
    // Nessun appuntamento futuro: si prosegue subito.
    return {
      success: true,
      output: { delay_ms: 0, execute_at: new Date().toISOString(), ancorata_a: "appuntamento_assente" },
      isDelay: true,
      delayMs: 0,
    };
  }

  // Schema del BUILDER (DelayConfigPanel): delay_tipo 'attendi'|'fino_a',
  // delay_durata + delay_unita (minuti|ore|giorni|settimane), delay_orario
  // 'HH:MM', delay_giorni_settimana [0..6] (0=Dom). PRIMA il motore leggeva
  // solo giorni/ore/minuti (schema catalogo) → OGNI attesa configurata dal
  // builder cadeva nel default di 1 ora ("aspetta 3 giorni" = 1 ora).
  let delayMs = 0;
  let minutiBersaglio: number | null = null;

  if (cfg.delay_tipo === "fino_a" && typeof cfg.delay_orario === "string" && /^\d{1,2}:\d{2}$/.test(cfg.delay_orario)) {
    // Prossima occorrenza dell'orario (ora italiana): oggi se futuro, sennò domani.
    const [th, tm] = cfg.delay_orario.split(":").map((n: string) => parseInt(n, 10));
    const targetMin = (th % 24) * 60 + tm;
    minutiBersaglio = targetMin;
    const { minutesOfDay } = romeNowParts(new Date());
    let deltaMin = targetMin - minutesOfDay;
    if (deltaMin <= 0) deltaMin += 24 * 60;
    delayMs = deltaMin * 60_000;
  } else if (cfg.delay_durata != null || cfg.delay_unita) {
    const durata = Math.max(1, parseInt(cfg.delay_durata) || 1);
    const MS: Record<string, number> = { secondi: 1_000, minuti: 60_000, ore: 3_600_000, giorni: 86_400_000, settimane: 604_800_000 };
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
  // Dal 19/09/2026 anche per settimana dell'anno: «il martedì della settimana
  // 6» (delay_settimane_anno) o «ogni martedì tranne quelle 9»
  // (delay_settimane_escluse), per le email a data fissa del broadcast
  // EdiliziaInCloud. Vedi _shared/attesaCalendario.ts.
  const regole = {
    giorni: Array.isArray(cfg.delay_giorni_settimana)
      ? cfg.delay_giorni_settimana.filter((d: unknown) => typeof d === "number")
      : [],
    settimane: leggiSettimane(cfg.delay_settimane_anno),
    settimaneEscluse: leggiSettimane(cfg.delay_settimane_escluse),
  };
  const conRegole = (regole.giorni.length > 0 && regole.giorni.length < 7)
    || regole.settimane.length > 0 || regole.settimaneEscluse.length > 0;
  if (conRegole) {
    // Un anno e una settimana: la settimana 6 dell'anno prossimo ci sta sempre.
    let guard = 0;
    while (!giornoAmmesso(romeGiorno(new Date(Date.now() + delayMs)), regole) && guard < 372) {
      delayMs += 86_400_000;
      guard++;
    }
    // Saltando giorni si può attraversare il cambio dell'ora legale: «le 8:30»
    // diventerebbero le 7:30 o le 9:30. Si rimette l'orario scelto.
    if (minutiBersaglio !== null && guard > 0) {
      const scarto = minutiBersaglio - romeNowParts(new Date(Date.now() + delayMs)).minutesOfDay;
      if (Math.abs(scarto) === 60) delayMs += scarto * 60_000;
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
  // È quell'oggetto (trigger operativi); calendario.* → oggi, ora italiana
  // (anno, mese, giorno, giorno_settimana 0=Dom, settimana_iso).
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
      } else if (prefix === "calendario") {
        row = calendarioDelGiorno(romeGiorno(new Date()));
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
    // Campi ELENCO (i tag del contatto sono un array): "contiene" deve valere
    // sull'elemento intero, non sul testo. Con il confronto testuale il tag
    // «dvs» risultava presente anche a chi ha solo «dvs ai» — due percorsi
    // diversi del DVS finivano nello stesso ramo.
    const elenco = Array.isArray(actual) ? actual.map((v) => String(v).trim().toLowerCase()) : null;
    const cercato = sv.trim().toLowerCase();
    switch (String(r.operatore ?? "uguale")) {
      case "uguale": case "equals": return elenco ? elenco.includes(cercato) : sa === sv;
      case "diverso": case "not_equals": return elenco ? !elenco.includes(cercato) : sa !== sv;
      case "contiene": case "contains":
        return elenco ? elenco.includes(cercato) : sa.toLowerCase().includes(cercato);
      case "non_contiene":
        return elenco ? !elenco.includes(cercato) : !sa.toLowerCase().includes(cercato);
      case "inizia_con": return sa.toLowerCase().startsWith(cercato);
      case "vuoto": case "is_empty": return elenco ? elenco.length === 0 : (actual == null || sa === "");
      case "non_vuoto": case "is_not_empty": return elenco ? elenco.length > 0 : !(actual == null || sa === "");
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
async function executeSplit(supabase: any, cfg: Record<string, any>, node: AutomationNode, queueItem: any) {
  // Da 2 a 5 rami con le percentuali dell'editor ("60,40", "40,30,30"). Prima
  // si leggeva solo il primo numero e si sceglieva tra "a" e "b": con tre call
  // center il terzo non riceveva mai nessuno. La regola sta in _shared/splitRami.
  const percentuali = leggiPercentuali(cfg);

  if (modalitaSplit(cfg) === "equilibrato") {
    try {
      const conteggi = await contaRamiDiOggi(supabase, node, queueItem, percentuali.length);
      const branch = ramoEquilibrato(percentuali, conteggi.valori);
      return {
        success: true,
        output: { branch, modalita: "equilibrato", contati: conteggi.base, conteggi: conteggi.valori, percentuali },
        branch,
      };
    } catch (err: any) {
      // Meglio un lead assegnato a sorte che un lead fermo.
      console.error("[split equilibrato] conteggio fallito, si tira a sorte:", err?.message ?? err);
    }
  }

  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  // Diviso per 2^32, non per 0xFFFFFFFF: cosi' il numero resta sotto 100.
  const rand = (arr[0] / 0x100000000) * 100;
  const branch = ramoPerNumero(percentuali, rand);

  return { success: true, output: { branch, random: rand, percentuali }, branch };
}

/**
 * Quanto ha già ricevuto oggi ogni ramo dello split equilibrato.
 *
 * Se ogni ramo porta a un "Crea opportunità" con una persona (call center o
 * venditore), si contano le opportunità di oggi di quella persona. Se i rami
 * creano tutti nella STESSA pipeline, si conta solo quella: lo split divide
 * quella pipeline, e le opportunità di un'altra non devono spostare la quota
 * (BeMade, 19/09/2026: «Nuovo 50% Antonella, 50% Venusia». Contando tutta
 * l'azienda, il Restauro di Venusia faceva pendere il Nuovo verso Antonella:
 * 12 a 5 a metà giornata). Se le pipeline sono diverse si conta tutta
 * l'azienda, come prima. Senza persone si contano le scelte di questo nodo.
 */
async function contaRamiDiOggi(supabase: any, node: AutomationNode, queueItem: any, rami: number) {
  const inizio = inizioGiornoRoma(new Date()).toISOString();

  const { data: archi, error: archiErr } = await supabase
    .from("automation_connections")
    .select("label, to_node_id")
    .eq("flow_id", queueItem.flow_id)
    .eq("from_node_id", node.id);
  if (archiErr) throw new Error(`archi: ${archiErr.message}`);

  const idDestinazioni = (archi ?? []).map((a: any) => a.to_node_id).filter(Boolean);
  const { data: destinazioni, error: destErr } = idDestinazioni.length
    ? await supabase.from("automation_nodes").select("id, config_json").in("id", idDestinazioni)
    : { data: [], error: null };
  if (destErr) throw new Error(`nodi: ${destErr.message}`);
  const cfgPerNodo = new Map<string, Record<string, any>>((destinazioni ?? []).map((n: any) => [n.id, n.config_json ?? {}]));

  const persone: Array<{ colonna: "call_center_id" | "assigned_to"; id: string } | null> = [];
  const pipelineDeiRami: Array<string | null> = [];
  for (let i = 0; i < rami; i++) {
    const arco = (archi ?? []).find((a: any) => arcoDelRamo(a.label, letteraRamo(i)));
    const dest = arco ? cfgPerNodo.get(arco.to_node_id) : undefined;
    pipelineDeiRami.push(dest?.pipeline_id ? String(dest.pipeline_id) : null);
    if (dest?.call_center_id) persone.push({ colonna: "call_center_id", id: String(dest.call_center_id) });
    else if (dest?.assegnato_a) persone.push({ colonna: "assigned_to", id: String(dest.assegnato_a) });
    else persone.push(null);
  }

  if (persone.every(Boolean)) {
    const pipelineComune = pipelineDeiRami.every((p) => p && p === pipelineDeiRami[0]) ? pipelineDeiRami[0] : null;
    let query = supabase
      .from("marketing_opportunities")
      .select("call_center_id, assigned_to")
      .eq("company_id", queueItem.company_id)
      .is("deleted_at", null)
      .gte("created_at", inizio);
    if (pipelineComune) query = query.eq("pipeline_id", pipelineComune);
    const { data: opp, error } = await query;
    if (error) throw new Error(`opportunità: ${error.message}`);
    const valori = persone.map((p) => (opp ?? []).filter((o: any) => o[p!.colonna] === p!.id).length);

    // L'opportunità nasce al passo dopo, un minuto più tardi, e Meta consegna i
    // lead a gruppi (alle 20:57 del 16/09 otto insieme): contando solo le
    // opportunità, tutto il gruppo andava alla stessa persona. Si aggiungono le
    // scelte di questo nodo il cui passo successivo non è ancora avvenuto.
    const da = new Date(Math.max(Date.parse(inizio), Date.now() - 30 * 60_000)).toISOString();
    const { data: scelte, error: scelteErr } = await supabase
      .from("automation_execution_log")
      .select("enrollment_id, output_json, created_at")
      .eq("node_id", node.id)
      .eq("status", "success")
      .gte("created_at", da);
    if (scelteErr) throw new Error(`scelte recenti: ${scelteErr.message}`);
    const idScelte = (scelte ?? []).map((r: any) => r.enrollment_id).filter(Boolean);
    if (idScelte.length) {
      const { data: passiDopo, error: dopoErr } = await supabase
        .from("automation_execution_log")
        .select("enrollment_id, created_at")
        .in("enrollment_id", idScelte)
        .eq("node_type", "action")
        .gte("created_at", da);
      if (dopoErr) throw new Error(`passi successivi: ${dopoErr.message}`);
      // Conta solo un'azione venuta DOPO la scelta: una fatta prima dello split
      // non dice che l'opportunità è nata.
      for (const r of scelte ?? []) {
        const fatta = (passiDopo ?? []).some((a: any) => a.enrollment_id === r.enrollment_id && a.created_at > r.created_at);
        if (fatta) continue;
        const i = String(r.output_json?.branch ?? "").charCodeAt(0) - 97;
        if (i >= 0 && i < valori.length) valori[i]++;
      }
    }
    return { base: pipelineComune ? "persone_pipeline" : "persone", valori };
  }

  const { data: scelte, error } = await supabase
    .from("automation_execution_log")
    .select("output_json")
    .eq("node_id", node.id)
    .eq("status", "success")
    .gte("created_at", inizio);
  if (error) throw new Error(`registro: ${error.message}`);
  const valori = Array.from({ length: rami }, (_, i) =>
    (scelte ?? []).filter((r: any) => r.output_json?.branch === letteraRamo(i)).length);
  return { base: "rami", valori };
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
    // Modello salvato scelto nel builder: oggetto e testo si leggono da
    // email_templates al momento dell'invio (vedi executeSendEmail).
    if (c.modello_id && !c.template_id) c.template_id = c.modello_id;
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

  // ── LEAD RECUPERATO DALLO STORICO ──
  // Un modulo compilato settimane fa e importato solo ora entra in pipeline
  // (crea opportunità, tag, campi: serve lavorarlo), ma NON deve avvisare
  // nessuno né scrivere al contatto: il 12/09/2026 un recupero ha mandato 91
  // notifiche «Nuovo lead» in un'ora e mezza per richieste vecchie fino a tre
  // settimane, e avrebbe scritto «ti ricontattiamo subito» a chi aspettava da
  // venti giorni.
  const leadArretrato = queueItem?.context_json?.payload?.arretrato === true;
  const AZIONI_CHE_CONTATTANO = new Set([
    "send_email", "send_whatsapp", "send_whatsapp_locale", "send_sms",
    "send_notification", "internal_notification", "send_ai_message", "call_with_ai_agent",
  ]);
  if (leadArretrato && AZIONI_CHE_CONTATTANO.has(actionType)) {
    const giorni = Number(queueItem?.context_json?.payload?.giorni_ritardo ?? 0);
    return {
      success: true,
      output: {
        action: actionType,
        saltata: "lead recuperato dallo storico",
        giorni_ritardo: giorni,
      },
    };
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
    // ── Cross-automazione (stile GHL): passa/togli l'entità tra flussi ──
    case "iscrivi_in_automazione": {
      const targetFlowId = String(ncfg.flow_id ?? "");
      if (!targetFlowId || targetFlowId === "__tutte__") return { success: false, error: "Nessuna automazione di destinazione configurata" };
      if (targetFlowId === queueItem?.flow_id) return { success: false, error: "Un'automazione non può iscrivere in se stessa" };
      const { data: target } = await supabase
        .from("automation_flows").select("id, version, status")
        .eq("id", targetFlowId).eq("company_id", companyId).maybeSingle();
      if (!target || target.status !== "published") return { success: false, error: "Automazione di destinazione non trovata o non pubblicata" };
      // Anti-loop/doppione: se l'entità è già dentro (attiva o in attesa) non si ri-iscrive.
      const { data: giaDentro } = await supabase
        .from("automation_enrollments").select("id")
        .eq("flow_id", targetFlowId).eq("entity_id", entityId)
        .in("status", ["active", "waiting"]).limit(1).maybeSingle();
      if (giaDentro) return { success: true, output: { skipped: "entità già iscritta nell'automazione di destinazione" } };
      const { data: currEnr } = await supabase
        .from("automation_enrollments").select("entity_type").eq("id", queueItem?.enrollment_id).maybeSingle();
      const entityType = currEnr?.entity_type ?? "contact";
      const { data: enr, error: enrErr } = await supabase
        .from("automation_enrollments")
        .insert({ flow_id: targetFlowId, company_id: companyId, entity_id: entityId, entity_type: entityType, flow_version: target.version, status: "active" })
        .select("id").single();
      if (enrErr) return { success: false, error: `Iscrizione fallita: ${enrErr.message}` };
      // Primo step: dopo il trigger se c'è; altrimenti (flusso RICEVENTE senza
      // trigger) il primo nodo operativo senza archi entranti.
      const [tN, allN, cN] = await Promise.all([
        supabase.from("automation_nodes").select("id").eq("flow_id", targetFlowId).eq("node_type", "trigger"),
        supabase.from("automation_nodes").select("id, node_type").eq("flow_id", targetFlowId),
        supabase.from("automation_connections").select("from_node_id, to_node_id, label").eq("flow_id", targetFlowId),
      ]);
      const triggerIds = new Set((tN.data ?? []).map((n: { id: string }) => n.id));
      const conns = (cN.data ?? []) as Array<{ from_node_id: string; to_node_id: string; label?: string }>;
      let partenze = conns.filter((c) => triggerIds.has(c.from_node_id)).map((c) => ({ nodo: c.to_node_id, branch: c.label }));
      // Da un passo scelto (22/09/2026): chi arriva dal «Flusso Appuntamenti»
      // entra nella sequenza R dopo gli inviti a prenotare, che ha già
      // ricevuto. Un passo che non esiste più nel flusso: si parte dall'inizio.
      const nodoScelto = typeof ncfg.nodo_partenza === "string" && UUID_RE.test(ncfg.nodo_partenza)
        ? ((allN.data ?? []) as Array<{ id: string; node_type: string }>).find((n) => n.id === ncfg.nodo_partenza && n.node_type !== "trigger")
        : undefined;
      if (nodoScelto) partenze = [{ nodo: nodoScelto.id, branch: undefined }];
      else if (ncfg.nodo_partenza) console.warn(`[process-automation] passo di partenza ${ncfg.nodo_partenza} non trovato in ${targetFlowId}: si parte dall'inizio`);
      if (partenze.length === 0) {
        const conIngresso = new Set(conns.map((c) => c.to_node_id));
        partenze = (allN.data ?? [])
          .filter((n: { id: string; node_type: string }) => n.node_type !== "trigger" && n.node_type !== "end" && n.node_type !== "note" && !conIngresso.has(n.id))
          .map((n: { id: string }) => ({ nodo: n.id, branch: undefined }));
      }
      if (partenze.length === 0) {
        await supabase.from("automation_enrollments").update({ status: "failed" }).eq("id", enr.id);
        return { success: false, error: "L'automazione di destinazione non ha step eseguibili" };
      }
      for (const p of partenze) {
        await supabase.from("automation_queue").insert({
          enrollment_id: enr.id, flow_id: targetFlowId, company_id: companyId,
          current_node_id: p.nodo, entity_id: entityId, entity_type: entityType,
          status: "pending", execute_at: new Date().toISOString(),
          context_json: { payload: pPayload, branch: p.branch },
        });
      }
      return { success: true, output: { automazione: targetFlowId, step_avviati: partenze.length } };
    }

    case "rimuovi_da_automazione": {
      const target = String(ncfg.flow_id ?? "");
      if (!target) return { success: false, error: "Nessuna automazione configurata" };
      let sel = supabase
        .from("automation_enrollments")
        .update({ status: "removed" })
        .eq("entity_id", entityId).eq("company_id", companyId)
        .in("status", ["active", "waiting"]);
      // "Tutte" non tocca il flusso corrente: si toglierebbe il terreno da
      // sotto i piedi a metà esecuzione.
      sel = target === "__tutte__" ? sel.neq("flow_id", queueItem?.flow_id ?? "") : sel.eq("flow_id", target);
      const { data: rimossi, error: remErr } = await sel.select("id");
      if (remErr) return { success: false, error: remErr.message };
      const ids = (rimossi ?? []).map((r: { id: string }) => r.id);
      if (ids.length > 0) {
        await supabase.from("automation_queue").update({ status: "canceled" }).in("enrollment_id", ids).in("status", ["pending", "waiting"]);
        // Le esecuzioni delle iscrizioni tolte si chiudono con loro.
        for (const id of ids) await completeExecutionRun(supabase, id, "completed");
      }
      return { success: true, output: { iscrizioni_rimosse: ids.length } };
    }

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
      const name = nomeOpportunitaPulito(await resolveOppText(ncfg.opportunity_name));
      const value = Number((await resolveOppText(ncfg.opportunity_value)).replace(",", ".")) || 0;
      const pipelineId = ncfg.pipeline_id;
      const stageId = ncfg.stage_id || ncfg.stage;

      const fonte = await resolveOppText(ncfg.fonte);

      // ── CREA O AGGIORNA ──
      // Il contatto ha già un'opportunità aperta in questa pipeline (ha fatto
      // di nuovo richiesta): non se ne crea un'altra e quella aperta resta
      // dov'è, di chi la sta seguendo. Fino al 18/09/2026 tornava invece nella
      // fase del flusso e cambiava di mano a ogni nuova compilazione: in BeMade
      // i contatti classificati «Non risponde» si ritrovavano in «Da Chiamare».
      if (pipelineId && UUID_RE.test(String(entityId))) {
        const { data: esistente } = await supabase
          .from("marketing_opportunities")
          .select("id, name, stage_id, assigned_to, call_center_id, tags")
          .eq("company_id", companyId)
          .eq("contact_id", entityId)
          .eq("pipeline_id", pipelineId)
          .eq("status", "open")
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (esistente) {
          const adesso = new Date().toISOString();
          // La scheda NON si muove e non cambia di mano: chi l'ha classificata
          // («Non risponde 3», «Standby», un appuntamento fissato) ha deciso, e
          // una nuova compilazione del modulo non ribalta quella decisione —
          // con i caroselli Meta la stessa persona compila più volte. Si segna
          // solo che è di nuovo viva: badge «Di nuovo», nota e avviso.
          // Il venditore e il call center del flusso entrano solo se la scheda
          // non è di nessuno (BeMade 18/09: prima se la palleggiavano).
          const patch: Record<string, unknown> = { last_activity_at: adesso, updated_at: adesso };
          if (!esistente.assigned_to && ncfg.assegnato_a) patch.assigned_to = ncfg.assegnato_a;
          if (!esistente.call_center_id && ncfg.call_center_id) patch.call_center_id = ncfg.call_center_id;
          if (leadArretrato) patch.tags = tagsUniti(esistente.tags, ["lead-recuperato"]);

          const { error: errAggiorna } = await supabase
            .from("marketing_opportunities")
            .update(patch)
            .eq("id", esistente.id)
            .eq("company_id", companyId);
          if (errAggiorna) return { success: false, error: errAggiorna.message };

          const idFasi = [esistente.stage_id, stageId].filter(Boolean);
          const idPersone = [patch.assigned_to, patch.call_center_id].filter(Boolean);
          const [fasiRes, personeRes, flussoRes] = await Promise.all([
            idFasi.length ? supabase.from("marketing_pipeline_stages").select("id, name").in("id", idFasi) : Promise.resolve({ data: [] }),
            idPersone.length ? supabase.from("profiles").select("id, first_name, last_name").in("id", idPersone) : Promise.resolve({ data: [] }),
            queueItem?.flow_id ? supabase.from("automation_flows").select("name").eq("id", queueItem.flow_id).maybeSingle() : Promise.resolve({ data: null }),
          ]);
          const nomeFase = (id: unknown): string | null =>
            ((fasiRes.data ?? []) as Array<{ id: string; name: string }>).find((f) => f.id === id)?.name ?? null;
          const nomePersona = (id: unknown): string | null => {
            const p = ((personeRes.data ?? []) as Array<{ id: string; first_name: string | null; last_name: string | null }>).find((x) => x.id === id);
            return p ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || null : null;
          };
          const faseOra = nomeFase(esistente.stage_id);

          // Nota sulla scheda: chi apre l'opportunità capisce perché è tornata qui.
          await supabase.from("marketing_contact_notes").insert({
            company_id: companyId,
            contact_id: entityId,
            opportunity_id: esistente.id,
            content: testoNotaAggiornamento({
              flusso: (flussoRes.data as { name?: string } | null)?.name ?? null,
              fasePrima: faseOra,
              faseFlusso: nomeFase(stageId),
              venditore: patch.assigned_to ? nomePersona(patch.assigned_to) : null,
              callCenter: patch.call_center_id ? nomePersona(patch.call_center_id) : null,
              arretrato: leadArretrato,
            }),
            created_by: null,
          });

          // Avviso a chi la segue adesso. Non per un lead recuperato dallo storico.
          if (!leadArretrato) {
            const destinatari = personeDaAvvisare([
              (patch.assigned_to as string | undefined) ?? esistente.assigned_to,
              (patch.call_center_id as string | undefined) ?? esistente.call_center_id,
            ]);
            if (destinatari.length > 0) {
              await supabase.from("notifications").insert(destinatari.map((uid) => ({
                company_id: companyId,
                user_id: uid,
                type: "lead_ripresentato",
                title: `${String(esistente.name || "Un cliente").slice(0, 80)} ha fatto di nuovo richiesta`,
                body: `La scheda resta dov'è, in «${faseOra ?? "prima fase"}»: decidi tu se richiamarlo.`,
                entity_type: "marketing_opportunity",
                entity_id: esistente.id,
                action_url: `/azienda/marketing/opportunita?pipeline=${pipelineId}&apri=${esistente.id}`,
              })));
            }
          }

          return {
            success: true,
            output: {
              action: "update_opportunity",
              opportunity_id: esistente.id,
              name: esistente.name,
              fase: faseOra,
              spostata: false,
              riassegnata: Boolean(patch.assigned_to || patch.call_center_id),
            },
          };
        }
      }

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
      if (fonte) insertData.source = fonte.slice(0, 100);

      // Lead recuperato dallo storico: si scrive sull'opportunità da quanto
      // aspetta, altrimenti in pipeline è indistinguibile da una richiesta di
      // oggi e il commerciale richiama come se fosse appena arrivata.
      if (leadArretrato) {
        const giorni = Number(queueItem?.context_json?.payload?.giorni_ritardo ?? 0);
        insertData.tags = ["lead-recuperato"];
        insertData.notes = giorni > 0
          ? `Richiesta compilata ${giorni} giorni fa e recuperata ora dallo storico di Facebook: non è un contatto di oggi.`
          : "Richiesta recuperata dallo storico di Facebook: non è un contatto di oggi.";
      }

      const { data: creata, error } = await supabase
        .from("marketing_opportunities")
        .insert(insertData)
        .select("id")
        .maybeSingle();
      if (error) return { success: false, error: error.message };
      return { success: true, output: { action: "create_opportunity", name, opportunity_id: creata?.id ?? null } };
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
      // opportunita_id esplicito (uuid) → solo quella; altrimenti le aperte del
      // contatto NELLA PIPELINE DELLA FASE scelta, fuori dal cestino. Prima
      // erano tutte le aperte, di qualsiasi pipeline: una demo di Edilizia in
      // Cloud avrebbe spostato anche la scheda di Marketing Edile dello stesso
      // contatto in una fase che non è della sua pipeline.
      if (ncfg.opportunita_id && UUID_RE.test(String(ncfg.opportunita_id))) {
        moveQ = moveQ.eq("id", ncfg.opportunita_id);
      } else {
        const { data: fase } = await supabase
          .from("marketing_pipeline_stages").select("pipeline_id").eq("id", stageId).maybeSingle();
        if (!fase?.pipeline_id) {
          return { success: false, error: "La fase scelta non esiste più: riconfigura l'azione" };
        }
        moveQ = moveQ.eq("contact_id", entityId).eq("status", "open")
          .eq("pipeline_id", fase.pipeline_id).is("deleted_at", null);
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
          .not("status", "in", "(completata,completato,completed,done,fatto,annullata)")
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
        // «Ciao {{contatto.first_name}},» col nome vuoto: niente «Ciao ,».
        return senzaSpazioPrimaDellaVirgola(rv(withContact));
      };
      const messaggio = (await resolveNotifText(ncfg.messaggio || ncfg.testo)).trim();
      if (!messaggio) return { success: false, error: "Nessun messaggio configurato" };
      // Oggetto di ripiego: "Notifica automazione" non dice ne' cosa e' successo
      // ne' a chi, e in casella e' indistinguibile da qualsiasi altra. Col nome
      // del contatto si capisce al volo se aprirla adesso.
      const nomeContattoNotifica = [notifContact?.first_name, notifContact?.last_name]
        .filter((x) => typeof x === "string" && x.trim() !== "")
        .map((x) => String(x).trim())
        .join(" ")
        .trim();
      const oggetto = (await resolveNotifText(ncfg.oggetto)).trim()
        || (nomeContattoNotifica
          ? `Nuovo contatto da ricontattare: ${nomeContattoNotifica}`
          : "Notifica automazione");

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
        const nomeAzienda = (companyRow?.business_name || companyRow?.name || "La tua azienda").trim();
        const mittenteNome = escapeNotif(nomeAzienda);
        // "…di Best Infissi S.r.l.." — il punto della ragione sociale e quello
        // della frase si sommavano. Togliamo il nostro se c'e' gia' il loro.
        const mittenteNomeFrase = mittenteNome.replace(/\.$/, "");
        const indirizzoAzienda = escapeNotif(companyRow?.legal_address || companyRow?.operational_address || "");
        // Il pulsante porta alla scheda di CHI ha fatto scattare il flusso, non
        // a una lista: chi apre la mail dal telefono deve trovarsi davanti la
        // persona da chiamare, non doverla cercare.
        const linkScheda = notifContact?.id
          ? `https://app.ediliziaincloud.com/azienda/marketing/contatti/${notifContact.id}`
          : "https://app.ediliziaincloud.com/azienda/attivita";
        const testoPulsante = notifContact?.id ? "Apri la scheda del contatto" : "Apri in Edilizia in Cloud";
        // Anteprima in casella: senza, i client mostrano le prime parole del
        // corpo o il nome dell'azienda, che non dicono nulla di utile.
        const preheader = escapeNotif(
          (messaggio.split("\n").find((l) => l.trim() !== "") ?? "").trim().slice(0, 140),
        );
        const bodyLines = messaggio
          .split("\n")
          .map((l) => `<p style="margin:0 0 10px;line-height:1.55;color:#1f2937">${conLinkCliccabili(escapeNotif(l)) || "&nbsp;"}</p>`)
          .join("");
        const html = `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="it"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="color-scheme" content="light"/></head>
<body style="margin:0;padding:0;background:#f4f5f7;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;height:0;width:0;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 0;"><tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e5e7eb;">
      <tr><td style="padding:20px 28px;border-bottom:1px solid #eef0f2;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#111827;">${mittenteNome}</td></tr>
      <tr><td style="padding:28px 28px 8px;font-family:Arial,Helvetica,sans-serif;font-size:15px;">${bodyLines}</td></tr>
      <tr><td style="padding:8px 28px 28px;">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="#111827" style="border-radius:8px;">
          <a href="${linkScheda}" style="display:inline-block;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${testoPulsante}</a>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding:16px 28px 22px;border-top:1px solid #eef0f2;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.5;color:#8a94a3;">
        Notifica automatica del flusso di lavoro di ${mittenteNomeFrase}.${indirizzoAzienda ? `<br/>${indirizzoAzienda}` : ""}<br/>
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

          // Catena di ripiego sul MITTENTE. Una notifica interna persa non si
          // recupera: il team non sa nemmeno che c'era un lead. Prima di
          // arrendersi si riprova con mittenti via via meno "belli" ma piu'
          // probabili.
          //
          // Serve perche' un dominio custom puo' risultare verificato da noi
          // (SPF/DKIM a posto in company_email_domains) ed essere comunque
          // rifiutato dal provider — visto in prod: Elastic Email rispondeva
          // 'From email address: "no-reply@mkt.ediliziaincloud.com" not
          // allowed.' e 18 notifiche lead di fila sono sparite senza che
          // nessuno se ne accorgesse per un mese.
          //
          //   1. mittente dell'azienda (dominio custom)   → il caso normale
          //   2. mittente marketing condiviso              → stesso provider e stessi crediti
          //   3. provider transazionale                    → ultima spiaggia, altro provider
          // Chi riceve deve leggere PRIMA il nome dell'azienda, sempre — anche
          // quando ripieghiamo su un indirizzo condiviso di piattaforma. Cambia
          // solo il nome visualizzato: l'indirizzo resta uno da cui siamo
          // autorizzati a spedire, ed e' esattamente il senso del "via".
          // Senza questo, ogni ripiego arrivava firmato "Edilizia in Cloud" e
          // il destinatario non capiva di quale azienda fosse il lead.
          const conNomeAzienda = (mittente: string): string => {
            const indirizzo = (mittente.match(/<([^>]+)>/)?.[1] ?? mittente).trim();
            const nome = nomeAzienda.replace(/["\\<>,]/g, " ").replace(/\s+/g, " ").trim();
            if (!nome || !indirizzo.includes("@")) return mittente;
            return `"${nome} via Edilizia in Cloud" <${indirizzo}>`;
          };

          let r = await sendViaProviderWithFailover("marketing", provider, {
            from: notifSender?.from ?? conNomeAzienda(provider.fromDefault),
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
          let streamUsato: "marketing" | "transactional" = "marketing";
          let ripiego: string | null = null;
          // Perché il provider marketing ha rifiutato, con le sue parole. Finisce
          // nel registro degli invii: è da lì che il controllo salute capisce che
          // il canale non consegna, e perché («Your plan expired…»). Prima la
          // notifica usciva dal canale di riserva e del rifiuto non restava
          // traccia, se non in un log che dopo un giorno non c'è più.
          const rifiuto = (esito: unknown): string =>
            JSON.stringify((esito as any)?.body ?? (esito as any)?.error ?? "").slice(0, 300);
          let motivoRipiego: string | null = r.ok ? null : rifiuto(r);

          // 2. Il mittente dell'azienda e' stato rifiutato: riprova col condiviso.
          if (!r.ok && notifSender?.from && notifSender.from !== provider.fromDefault) {
            console.warn(
              `[internal_notification] mittente azienda rifiutato (${notifSender.from}), riprovo col condiviso:`,
              JSON.stringify((r as any).body ?? (r as any).error ?? ""),
            );
            r = await sendViaProviderWithFailover("marketing", provider, {
              from: conNomeAzienda(provider.fromDefault),
              to: recipients,
              subject: oggetto,
              html,
            }, {
              domain: provider.domain ?? undefined,
              stream: "marketing",
              disableNativeTracking: true,
              elasticTransactionalClass: true,
            });
            if (r.ok) ripiego = "mittente_condiviso";
            // Rifiutato anche il mittente condiviso: è questo il motivo che conta.
            else motivoRipiego = rifiuto(r);
          }

          // 3. Anche il provider marketing e' giu' (piano scaduto, account
          //    sospeso): la notifica esce dal transazionale. Costa a noi, ma e'
          //    l'unico modo perche' il lead non resti muto.
          if (!r.ok) {
            try {
              const providerTx = await loadProviderSettings("transactional");
              if (providerTx.apiKey) {
                console.warn("[internal_notification] provider marketing non consegna, ripiego sul transazionale");
                r = await sendViaProviderWithFailover("transactional", providerTx, {
                  from: conNomeAzienda(providerTx.fromDefault),
                  to: recipients,
                  subject: oggetto,
                  html,
                }, { stream: "transactional", disableNativeTracking: true });
                if (r.ok) { ripiego = "stream_transazionale"; streamUsato = "transactional"; }
              }
            } catch (txErr) {
              console.error("[internal_notification] ripiego transazionale fallito:", txErr);
            }
          }

          await logEmailDelivery(supabase, {
            company_id: companyId,
            recipient: recipients.join(", "),
            subject: oggetto,
            template_name: "automation_internal_notification",
            status: r.ok ? "sent" : "failed",
            provider: r.providerUsed ?? provider.provider,
            stream: streamUsato,
            provider_id: r.providerMessageId ?? null,
            error_message: r.ok ? undefined : JSON.stringify(r.body),
            cost_eur: 0,
            charged_eur: deductedNotifCost,
            metadata: {
              entity_id: entityId, automation: true, internal_notification: true,
              ...(ripiego ? { ripiego, ...(motivoRipiego ? { ripiego_motivo: motivoRipiego } : {}) } : {}),
            },
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
      return await executeSendEmail(supabase, ncfg, entityId, companyId, queueItem);
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

          return await executeSendEmail(supabase, { ...ncfg, email_subject: subject, email_body: body }, entityId, companyId, undefined, queueItem?.flow_id);
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
          await completeExecutionRun(supabase, enrollment.id, "completed");
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
      return await executeDelay(ncfg, supabase, entityId, companyId);

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
/**
 * Finestra oraria del flusso: sposta un invio dentro l'orario consentito.
 *
 * `time_window_active` + `time_window_from/to` erano tre colonne che
 * l'interfaccia salvava e che il motore non leggeva mai: una sequenza
 * impostata "dalle 9 alle 18" mandava lo stesso alle tre di notte. Su email
 * commerciali un orario sbagliato non e' solo maleducazione — abbassa aperture
 * e alza le segnalazioni di spam.
 *
 * Se l'orario calcolato cade prima dell'apertura, si sposta all'apertura dello
 * stesso giorno; se cade dopo la chiusura, all'apertura del giorno dopo. Non si
 * anticipa mai un invio: al massimo si ritarda.
 *
 * Dal 22/09/2026 sabato e domenica possono avere una regola propria
 * (time_window_sabato / time_window_domenica: chiuso, o una fascia): il
 * «Flusso Appuntamenti» manda di giorno, il sabato solo la mattina, mai la
 * domenica. Senza regola valgono come gli altri giorni, come prima.
 */
function minutiDelGiorno(at: Date, tz: string): number {
  try {
    const p = new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit",
    }).formatToParts(at);
    const g = (t: string) => parseInt(p.find((x) => x.type === t)?.value ?? "0", 10);
    return (g("hour") % 24) * 60 + g("minute");
  } catch {
    return at.getUTCHours() * 60 + at.getUTCMinutes();
  }
}

/** 1 = lunedì … 7 = domenica, nel fuso del flusso. */
function giornoDellaSettimana(at: Date, tz: string): number {
  const ripiego = ((at.getUTCDay() + 6) % 7) + 1;
  try {
    const g = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(at);
    return ({ Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 } as Record<string, number>)[g] ?? ripiego;
  } catch {
    return ripiego;
  }
}

function orarioInMinuti(v: unknown, difetto: number): number {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(v ?? ""));
  if (!m) return difetto;
  return (parseInt(m[1], 10) % 24) * 60 + parseInt(m[2], 10);
}

function dentroLaFinestra(quando: Date, flusso: Record<string, any> | null): Date {
  if (!flusso || flusso.time_window_active !== true) return quando;
  const tz = fusoDelFlusso(flusso.timezone);
  const apre = orarioInMinuti(flusso.time_window_from, 9 * 60);
  const chiude = orarioInMinuti(flusso.time_window_to, 18 * 60);
  // Finestra incoerente (chiusura <= apertura): si ignora invece di bloccare
  // la sequenza per sempre.
  if (chiude <= apre) return quando;

  const avanti = minutiAllApertura(minutiDelGiorno(quando, tz), giornoDellaSettimana(quando, tz), {
    apre, chiude, sabato: flusso.time_window_sabato, domenica: flusso.time_window_domenica,
  });
  return avanti > 0 ? new Date(quando.getTime() + avanti * 60_000) : quando;
}

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
      // executeSplit restituisce la lettera del ramo ("a", "b", "c"…); gli archi
      // sono etichettati "A", "B", "C" oppure "A: 60%".
      nextConns = connections.filter((c: AutomationConnection) => arcoDelRamo(c.label, result.branch));
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
        // Anche l'esecuzione va chiusa (20/09/2026): l'iscrizione finiva, ma
        // nell'elenco restava «in corso» per sempre ogni flusso che termina su
        // un ramo senza uscite («non è un mio contatto» → fine).
        await completeExecutionRun(supabase, queueItem.enrollment_id, "completed");
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

  // Impostazioni del flusso: servono per la finestra oraria. Una sola lettura
  // per accodamento, non una per collegamento.
  const { data: flussoImp } = await supabase
    .from("automation_flows")
    .select("time_window_active, time_window_from, time_window_to, time_window_sabato, time_window_domenica, timezone")
    .eq("id", queueItem.flow_id)
    .maybeSingle();

  for (const conn of nextConns) {
    const grezzo = result.isDelay
      ? new Date(Date.now() + (result.delayMs || 0))
      : new Date();
    const executeAt = dentroLaFinestra(grezzo, flussoImp).toISOString();

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
    const sv = String(c.value ?? "").toLowerCase().trim();
    const elenco = Array.isArray(actual) ? actual.map((v) => String(v).trim().toLowerCase()) : null;
    const na = Number(actual);
    const nv = Number(c.value);
    const da = actual != null ? new Date(String(actual)).getTime() : NaN;
    const dv = c.value != null ? new Date(String(c.value)).getTime() : NaN;
    let match = false;
    // Il TriggerConditionBuilder offre TUTTI questi operatori: prima solo 5
    // erano implementati e il resto cadeva nel default → condizione sempre
    // vera in silenzio (es. "valore > 1000" scattava per qualsiasi valore).
    switch (c.operator) {
      // Campi ELENCO (payload.tags): il confronto vale sull'elemento intero,
      // altrimenti «dvs» risulta presente anche a chi ha solo «dvs ai».
      case "equals": match = elenco ? elenco.includes(sv) : String(actual) === String(c.value); break;
      case "not_equals": match = elenco ? !elenco.includes(sv) : String(actual) !== String(c.value); break;
      case "contains": match = elenco ? elenco.includes(sv) : sa.includes(sv); break;
      case "not_contains": match = elenco ? !elenco.includes(sv) : !sa.includes(sv); break;
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
    // Presa in carico ATOMICA (19/09/2026): due giri sovrapposti leggevano lo
    // stesso evento e arruolavano/eseguivano due volte. Si segna subito come
    // preso; se la gestione fallisce si rimette in coda per il giro dopo.
    const evento = await prendiInCarico(supabase, "automation_trigger_events", evt.id, "processed", false,
      { processed: true });
    if (!evento.presa) continue;
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

      // L'evento è già segnato come preso (sopra). Un errore transitorio (es.
      // enrollment del lead FB fallito) non deve perdere l'automazione in
      // silenzio: nel catch lo si rimette in coda e il cron (ogni minuto) lo riprova.
    } catch (err: any) {
      console.error(`Trigger event ${evt.id} error:`, err);
      // Rimesso in coda: verrà ritentato al giro dopo.
      await supabase.from("automation_trigger_events").update({ processed: false }).eq("id", evt.id);
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

    // Presa in carico ATOMICA (19/09/2026): l'evento e la scadenza dell'attesa
    // possono scattare nello stesso minuto su due giri diversi. Riprende il
    // flusso solo chi riesce a chiudere questa attesa.
    const ripresa = await prendiInCarico(supabase, "automation_queue", item.id, "status", "waiting",
      { status: "cancelled", updated_at: new Date().toISOString() });
    if (!ripresa.presa) continue;

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
    // Presa in carico ATOMICA (19/09/2026): due giri sovrapposti trovavano la
    // stessa attesa scaduta e riprendevano il flusso due volte.
    const scaduta = await prendiInCarico(supabase, "automation_queue", item.id, "status", "waiting",
      { status: "completed", updated_at: now });
    if (!scaduta.presa) continue;

    // Attesa "terminale" (nodo wait senza uscite): il timeout chiude
    // l'iscrizione, senza ri-eseguire il nodo di attesa (loop infinito).
    if (item.context_json?.terminal_wait) {
      await supabase
        .from("automation_enrollments")
        .update({ status: "completed", updated_at: now })
        .eq("id", item.enrollment_id);
      await completeExecutionRun(supabase, item.enrollment_id, "completed");
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
/**
 * Mittente scelto nelle Impostazioni dell'automazione (sender_name,
 * sender_email): letto al massimo una volta al minuto per flusso, non a ogni
 * email. Un errore di lettura non ferma l'invio: si usa l'ultimo valore noto.
 */
const mittentiDeiFlussi = new Map<string, { valore: { sender_name: string | null; sender_email: string | null } | null; letto: number }>();

async function mittenteDelFlusso(supabase: any, flowId: unknown, companyId: string) {
  if (typeof flowId !== "string" || !UUID_RE.test(flowId)) return null;
  const inCache = mittentiDeiFlussi.get(flowId);
  if (inCache && Date.now() - inCache.letto < 60_000) return inCache.valore;
  const { data, error } = await supabase
    .from("automation_flows")
    .select("sender_name, sender_email")
    .eq("id", flowId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) return inCache?.valore ?? null;
  const valore = data ? { sender_name: data.sender_name ?? null, sender_email: data.sender_email ?? null } : null;
  if (mittentiDeiFlussi.size > 500) mittentiDeiFlussi.clear();
  mittentiDeiFlussi.set(flowId, { valore, letto: Date.now() });
  return valore;
}

/**
 * I domini collegati dall'azienda: letti al massimo una volta al minuto. Se la
 * lettura fallisce non si ammette nessun dominio (l'email parte comunque, dal
 * mittente dell'azienda): meglio quello che un mittente non controllato.
 */
const dominiDelleAziende = new Map<string, { righe: any[]; letto: number }>();

async function dominiCollegati(supabase: any, companyId: string): Promise<any[]> {
  const inCache = dominiDelleAziende.get(companyId);
  if (inCache && Date.now() - inCache.letto < 60_000) return inCache.righe;
  const { data, error } = await supabase
    .from("company_email_domains")
    .select("domain, is_active, ee_spf_verified, ee_dkim_verified, resend_status, sg_cname_1_valid, sg_cname_2_valid, sg_cname_3_valid")
    .eq("company_id", companyId);
  if (error) return [];
  if (dominiDelleAziende.size > 500) dominiDelleAziende.clear();
  dominiDelleAziende.set(companyId, { righe: data ?? [], letto: Date.now() });
  return data ?? [];
}

async function executeSendEmail(supabase: any, cfg: Record<string, any>, entityId: string, companyId: string, queueItem?: any, idFlusso: unknown = queueItem?.flow_id) {
  try {
    // Automazione su una COMMESSA (benvenuto, fattura, data di posa, saldo):
    // l'entità è l'ordine, non un contatto marketing. Prima si cercava l'id
    // dell'ordine fra i contatti e ogni invio falliva «Contact has no email».
    const suCommessa = queueItem?.entity_type === "order";
    const commessa = suCommessa ? await caricaContestoCommessa(supabase, entityId, companyId) : null;
    if (suCommessa && !commessa) {
      return { success: false, error: "Commessa non trovata (o di un'altra azienda)" };
    }

    let contact: any;
    if (commessa) {
      contact = commessa.contatto;
    } else {
      const { data } = await supabase
        .from("marketing_contacts")
        .select("id, email, first_name, last_name, phone, city, province, company_name, source, unsubscribed, optout_email")
        .eq("id", entityId)
        .single();
      contact = data;
    }
    const conVariabili = (t: string) => (commessa ? sostituisciVariabiliCommessa(t, commessa.variabili) : t);

    if (!contact?.email && !(commessa && typeof cfg.email_to === "string" && cfg.email_to.trim())) {
      return { success: false, error: commessa ? "Il cliente della commessa non ha un indirizzo email" : "Contact has no email address" };
    }
    // L'opt-out marketing vale per i contatti: al cliente di una commessa si
    // scrive per il lavoro in corso (email di servizio).
    if (!commessa && (contact.unsubscribed || contact.optout_email)) {
      return { success: false, error: "Contact has opted out of email", fermaIscrizione: "il contatto si è tolto dalla lista email" };
    }

    // Stream: le email di commessa sono di servizio, non promozionali.
    const stream = cfg.stream || (commessa ? "transactional" : "marketing");
    // Casella dell'azienda scelta nel nodo: l'email parte da lì (e resta nella
    // sua posta inviata) invece che dal dominio di piattaforma.
    const casellaId = typeof cfg.casella_id === "string" && UUID_RE.test(cfg.casella_id) ? cfg.casella_id : null;
    const settings = await loadProviderSettings(stream);

    if (!casellaId && !settings.apiKey) {
      return { success: false, error: `No API key configured for ${stream} email provider` };
    }

    // Destinatario override (campo "destinatario" del builder, con supporto
    // {{placeholder}}): PRIMA era ignorato e si inviava sempre al contatto.
    // Default (vuoto o uguale) = email del contatto, comportamento invariato.
    let toAddress: string = contact?.email ?? "";
    if (typeof cfg.email_to === "string" && cfg.email_to.trim() !== "") {
      const resolvedTo = (await resolveContactText(supabase, conVariabili(cfg.email_to), contact, companyId)).trim();
      if (resolvedTo && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(resolvedTo)) {
        toAddress = resolvedTo;
      }
    }
    if (!toAddress) {
      return { success: false, error: "Nessun indirizzo email a cui scrivere" };
    }

    const suppressed = await getSuppressedEmailMap(
      supabase,
      [toAddress],
      companyId,
      stream,
    );
    if (suppressed.has(normalizeEmailAddress(toAddress))) {
      return { success: false, error: "Contact is suppressed for this email stream", fermaIscrizione: "l'indirizzo email rimbalza o ci ha segnalati come spam" };
    }

    // Build email content
    let html = cfg.email_body || cfg.html || "<p>No content</p>";
    let subject = cfg.email_subject || cfg.subject || "Messaggio";

    // ── Modello salvato ────────────────────────────────────────────────────
    // Il nodo può puntare a un modello dell'azienda invece di portarsi dietro
    // il testo: così una sequenza di dieci email si corregge in un posto solo.
    // Il modello VINCE sul testo del nodo (che resta come copia di scorta se
    // il modello è stato cancellato nel frattempo).
    if (cfg.template_id) {
      const { data: modello } = await supabase
        .from("email_templates")
        .select("subject, html_content")
        .eq("id", cfg.template_id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (modello?.html_content) {
        html = modello.html_content;
        subject = modello.subject || subject;
      } else if (!cfg.email_body && !cfg.html) {
        return { success: false, error: "Modello email non trovato (o di un'altra azienda)" };
      }
    }

    // ── TEST A/B ───────────────────────────────────────────────────────────
    // Si attiva da solo quando esiste una variante B: un oggetto alternativo
    // (`oggetto_b`) e/o un corpo alternativo (`corpo_b`). Si spegne con
    // `ab_attivo: false`.
    //
    // La scelta è DETERMINISTICA su (contatto + nodo), non casuale, per due
    // motivi concreti: se l'invio viene ritentato la persona riceve la stessa
    // variante invece di due email diverse, e ogni email della sequenza fa il
    // suo test indipendente invece di trascinarsi la scelta della prima.
    const oggettoB = cfg.oggetto_b ?? cfg.email_subject_b ?? null;
    const corpoB = cfg.corpo_b ?? cfg.email_body_b ?? null;
    let variante: "A" | "B" | null = null;
    if (cfg.ab_attivo !== false && (oggettoB || corpoB)) {
      // Seme = contatto + oggetto A (quello di partenza, prima di sostituirlo):
      // identifica l'email dentro la sequenza senza dipendere dall'id del nodo,
      // che a questo punto del motore non è disponibile.
      const seme = `${contact.id}:${cfg.email_subject ?? cfg.oggetto ?? cfg.subject ?? ""}`;
      let h = 0;
      for (let i = 0; i < seme.length; i++) h = ((h << 5) - h + seme.charCodeAt(i)) | 0;
      variante = Math.abs(h) % 2 === 0 ? "A" : "B";
      if (variante === "B") {
        if (oggettoB) subject = String(oggettoB);
        if (corpoB) html = String(corpoB);
      }
    }

    // Personalizzazione completa: {{contatto.X}} (picker IT), {{contact.X}} (EN),
    // nomi nudi e CAMPI PERSONALIZZATI. Anche l'oggetto viene personalizzato.
    // Le variabili di commessa ({{commessa.x}}, {{cliente.x}}, {{azienda.x}})
    // vanno per prime: le altre regole non le conoscono.
    html = await resolveContactText(supabase, conVariabili(html), contact, companyId);
    subject = await resolveContactText(supabase, conVariabili(subject), contact, companyId);
    // «Ciao {{contatto.first_name}},» con il nome vuoto usciva «Ciao ,».
    html = senzaSpazioPrimaDellaVirgola(html);
    subject = senzaSpazioPrimaDellaVirgola(subject);

    // Fattura della commessa in allegato (nodo «allega la fattura»): l'ultima
    // caricata in «Fatture e pagamenti» (vedi scegliFatturaDaAllegare). Se
    // manca, non si manda un'email che dice «in allegato la fattura» senza fattura.
    let fattura: { file_name: string; file_url: string; file_type: string | null; file_size: number | null } | null = null;
    if (cfg.allega_fattura_commessa === true || cfg.allega_fattura_commessa === "true") {
      if (!commessa) {
        return { success: false, error: "«Allega la fattura» funziona solo sulle automazioni di commessa" };
      }
      fattura = commessa.fattura;
      if (!fattura) {
        return { success: false, error: "Nessuna fattura nei documenti della commessa: caricala nella cartella «Fatture e pagamenti» e rilancia" };
      }
    }

    // Mittente: prima il passo, poi le Impostazioni dell'automazione, campo per
    // campo (vedi _shared/mittenteAutomazione.ts). Tutto vuoto = come prima.
    const mittenteScelto = mittenteDelPasso(cfg, await mittenteDelFlusso(supabase, idFlusso, companyId));
    // Dal provider (condiviso fra le aziende) si spedisce solo dai domini che
    // QUESTA azienda ha collegato e verificato: vedi mittenteAutomazione.ts.
    // Dalla casella collegata l'indirizzo è quello della casella, non questo.
    const mittente = casellaId || !mittenteScelto.email
      ? mittenteScelto
      : soloDominiDellAzienda(mittenteScelto, dominiAmmessi(await dominiCollegati(supabase, companyId), stream));
    if (mittenteScelto.email && !mittente.email && !casellaId) {
      console.warn(`[process-automation] mittente ${mittenteScelto.email} scartato: il dominio non è fra quelli verificati dell'azienda ${companyId}`);
    }

    if (casellaId) {
      // Anche dalla casella collegata, un'email a un contatto deve poter dire
      // «esci qui»: prima {{unsubscribe_url}} restava scritto così nel testo
      // (19/09/2026, sequenza «Download Risorse — PDF Vendita» che parte da
      // info@ perché il canale marketing è scaduto).
      if (!commessa && html.includes("{{unsubscribe_url}}")) {
        const urlUscita = await appendTrackingSig(
          `${Deno.env.get("SUPABASE_URL")!}/functions/v1/email-tracking?type=automation_unsub&rid=${contact.id}&co=${companyId}`,
          { co: companyId, rid: contact.id, type: "automation_unsub" },
        );
        html = html.replace(/\{\{unsubscribe_url\}\}/g, urlUscita);
      }
      return await inviaDaCasellaAzienda(supabase, {
        casellaId, companyId, toAddress, subject, html,
        cc: listaEmail(conVariabili(String(cfg.cc ?? ""))),
        fattura,
        orderId: commessa ? entityId : null,
        // «Da nome» del nodo (o delle Impostazioni): senza, il nome è quello
        // del profilo di chi ha collegato la casella (e «flo.andriciuc Admin»
        // non passava il filtro). L'indirizzo resta quello della casella.
        fromName: mittente.nome,
      });
    }

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

    const safeFromName = sanitizeFromName(mittente.nome);
    // Solo il nome, senza indirizzo: va sull'indirizzo dell'azienda (prima il
    // nome veniva scartato e restava quello dell'azienda).
    const resolvedSender = mittente.email
      ? null
      : await resolveSender(companyId, stream, supabase, { nome: safeFromName }).catch(() => null);
    // Reply GHL-style: Reply-To = indirizzo unico del contatto (attivo solo se
    // email_reply_domain è configurato) → la risposta rientra nel CRM in
    // tempo reale via edge email-inbound-reply, senza caselle collegate.
    // Il cliente di una commessa non è un contatto CRM: risponde all'azienda.
    const routeReplyTo = commessa ? null : await getReplyAddress(supabase, companyId, contact.id);
    const fromAddress = mittente.email
      ? safeFromName ? `${safeFromName} <${mittente.email}>` : mittente.email
      : resolvedSender?.from ?? settings.fromDefault;
    const providerDomain = mittente.email
      ? mittente.email.split("@").pop() ?? null
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

    const allegatiProvider = fattura ? [await scaricaAllegatoBase64(supabase, fattura)] : undefined;

    const result = await sendViaProviderWithFailover(stream, settings, {
      from: fromAddress,
      replyTo: routeReplyTo ?? resolvedSender?.replyTo,
      to: [toAddress],
      subject,
      html,
      attachments: allegatiProvider,
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
      // La variante finisce nel registro: senza, un test A/B produce due
      // email diverse e nessun modo di sapere quale ha reso di piu'.
      metadata: {
        contact_id: contact.id, automation: true,
        // Il modello usato: Conversazioni ci legge il testo dell'email
        // (il registro degli invii tiene solo l'oggetto).
        ...(cfg.template_id ? { template_id: String(cfg.template_id) } : {}),
        ...(commessa ? { order_id: entityId, allegato: fattura?.file_name ?? null } : {}),
        ...(variante ? { ab_variant: variante } : {}),
      },
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

    // Provider occupato o giù: si riprova tra mezz'ora (fino a un giorno)
    // invece di chiudere l'iscrizione. Vedi invioEmailDaRimandare.
    if (!result.ok && invioEmailDaRimandare(result.status, stream)) {
      return {
        success: false,
        defer: true,
        deferMinutes: MINUTI_RINVIO_EMAIL,
        error: `Provider returned ${result.status}: invio rimandato di ${MINUTI_RINVIO_EMAIL} minuti`,
      };
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
// EMAIL DI COMMESSA: contesto, allegato, casella dell'azienda
// ────────────────────────────────────────────────────

/** Cliente, variabili e fattura di una commessa, per le email di servizio. */
async function caricaContestoCommessa(supabase: any, orderId: string, companyId: string) {
  if (!UUID_RE.test(String(orderId))) return null;
  const { data: ordine } = await supabase
    .from("orders")
    .select("id, company_id, customer_id, current_status_id, order_code, description, total_amount, deposit_amount, balance_amount, expected_date, work_start_date, indirizzo_lavori, work_address, client_name, client_email, client_phone")
    .eq("id", orderId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (!ordine) return null;

  const [clienteRes, aziendaRes, anagraficaRes, faseRes, fileRes] = await Promise.all([
    ordine.customer_id
      ? supabase.from("profiles").select("id, first_name, last_name, email, phone").eq("id", ordine.customer_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("companies").select("name, business_name, email, phone, bank_iban").eq("id", companyId).maybeSingle(),
    supabase.from("anagrafica_azienda").select("ragione_sociale, iban_principale, intestatario_conto, telefono, email").eq("company_id", companyId).maybeSingle(),
    ordine.current_status_id
      ? supabase.from("order_statuses").select("name").eq("id", ordine.current_status_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("order_attachments")
      .select("file_name, file_url, file_type, file_size, created_at, order_document_folders:folder_id(nome)")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const cliente = clienteRes.data as { id: string; first_name: string | null; last_name: string | null; email: string | null; phone: string | null } | null;
  const azienda = aziendaRes.data as Record<string, string | null> | null;
  const anagrafica = anagraficaRes.data as Record<string, string | null> | null;

  const variabili = costruisciVariabiliCommessa({
    ordine,
    cliente,
    fase: (faseRes.data as { name?: string } | null)?.name ?? null,
    azienda: {
      nome: anagrafica?.ragione_sociale || azienda?.business_name || azienda?.name || null,
      email: anagrafica?.email || azienda?.email || null,
      telefono: anagrafica?.telefono || azienda?.phone || null,
      iban: anagrafica?.iban_principale || azienda?.bank_iban || null,
      intestatario_conto: anagrafica?.intestatario_conto || null,
    },
  });

  const file = ((fileRes.data ?? []) as Array<Record<string, any>>).map((f) => ({
    file_name: String(f.file_name ?? ""),
    file_url: String(f.file_url ?? ""),
    file_type: (f.file_type as string | null) ?? null,
    file_size: (f.file_size as number | null) ?? null,
    created_at: String(f.created_at ?? ""),
    cartella: (f.order_document_folders as { nome?: string } | null)?.nome ?? null,
  })).filter((f) => f.file_url);

  return {
    // Forma «contatto» per le regole di personalizzazione esistenti ({{nome}}…).
    contatto: {
      id: cliente?.id ?? ordine.id,
      email: variabili["cliente.email"] || null,
      first_name: variabili["cliente.nome"],
      last_name: variabili["cliente.cognome"],
      phone: variabili["cliente.telefono"],
      address: variabili["commessa.indirizzo"],
    },
    variabili,
    fattura: scegliFatturaDaAllegare(file),
  };
}

/** «a@b.it, c@d.it» → indirizzi validi, senza doppioni. */
function listaEmail(raw: string): string[] {
  return Array.from(new Set(
    raw.split(/[,;\s]+/).map((s) => s.trim()).filter((s) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)),
  ));
}

async function scaricaAllegatoBase64(
  supabase: any,
  f: { file_name: string; file_url: string; file_type: string | null },
): Promise<{ filename: string; content: string; type: string }> {
  const { data, error } = await supabase.storage.from("order-attachments").download(f.file_url);
  if (error || !data) throw new Error(`Non riesco a leggere la fattura «${f.file_name}»: ${error?.message ?? "file mancante"}`);
  const buf = new Uint8Array(await data.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 1024) bin += String.fromCharCode(...buf.subarray(i, i + 1024));
  return { filename: f.file_name, content: btoa(bin), type: f.file_type || "application/pdf" };
}

/**
 * Invio dalla casella collegata dall'azienda (Impostazioni › Posta): riga in
 * email_outbox intestata al proprietario della casella, poi email-send, lo
 * stesso percorso dei solleciti. L'email resta nella posta inviata vera.
 */
async function inviaDaCasellaAzienda(supabase: any, p: {
  casellaId: string;
  companyId: string;
  toAddress: string;
  subject: string;
  html: string;
  cc: string[];
  fattura: { file_name: string; file_url: string; file_type: string | null; file_size: number | null } | null;
  orderId: string | null;
  fromName?: string | null;
}) {
  const { data: conn } = await supabase
    .from("email_oauth_connections")
    .select("id, user_id, company_id, status, email_address")
    .eq("id", p.casellaId)
    .maybeSingle();
  if (!conn || conn.company_id !== p.companyId) {
    return { success: false, error: "Casella email non trovata (o di un'altra azienda)" };
  }
  if (conn.status !== "active") {
    return { success: false, error: `La casella ${conn.email_address} non è collegata: ricollegala da Impostazioni › Posta` };
  }

  const { data: ob, error: obErr } = await supabase.from("email_outbox").insert({
    company_id: p.companyId,
    user_id: conn.user_id,
    oauth_connection_id: conn.id,
    to_emails: [p.toAddress],
    cc_emails: p.cc,
    subject: p.subject,
    body_html: p.html,
    // eslint-disable-next-line no-control-regex -- niente caratteri di controllo nell'intestazione
    from_name: p.fromName ? p.fromName.replace(/[\x00-\x1F\x7F]/g, "").trim().slice(0, 78) || null : null,
    attachments: p.fattura
      ? [{ filename: p.fattura.file_name, mime: p.fattura.file_type || "application/pdf", size: p.fattura.file_size ?? undefined, storage_path: p.fattura.file_url, bucket: "order-attachments" }]
      : [],
    status: "draft",
  }).select("id").maybeSingle();
  if (obErr || !ob?.id) return { success: false, error: `Coda email: ${obErr?.message ?? "riga non creata"}` };

  const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/email-send`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}` },
    body: JSON.stringify({ outbox_id: ob.id }),
  });
  const body = await res.json().catch(() => ({})) as { ok?: boolean; error?: string };
  const ok = res.ok && body.ok !== false;

  await logEmailDelivery(supabase, {
    company_id: p.companyId,
    recipient: p.toAddress,
    subject: p.subject,
    template_name: "automation_send",
    status: ok ? "sent" : "failed",
    provider: `casella:${conn.email_address}`,
    stream: "transactional",
    provider_id: null,
    error_message: ok ? undefined : body.error ?? `email-send ${res.status}`,
    cost_eur: 0,
    charged_eur: 0,
    metadata: { automation: true, outbox_id: ob.id, order_id: p.orderId, allegato: p.fattura?.file_name ?? null },
  });

  return {
    success: ok,
    output: { action: "send_email", via: "casella", casella: conn.email_address, outbox_id: ob.id },
    error: ok ? undefined : `Invio dalla casella ${conn.email_address} non riuscito: ${body.error ?? res.status}`,
  };
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

  // «Ciao {{contatto.first_name}},» col nome vuoto: niente «Ciao ,».
  const resolvedText = senzaSpazioPrimaDellaVirgola(
    await resolveContactText(supabase, cfg.whatsapp_text || "", contact, companyId),
  );
  if (!resolvedText) return { success: false, error: "Nessun testo configurato per il messaggio WhatsApp Locale" };

  // Qualche minuto a caso sopra l'apertura: i messaggi rimasti in coda nel
  // weekend non partono tutti allo stesso minuto del lunedì.
  const sparpaglia = (minuti: number) => minuti + 1 + Math.floor(Math.random() * 15);

  // Fasce orarie del passo (es. "8-12, 14-20"), in aggiunta alla finestra
  // generale dei numeri: fuori fascia si rinvia all'inizio della prossima.
  const attesaFascia = minutiAllaFascia(romeMinuti(), leggiFasceOrarie(cfg.fasce_orarie));
  if (attesaFascia > 0) {
    return { success: false, defer: true, deferMinutes: sparpaglia(attesaFascia), error: `Fuori dalle fasce orarie del passo (${cfg.fasce_orarie})` };
  }

  // Numero mittente scelto nel passo: parte sempre da lì (niente rotazione).
  const numeroScelto = typeof cfg.numero_mittente === "string" && /^[0-9a-f-]{36}$/i.test(cfg.numero_mittente)
    ? cfg.numero_mittente
    : null;

  const res = await sendOpenWaMessage(supabase, {
    contactId: contact.id,
    to: contact.phone,
    text: resolvedText,
    contactTags: contact.tags ?? [],
    numberId: numeroScelto,
    // In un'automazione i tempi li decide il flusso: le attese e le fasce del
    // passo qui sopra. La finestra generale dei numeri resta per gli invii a
    // freddo delle campagne. Florin, 19/09/2026: chi chiede il PDF alle 2 di
    // notte riceve subito il W1, non il mattino dopo (né il lunedì).
    bypassQuietHours: true,
  });
  if (!res.ok) {
    // 409 = esito TRANSIENTE (nessun numero disponibile: cap/warm-up/throttle
    // esauriti, numero scelto scollegato, o fuori finestra oraria). Non è un
    // errore vero: chiedi al motore di rinviare senza consumare i tentativi
    // (back-pressure sul pool). Fuori orario si rinvia all'apertura.
    if (res.status === 409) {
      const minuti = res.motivo === "fuori_orario" && res.riapreTraMinuti ? sparpaglia(res.riapreTraMinuti) : 60;
      return { success: false, defer: true, deferMinutes: minuti, error: res.error };
    }
    return { success: false, error: res.error ?? "Invio WhatsApp Locale fallito" };
  }
  return { success: true, output: { action: "send_whatsapp_locale", numero_id: res.numberId ?? null } };
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
/**
 * Variabili dell'APPUNTAMENTO per le email delle automazioni.
 *
 * I flussi di pre-appuntamento e no-show parlano di giorno, ora e telefono:
 * senza questi, righe come "Confermato: {{giorno}} alle {{ora}}" arrivavano al
 * cliente stampate letteralmente. Il contatto da solo non basta, e il payload
 * del trigger non arriva fino al nodo email.
 *
 * Si legge l'appuntamento VERO al momento dell'invio, non una fotografia presa
 * al trigger: fra il trigger e l'email possono passare giorni, e se il cliente
 * sposta l'orario deve arrivargli quello nuovo. Si preferisce il prossimo
 * appuntamento futuro; se non ce n'è, l'ultimo passato (è il caso del no-show).
 *
 * Sconosciute o mancanti restano stringa vuota, mai il segnaposto grezzo.
 */
/** Dove vive la pagina pubblica «sposta o disdici» (/appuntamento/:token). */
const APP_ORIGINE_PUBBLICA = "https://app.ediliziaincloud.com";

const MESI_IT = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno",
  "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const GIORNI_IT = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];

async function variabiliAppuntamento(
  supabase: any,
  contactId: string,
  companyId: string,
): Promise<Record<string, string>> {
  const vuoto = { giorno: "", data: "", ora: "", ora_fine: "", titolo: "", luogo: "", link_riprogramma: "", link_sposta: "", link_call: "" };
  if (!contactId) return vuoto;

  const oggi = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  const base = () => supabase.from("appointments")
    .select("id, title, appointment_date, appointment_time, appointment_end_time, meeting_url, formatted_address, manage_token, status")
    .eq("contact_id", contactId).eq("company_id", companyId)
    .not("status", "in", '("cancelled","canceled","annullato")');

  let { data: app } = await base()
    .gte("appointment_date", oggi).order("appointment_date", { ascending: true }).limit(1).maybeSingle();
  if (!app) {
    const r = await base().order("appointment_date", { ascending: false }).limit(1).maybeSingle();
    app = r.data;
  }
  if (!app?.appointment_date) return vuoto;

  const [aa, mm, gg] = String(app.appointment_date).split("-").map(Number);
  const d = new Date(aa, mm - 1, gg);
  const ora = String(app.appointment_time ?? "").slice(0, 5);

  return {
    giorno: GIORNI_IT[d.getDay()] ?? "",
    data: `${gg} ${MESI_IT[mm - 1] ?? ""}`,
    ora,
    ora_fine: String(app.appointment_end_time ?? "").slice(0, 5),
    titolo: app.title ?? "",
    luogo: app.meeting_url || app.formatted_address || "",
    // La pagina «sposta o disdici» dell'appuntamento. Prima era il link della
    // videochiamata: chi cliccava «sposta» entrava nella call.
    link_riprogramma: app.manage_token ? urlGestione(APP_ORIGINE_PUBBLICA, app.manage_token) : "",
    link_sposta: app.manage_token ? urlGestione(APP_ORIGINE_PUBBLICA, app.manage_token) : "",
    link_call: app.meeting_url ?? "",
  };
}

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
    // Alias italiani mancanti: i testi scritti da chi fa marketing usano la
    // parola italiana, e senza questi righe come "{{provincia}}" uscivano
    // stampate così com'erano dentro l'email.
    nome: contact?.first_name ?? "",
    cognome: contact?.last_name ?? "",
    provincia: contact?.province ?? "",
    citta: contact?.city ?? "",
    telefono: contact?.phone ?? "",
    // Il numero come lo vuole wa.me, per il link che apre la chat dal
    // telefono (notifiche «manda questo WhatsApp a …»).
    telefono_whatsapp: numeroWhatsApp(contact?.phone),
    azienda: contact?.company_name ?? "",
  };

  // Appuntamento: si legge solo se il testo lo nomina davvero, per non fare
  // una query in più su ogni email che non ne ha bisogno.
  if (/\{\{\s*(appuntamento\.|giorno|data|ora|ora_fine|titolo|luogo|link_riprogramma|link_sposta|link_call)/.test(out)) {
    try {
      const app = await variabiliAppuntamento(supabase, contactId, companyId);
      for (const [k, v] of Object.entries(app)) {
        map[k] = v;
        map[`appuntamento.${k}`] = v;
      }
    } catch { /* fail-open: un appuntamento mancante non blocca l'invio */ }
  }
  // {{contatto.X}} / {{contact.X}} → valore mappato (sconosciuto → "").
  out = out.replace(/\{\{\s*(?:contatto|contact)\.(\w+)\s*\}\}/g, (_m, k: string) =>
    Object.prototype.hasOwnProperty.call(map, k) ? map[k] : "");
  // Nomi nudi: l'elenco si costruisce dalle chiavi DISPONIBILI invece di essere
  // scritto a mano. Prima era una lista fissa di dieci nomi inglesi, quindi ogni
  // alias nuovo (provincia, giorno, ora...) restava stampato nel testo anche se
  // il valore c'era. Le chiavi con il punto restano fuori: le gestisce la regola
  // sopra. I token speciali come {{unsubscribe_url}}, non essendo nella mappa,
  // non vengono toccati.
  const nudi = Object.keys(map).filter((k) => !k.includes("."));
  if (nudi.length) {
    const alternanza = nudi
      .sort((a, b) => b.length - a.length) // i più lunghi prima: "first_name" non finisce spezzato
      .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    out = out.replace(
      new RegExp(`\\{\\{\\s*(${alternanza})\\s*\\}\\}`, "g"),
      (_m, k: string) => map[k] ?? "",
    );
  }
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

  // Connessione Google: prima quella di chi ha l'appuntamento, poi una
  // qualunque dell'azienda. Prima si cercavano le colonne calendar_id e
  // is_active, che non esistono: la query falliva e l'azione rispondeva
  // sempre «nessuna connessione».
  const utenteAppuntamento = appointment.assigned_to ?? appointment.created_by ?? null;
  const { data: connessioni } = await supabase
    .from("google_calendar_connections")
    .select("id, user_id")
    .eq("company_id", companyId)
    .eq("status", "connected")
    .limit(50);
  const elenco = (connessioni ?? []) as Array<{ id: string; user_id: string }>;
  const gcalConn = elenco.find((c) => c.user_id === utenteAppuntamento) ?? elenco[0];

  if (!gcalConn) {
    return { success: false, error: "No active Google Calendar connection for this company" };
  }

  // google-calendar-sync ha verify_jwt: la chiamata passa dal database, che
  // manda il segreto interno e la chiave per il gateway.
  const { error: svegliaErr } = await supabase.rpc("calendario_esterno_sveglia", {
    p_funzione: "google-calendar-sync",
    p_action: "push-event",
    p_body: { appointmentId: appointment.id, companyId, userId: gcalConn.user_id },
  });
  if (svegliaErr) {
    return { success: false, error: `Google Calendar sync error: ${svegliaErr.message}` };
  }

  return { success: true, output: { action: "sync_google", sync_action: "sync_event", appointment_id: appointment.id, queued: true } };
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
