import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, secureHeaders, errorResponse, jsonResponse } from "../_shared/headers.ts";
import { requireAuth, requireCompanyAccess, requireInternalSecret } from "../_shared/auth.ts";
import { romaVersoUtc } from "../_shared/appuntamentiPubblici.ts";
import { serveConMetricheRapida } from "../_shared/withMetricsRapida.ts";

/**
 * 2026-05-27 SECURITY FIX: prima accettava QUALSIASI Bearer senza validare.
 * Global cron accepts internal/service credentials only; manual runs are tenant-scoped.
 */
async function verifyCronOrAuth(req: Request): Promise<void> {
  const reqSecret = req.headers.get("x-cron-secret") ?? "";
  // Accetta CRON_SECRET (originale) O PROACTIVE_CRON_SECRET (shared cron auth)
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  const proactiveSecret = Deno.env.get("PROACTIVE_CRON_SECRET") ?? "";
  if (reqSecret.length > 0 && (
    (cronSecret.length > 0 && reqSecret === cronSecret) ||
    (proactiveSecret.length > 0 && reqSecret === proactiveSecret)
  )) return;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "Unauthorized: missing cron secret or JWT" }), {
      status: 401,
      headers: secureHeaders,
    });
  }
  const token = authHeader.slice(7);

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (serviceRoleKey && token === serviceRoleKey) return;

  const sbUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!sbUrl || !anonKey) {
    throw new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 503,
      headers: secureHeaders,
    });
  }
  // Global scheduler: user authentication alone must never authorize all tenants.
  // The company-scoped run_flow path has its own permission checks.
  requireInternalSecret(req, getCorsHeaders(req));
}

// -- Mappa id-catalogo italiani (SCHEDULED) -> chiave handler / evento canonico.
// Il flow-builder salva l'id catalogo in config_json.item_id; gli handler inseriscono
// l'evento canonico inglese in automation_trigger_events cosi' che
// process-automation/handleTrigger (TRIGGER_EVENT_MAP) lo matchi col nodo.
const SCHEDULED_EVENT_MAP: Record<string, string> = {
  ordine_in_ritardo: "order_overdue",
  task_scaduto: "task_overdue",
  appuntamento_imminente: "appointment_reminder",
  fattura_scaduta: "invoice_overdue",
  preventivo_in_scadenza: "quote_expiring",
  preventivo_senza_risposta: "quote_unanswered",
  manutenzione_in_scadenza: "manutenzione_scheduled",
  contratto_manutenzione_in_scadenza: "contratto_manut_expiring",
  cantiere_lavori_conclusi: "order_work_completed",
  ticket_senza_risposta: "ticket_unanswered",
  contratto_in_scadenza: "contract_expiring",
  cantiere_in_ritardo: "site_overdue",
  cron_giornaliero: "cron_daily",
  cron_settimanale: "cron_weekly",
  cron_mensile: "cron_monthly",
  // Audit automazioni 2026-07-02: gli handler sotto esistevano già nello
  // switch ma erano IRRAGGIUNGIBILI (nessun id catalogo vi mappava).
  opportunita_stale: "opportunity_stale",
  compleanno_contatto: "birthday_reminder",
  costo_in_scadenza: "cost_due",
  data_personalizzata: "custom_date",
};

// Emette un evento UNA SOLA VOLTA per (company, evento, entity): evita spam giornaliero
// per gli alert "di stato" (scaduto/sotto-soglia). handleTrigger blocca comunque la
// ri-arruolamento sulla stessa entity, quindi una emissione e' sufficiente.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function emitEventOnce(supabase: any, companyId: string, event: string, entityId: string, entityType: string, payload: Record<string, unknown>): Promise<boolean> {
  const occurrence = payload._automation_occurrence ?? payload.prossima_scadenza ?? payload.data_scadenza
    ?? payload.due_date ?? payload.expected_date ?? payload.expires_at ?? payload.sent_at ?? payload.work_end_date ?? payload.data_cessazione ?? "once";
  const identity = JSON.stringify([companyId, event, entityId, payload._automation_flow_id, payload._automation_trigger_id, payload._automation_config, occurrence]);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  const key = Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, "0")).join("");
  const { error } = await supabase.from("automation_trigger_events").insert({
    company_id: companyId, trigger_event: event, entity_id: String(entityId), entity_type: entityType,
    payload, dedup_key: key,
  });
  if (error?.code === "23505") return false;
  if (error) throw error;
  return true;
}

function integerSetting(value: unknown, fallback: number, signed = false): number {
  const number = value == null || value === "" ? fallback : Number(value);
  if (!Number.isSafeInteger(number) || (!signed && number < 0)) throw new Error("La durata deve essere un numero intero valido.");
  return number;
}

function scheduledRomeDate(days = 0, now = new Date()): string {
  const today = now.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  const day = new Date(`${today}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() + days);
  return day.toISOString().slice(0, 10);
}

// Arruola direttamente UN flusso specifico (bypassa il fan-out per-evento). Usato dai
// trigger cron (per rispettare giorno/orario per-nodo, che handleTrigger ignorerebbe) e
// dall'avvio manuale. Replica il minimo di handleTrigger: enrollment + queue dei nodi
// successivi al trigger. La coda viene poi processata da process-automation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function enrollFlowDirect(supabase: any, flowId: string, companyId: string, triggerNodeId: string, entityId: string, entityType: string, payload: Record<string, unknown>): Promise<string | null> {
  const { data: flow, error: flowError } = await supabase.from("automation_flows").select("version, status")
    .eq("id", flowId).eq("company_id", companyId).is("deleted_at", null).maybeSingle();
  if (flowError) throw flowError;
  if (!flow || flow.status !== "published") throw new Error("Flusso non disponibile o non pubblicato per questa azienda");
  // Read the graph before creating an enrollment: a failed read is not an empty flow.
  const { data: conns, error: connectionError } = await supabase.from("automation_connections")
    .select("to_node_id, label").eq("flow_id", flowId).eq("from_node_id", triggerNodeId);
  if (connectionError) throw connectionError;
  if (!conns?.length) throw new Error("Il trigger non ha passi successivi da eseguire");
  const { data: enrollment, error } = await supabase
    .from("automation_enrollments")
    .insert({
      flow_id: flowId,
      company_id: companyId,
      entity_id: entityId,
      entity_type: entityType,
      flow_version: flow?.version ?? 1,
      status: "active",
    })
    .select("id")
    .single();
  if (error || !enrollment) {
    // Prima si tornava null in silenzio: e' cosi' che il CHECK su entity_type
    // ('cron'/'manual' non ammessi) e il tipo di entity_id hanno tenuto morti
    // per mesi i trigger cron e il pulsante "Esegui" senza lasciare traccia.
    console.error("[enrollFlowDirect] iscrizione fallita", { flowId, companyId, entityId, entityType, error });
    await supabase.from("automation_execution_log").insert({
      flow_id: flowId,
      company_id: companyId,
      node_id: triggerNodeId,
      node_type: "trigger",
      status: "error",
      input_json: { entity_id: entityId, entity_type: entityType, payload },
      error_message: `Iscrizione fallita: ${error?.message ?? "nessuna riga creata"}`,
    });
    throw error ?? new Error("Nessuna iscrizione creata");
  }

  try {
    // Register first so a fast worker cannot finish before the run exists.
    const { error: runError } = await supabase.from("flow_execution_runs").insert({
      flow_id: flowId, company_id: companyId, enrollment_id: enrollment.id,
      trigger_type: (payload?.trigger as string) ?? "scheduled", trigger_data: payload, status: "running",
    });
    if (runError) throw runError;
    // A single insert is atomic for all initial branches.
    const { error: queueError } = await supabase.from("automation_queue").insert(conns.map((c: any) => ({
      enrollment_id: enrollment.id,
      flow_id: flowId,
      company_id: companyId,
      current_node_id: c.to_node_id,
      entity_id: entityId,
      entity_type: entityType,
      status: "pending",
      execute_at: new Date().toISOString(),
      context_json: { payload, branch: c.label },
    })));
    if (queueError) throw queueError;
  } catch (startError: any) {
    const now = new Date().toISOString();
    const message = startError?.message ?? String(startError);
    const cleanup = await Promise.all([
      supabase.from("automation_enrollments").update({ status: "failed", updated_at: now })
        .eq("id", enrollment.id).eq("company_id", companyId).eq("flow_id", flowId).in("status", ["active", "waiting"]),
      supabase.from("flow_execution_runs").update({ status: "error", ended_at: now, error_message: message })
        .eq("enrollment_id", enrollment.id).eq("company_id", companyId).eq("status", "running"),
      supabase.from("automation_execution_log").insert({
        flow_id: flowId, company_id: companyId, node_id: triggerNodeId, node_type: "trigger", status: "error",
        input_json: { entity_id: entityId, entity_type: entityType, payload }, error_message: `Avvio non completato: ${message}`,
      }),
    ]);
    for (const result of cleanup) if (result.error) console.error("[enrollFlowDirect] errore nel registro del fallimento", result.error);
    throw startError;
  }

  return enrollment.id;
}

const CRON_WEEKDAY: Record<string, number> = {
  domenica: 0, lunedi: 1, martedi: 2, mercoledi: 3, giovedi: 4, venerdi: 5, sabato: 6,
};

// Trigger cron generici. Granularita' giornaliera (il cron gira 1volta/giorno alle 07:00 UTC):
// cron_daily fira ogni run; weekly/monthly solo nel giorno configurato. Entity unica per
// occorrenza (data nell'id) -> ri-arruolamento ad ogni occorrenza. Dedup per enrollment.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleCronTrigger(supabase: any, flow: any, node: any, ev: string, cfg: any): Promise<boolean> {
  const now = new Date();
  // Tutto in Europe/Rome, non in UTC: il motore usa gia' Europe/Rome per attese
  // e scadenze. Con getUTCDay()/getUTCDate() "ogni lunedi" e "il 1o del mese"
  // slittavano di un'ora fra estate e inverno e vicino a mezzanotte cadevano
  // nel giorno sbagliato. Il mezzogiorno nel calcolo del weekday evita i bordi DST.
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
  const romeWeekday = new Date(`${todayStr}T12:00:00Z`).getUTCDay();
  const romeDayOfMonth = parseInt(todayStr.slice(8, 10), 10);
  let shouldFire = false;
  if (ev === "cron_daily") {
    shouldFire = true;
  } else if (ev === "cron_weekly") {
    const want = CRON_WEEKDAY[String(cfg.giorno || "lunedi")];
    if (want == null) throw new Error("Giorno della settimana non valido");
    shouldFire = romeWeekday === want;
  } else if (ev === "cron_monthly") {
    const want = integerSetting(cfg.giorno_mese, 1);
    if (want < 1 || want > 31) throw new Error("Giorno del mese non valido");
    shouldFire = romeDayOfMonth === want;
  }
  if (!shouldFire) return false;

  const entityId = `cron:${flow.id}:${todayStr}`;
  const { data: existing, error: existingError } = await supabase
    .from("automation_enrollments")
    .select("id")
    .eq("flow_id", flow.id)
    .eq("company_id", flow.company_id)
    .eq("entity_id", entityId)
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return false;

  const enrolled = await enrollFlowDirect(supabase, flow.id, flow.company_id, node.id, entityId, "cron", {
    data: todayStr,
    ora: now.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }),
    giorno: Object.keys(CRON_WEEKDAY).find(key => CRON_WEEKDAY[key] === romeWeekday),
    mese: Number(todayStr.slice(5, 7)),
    trigger: ev,
  });
  return !!enrolled;
}

// Avvio MANUALE di un flusso (trigger 'manuale'): il pulsante "Esegui" chiama questa
// function con { mode:"run_flow", flow_id, company_id }. Auth: cron-secret OPPURE JWT
// utente con accesso alla company.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleManualRun(req: Request, supabase: any, body: any): Promise<Response> {
  const corsH = getCorsHeaders(req);
  const { flow_id, company_id, entity_id, entity_type, payload } = body;
  if (!flow_id || !company_id) {
    return jsonResponse({ error: "Missing flow_id or company_id" }, 400);
  }

  const reqSecret = req.headers.get("x-cron-secret") ?? "";
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  const proactiveSecret = Deno.env.get("PROACTIVE_CRON_SECRET") ?? "";
  const isInternal = reqSecret.length > 0 && (
    (cronSecret.length > 0 && reqSecret === cronSecret) ||
    (proactiveSecret.length > 0 && reqSecret === proactiveSecret)
  );
  let startedBy: string | null = null;
  if (!isInternal) {
    const { userId, supabaseAdmin } = await requireAuth(req, corsH);
    await requireCompanyAccess(supabaseAdmin, userId, company_id, corsH);
    startedBy = userId;
  }

  const { data: flow, error: flowReadError } = await supabase
    .from("automation_flows")
    .select("id, version, status, company_id")
    .eq("id", flow_id)
    .eq("company_id", company_id)
    .is("deleted_at", null)
    .maybeSingle();
  if (flowReadError) throw flowReadError;
  if (!flow) return jsonResponse({ error: "Flow not found" }, 404);
  if (flow.status !== "published") return jsonResponse({ error: "Flow not published" }, 400);

  const { data: nodes, error: nodeReadError } = await supabase
    .from("automation_nodes")
    .select("id, node_type")
    .eq("flow_id", flow_id);
  if (nodeReadError) throw nodeReadError;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const triggerNode = (nodes || []).find((n: any) => n.node_type === "trigger");
  if (!triggerNode) return jsonResponse({ error: "Flow has no trigger node" }, 400);

  const eid = entity_id || `manual:${crypto.randomUUID()}`;
  const enrollmentId = await enrollFlowDirect(
    supabase, flow_id, company_id, triggerNode.id, eid, entity_type || "manual",
    { ...(payload || {}), trigger: "manual_run", manual: true, avviato_da: startedBy, timestamp: new Date().toISOString() },
  );
  if (!enrollmentId) return jsonResponse({ error: "Enrollment failed" }, 500);
  return jsonResponse({ message: "Flow started", enrollment_id: enrollmentId, entity_id: eid });
}

serveConMetricheRapida("check-scheduled-triggers", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: getCorsHeaders(req) });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { body = {}; }

  // Avvio manuale di un singolo flusso (trigger 'manuale').
  if (body && (body.mode === "run_flow" || body.action === "run_flow")) {
    try {
      return await handleManualRun(req, supabase, body);
    } catch (e: any) {
      if (e instanceof Response) return e;
      return errorResponse(e?.message || String(e), 500);
    }
  }

  const results: Record<string, number> = {
    failed_triggers: 0,
    failed_flows: 0,
    birthday: 0,
    custom_date: 0,
    opportunity_stale: 0,
    appointment_reminder_24h: 0,
    appointment_reminder_1h: 0,
    appointment_reminder_custom: 0,
    cash_flow_alert: 0,
    recurring_costs: 0,
    order_overdue: 0,
    task_overdue: 0,
    cost_due: 0,
    appointment_reminder: 0,
    invoice_overdue: 0,
    quote_expiring: 0,
    quote_unanswered: 0,
    manutenzione_scheduled: 0,
    contratto_manut_expiring: 0,
    order_work_completed: 0,
    ticket_unanswered: 0,
    contract_expiring: 0,
    site_overdue: 0,
    cron: 0,
  };

  try {
    await verifyCronOrAuth(req);

    // Get all published flows
    const { data: flows, error: flowsError } = await supabase
      .from("automation_flows")
      .select("id, company_id")
      .eq("status", "published").is("deleted_at", null);
    if (flowsError) throw flowsError;

    if (!flows || flows.length === 0) {
      return jsonResponse({ message: "No published flows", results });
    }

    // For each flow, get trigger nodes
    for (const flow of flows) {
      const { data: triggerNodes, error: nodesError } = await supabase
        .from("automation_nodes")
        .select("id, config_json")
        .eq("flow_id", flow.id)
        .eq("node_type", "trigger");
      if (nodesError) {
        results.failed_flows++;
        console.error(`Scheduled trigger nodes unavailable for flow ${flow.id}:`, nodesError.message);
        continue;
      }

      if (!triggerNodes) continue;

      for (const node of triggerNodes) {
        const cfg = node.config_json || {};
        const itemId = (cfg.item_id ?? cfg.trigger_event ?? "") as string;
        const triggerEvent = SCHEDULED_EVENT_MAP[itemId] ?? cfg.trigger_event ?? itemId;
        if (body.mode === "appointment_triggers_only" && triggerEvent !== "appointment_reminder") continue;
        const emitForTrigger = (db: any, company: string, event: string, entity: string, type: string, payload: Record<string, unknown>) =>
          emitEventOnce(db, company, event, entity, type, { ...payload, _automation_flow_id: flow.id, _automation_trigger_id: node.id, _automation_config: cfg });

        try {
        switch (triggerEvent) {
          case "birthday_reminder": {
            const daysBefore = integerSetting(cfg.days_before, 0);
            const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
            const target = new Date(today + "T12:00:00Z");
            target.setUTCDate(target.getUTCDate() + daysBefore);
            const { data: contacts, error } = await supabase.from("marketing_contacts").select("id, date_of_birth")
              .eq("company_id", flow.company_id).is("deleted_at", null).not("date_of_birth", "is", null);
            if (error) throw error;
            for (const c of contacts ?? []) {
              if (String(c.date_of_birth).slice(5, 10) !== target.toISOString().slice(5, 10)) continue;
              if (await emitForTrigger(supabase, flow.company_id, "birthday_reminder", c.id, "contact", {
                date_of_birth: c.date_of_birth, days_before: daysBefore, _automation_occurrence: target.toISOString().slice(0, 10),
              })) results.birthday++;
            }
            break;
          }

          case "opportunity_stale": {
            const days = integerSetting(cfg.stale_days, 30);
            const { data: opportunities, error } = await supabase.from("marketing_opportunities")
              .select("id, contact_id, pipeline_id, stage_id, updated_at").eq("company_id", flow.company_id)
              .eq("status", "open").is("deleted_at", null).lt("updated_at", new Date(Date.now() - days * 86400000).toISOString());
            if (error) throw error;
            for (const opp of opportunities ?? []) {
              if (!opp.contact_id) continue;
              if (await emitForTrigger(supabase, flow.company_id, "opportunity_stale", opp.contact_id, "contact", {
                opportunity_id: opp.id, pipeline_id: opp.pipeline_id, stage_id: opp.stage_id, stale_days: days,
                _automation_occurrence: opp.id + ":" + opp.updated_at,
              })) results.opportunity_stale++;
            }
            break;
          }

          case "order_overdue": {
            // ordine_in_ritardo: ordine oltre la data di consegna prevista, con N giorni di
            // tolleranza. NB: la colonna reale e' `expected_date` (non expected_delivery_date)
            // e lo stato testuale e' `status`.
            const giorniTolleranza = integerSetting(cfg.giorni_tolleranza, 1);
            const cutoffStr = scheduledRomeDate(-giorniTolleranza);

            const { data: overdueOrders, error: overdueError } = await supabase
              .from("orders")
              .select("id, description, order_code, status, customer_id, expected_date")
              .eq("company_id", flow.company_id)
              .not("expected_date", "is", null)
              .lt("expected_date", cutoffStr);
            if (overdueError) throw overdueError;

            for (const order of overdueOrders || []) {
              const st = String(order.status || "").toLowerCase();
              if (["completato", "consegnato", "chiuso", "annullato", "completed", "delivered", "closed", "cancelled"].includes(st)) continue;
              const giorni = Math.max(0, Math.floor((Date.now() - new Date(order.expected_date).getTime()) / 86400000));
              const emitted = await emitForTrigger(supabase, flow.company_id, "order_overdue", order.id, "order", {
                order_id: order.id, order_code: order.order_code, description: order.description,
                customer_id: order.customer_id, expected_date: order.expected_date, giorni_ritardo: giorni,
              });
              if (emitted) results.order_overdue++;
            }
            break;
          }

          case "task_overdue": {
            // task_scaduto: due_date passata e task non completato (valore reale 'completato').
            const todayStr = scheduledRomeDate();
            const { data: overdueTasks, error: overdueError } = await supabase
              .from("tasks")
              .select("id, title, due_date, assigned_to, status")
              .eq("company_id", flow.company_id)
              .not("due_date", "is", null)
              .lt("due_date", todayStr)
              .not("status", "in", "(completata,completato,completed,done,fatto,annullata)");
            if (overdueError) throw overdueError;

            for (const task of overdueTasks || []) {
              const giorni = Math.max(0, Math.floor((Date.now() - new Date(task.due_date).getTime()) / 86400000));
              const emitted = await emitForTrigger(supabase, flow.company_id, "task_overdue", task.id, "task", {
                task_id: task.id, title: task.title, assigned_to: task.assigned_to, due_date: task.due_date, giorni_ritardo: giorni,
              });
              if (emitted) results.task_overdue++;
            }
            break;
          }

          case "cost_due": {
            const days = integerSetting(cfg.days_before, 7);
            const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
            const until = scheduledRomeDate(days);
            const { data: costs, error } = await supabase.from("company_costs").select("id, name, amount, due_date")
              .eq("company_id", flow.company_id).eq("is_paid", false).gte("due_date", today).lte("due_date", until);
            if (error) throw error;
            for (const cost of costs ?? []) {
              if (await emitForTrigger(supabase, flow.company_id, "cost_due", cost.id, "cost", {
                cost_id: cost.id, name: cost.name, amount: cost.amount, due_date: cost.due_date, days_before: days,
              })) results.cost_due++;
            }
            break;
          }

          case "appointment_reminder": {
            const minutesBefore = cfg.minutes_before != null ? Number(cfg.minutes_before)
              : cfg.ore_prima != null ? Number(cfg.ore_prima) * 60 : 1440;
            if (!Number.isFinite(minutesBefore) || minutesBefore < 0) throw new Error("Anticipo appuntamento non valido");
            const now = new Date();
            const earliest = new Date(now.getTime() - 5 * 60000);
            const horizon = new Date(now.getTime() + minutesBefore * 60000);
            const { data: appointments, error } = await supabase.from("appointments")
              .select("id, title, appointment_date, appointment_time, contact_id, calendar_id, appointment_type, status")
              .eq("company_id", flow.company_id).eq("is_blocked_slot", false)
              .not("status", "in", "(annullato,cancelled,canceled,completed,completato)")
              .gte("appointment_date", earliest.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" }))
              .lte("appointment_date", horizon.toLocaleDateString("en-CA", { timeZone: "Europe/Rome" }));
            if (error) throw error;
            for (const apt of appointments ?? []) {
              if (!apt.contact_id) continue;
              const at = romaVersoUtc(String(apt.appointment_date), String(apt.appointment_time ?? "09:00").slice(0, 5));
              if (at < earliest || at > horizon) continue;
              if (await emitForTrigger(supabase, flow.company_id, "appointment_reminder", apt.contact_id, "contact", {
                appointment_id: apt.id, title: apt.title, date: apt.appointment_date, time: apt.appointment_time,
                calendar_id: apt.calendar_id, appointment_type: apt.appointment_type, status: apt.status, minutes_before: minutesBefore,
                _automation_occurrence: apt.id + ":" + at.toISOString(),
              })) results.appointment_reminder++;
            }
            break;
          }

          case "invoice_overdue": {
            // fattura_scaduta: fattura non pagata oltre N giorni dalla scadenza.
            const giorni = integerSetting(cfg.giorni_dopo_scadenza, 3);
            const cutoffStr = scheduledRomeDate(-giorni);

            const { data: overdue, error: overdueError } = await supabase
              .from("invoices")
              .select("id, invoice_number, total, client_company_name, client_email, due_date, status")
              .eq("company_id", flow.company_id)
              .not("due_date", "is", null)
              .lte("due_date", cutoffStr);
            if (overdueError) throw overdueError;

            for (const inv of overdue || []) {
              const st = String(inv.status || "").toLowerCase();
              if (["paid", "pagata", "cancelled", "canceled", "annullata", "draft", "bozza"].includes(st)) continue;
              const giorniScaduta = Math.max(0, Math.floor((Date.now() - new Date(inv.due_date).getTime()) / 86400000));
              const emitted = await emitForTrigger(supabase, flow.company_id, "invoice_overdue", inv.id, "invoice", {
                invoice_id: inv.id, invoice_number: inv.invoice_number, total: inv.total,
                client_company_name: inv.client_company_name, client_email: inv.client_email,
                due_date: inv.due_date, giorni_scaduta: giorniScaduta,
              });
              if (emitted) results.invoice_overdue++;
            }
            break;
          }

          case "quote_expiring": {
            // preventivo_in_scadenza: scade entro N giorni e non ancora risposto.
            const giorni = integerSetting(cfg.giorni_prima, 3);
            const now = new Date();
            const limit = new Date(now.getTime() + giorni * 86400000);

            const { data: expiring, error: expiryError } = await supabase
              .from("quotes")
              .select("id, quote_number, total, client_name, client_email, expires_at, signed_at, refused_at")
              .eq("company_id", flow.company_id)
              .not("expires_at", "is", null)
              .is("signed_at", null)
              .is("refused_at", null)
              .gte("expires_at", now.toISOString())
              .lte("expires_at", limit.toISOString());
            if (expiryError) throw expiryError;

            for (const q of expiring || []) {
              const giorniAlla = Math.max(0, Math.ceil((new Date(q.expires_at).getTime() - Date.now()) / 86400000));
              const emitted = await emitForTrigger(supabase, flow.company_id, "quote_expiring", q.id, "quote", {
                preventivo_id: q.id, quote_number: q.quote_number, total: q.total,
                client_name: q.client_name, client_email: q.client_email, giorni_alla_scadenza: giorniAlla, expires_at: q.expires_at,
              });
              if (emitted) results.quote_expiring++;
            }
            break;
          }

          case "quote_unanswered": {
            // preventivo_senza_risposta: inviato da almeno N giorni, né accettato né
            // rifiutato. Una sola emissione per preventivo (emitEventOnce).
            const giorniAttesa = integerSetting(cfg.giorni_senza_risposta, 5);
            const cutoffInvio = new Date(Date.now() - giorniAttesa * 86400000).toISOString();
            const { data: senzaRisposta, error: responseReadError } = await supabase
              .from("quotes")
              .select("id, quote_number, total, client_name, client_email, sent_at, viewed_at, expires_at")
              .eq("company_id", flow.company_id)
              .eq("status", "inviata")
              .is("signed_at", null)
              .is("refused_at", null)
              .is("deleted_at", null)
              .not("sent_at", "is", null)
              .lte("sent_at", cutoffInvio);
            if (responseReadError) throw responseReadError;

            for (const q of senzaRisposta || []) {
              const giorniDaInvio = Math.max(0, Math.floor((Date.now() - new Date(q.sent_at).getTime()) / 86400000));
              const emitted = await emitForTrigger(supabase, flow.company_id, "quote_unanswered", q.id, "quote", {
                preventivo_id: q.id, quote_number: q.quote_number, total: q.total,
                client_name: q.client_name, client_email: q.client_email,
                giorni_da_invio: giorniDaInvio, visualizzato: q.viewed_at != null, expires_at: q.expires_at,
              });
              if (emitted) results.quote_unanswered++;
            }
            break;
          }

          case "manutenzione_scheduled": {
            // Piano di manutenzione attivo con la prossima uscita entro N giorni.
            const giorniPrima = integerSetting(cfg.giorni_prima, 30);
            const limite = scheduledRomeDate(giorniPrima);
            const oggiStr = scheduledRomeDate();
            const { data: piani, error: plansError } = await supabase
              .from("piani_manutenzione")
              .select("id, titolo, prossima_scadenza, contratto_id, tecnico_preferito")
              .eq("company_id", flow.company_id)
              .eq("attivo", true)
              .not("prossima_scadenza", "is", null)
              .gte("prossima_scadenza", oggiStr)
              .lte("prossima_scadenza", limite);
            if (plansError) throw plansError;

            for (const piano of piani || []) {
              const giorni = Math.max(0, Math.ceil((new Date(piano.prossima_scadenza).getTime() - Date.now()) / 86400000));
              // Il cliente sta sul contratto, non sul piano.
              let clienteId: string | null = null;
              if (piano.contratto_id) {
                const { data: contratto, error: contractError } = await supabase
                  .from("contratti_manutenzione").select("customer_id").eq("id", piano.contratto_id).eq("company_id", flow.company_id).maybeSingle();
                if (contractError) throw contractError;
                clienteId = contratto?.customer_id ?? null;
              }
              const emitted = await emitForTrigger(supabase, flow.company_id, "manutenzione_scheduled", piano.id, "manutenzione", {
                piano_id: piano.id, titolo: piano.titolo, prossima_scadenza: piano.prossima_scadenza,
                giorni_alla_scadenza: giorni, contratto_id: piano.contratto_id, cliente_id: clienteId,
                tecnico_preferito: piano.tecnico_preferito,
              });
              if (emitted) results.manutenzione_scheduled++;
            }
            break;
          }

          case "contratto_manut_expiring": {
            // Contratto di manutenzione attivo che scade entro N giorni.
            const giorniPrima = integerSetting(cfg.giorni_prima, 60);
            const limite = scheduledRomeDate(giorniPrima);
            const oggiStr = scheduledRomeDate();
            const { data: contratti, error: contractError } = await supabase
              .from("contratti_manutenzione")
              .select("id, nome_contratto, importo_canone, data_scadenza, rinnovo_automatico, customer_id, stato")
              .eq("company_id", flow.company_id)
              .not("data_scadenza", "is", null)
              .gte("data_scadenza", oggiStr)
              .lte("data_scadenza", limite);
            if (contractError) throw contractError;

            for (const c of contratti || []) {
              // Uno cessato o sospeso non va rinnovato.
              const stato = String(c.stato || "").toLowerCase();
              if (["cessato", "annullato", "sospeso", "scaduto"].includes(stato)) continue;
              const giorni = Math.max(0, Math.ceil((new Date(c.data_scadenza).getTime() - Date.now()) / 86400000));
              const emitted = await emitForTrigger(supabase, flow.company_id, "contratto_manut_expiring", c.id, "contratto_manutenzione", {
                contratto_id: c.id, nome: c.nome_contratto, canone: c.importo_canone,
                data_scadenza: c.data_scadenza, giorni_alla_scadenza: giorni,
                rinnovo_automatico: c.rinnovo_automatico, cliente_id: c.customer_id,
              });
              if (emitted) results.contratto_manut_expiring++;
            }
            break;
          }

          case "order_work_completed": {
            // Fine lavori passata (più l'eventuale attesa) e commessa completata:
            // è il momento di chiedere la recensione o aprire la manutenzione.
            const giorniDopo = integerSetting(cfg.giorni_dopo, 0);
            const soglia = scheduledRomeDate(-giorniDopo);
            const { data: concluse, error: completedError } = await supabase
              .from("orders")
              .select("id, order_code, description, work_end_date, status, customer_id")
              .eq("company_id", flow.company_id)
              .not("work_end_date", "is", null)
              .lte("work_end_date", soglia);
            if (completedError) throw completedError;

            for (const o of concluse || []) {
              const stato = String(o.status || "").toLowerCase();
              if (!["completato", "completata", "completed", "chiuso", "consegnato", "delivered", "closed"].includes(stato)) continue;
              const giorni = Math.max(0, Math.floor((Date.now() - new Date(o.work_end_date).getTime()) / 86400000));
              const emitted = await emitForTrigger(supabase, flow.company_id, "order_work_completed", o.id, "order", {
                order_id: o.id, order_code: o.order_code, descrizione: o.description,
                work_end_date: o.work_end_date, giorni_da_fine_lavori: giorni, cliente_id: o.customer_id,
              });
              if (emitted) results.order_work_completed++;
            }
            break;
          }

          case "ticket_unanswered": {
            // ticket_senza_risposta: ticket aperto/in lavorazione senza attivita' da N ore (SLA).
            const oreSla = integerSetting(cfg.ore_sla, 24);
            const cutoff = new Date(Date.now() - oreSla * 3600000).toISOString();

            // NB: .lte esclude i NULL → un ticket MAI risposto (last_message_at
            // null) non scattava mai: fallback su created_at. Esclusi anche i
            // ticket chiusi (prima solo 'risolto' → i chiusi rifiravano l'SLA).
            const { data: stale, error: ticketsError } = await supabase
              .from("tickets")
              .select("id, subject, customer_id, assigned_to, created_at, last_message_at, status")
              .eq("company_id", flow.company_id)
              .not("status", "in", "(risolto,chiuso,closed,resolved)")
              .or(`last_message_at.lte.${cutoff},and(last_message_at.is.null,created_at.lte.${cutoff})`);
            if (ticketsError) throw ticketsError;

            for (const t of stale || []) {
              const oreApertura = Math.max(0, Math.floor((Date.now() - new Date(t.created_at).getTime()) / 3600000));
              const emitted = await emitForTrigger(supabase, flow.company_id, "ticket_unanswered", t.id, "ticket", {
                ticket_id: t.id, subject: t.subject, customer_id: t.customer_id,
                assigned_to: t.assigned_to, ore_apertura: oreApertura,
              });
              if (emitted) results.ticket_unanswered++;
            }
            break;
          }

          case "contract_expiring": {
            // contratto_in_scadenza: contratto dipendente in scadenza entro N giorni.
            // Fonte dati: hr_profili.data_cessazione (data fine rapporto/contratto).
            const giorni = integerSetting(cfg.giorni_prima, 30);
            const todayStr = scheduledRomeDate();
            const limitStr = scheduledRomeDate(giorni);

            const { data: contracts, error: contractsError } = await supabase
              .from("hr_profili")
              .select("id, employee_id, nome, cognome, data_cessazione, attivo")
              .eq("company_id", flow.company_id)
              .eq("attivo", true)
              .not("data_cessazione", "is", null)
              .gte("data_cessazione", todayStr)
              .lte("data_cessazione", limitStr);
            if (contractsError) throw contractsError;

            for (const c of contracts || []) {
              const entityId = c.employee_id || c.id;
              const giorniRim = Math.max(0, Math.ceil((new Date(c.data_cessazione).getTime() - Date.now()) / 86400000));
              const emitted = await emitForTrigger(supabase, flow.company_id, "contract_expiring", entityId, "employee", {
                dipendente_id: entityId, first_name: c.nome, last_name: c.cognome,
                data_cessazione: c.data_cessazione, giorni_rimanenti: giorniRim,
              });
              if (emitted) results.contract_expiring++;
            }
            break;
          }

          case "site_overdue": {
            // cantiere_in_ritardo: ordine/cantiere oltre la data di fine prevista (work_end_date).
            const giorniTolleranza = integerSetting(cfg.giorni_tolleranza, 0);
            const cutoffStr = scheduledRomeDate(-giorniTolleranza);

            const { data: lateSites, error: sitesError } = await supabase
              .from("orders")
              .select("id, order_code, description, status, assigned_to, work_end_date")
              .eq("company_id", flow.company_id)
              .not("work_end_date", "is", null)
              .lt("work_end_date", cutoffStr);
            if (sitesError) throw sitesError;

            for (const o of lateSites || []) {
              const st = String(o.status || "").toLowerCase();
              if (["completato", "consegnato", "chiuso", "annullato", "completed", "delivered", "closed", "cancelled"].includes(st)) continue;
              const giorni = Math.max(0, Math.floor((Date.now() - new Date(o.work_end_date).getTime()) / 86400000));
              const emitted = await emitForTrigger(supabase, flow.company_id, "site_overdue", o.id, "order", {
                cantiere_id: o.id, nome: o.order_code || o.description, giorni_ritardo: giorni, responsabile_id: o.assigned_to,
              });
              if (emitted) results.site_overdue++;
            }
            break;
          }

          case "cron_daily":
          case "cron_weekly":
          case "cron_monthly": {
            const fired = await handleCronTrigger(supabase, flow, node, triggerEvent, cfg);
            if (fired) results.cron++;
            break;
          }

          case "custom_date": {
            const dateField = cfg.date_field;
            const daysOffset = integerSetting(cfg.days_offset, 0, true);
            if (!["created_at", "date_of_birth"].includes(dateField)) throw new Error("Seleziona un campo data supportato per la ricorrenza.");
            const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });
            const targetDate = new Date(today + "T12:00:00Z");
            // Positive offset means AFTER the original date, as promised by the editor.
            targetDate.setUTCDate(targetDate.getUTCDate() - daysOffset);
            const targetStr = targetDate.toISOString().slice(0, 10);
            let q = supabase.from("marketing_contacts").select("id")
              .eq("company_id", flow.company_id).is("deleted_at", null);
            if (dateField === "created_at") {
              const next = new Date(targetDate); next.setUTCDate(next.getUTCDate() + 1);
              q = q.gte("created_at", romaVersoUtc(targetStr, "00:00").toISOString())
                .lt("created_at", romaVersoUtc(next.toISOString().slice(0, 10), "00:00").toISOString());
            } else q = q.eq("date_of_birth", targetStr);
            const { data: contacts, error } = await q;
            if (error) throw error;
            for (const contact of contacts ?? []) {
              if (await emitForTrigger(supabase, flow.company_id, "custom_date", contact.id, "contact", {
                date_field: dateField, days_offset: daysOffset, target_date: targetStr, _automation_occurrence: targetStr,
              })) results.custom_date++;
            }
            break;
          }
        }
        } catch (triggerError: any) {
          // One malformed trigger must not suppress every other company's reminders.
          results.failed_triggers++;
          console.error(`Scheduled trigger ${node.id} in flow ${flow.id} failed:`, triggerError?.message ?? String(triggerError));
        }
      }
    }

    // Frequent run is limited to automation appointment triggers. Leave unrelated
    // daily notifications on their existing cadence and deduplication strategy.
    if (body.mode === "appointment_triggers_only") return jsonResponse({ results });

    // ── Custom Reminder Minutes (from appointments.reminder_minutes) ──
    const now = new Date();
    const { data: reminderApts } = await supabase
      .from("appointments")
      .select("id, title, appointment_date, appointment_time, assigned_to, company_id, contact_id, reminder_minutes")
      .eq("is_blocked_slot", false)
      .eq("reminder_sent", false)
      .neq("status", "annullato")
      .neq("status", "cancelled")
      .not("reminder_minutes", "is", null);

    if (reminderApts && reminderApts.length > 0) {
      for (const apt of reminderApts) {
        const aptDate = new Date(apt.appointment_date);
        if (apt.appointment_time) {
          const [hh, mm] = apt.appointment_time.split(":").map(Number);
          aptDate.setHours(hh || 0, mm || 0, 0, 0);
        } else {
          aptDate.setHours(9, 0, 0, 0);
        }

        const triggerAt = new Date(aptDate.getTime() - (apt.reminder_minutes || 0) * 60 * 1000);
        if (now >= triggerAt && now < aptDate) {
          // Mark as sent
          await supabase
            .from("appointments")
            .update({ reminder_sent: true })
            .eq("id", apt.id);

          // Send notification
          if (apt.assigned_to) {
            const label = apt.reminder_minutes === 1440 ? "24h" : apt.reminder_minutes === 60 ? "1h" : `${apt.reminder_minutes}min`;
            // Colonne REALI: notification_type (non "type"); nessuna colonna
            // user_id → destinatario nel metadata. notification_date NULL:
            // l'indice unico (company,type,date) limiterebbe a 1 promemoria
            // al giorno. Prima l'insert falliva SEMPRE (colonna inesistente).
            await supabase.from("lifecycle_notifications").insert({
              company_id: apt.company_id,
              notification_type: "appointment_reminder",
              notification_date: null,
              title: `Promemoria appuntamento (${label})`,
              message: `Appuntamento "${apt.title}" il ${apt.appointment_date}${apt.appointment_time ? " alle " + apt.appointment_time : ""}.`,
              metadata: { appointment_id: apt.id, reminder_type: label, user_id: apt.assigned_to },
            });
          }

          results.appointment_reminder_custom = (results.appointment_reminder_custom || 0) + 1;
        }
      }
    }

    // ── Appointment Reminders (24h and 1h before) ──
    const in24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const { data: upcomingAppointments } = await supabase
      .from("appointments")
      .select("id, title, appointment_date, appointment_time, contact_id, company_id, assigned_to, calendar_id")
      .eq("is_blocked_slot", false)
      .neq("status", "annullato")
      .neq("status", "cancelled")
      .neq("status", "canceled")
      .gte("appointment_date", now.toISOString().split("T")[0])
      .lte("appointment_date", in24h.toISOString().split("T")[0]);

    if (upcomingAppointments && upcomingAppointments.length > 0) {
      for (const apt of upcomingAppointments) {
        const aptDate = new Date(apt.appointment_date);
        if (apt.appointment_time) {
          const [hh, mm] = apt.appointment_time.split(":").map(Number);
          aptDate.setHours(hh || 0, mm || 0, 0, 0);
        } else {
          aptDate.setHours(9, 0, 0, 0);
        }

        const diffMs = aptDate.getTime() - now.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);

        // 24h reminder: between 23-25 hours away
        if (diffHours > 23 && diffHours <= 25) {
          const { data: alreadySent } = await supabase
            .from("appointment_reminders_sent")
            .select("id")
            .eq("appointment_id", apt.id)
            .eq("reminder_type", "24h")
            .maybeSingle();

          if (!alreadySent) {
            await supabase.from("appointment_reminders_sent").insert({
              appointment_id: apt.id,
              reminder_type: "24h",
            });

            if (apt.assigned_to) {
              // Colonne reali + date NULL (vedi promemoria custom sopra).
              await supabase.from("lifecycle_notifications").insert({
                company_id: apt.company_id,
                notification_type: "appointment_reminder",
                notification_date: null,
                title: "Promemoria appuntamento (24h)",
                message: `Appuntamento "${apt.title}" domani${apt.appointment_time ? " alle " + apt.appointment_time : ""}.`,
                metadata: { appointment_id: apt.id, reminder_type: "24h", user_id: apt.assigned_to },
              });
            }

            if (apt.contact_id) {
              await supabase.from("automation_trigger_events").insert({
                company_id: apt.company_id,
                trigger_event: "appointment_reminder_24h",
                entity_id: apt.contact_id,
                entity_type: "contact",
                payload: { appointment_id: apt.id, title: apt.title, date: apt.appointment_date, time: apt.appointment_time },
              });
            }

            results.appointment_reminder_24h++;
          }
        }

        // 1h reminder: between 0.5-1.5 hours away
        if (diffHours > 0.5 && diffHours <= 1.5) {
          const { data: alreadySent } = await supabase
            .from("appointment_reminders_sent")
            .select("id")
            .eq("appointment_id", apt.id)
            .eq("reminder_type", "1h")
            .maybeSingle();

          if (!alreadySent) {
            await supabase.from("appointment_reminders_sent").insert({
              appointment_id: apt.id,
              reminder_type: "1h",
            });

            if (apt.assigned_to) {
              // Colonne reali + date NULL (vedi promemoria custom sopra).
              await supabase.from("lifecycle_notifications").insert({
                company_id: apt.company_id,
                notification_type: "appointment_reminder",
                notification_date: null,
                title: "Promemoria appuntamento (1h)",
                message: `Appuntamento "${apt.title}" tra 1 ora${apt.appointment_time ? " alle " + apt.appointment_time : ""}.`,
                metadata: { appointment_id: apt.id, reminder_type: "1h", user_id: apt.assigned_to },
              });
            }

            if (apt.contact_id) {
              await supabase.from("automation_trigger_events").insert({
                company_id: apt.company_id,
                trigger_event: "appointment_reminder_1h",
                entity_id: apt.contact_id,
                entity_type: "contact",
                payload: { appointment_id: apt.id, title: apt.title, date: apt.appointment_date, time: apt.appointment_time },
              });
            }

            results.appointment_reminder_1h++;
          }
        }
      }
    }

    // ── Cash Flow Alert (daily check for negative next-month forecast) ──
    const today = new Date();
    const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
    const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0);
    const todayStr = today.toISOString().split("T")[0];

    // Get all companies
    const { data: allCompanies } = await supabase.from("companies").select("id").eq("status", "active");

    if (allCompanies) {
      for (const company of allCompanies) {
        // Check if already sent today. Colonna REALE: notification_type
        // (con .eq("type",...) la query falliva → dedup mai applicato).
        const { data: alreadySent } = await supabase
          .from("lifecycle_notifications")
          .select("id")
          .eq("company_id", company.id)
          .eq("notification_type", "cash_flow_alert")
          .gte("created_at", todayStr)
          .maybeSingle();

        if (alreadySent) continue;

        // Sum expected income (order_installments)
        const { data: incomeData } = await supabase
          .from("order_installments")
          .select("amount, order_id")
          .eq("is_paid", false)
          .gte("expected_date", nextMonthStart.toISOString().split("T")[0])
          .lte("expected_date", nextMonthEnd.toISOString().split("T")[0]);

        // Filter by company via orders
        let totalIncome = 0;
        if (incomeData && incomeData.length > 0) {
          const orderIds = [...new Set(incomeData.map(i => i.order_id))];
          const { data: companyOrders } = await supabase
            .from("orders")
            .select("id")
            .eq("company_id", company.id)
            .in("id", orderIds);

          const validOrderIds = new Set((companyOrders || []).map(o => o.id));
          totalIncome = incomeData.filter(i => validOrderIds.has(i.order_id)).reduce((s, i) => s + (i.amount || 0), 0);
        }

        // Sum expected costs
        const { data: costsData } = await supabase
          .from("company_costs")
          .select("amount")
          .eq("company_id", company.id)
          .eq("is_paid", false)
          .gte("due_date", nextMonthStart.toISOString().split("T")[0])
          .lte("due_date", nextMonthEnd.toISOString().split("T")[0]);

        const totalExpenses = (costsData || []).reduce((s, c) => s + (c.amount || 0), 0);
        const netForecast = totalIncome - totalExpenses;

        if (netForecast < 0) {
          // Get company admin user
          const { data: adminProfile } = await supabase
            .from("profiles")
            .select("id")
            .eq("company_id", company.id)
            .limit(1)
            .maybeSingle();

          // 2026-08-06 — Anti-ripetizione. Questo blocco gira OGNI GIORNO e
          // finora inseriva un avviso nuovo a ogni giro: cinque giorni di
          // previsione negativa producevano cinque banner identici uno sotto
          // l'altro in testa alla pagina. Il fatto e' uno solo, e ripeterlo
          // non lo rende piu' urgente — lo rende rumore che si impara a
          // saltare, e a quel punto smette di funzionare anche quando conta.
          //
          // Se ne esiste gia' uno NON archiviato per questa azienda, non se ne
          // crea un altro: quello che c'e' dice gia' la stessa cosa. Quando
          // l'utente lo archivia, il prossimo giro ne creera' uno aggiornato.
          const { data: giaAvvisato } = await supabase
            .from("lifecycle_notifications")
            .select("id")
            .eq("company_id", company.id)
            .eq("notification_type", "cash_flow_alert")
            .eq("is_dismissed", false)
            .limit(1)
            .maybeSingle();

          if (adminProfile && !giaAvvisato) {
            // Colonne REALI: notification_type (non "type"), nessuna colonna
            // user_id (destinatario nel metadata), notification_date NULL per
            // non collidere con l'indice unico dei digest. Prima l'insert
            // falliva SEMPRE → l'alert cash-flow non è mai stato consegnato.
            await supabase.from("lifecycle_notifications").insert({
              company_id: company.id,
              notification_type: "cash_flow_alert",
              notification_date: null,
              title: "⚠️ Cash flow negativo previsto",
              message: `Il saldo previsto per il prossimo mese è di €${netForecast.toFixed(2)}. Verifica le uscite programmate.`,
              metadata: { net_forecast: netForecast, month: nextMonthStart.toISOString().split("T")[0], user_id: adminProfile.id },
            });
            results.cash_flow_alert++;
          }
        }
      }
    }

    // ── Auto-generate recurring costs for all active companies ──
    if (allCompanies) {
      for (const company of allCompanies) {
        try {
          const { data: recurringCosts } = await supabase
            .from("company_costs")
            .select("*")
            .eq("company_id", company.id)
            .eq("recurrence_auto", true)
            .neq("recurrence", "once");

          if (!recurringCosts || recurringCosts.length === 0) continue;

          const rcNow = new Date();
          const toInsert: any[] = [];

          for (const cost of recurringCosts) {
            if (cost.recurrence_end_date && new Date(cost.recurrence_end_date) < rcNow) continue;

            const baseDate = new Date(cost.due_date);
            const maxLookahead = 3;
            const horizon = new Date(rcNow.getFullYear(), rcNow.getMonth() + maxLookahead, 0);

            // Giorno ANCORA clampato a fine mese (v. generate-recurring-costs:
            // "31 gennaio + 1 mese" rollava al 3 marzo, per sempre).
            const anchorDay = baseDate.getDate();
            const stepMonths = cost.recurrence === "monthly" ? 1 : cost.recurrence === "quarterly" ? 3 : cost.recurrence === "yearly" ? 12 : 0;
            if (stepMonths === 0) continue;

            for (let k = stepMonths; ; k += stepMonths) {
              const lastDay = new Date(baseDate.getFullYear(), baseDate.getMonth() + k + 1, 0).getDate();
              const nextDate = new Date(baseDate.getFullYear(), baseDate.getMonth() + k, Math.min(anchorDay, lastDay));
              if (nextDate > horizon) break;
              if (cost.recurrence_end_date && nextDate > new Date(cost.recurrence_end_date)) break;
              if (nextDate < new Date(rcNow.getFullYear(), rcNow.getMonth(), 1)) continue;

              toInsert.push({
                company_id: company.id,
                name: cost.name,
                cost_type: cost.cost_type,
                amount: cost.amount,
                category: cost.category,
                // "once": l'occorrenza materializza UN mese. Ereditando
                // "monthly" ogni occorrenza contava come voce mensile in piu'
                // nel run-rate dei fissi (madre + N occorrenze = (N+1)x).
                recurrence: "once",
                due_date: nextDate.toISOString().split("T")[0],
                notes: cost.notes,
                supplier_id: cost.supplier_id,
                vat_rate: cost.vat_rate,
                // Contesto completo: senza, l'occorrenza perdeva commessa,
                // riparto, sede e categoria di tesoreria.
                order_id: cost.order_id ?? null,
                allocations: cost.allocations ?? null,
                sede_id: cost.sede_id ?? null,
                treasury_category_id: cost.treasury_category_id ?? null,
                payment_method: cost.payment_method ?? null,
                recurrence_auto: false,
              });
            }
          }

          if (toInsert.length > 0) {
            const { data: inserted } = await supabase
              .from("company_costs")
              .upsert(toInsert, { onConflict: "company_id,name,due_date", ignoreDuplicates: true })
              .select("id");
            results.recurring_costs += inserted?.length ?? 0;
          }
        } catch (rcErr) {
          console.error(`Recurring costs error for company ${company.id}:`, rcErr);
        }
      }
    }

    return jsonResponse({ message: "Scheduled triggers checked", results });
  } catch (err: any) {
    if (err instanceof Response) return err;
    console.error("check-scheduled-triggers error:", err);
    return errorResponse(err.message || String(err), 500);
  }
});
