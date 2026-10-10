// Extract real worker functions without starting Deno. Every query uses memory;
// all network access is forbidden unless a test installs an explicit response stub.
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import vm from "node:vm";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import { evaluateAutomationFilters, matchesAutomationTriggerConfig } from "../../../supabase/functions/_shared/automationFilters";
import { resolveAutomationRecord, automationEntityType, loadAutomationCustomFields, automationEventEntity, automationEventPayload } from "../../../supabase/functions/_shared/automationContext";
import { minutiAllApertura } from "../../../supabase/functions/_shared/finestraFlusso";
import { calendarioDelGiorno, giornoAmmesso, leggiSettimane } from "../../../supabase/functions/_shared/attesaCalendario";
import { numeroWhatsApp } from "../../../supabase/functions/_shared/sequenzaContatto";
import { romaVersoUtc } from "../../../supabase/functions/_shared/appuntamentiPubblici";
import { pickOpenWaNumber } from "../../../supabase/functions/_shared/openwaPickNumber";
import { automationEmailDelayMs } from "../../../supabase/functions/_shared/automationEmail";
import { canaleDelFreno, LIMITE_AL_MINUTO, riprovaDopoFreno } from "../../../supabase/functions/_shared/frenoInvii";
import { actionConfigErrors, conditionConfigErrors, delayConfigErrors } from "../../../supabase/functions/_shared/automationValidation";
import { automationWebhookUrl } from "../../../supabase/functions/_shared/automationWebhook";
import { automationNextContext } from "../../../supabase/functions/_shared/automationNextContext";
import { nomeOpportunitaPulito } from "../../../supabase/functions/_shared/creaAggiornaOpportunita";
import { PLATFORM_ADMIN_COMPANY_ID, PLATFORM_ACTION_IDS, COMPANY_ONLY_ACTION_IDS, PLATFORM_EVENTS, isPlatformCompany } from "../../../supabase/functions/_shared/platformAutomation";
import { escapeEmailValue, emailContentEmpty } from "../../../supabase/functions/_shared/automationEmail";
import { platformSubscriptionPlan } from "../../../supabase/functions/_shared/platformSubscriptionPlan";

const engine = fs.readFileSync("supabase/functions/process-automation/index.ts", "utf8");
const scheduler = fs.readFileSync("supabase/functions/check-scheduled-triggers/index.ts", "utf8");
function load(name: string, globals: Record<string, any> = {}, source = engine): any {
  const ast = ts.createSourceFile("worker.ts", source, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name)!;
  if (!fn) throw new Error(`Missing worker function ${name}`);
  const code = ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return vm.runInNewContext(`${code}; ${name}`, {
    exports: {}, console: { log() {}, warn() {}, error() {} }, Date, Set, Map, Number, String, Response, TextEncoder,
    crypto: webcrypto, fetch: () => { throw new Error("NETWORK FORBIDDEN IN TEST"); },
    UUID_RE: /^[0-9a-f-]{36}$/i, PLATFORM_ACTION_IDS: new Set(), COMPANY_ONLY_ACTION_IDS: new Set(),
    PLATFORM_TRIGGER_EVENT_MAP: {}, isPlatformCompany: () => false, isPlatformEvent: () => false,
    jsonResponse: (body: any, status = 200) => ({ body, status }), completeExecutionRun: async () => {},
    fusoDelFlusso: (s: string) => s || "Europe/Rome", matchesAutomationTriggerConfig, evaluateAutomationFilters,
    resolveAutomationRecord, automationEntityType, loadAutomationCustomFields, automationEventEntity, automationEventPayload,
    actionConfigErrors, conditionConfigErrors, delayConfigErrors,
    automationWebhookUrl,
    automationNextContext,
    nomeOpportunitaPulito,
    completeEnrollmentIfIdle: (...args: any[]) => load("completeEnrollmentIfIdle")(...args),
    markQueueItem: (...args: any[]) => load("markQueueItem")(...args),
    failWaitingTransition: (...args: any[]) => load("failWaitingTransition")(...args),
    canaleDelFreno, LIMITE_AL_MINUTO, riprovaDopoFreno, ...globals,
  });
}
type Call = { table: string; steps: any[][] };
function db(resolver: (q: Call) => any = () => ({ data: [], error: null })) {
  const calls: Call[] = [];
  return { calls, async rpc(table: string, args: Record<string, unknown>) {
    const call = { table, steps: [["rpc", args]] };
    calls.push(call);
    return resolver(call);
  }, from(table: string) {
    const call = { table, steps: [] as any[][] };
    const chain: any = new Proxy({}, { get(_, method) {
      if (method === "then") return (ok: any, bad: any) => { calls.push(call); return Promise.resolve(resolver(call)).then(ok, bad); };
      return (...args: any[]) => { call.steps.push([method, ...args]); return chain; };
    } });
    return chain;
  } };
}
const eq = (q: Call, key: string) => q.steps.find(s => s[0] === "eq" && s[1] === key)?.[2];
const has = (q: Call, method: string) => q.steps.some(s => s[0] === method);
function loadSchedulerHandler(mock: ReturnType<typeof db>, globals: Record<string, any> = {}): any {
  const ast = ts.createSourceFile("scheduler.ts", scheduler, ts.ScriptTarget.Latest, true);
  const statement = ast.statements.find(n => ts.isExpressionStatement(n) && ts.isCallExpression(n.expression) && n.expression.expression.getText(ast) === "serveConMetricheRapida") as ts.ExpressionStatement;
  const handlerText = (statement.expression as ts.CallExpression).arguments[1].getText(ast);
  const code = ts.transpileModule(`const handler = ${handlerText};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  return vm.runInNewContext(`${code};handler`, {
    Date, crypto: webcrypto, TextEncoder, console: { error() {}, log() {}, warn() {} }, createClient: () => mock,
    Deno: { env: { get: () => "test" } }, verifyCronOrAuth: async () => {}, SCHEDULED_EVENT_MAP: {},
    integerSetting: load("integerSetting", {}, scheduler), scheduledRomeDate: load("scheduledRomeDate", {}, scheduler),
    romaVersoUtc: () => new Date(Date.now() + 30 * 60000), emitEventOnce: async () => true,
    jsonResponse: (body: any) => body, errorResponse: (message: string) => { throw new Error(message); },
    fetch: () => { throw new Error("NETWORK FORBIDDEN IN TEST"); }, ...globals,
  });
}
const id = "00000000-0000-4000-a000-000000000001";
const chosen = "00000000-0000-4000-a000-000000000002";
const action = load("executeAction");
const base = { trigger_event: "contact_created", company_id: "company", entity_id: id, entity_type: "contact", payload: {} };
function triggerDb(configs: any[], existing: any[] = [], connections: any[] = []) {
  return db(q => {
    if (q.table === "automation_flows") return { data: [{ id: "flow", version: 1 }], error: null };
    if (q.table === "automation_nodes") return { data: configs.map((config_json, i) => ({ id: `trigger${i}`, flow_id: "flow", config_json })), error: null };
    if (q.table === "automation_connections") return { data: connections, error: null };
    if (q.table === "automation_enrollments") return { data: has(q, "insert") ? { id: "enrollment" } : existing, error: null };
    return { data: [], error: null };
  });
}
describe("automation runtime regressions (isolated)", () => {
  it("event triggers cannot enroll soft-deleted flows", async () => {
    const mock = triggerDb([{ item_id: "contatto_creato" }]);
    await load("handleTrigger")(mock, base);
    const flowQuery = mock.calls.find(q => q.table === "automation_flows")!;
    expect(flowQuery.steps).toContainEqual(["is", "deleted_at", null]);
    expect(flowQuery.steps).toContainEqual(["eq", "status", "published"]);
  });
  it("both cron workers use the shared fast-response wrapper without bypassing authorization", () => {
    expect(engine).toContain('serveConMetricheRapida("process-automation"');
    expect(scheduler).toContain('serveConMetricheRapida("check-scheduled-triggers"');
    expect(engine).toContain("requireInternalSecret(req, corsH)");
    expect(scheduler).toContain("await verifyCronOrAuth(req)");
  });
  it.each([false, true])("opportunity creation resolves the real contact and respects multiple-pipeline setting: %s", async multiple => {
    const mock = db(q => {
      if (has(q, "insert")) return { data: { id: "new-opportunity" } };
      if (q.table === "marketing_contacts") return { data: { id: chosen, first_name: "Cliente" } };
      if (q.table === "marketing_opportunities") return { data: eq(q, "pipeline_id") ? null : { id, contact_id: chosen, pipeline_id: "another-pipeline" } };
      if (q.table === "automation_flows") return { data: { allow_multiple_opportunities: multiple } };
      if (q.table === "marketing_pipelines") return { data: { id } };
      return { data: null };
    });
    const result = await load("executeAction", { resolveContactText: async (_db: any, value: string) => value })(mock,
      { item_id: "crea_opportunita", nome: "Nuova richiesta", valore: "12,50", pipeline_id: id }, id, "company",
      { flow_id: "flow", entity_type: "opportunity" });
    expect(result.success).toBe(true);
    const inserted = mock.calls.find(q => q.table === "marketing_opportunities" && has(q, "insert"));
    if (multiple) {
      expect(inserted?.steps.find(s => s[0] === "insert")?.[1]).toMatchObject({ contact_id: chosen, value: 12.5 });
    } else {
      expect(result.output.skipped).toBe(true);
      expect(inserted).toBeUndefined();
    }
    expect(mock.calls.filter(q => q.table === "marketing_opportunities" && has(q, "update"))).toHaveLength(0);
  });
  it.each(["missing-contact", "missing-pipeline", "invalid-value", "missing-stage"])("opportunity creation fails before writes: %s", async failure => {
    const mock = db(q => ({ data: q.table === "marketing_contacts" ? (failure === "missing-contact" ? null : { id }) : q.table === "marketing_pipelines" && failure !== "missing-pipeline" ? { id } : null }));
    const result = await load("executeAction", { resolveContactText: async (_db: any, value: string) => value })(mock,
      { item_id: "crea_opportunita", nome: "Nuova richiesta", valore: failure === "invalid-value" ? "abc" : 10, pipeline_id: id, ...(failure === "missing-stage" ? { stage_id: chosen } : {}) }, id, "company", {});
    expect(result.success).toBe(false);
    expect(mock.calls.some(q => has(q, "insert") || has(q, "update"))).toBe(false);
    if (failure === "missing-stage") expect(mock.calls.some(q => q.table === "marketing_pipeline_stages" && eq(q, "pipeline_id") === id)).toBe(true);
  });
  it.each(["crea_bozza_ordine", "crea_cantiere", "crea_fattura"])("dynamic money values never silently create zero-value %s", async item_id => {
    const mock = db(q => ({ data: has(q, "insert") ? { id: chosen } : { id, first_name: "Cliente" } }));
    const missing = await action(mock, { item_id, importo: "{{importo}}" }, id, "company", { context_json: { payload: {} } });
    expect(missing.success).toBe(false);
    expect(mock.calls.some(q => has(q, "insert"))).toBe(false);
    const valid = await action(mock, { item_id, importo: "{{importo}}" }, id, "company", { context_json: { payload: { importo: "12,50" } } });
    expect(valid.success).toBe(true);
    const inserted = mock.calls.find(q => has(q, "insert"))!.steps.find(s => s[0] === "insert")![1];
    expect(inserted.total_amount ?? inserted.total).toBe(12.5);
    if (item_id === "crea_fattura") expect(inserted.client_id).toBe(id);
  });
  it("unknown nodes fail visibly instead of pretending to have executed", async () => {
    expect((await load("executeNode")(db(), { node_type: "typo_action", config_json: {} }, {})).success).toBe(false);
  });
  it.each([false, true])("webhook refuses redirects and clears its timeout even on failure: %s", async fail => {
    let cleared = 0;
    let requested: any;
    const result = await load("executeAction", {
      AbortController,
      setTimeout: () => 42,
      clearTimeout: (id: number) => { expect(id).toBe(42); cleared++; },
      fetch: async (_url: string, options: any) => {
        requested = options;
        if (fail) throw new Error("provider unavailable");
        return new Response("ok");
      },
    })(db(), { item_id: "chiama_webhook", url: "https://example.com" }, id, "company", {});
    expect(result.success).toBe(!fail);
    expect(requested.redirect).toBe("error");
    expect(cleared).toBe(1);
  });
  describe.each(["resolveWaitingEnrollments", "processWaitingTimeouts"])("%s transition safety", name => {
    it.each([false, true])("holds the atomic claim until successors exist, insert failure=%s", async failed => {
      const item = { id: "queue", flow_id: "flow", enrollment_id: "enrollment", company_id: "company", entity_id: id, current_node_id: "next", context_json: { waiting_for: "contact_updated", wait_node_id: "wait" } };
      const mock = db(q => {
        if (has(q, "insert")) return failed && q.table === "automation_queue" ? { error: new Error("enqueue unavailable") } : { data: [] };
        if (has(q, "update")) return { data: [{ id: "updated" }] };
        if (q.table === "automation_enrollments") return { data: { status: "waiting" } };
        if (q.table === "automation_queue") return { data: [item] };
        return { data: [{ from_node_id: "wait", to_node_id: "next", label: "event" }] };
      });
      const claims: any[] = [];
      await load(name, {
        canResumeAutomationEnrollment: load("canResumeAutomationEnrollment"),
        prendiInCarico: async (...args: any[]) => { claims.push(args[5]); return { presa: true }; },
      })(mock, { entity_id: id, company_id: "company", trigger_event: "contact_updated" });
      expect(claims[0].status).toBe("processing");
      const insertion = mock.calls.findIndex(q => has(q, "insert"));
      const finalization = mock.calls.findIndex(q => q.table === "automation_queue" && has(q, "update") && eq(q, "id") === "queue");
      expect(insertion).toBeGreaterThan(-1);
      expect(finalization).toBeGreaterThan(insertion);
      if (failed) {
        expect(mock.calls.some(q => q.table === "automation_enrollments" && q.steps.some(s => s[0] === "update" && s[1].status === "failed"))).toBe(true);
        expect(mock.calls.some(q => q.table === "automation_dead_letter" && has(q, "insert"))).toBe(true);
        const queueFailure = mock.calls.find(q => q.table === "automation_queue" && eq(q, "id") === "queue")!;
        expect(queueFailure.steps.find(s => s[0] === "update")![1].last_error).toBe("enqueue unavailable");
      }
      if (name === "resolveWaitingEnrollments") {
        const canceled = mock.calls.find(q => q.table === "automation_queue" && eq(q, "status") === "waiting" && has(q, "update"))!;
        expect(eq(canceled, "context_json->>wait_node_id")).toBe("wait");
        expect(eq(canceled, "company_id")).toBe("company");
        expect(eq(canceled, "flow_id")).toBe("flow");
      }
    });
  });
  describe.each(["resolveWaitingEnrollments", "processWaitingTimeouts"])("%s respects enrollment state", name => {
    it.each(["active", "waiting", "paused", "removed", "canceled", "completed", "failed", null, "read-error"])("resumes only active/waiting, status=%s", async status => {
      const item = { id: "queue", flow_id: "flow", enrollment_id: "enrollment", company_id: "company", entity_id: id, current_node_id: "next", context_json: { waiting_for: "contact_updated", wait_node_id: "wait" } };
      const mock = db(q => {
        if (has(q, "update")) return { data: [{ id: "enrollment" }] };
        if (has(q, "insert")) return { data: [{ id: "next" }] };
        if (q.table === "automation_enrollments") return status === "read-error" ? { error: new Error("database unavailable") } : { data: status ? { status } : null };
        if (q.table === "automation_queue") return { data: [item] };
        if (q.table === "automation_connections") return { data: [{ from_node_id: "wait", to_node_id: "next", label: "event" }] };
        throw new Error(`Unexpected query ${q.table}`);
      });
      let claims = 0;
      const worker = load(name, { canResumeAutomationEnrollment: load("canResumeAutomationEnrollment"), prendiInCarico: async () => { claims++; return { presa: true }; } });
      const attempt = worker(mock, { entity_id: id, company_id: "company", trigger_event: "contact_updated" });
      if (status === "read-error") await expect(attempt).rejects.toThrow("database unavailable"); else await attempt;
      const allowed = status === "active" || status === "waiting";
      expect(claims).toBe(allowed ? 1 : 0);
      expect(mock.calls.filter(q => has(q, "insert"))).toHaveLength(allowed ? 1 : 0);
      if (name === "resolveWaitingEnrollments") expect(eq(mock.calls[0], "company_id")).toBe("company");
      if (allowed) {
        const update = mock.calls.find(q => q.table === "automation_enrollments" && has(q, "update"))!;
        expect(update.steps).toContainEqual(["in", "status", ["active", "waiting"]]);
      } else expect(mock.calls.some(q => has(q, "update"))).toBe(false);
    });
    it("does not enqueue an action if pause/removal wins during resumption", async () => {
      const mock = db(q => {
        if (has(q, "update")) return { data: [] };
        if (q.table === "automation_enrollments") return { data: { status: "waiting" } };
        if (q.table === "automation_queue") return { data: [{ id: "queue", flow_id: "flow", enrollment_id: "enrollment", company_id: "company", entity_id: id, context_json: { waiting_for: "contact_updated", wait_node_id: "wait" } }] };
        return { data: [{ from_node_id: "wait", to_node_id: "next", label: "event" }] };
      });
      await load(name, { canResumeAutomationEnrollment: load("canResumeAutomationEnrollment"), prendiInCarico: async () => ({ presa: true }) })(mock, { entity_id: id, company_id: "company", trigger_event: "contact_updated" });
      expect(mock.calls.some(q => has(q, "insert"))).toBe(false);
    });
  });
  it.each(["paused", "removed", "canceled", "completed", "failed", null, "read-error"])("does not execute a queued action when enrollment is %s", async status => {
    const item = { id: "queue", current_node_id: "node", flow_id: "flow", enrollment_id: "enrollment", entity_id: id, entity_type: "contact", company_id: "company", context_json: {} };
    const mock = db(q => {
      if (has(q, "update")) return { data: [{ id: "queue" }] };
      if (q.table === "automation_queue") return { data: [item] };
      if (q.table === "automation_flows") return { data: [{ id: "flow", status: "published" }] };
      if (q.table === "automation_enrollments") return status === "read-error" ? { error: { message: "database unavailable" } } : { data: status ? { status } : null };
      throw new Error(`Unexpected query: ${q.table}`);
    });
    let claimed = false; let executed = false;
    await load("processQueue", { prendiInCarico: async () => { claimed = true; return { presa: true }; }, executeNode: async () => { executed = true; return { success: true }; } })(mock);
    expect(claimed).toBe(false); expect(executed).toBe(false);
    const stateRead = mock.calls.find(q => q.table === "automation_enrollments")!;
    expect(eq(stateRead, "company_id")).toBe("company"); expect(eq(stateRead, "flow_id")).toBe("flow");
    const writes = mock.calls.filter(q => has(q, "update"));
    if (status === "read-error") expect(writes).toHaveLength(0);
    else {
      expect(writes).toHaveLength(1);
      const update = writes[0].steps.find(s => s[0] === "update")![1];
      expect(eq(writes[0], "status")).toBe("pending");
      if (status === "paused") { expect(update.status).toBeUndefined(); expect(new Date(update.execute_at).getTime()).toBeGreaterThan(Date.now()); }
      else expect(update.status).toBe("cancelled");
    }
  });
  it.each([false, true])("stop only on won pipeline ignores replies and stops only after a win: %s", async won => {
    const item = { id: "queue", current_node_id: "node", flow_id: "flow", enrollment_id: "enrollment", entity_id: id, entity_type: "contact", company_id: "company", context_json: {} };
    const mock = db(q => {
      if (has(q,"update") || has(q,"insert")) return { data: [{id:"updated"}] };
      if (q.table === "automation_queue") return { data: [item] };
      if (q.table === "automation_flows") return { data: has(q,"in") ? [{ id:"flow",status:"published" }] : {stop_on_reply:false,stop_on_won_pipeline_id:"won-pipeline"} };
      if (q.table === "automation_enrollments") return { data: {status:"active",created_at:"2026-09-01"} };
      if (q.table === "marketing_contacts") return { data: {id,email:"test@example.invalid"} };
      if (q.table === "marketing_opportunities") return { data: won ? {id:chosen} : null };
      if (["email_inbox","openwa_messages","whatsapp_messages","marketing_opportunity_stage_history"].includes(q.table)) throw new Error("Replies must not be checked when stop_on_reply is false");
      if (q.table === "automation_nodes") return { data: {id:"node",node_type:"action",config_json:{item_id:"crea_task"}} };
      return {data:null};
    });
    let executed=0;
    await load("processQueue", { OPENWA_PLATFORM_COMPANY_ID:"platform",prendiInCarico:async()=>({presa:true}),dentroLaFinestra:(date:Date)=>date,executeNode:async()=>{executed++;return {success:true};},markQueueItem:async()=>{},queueNextNodes:async()=>{} })(mock);
    expect(executed).toBe(won ? 0 : 1);
    expect(mock.calls.some(q=>["email_inbox","openwa_messages","whatsapp_messages","marketing_opportunity_stage_history"].includes(q.table))).toBe(false);
    expect(eq(mock.calls.find(q=>q.table==="marketing_opportunities")!,"pipeline_id")).toBe("won-pipeline");
    expect(mock.calls.some(q=>q.table==="automation_queue" && q.steps.some(s=>s[0]==="update" && s[1].status==="cancelled"))).toBe(won);
  });
  it.each([false, true])("email delay is applied once per queue entry, resumed=%s", async resumed => {
    const item = { id: "queue", current_node_id: "email", flow_id: "flow", enrollment_id: "enrollment", entity_id: id, entity_type: "contact", company_id: "company", context_json: resumed ? { _email_delay_queue_id: "queue" } : {} };
    const mock = db(q => {
      if (has(q,"update") || has(q,"insert")) return { data: [{id:"updated"}] };
      if (q.table === "automation_queue") return { data: [item] };
      if (q.table === "automation_flows") return { data: has(q,"in") ? [{ id:"flow",status:"published" }] : {} };
      if (q.table === "automation_enrollments") return { data: { status: "active" } };
      if (q.table === "automation_nodes") return { data: { id:"email",node_type:"action",config_json:{item_id:"invia_email",ritardo_valore:2,ritardo_unita:"ore"} } };
      return {data:null};
    });
    let executed=0;
    await load("processQueue", { automationEmailDelayMs, prendiInCarico:async()=>({presa:true}), dentroLaFinestra:(date:Date)=>date, executeNode:async()=>{executed++;return {success:true};},markQueueItem:async()=>{},queueNextNodes:async()=>{} })(mock);
    expect(executed).toBe(resumed ? 1 : 0);
    const delay = mock.calls.filter(q=>q.table==="automation_queue" && has(q,"update")).map(q=>q.steps.find(s=>s[0]==="update")![1]).find(v=>v.context_json?._email_delay_queue_id);
    if (!resumed) expect(new Date(delay.execute_at).getTime()-Date.now()).toBeGreaterThan(7_100_000);
    else expect(delay).toBeUndefined();
  });
  it.each([true, false, "unavailable"])("the send throttle is consulted before dispatch: %s", async slot => {
    const item = { id: "queue", current_node_id: "email", flow_id: "flow", enrollment_id: "enrollment", entity_id: id, entity_type: "contact", company_id: "company", context_json: {} };
    const mock = db(q => {
      if (q.table === "freno_invii_prenota") return slot === "unavailable"
        ? { data: null, error: { message: "temporarily unavailable" } }
        : { data: slot, error: null };
      if (has(q, "update") || has(q, "insert")) return { data: [{ id: "updated" }] };
      if (q.table === "automation_queue") return { data: [item] };
      if (q.table === "automation_flows") return { data: has(q, "in") ? [{ id: "flow", status: "published" }] : {} };
      if (q.table === "automation_enrollments") return { data: { status: "active" } };
      if (q.table === "automation_nodes") return { data: { id: "email", node_type: "action", config_json: { item_id: "invia_email" } } };
      return { data: null };
    });
    let executed = 0;
    await load("processQueue", { automationEmailDelayMs, prendiInCarico: async () => ({ presa: true }),
      dentroLaFinestra: (date: Date) => date, executeNode: async () => { executed++; return { success: true }; },
      markQueueItem: async () => {}, queueNextNodes: async () => {} })(mock);
    expect(mock.calls.find(q => q.table === "freno_invii_prenota")?.steps).toEqual([
      ["rpc", { p_company_id: "company", p_canale: "email", p_limite: LIMITE_AL_MINUTO.email }],
    ]);
    expect(executed).toBe(slot === false ? 0 : 1);
    if (slot === false) {
      const deferred = mock.calls.filter(q => q.table === "automation_queue")
        .flatMap(q => q.steps.filter(s => s[0] === "update").map(s => s[1]))
        .find(update => update.status === "pending");
      expect(new Date(deferred.execute_at).getTime()).toBeGreaterThan(Date.now() + 59_000);
      expect(deferred).not.toHaveProperty("context_json");
    }
  });
  it("WhatsApp selection preserves session metadata and the original record", () => {
    const number = { id, stato: "connected", tags: [] as string[], daily_cap: 10, daily_sent: 0, daily_sent_date: null as string | null, session_id: "mock-session", numero: "+393331234567" };
    const selected = pickOpenWaNumber([number], [], "2026-09-30");
    expect(selected).toBe(number);
    expect(selected?.session_id).toBe("mock-session");
  });
  it.each(["unknown", "constructor", "toString", "__proto__"])("email template rejects unregistered/inherited key %s", async templateName => {
    const render = load("renderEmailTemplate", { TEMPLATE_REGISTRY: { welcome: () => ({}) }, SYSTEM_EMAIL_CONTENT: {}, AVAILABLE_TEMPLATES: ["welcome"] }, fs.readFileSync("supabase/functions/_shared/renderTemplate.ts", "utf8"));
    await expect(render({ templateName, companyId: "company", props: {}, adminClient: {} })).rejects.toThrow("Unknown template");
  });
  it.each([0, "0", undefined, ""])("task deadline preserves zero without inventing a missing deadline (%s)", async scadenza_giorni => {
    const mock = db();
    const execute = load("executeAction", { resolveTaskAssignee: async (): Promise<null> => null, collegamentiDelFlusso: load("collegamentiDelFlusso") });
    expect((await execute(mock, { item_id: "crea_task", scadenza_giorni }, id, "company", {})).success).toBe(true);
    const row = mock.calls.find(q=>q.table === "tasks")!.steps.find(s=>s[0] === "insert")![1];
    expect(row.due_date).toBe(scadenza_giorni === 0 || scadenza_giorni === "0" ? new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" }) : null);
  });
  it.each(["crea_task", "aggiorna_task", "crea_fattura"])("invalid deadline cannot silently become today/default for %s", async item_id => {
    const mock = db();
    expect((await action(mock, { item_id, task_id: chosen, scadenza_giorni: "not-a-number" }, id, "company", {})).success).toBe(false);
    expect(mock.calls.some(q=>has(q,"insert") || has(q,"update"))).toBe(false);
  });
  it("zero days means invoice due today, not in thirty days", async () => {
    const mock = db(() => ({ data: { id, first_name: "Test" } }));
    expect((await action(mock, { item_id: "crea_fattura", scadenza_giorni: 0 }, id, "company", {})).success).toBe(true);
    const row = mock.calls.find(q=>q.table === "invoices")!.steps.find(s=>s[0] === "insert")![1];
    expect(row.due_date).toBe(new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" }));
  });
  it("zero-hour appointment delay waits until the appointment itself", async () => {
    const mock = db(() => ({ data: { appointment_date: "2060-09-30", appointment_time: "11:00" } }));
    const result = await load("executeDelay", { romaVersoUtc })( { delay_tipo: "prima_appuntamento", delay_ore: 0 }, mock, id, "company");
    expect(result.success).toBe(true);
    expect(Math.abs(new Date(result.output.execute_at).getTime() - romaVersoUtc("2060-09-30","11:00").getTime())).toBeLessThan(100);
  });
  it("appointment read failure cannot bypass its delay", async () => {
    const mock = db(() => ({ error: { message: "temporary database failure" } }));
    const result = await load("executeDelay", { romaVersoUtc })({ delay_tipo: "prima_appuntamento" }, mock, id, "company");
    expect(result.success).toBe(false);
    expect(result.isDelay).toBeUndefined();
  });
  it.each(["allowed", "optout", "ambiguous", "missing"])("WhatsApp explicit recipient is scoped and consent checked (%s)", async scenario => {
    const requests: any[] = [];
    const recipient = { id: chosen, optout_whatsapp: scenario === "optout" };
    const mock = db(q => {
      if (q.table === "marketing_contacts") return { data: has(q,"in") ? scenario === "ambiguous" ? [recipient, { id: "other" }] : scenario === "missing" ? [] : [recipient] : { id, phone: "+393331234567" } };
      return { data: [] };
    });
    const send = load("executeSendWhatsApp", {
      numeroWhatsApp, resolveContactText: async (_db: any, text: string) => text,
      Deno: { env: { get: () => "test-only" } },
      fetch: async (_url: string, init: any) => { requests.push(JSON.parse(init.body)); return { ok: true, json: async () => ({ success: true, meta_message_id: "mock-message" }) }; },
    });
    const result = await send(mock, { whatsapp_to: "+393339876543", whatsapp_body: "Test", modello_whatsapp_numero: "test-number" }, id, "company", {});
    expect(result.success).toBe(scenario === "allowed");
    const lookup = mock.calls.find(q=>has(q,"in"))!;
    expect(eq(lookup,"company_id")).toBe("company");
    expect(lookup.steps).toContainEqual(["is","deleted_at",null]);
    if (scenario === "allowed") {
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({ contact_id: chosen, to: "393339876543" });
      expect(mock.calls.find(q=>q.table === "marketing_contact_activities")!.steps.find(s=>s[0] === "insert")![1].contact_id).toBe(chosen);
    } else {
      expect(requests).toHaveLength(0);
      expect(mock.calls.some(q=>has(q,"insert"))).toBe(false);
    }
  });
  it.each([true, false])("reply check stops safely, including database failure (%s)", async replied => {
    const item = { id: "queue", flow_id: "flow", enrollment_id: "enrollment", entity_id: id, entity_type: "contact", company_id: "company", context_json: {} };
    const mock = db(q => {
      if (has(q,"update")) return { data: [{ id: "updated" }] };
      if (q.table === "automation_queue") return { data: [item] };
      if (q.table === "automation_flows") return { data: has(q,"in") ? [{ id: "flow", status: "published" }] : { stop_on_reply: true } };
      if (q.table === "automation_enrollments") return { data: { status: "active", created_at: "2026-09-01" } };
      if (q.table === "marketing_contacts") return { data: { id, email: "test@example.invalid" } };
      if (q.table === "whatsapp_messages") return replied ? { data: { id: "reply" } } : { error: new Error("temporary read failure") };
      return { data: null };
    });
    await load("processQueue", { OPENWA_PLATFORM_COMPANY_ID: "platform", executeNode: () => { throw new Error("Must not execute any action"); } })(mock);
    const updates = mock.calls.filter(q => q.table === "automation_queue" && has(q,"update")).map(q=>q.steps.find(s=>s[0]==="update")![1]);
    expect(updates.length).toBeGreaterThan(0);
    if (replied) expect(updates.every(u=>u.status === "cancelled")).toBe(true);
    else expect(updates[0].last_error).toContain("riprovo prima di inviare");
  });
  it("explicit opportunity variable does not silently update every opportunity", async () => {
    const mock = db(q => ({ data: q.table === "marketing_pipeline_stages" ? { pipeline_id: "pipeline" } : [{ id: chosen }] }));
    const result = await action(mock, { item_id: "sposta_opportunita", stage_id: id, opportunita_id: "{{opportunita.id}}" }, id, "company", { context_json: { payload: { opportunity_id: chosen } } });
    expect(result.success).toBe(true);
    expect(eq(mock.calls.find(q=>has(q,"update"))!,"id")).toBe(chosen);
  });
  it("unresolved qualified ID cannot fall back to the contact ID", async () => {
    const mock = db(q=>({ data: q.table === "marketing_pipeline_stages" ? {pipeline_id:"pipeline"} : [] }));
    const result = await action(mock, { item_id: "sposta_opportunita", stage_id: id, opportunita_id: "{{opportunita.id}}" }, id, "company", { context_json: { payload: { id } } });
    expect(result.success).toBe(false); expect(mock.calls.some(q=>has(q,"update"))).toBe(false);
  });
  it.each([
    ["2026-03-27T20:00:00Z", "2026-03-30T07:00:00.000Z"],
    ["2026-10-23T20:00:00Z", "2026-10-26T08:00:00.000Z"],
    ["2026-09-30T08:00:00Z", "2026-09-30T08:00:00.000Z"],
  ])("time window across daylight saving: %s", (at, expected) => {
    const next = load("dentroLaFinestra", { minutiAllApertura, minutiDelGiorno: load("minutiDelGiorno"), giornoDellaSettimana: load("giornoDellaSettimana"), orarioInMinuti: load("orarioInMinuti") });
    expect(next(new Date(at), { time_window_active: true, timezone: "Europe/Rome", time_window_from: "09:00", time_window_to: "17:00", time_window_sabato: "chiuso", time_window_domenica: "chiuso" }).toISOString()).toBe(expected);
  });
  it("calendar conditions execute without reading a contact record", async () => {
    const mock = db(); const condition = load("executeCondition", { calendarioDelGiorno, romeGiorno: () => ({ anno: 2026, mese: 10, giorno: 6, giornoSettimana: 2 }) });
    expect((await condition(mock, { variabile: "{{calendario.mese}}", operatore: "uguale", valore: 10 }, id, "company")).branch).toBe("yes");
    expect(mock.calls).toHaveLength(0);
  });
  it.each(["opportunity", "contact"])("direct %s record lookup excludes trash", async type => {
    const mock = db(() => ({ data: null }));
    await resolveAutomationRecord(mock, type, id, "company", { entity_type: type });
    expect(mock.calls[0].steps).toContainEqual(["is", "deleted_at", null]);
  });
  it("event fields come from the opportunity, not its enrollment contact", async () => {
    const mock = db(() => ({ data: { id: chosen, assigned_to: "opportunity-owner", tags: ["opportunity-tag"], value: 100 } }));
    const payload = await automationEventPayload(mock, "opportunity_created", "contact", id, "company", { opportunity_id: chosen, value: 50 });
    expect(payload).toMatchObject({ id, assigned_to: "opportunity-owner", tags: ["opportunity-tag"], value: 50 });
    expect(mock.calls[0].table).toBe("marketing_opportunities");
  });
  it("selects a second matching trigger instead of stopping at first rejection", async () => {
    const mock = triggerDb(["facebook", "google"].map(source => ({ item_id: "contatto_creato", fonte_filtro: source })));
    expect((await load("handleTrigger")(mock, { ...base, payload: { source: "google" } })).body.enrolled).toBe(1);
  });
  it.each(["waiting", "paused"])("%s enrollment blocks another enrollment", async status => {
    const mock = triggerDb([{ item_id: "contatto_creato" }], [{ flow_id: "flow", status }]);
    expect((await load("handleTrigger")(mock, base)).body.enrolled).toBe(0);
    expect(mock.calls.some(q => has(q, "insert"))).toBe(false);
  });
  it("scoped scheduler event cannot start another flow", async () => {
    const mock = triggerDb([{ item_id: "contatto_creato" }]);
    expect((await load("handleTrigger")(mock, { ...base, payload: { _automation_flow_id: "other" } })).body.enrolled).toBe(0);
  });
  it("scoped event cannot start a different trigger of the same flow", async () => {
    const mock = triggerDb([{ item_id: "contatto_creato" }]);
    expect((await load("handleTrigger")(mock, { ...base, payload: { _automation_trigger_id: "other" } })).body.enrolled).toBe(0);
  });
  it("old browser test request is rejected without any database access", async () => {
    const mock = db();
    expect((await load("handleTrigger")(mock, { ...base, payload: { dry_run: true } })).status).toBe(400);
    expect(mock.calls).toHaveLength(0);
  });
  it("batch read failure does not pretend no flow matched", async () => {
    const mock = db(q => q.table === "automation_flows" ? { data: [{ id: "flow", version: 1 }] } : { error: new Error("database unavailable") });
    await expect(load("handleTrigger")(mock, base)).rejects.toThrow("database unavailable");
  });
  it("preserves the event payload when queueing the first action", async () => {
    const mock = triggerDb([{ item_id: "contatto_creato" }], [], [{ flow_id: "flow", from_node_id: "trigger0", to_node_id: "action" }]);
    await load("handleTrigger")(mock, { ...base, payload: { source: "google", appointment_id: chosen } });
    const queued = mock.calls.find(q => q.table === "automation_queue")!.steps.find(s => s[0] === "insert")![1];
    expect(queued.context_json.payload).toMatchObject({ id, source: "google", appointment_id: chosen });
  });
  it.each([10, 101])("goal evaluates the configured score (%s), not unconditional success", async score => {
    const condition = load("executeCondition");
    const execute = load("executeNode", { executeCondition: condition });
    const result = await execute(db(() => ({ data: { id, score } })), { node_type: "goal", config_json: { variabile: "{{contatto.score}}", operatore: "maggiore", valore: 100 } }, { entity_id: id, company_id: "company" });
    expect(result.output.reached).toBe(score > 100);
  });
  it("processes waiting timeouts even when there are no incoming events", async () => {
    let n = 0; await load("processTriggerEvents", { processWaitingTimeouts: async () => { n++; } })(db()); expect(n).toBe(1);
  });
  it.each(["aggiungi_tag", "assegna_agente", "aggiorna_punteggio", "crea_bozza_ordine", "invia_email", "chiama_webhook"])("dry run never writes or sends for %s", async item_id => {
    const mock = db(); const result = await action(mock, { item_id }, id, "company", { context_json: { payload: { dry_run: true } } });
    expect(result.output.simulated).toBe(true); expect(mock.calls).toHaveLength(0);
  });
  it("uses the explicitly selected task", async () => {
    const mock = db(() => ({ data: [{ id: chosen }] }));
    const result = await action(mock, { item_id: "aggiorna_task", task_id: chosen, stato: "completata" }, id, "company", {});
    expect(result.success).toBe(true); expect(eq(mock.calls.find(q => has(q, "update"))!, "id")).toBe(chosen);
  });
  it("updates opportunity assignee rather than the contact", async () => {
    const mock = db(q => ({ data: has(q, "update") ? [{ id: chosen }] : { id: q.table === "marketing_contacts" ? id : chosen } }));
    const result = await action(mock, { item_id: "assegna_agente", entity_type: "opportunities", agente_id: "worker" }, id, "company", { context_json: { payload: { opportunity_id: chosen } } });
    expect(result.success).toBe(true); const update = mock.calls.find(q => has(q, "update"))!;
    expect(update.table).toBe("marketing_opportunities"); expect(eq(update,"id")).toBe(chosen);
  });
  it("does not report success after score read error", async () => {
    const result = await action(db(() => ({ data: null, error: { message: "read failed" } })), { item_id: "aggiorna_punteggio", score_value: 10 }, id, "company", {});
    expect(result.success).toBe(false); expect(result.error).toBe("read failed");
  });
  it("does not report success when zero records are changed", async () => {
    const result = await action(db(), { item_id: "aggiorna_campo", campo: "description", tabella: "orders", valore: 0 }, id, "company", {});
    expect(result.success).toBe(false);
  });
  it("zero days creates today's appointment", async () => {
    const mock = db(() => ({ data: { id: chosen } }));
    await action(mock, { item_id: "crea_appuntamento", giorni_da_oggi: 0 }, id, "company", {});
    const row = mock.calls.find(q => has(q, "insert"))!.steps.find(s => s[0] === "insert")![1];
    expect(row.appointment_date).toBe(new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" }));
  });
  it("uses the configured customer when creating an order", async () => {
    const mock = db(q => ({ data: q.table === "marketing_contacts" ? { id: eq(q,"id"), customer_profile_id: "selected-profile", first_name: "Selected" } : { id: "order" } }));
    expect((await action(mock, { item_id: "crea_bozza_ordine", cliente_id: chosen }, id, "company", {})).success).toBe(true);
    expect(eq(mock.calls[0], "id")).toBe(chosen);
    expect(mock.calls.find(q => q.table === "orders")!.steps.find(s => s[0] === "insert")![1].customer_id).toBe("selected-profile");
  });
  it("cross-tenant source never falls back to another contact", async () => {
    const mock = db(() => ({ data: null }));
    expect(await resolveAutomationRecord(mock, "contact", id, "company", { entity_type: "invoice" })).toBeNull();
    expect(mock.calls).toHaveLength(1); expect(eq(mock.calls[0], "company_id")).toBe("company");
  });
  it("opportunity-linked condition uses the event record, not latest unrelated opportunity", async () => {
    const mock = db(q => ({ data: { id: eq(q,"id"), status: "won" } }));
    const result = await load("executeCondition")(mock, { variabile: "{{opportunita.status}}", operatore: "uguale", valore: "won" }, id, "company", { context_json: { payload: { opportunity_id: chosen } } });
    expect(result.branch).toBe("yes"); expect(eq(mock.calls.at(-1)!,"id")).toBe(chosen);
  });
  it("scheduled occurrence key includes flow, trigger and date", async () => {
    const mock = db(); const emit = load("emitEventOnce", {}, scheduler);
    const emitFor = (flow: string, occurrence: string) => emit(mock, "company", "birthday_reminder", id, "contact", { _automation_flow_id: flow, _automation_trigger_id: "trigger", _automation_occurrence: occurrence });
    await emitFor("a","2026"); await emitFor("a","2026"); await emitFor("b","2026"); await emitFor("a","2027");
    const keys = mock.calls.map(q => q.steps.find(s => s[0] === "insert")![1].dedup_key);
    expect(keys[0]).toBe(keys[1]); expect(new Set(keys).size).toBe(3);
  });
  it("scheduler unique conflict is a dedup, other errors are propagated", async () => {
    const emit = load("emitEventOnce", {}, scheduler);
    expect(await emit(db(() => ({ error: { code: "23505" } })), "c", "e", id, "contact", {})).toBe(false);
    await expect(emit(db(() => ({ error: new Error("db offline") })), "c", "e", id, "contact", {})).rejects.toThrow("db offline");
  });
  it("global scheduler rejects a normal user token", async () => {
    const verify = load("verifyCronOrAuth", {
      Deno: { env: { get: (k: string) => ({ SUPABASE_URL: "https://invalid.example", SUPABASE_ANON_KEY: "test" } as any)[k] } },
      secureHeaders: {}, getCorsHeaders: () => ({}), requireInternalSecret: () => { throw new Error("Internal authorization required"); },
    }, scheduler);
    await expect(verify(new Request("https://invalid.example", { headers: { Authorization: "Bearer user-token" } }))).rejects.toThrow("Internal authorization required");
  });
});

describe("automation audit regressions", () => {
  const item = { id: "queue", enrollment_id: "enrollment", flow_id: "flow", company_id: "company", entity_id: id, entity_type: "contact", context_json: { payload: {} } };
  it("worker and scheduler parse without syntax errors", () => {
    for (const source of [engine, scheduler]) expect((ts.createSourceFile("worker.ts", source, ts.ScriptTarget.Latest, true) as any).parseDiagnostics).toEqual([]);
  });
  it.each([
    ["order_overdue", "orders"], ["task_overdue", "tasks"], ["invoice_overdue", "invoices"],
    ["quote_expiring", "quotes"], ["quote_unanswered", "quotes"], ["manutenzione_scheduled", "piani_manutenzione"],
    ["contratto_manut_expiring", "contratti_manutenzione"], ["order_work_completed", "orders"],
    ["ticket_unanswered", "tickets"], ["contract_expiring", "hr_profili"], ["site_overdue", "orders"],
  ])("%s reports a %s query failure and continues other flows", async (trigger, table) => {
    const mock = db(q => {
      if (q.table === "automation_flows") return { data: [{ id: "bad", company_id: "company" }, { id: "good", company_id: "company" }] };
      if (q.table === "automation_nodes") return { data: [{ id: eq(q, "flow_id"), config_json: { trigger_event: eq(q, "flow_id") === "bad" ? trigger : "appointment_reminder", minutes_before: 60 } }] };
      if (q.table === table) return { data: null, error: { message: "database unavailable" } };
      if (q.table === "appointments" && q.steps.some(s => s[0] === "select" && String(s[1]).includes("calendar_id"))) return { data: [{ id: chosen, contact_id: id, appointment_date: "2030-01-01", appointment_time: "10:00" }] };
      return { data: [] };
    });
    const response = await loadSchedulerHandler(mock)(new Request("https://invalid.example", { method: "POST", body: "{}" }));
    expect(response.results.failed_triggers).toBe(1);
    expect(response.results.appointment_reminder).toBe(1);
  });
  it.each([
    ["2026-10-09T22:30:00Z", 0, "2026-10-10"],
    ["2026-03-28T23:30:00Z", 1, "2026-03-30"],
    ["2026-10-24T22:30:00Z", 1, "2026-10-26"],
    ["2026-10-09T22:30:00Z", -1, "2026-10-09"],
  ])("scheduled date-only cutoffs use Rome calendar days (%s, %s)", (at, offset, expected) => {
    expect(load("scheduledRomeDate", {}, scheduler)(offset, new Date(at))).toBe(expected);
  });
  it.each(["graph-read", "empty-graph", "enrollment", "run", "queue", "flow-read", "foreign-flow"])("direct cron/manual start cannot report success after %s failure", async failure => {
    const mock = db(q => {
      if (q.table === "automation_flows") return failure === "flow-read" ? { error: new Error("offline") } : { data: failure === "foreign-flow" ? null : { version: 3, status: "published" } };
      if (q.table === "automation_connections") return failure === "graph-read" ? { error: new Error("offline") } : { data: failure === "empty-graph" ? [] : [{ to_node_id: "next" }] };
      if (has(q, "update")) return { data: [] };
      if (q.table === "automation_enrollments") return failure === "enrollment" ? { error: new Error("offline") } : { data: { id: "enrollment" } };
      if ((q.table === "flow_execution_runs" && failure === "run") || (q.table === "automation_queue" && failure === "queue")) return { error: new Error("offline") };
      return { data: [] };
    });
    await expect(load("enrollFlowDirect", {}, scheduler)(mock, "flow", "company", "trigger", id, "contact", {})).rejects.toBeTruthy();
    if (["graph-read", "empty-graph", "flow-read", "foreign-flow"].includes(failure)) expect(mock.calls.some(q => has(q, "insert"))).toBe(false);
    if (["run", "queue"].includes(failure)) {
      const closed = mock.calls.find(q => q.table === "flow_execution_runs" && has(q, "update"))!;
      expect(closed.steps.find(s => s[0] === "update")![1]).toHaveProperty("ended_at");
      expect(closed.steps.find(s => s[0] === "update")![1]).not.toHaveProperty("completed_at");
      expect(mock.calls.some(q => q.table === "automation_enrollments" && has(q, "update"))).toBe(true);
    }
  });
  it("direct start registers the run before atomically queuing all initial branches", async () => {
    const mock = db(q => ({ data: q.table === "automation_flows" ? { version: 3, status: "published" } : q.table === "automation_connections" ? [{ to_node_id: "one" }, { to_node_id: "two" }] : q.table === "automation_enrollments" ? { id: "enrollment" } : [] }));
    expect(await load("enrollFlowDirect", {}, scheduler)(mock, "flow", "company", "trigger", id, "contact", { title: "Test" })).toBe("enrollment");
    const queued = mock.calls.filter(q => q.table === "automation_queue" && has(q, "insert"));
    expect(queued).toHaveLength(1);
    expect(queued[0].steps.find(s => s[0] === "insert")![1]).toHaveLength(2);
    expect(mock.calls.findIndex(q => q.table === "flow_execution_runs")).toBeLessThan(mock.calls.indexOf(queued[0]));
    expect(eq(mock.calls[0], "company_id")).toBe("company");
  });
  it("manual variables identify the authenticated starter, never a user supplied by the payload", async () => {
    const mock = db(q => ({ data: q.table === "automation_flows" ? { id: "flow", status: "published" } : [{ id: "trigger", node_type: "trigger" }] }));
    let passedPayload: any;
    let checkedCompany: any;
    const manual = load("handleManualRun", {
      getCorsHeaders: () => ({}), Deno: { env: { get: () => "internal-secret" } },
      requireAuth: async () => ({ userId: id, supabaseAdmin: mock }),
      requireCompanyAccess: async (_db: any, user: string, company: string) => { checkedCompany = [user, company]; },
      enrollFlowDirect: async (...args: any[]) => { passedPayload = args[6]; return "enrollment"; },
    }, scheduler);
    const response = await manual(new Request("https://invalid.example", { headers: { Authorization: "Bearer fake-unit-test" } }), mock,
      { flow_id: "flow", company_id: "company", entity_id: chosen, payload: { avviato_da: "spoofed", timestamp: "fake", title: "Test" } });
    expect(response.body.enrollment_id).toBe("enrollment");
    expect(checkedCompany).toEqual([id, "company"]);
    expect(passedPayload).toMatchObject({ avviato_da: id, title: "Test", manual: true });
    expect(new Date(passedPayload.timestamp).getTime()).toBeGreaterThan(Date.now() - 10000);
  });
  it("a malformed scheduled reminder does not abort the next flow", async () => {
    const mock = db(q => {
      if (q.table === "automation_flows") return { data: [{ id: "bad", company_id: "company" }, { id: "good", company_id: "company" }] };
      if (q.table === "automation_nodes") return { data: [{ id: eq(q, "flow_id"), config_json: { trigger_event: "appointment_reminder", minutes_before: eq(q, "flow_id") === "bad" ? -1 : 60 } }] };
      if (q.table === "appointments") return { data: [{ id: chosen, contact_id: id, appointment_date: "2030-01-01", appointment_time: "10:00" }] };
      throw new Error("Unexpected scheduler query " + q.table);
    });
    const ast = ts.createSourceFile("scheduler.ts", scheduler, ts.ScriptTarget.Latest, true);
    const statement = ast.statements.find(n => ts.isExpressionStatement(n) && ts.isCallExpression(n.expression) && n.expression.expression.getText(ast) === "serveConMetricheRapida") as ts.ExpressionStatement;
    const handlerText = (statement.expression as ts.CallExpression).arguments[1].getText(ast);
    const code = ts.transpileModule(`const handler = ${handlerText};`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
    let emitted = 0;
    const handler = vm.runInNewContext(`${code};handler`, { Date, console: { error() {} }, createClient: () => mock,
      Deno: { env: { get: () => "test" } }, verifyCronOrAuth: async () => {}, SCHEDULED_EVENT_MAP: {},
      romaVersoUtc: () => new Date(Date.now() + 30 * 60000), emitEventOnce: async () => { emitted++; return true; },
      jsonResponse: (body: any) => body, errorResponse: (message: string) => { throw new Error(message); },
    });
    const response = await handler(new Request("https://invalid.example", { method: "POST", body: JSON.stringify({ mode: "appointment_triggers_only" }) }));
    expect(response.results.failed_triggers).toBe(1);
    expect(response.results.appointment_reminder).toBe(1);
    expect(emitted).toBe(1);
  });
  it.each(["pending", "processing", "waiting"])("does not close an enrollment while another step is %s", async status => {
    const mock = db(q => ({ data: q.table === "automation_queue" ? [{ id: "sibling", status }] : [] }));
    await load("completeEnrollmentIfIdle")(mock, item);
    expect(mock.calls.some(q => has(q, "update"))).toBe(false);
    expect(eq(mock.calls[0], "company_id")).toBe("company");
    expect(eq(mock.calls[0], "flow_id")).toBe("flow");
  });
  it("closes only an active/waiting enrollment after the last branch", async () => {
    let runsClosed = 0;
    const mock = db(q => ({ data: q.table === "automation_queue" ? [] : [{ id: "enrollment" }] }));
    await load("completeEnrollmentIfIdle", { completeExecutionRun: async () => { runsClosed++; } })(mock, item);
    expect(runsClosed).toBe(1);
    const write = mock.calls.find(q => has(q, "update"))!;
    expect(write.steps).toContainEqual(["in", "status", ["active", "waiting"]]);
  });
  it("pause/removal winning the final update is preserved", async () => {
    let runsClosed = 0;
    await load("completeEnrollmentIfIdle", { completeExecutionRun: async () => { runsClosed++; } })(db(), item);
    expect(runsClosed).toBe(0);
  });
  it("a queue read failure cannot be interpreted as an empty queue", async () => {
    const mock = db(() => ({ error: new Error("offline") }));
    await expect(load("completeEnrollmentIfIdle")(mock, item)).rejects.toThrow("offline");
    expect(mock.calls.some(q => has(q, "update"))).toBe(false);
  });
  it("a leaf cannot directly terminate an enrollment", async () => {
    const mock = db();
    await load("queueNextNodes")(mock, item, { id: "leaf", node_type: "action" }, { success: true });
    expect(mock.calls.some(q => q.table === "automation_enrollments")).toBe(false);
  });
  it("drip queues every repeat and propagates insertion errors", async () => {
    const resolver = (q: Call): any => ({ data: q.table === "automation_connections" ? [{ to_node_id: "leaf" }] : [], error: null });
    const mock = db(resolver);
    await load("queueNextNodes")(mock, item, { id: "drip", node_type: "action" }, { isDrip: true, dripCount: 3, dripIntervalMs: 60000 });
    expect(mock.calls.filter(q => has(q, "insert"))).toHaveLength(3);
    const failed = db(q => has(q, "insert") ? { error: new Error("insert failed") } : resolver(q));
    await expect(load("queueNextNodes")(failed, item, { id: "drip" }, { isDrip: true, dripCount: 3 })).rejects.toThrow("insert failed");
  });
  it.each([
    ["2026-10-24T12:00:00Z", "2026-10-25T08:00:00.000Z"],
    ["2026-03-28T12:00:00Z", "2026-03-29T07:00:00.000Z"],
  ])("until 09:00 uses local clock through DST from %s", async (now, expected) => {
    class FixedDate extends Date { constructor(value?: any) { super(value ?? now); } static now() { return new Date(now).getTime(); } }
    const execute = load("executeDelay", { Date: FixedDate, romaVersoUtc, leggiSettimane, giornoAmmesso });
    const result = await execute({ delay_tipo: "fino_a", delay_orario: "09:00", delay_giorni_settimana: [0, 1, 2, 3, 4, 5, 6] });
    expect(result.success).toBe(true);
    expect(result.output.execute_at).toBe(expected);
  });
  it("ends-with from the condition editor executes correctly", async () => {
    const mock = db(() => ({ data: { id, email: "mario@azienda.it" } }));
    const result = await load("executeCondition")(mock, { condizioni: [{ campo: "contatto.email", operatore: "finisce_con", valore: "@azienda.it" }] }, id, "company", item);
    expect(result.branch).toBe("yes");
  });
  it("an empty condition fails instead of silently taking the no branch", async () => {
    expect((await load("executeCondition")(db(), {}, id, "company", item)).success).toBe(false);
  });
  it("payment context follows stored invoice FK to the actual customer", async () => {
    const mock = db(q => ({ data: q.table === "invoice_payments" ? { id, invoice_id: "invoice" } : q.table === "invoices" ? { id: "invoice", client_id: chosen } : { id: chosen, email: "customer@example.it" } }));
    const queue = { entity_type: "payment", context_json: { payload: { fattura_id: "untrusted" } } };
    expect((await resolveAutomationRecord(mock, "contact", id, "company", queue)).id).toBe(chosen);
    expect(eq(mock.calls.find(q => q.table === "invoices")!, "id")).toBe("invoice");
    expect(mock.calls.every(q => eq(q, "company_id") === "company")).toBe(true);
  });
  it("a missing/cross-tenant payment cannot borrow a customer from the payload", async () => {
    expect(await resolveAutomationRecord(db(() => ({ data: null })), "contact", id, "company", { entity_type: "payment", context_json: { payload: { contact_id: chosen, fattura_id: chosen } } })).toBeNull();
  });
  it("fixed appointments resolve variables and save the tenant calendar", async () => {
    const mock = db(q => ({ data: q.table === "marketing_contacts" ? { id, first_name: "Mario" } : q.table === "marketing_calendars" ? { id: chosen, is_active: true } : { id: "appointment" } }));
    const result = await action(mock, { item_id: "crea_appuntamento", titolo: "Chiama {{contatto.full_name}}", contact_id: "{{contatto.id}}", calendario_id: chosen, giorni_da_oggi: 0 }, id, "company", { ...item, context_json: { payload: { "contatto.full_name": "Mario Rossi" } } });
    expect(result.success).toBe(true);
    const row = mock.calls.find(q => has(q, "insert"))!.steps.find(s => s[0] === "insert")![1];
    expect(row).toMatchObject({ title: "Chiama Mario Rossi", contact_id: id, calendar_id: chosen });
  });
  it.each([null, { id: chosen, is_active: false }])("refuses unavailable calendars: %j", async calendar => {
    const mock = db(q => ({ data: q.table === "marketing_contacts" ? { id } : calendar }));
    expect((await action(mock, { item_id: "crea_appuntamento", calendario_id: chosen }, id, "company", item)).success).toBe(false);
    expect(mock.calls.some(q => has(q, "insert"))).toBe(false);
  });
  it("AI honors the selected agent and carries the trigger context to email", async () => {
    let router: any; let dispatched: any;
    const mock = db(q => ({ data: q.table === "marketing_contacts" ? { id, first_name: "Mario", email: "mario@example.it" } : { id: chosen, system_prompt: "Sei il consulente serramenti." } }));
    const worker = load("executeAction", {
      aiRouterComplete: async (params: any) => { router = params; return { content: "SUBJECT: Prova\nBODY: Testo" }; },
      resolveContactText: async (_db: any, text: string) => text,
      executeSendEmail: async (...args: any[]) => { dispatched = args; return { success: true }; },
      queueSafeId: () => "test", Deno: { env: { get: () => "https://invalid.example" } },
    });
    expect((await worker(mock, { item_id: "esegui_agente_ai", agent_id: chosen }, id, "company", item)).success).toBe(true);
    expect(router.messages[0].content).toContain("Sei il consulente serramenti.");
    expect(dispatched[4]).toBe(item);
    expect(eq(mock.calls.find(q => q.table === "ai_agents")!, "company_id")).toBe("company");
  });
  it("AI cannot invoke a missing/foreign agent or bypass SMS opt-out", async () => {
    let calls = 0;
    const worker = load("executeAction", {
      aiRouterComplete: async () => { calls++; return { content: "Testo" }; }, resolveContactText: async (_db: any, text: string) => text,
      queueSafeId: () => "test", Deno: { env: { get: () => "https://invalid.example" } },
      executeAction: (...args: any[]) => action(...args),
    });
    const foreign = db(q => ({ data: q.table === "marketing_contacts" ? { id } : null }));
    expect((await worker(foreign, { item_id: "esegui_agente_ai", agent_id: chosen }, id, "company", item)).success).toBe(false);
    expect(calls).toBe(0);
    const optedOut = db(() => ({ data: { id, phone: "+393331234567", optout_sms: true } }));
    const result = await worker(optedOut, { item_id: "esegui_agente_ai", ai_channel: "sms" }, id, "company", item);
    expect(result.success).toBe(false);
    expect(result.error).toContain("opted out");
  });
});

describe("superadmin actions: real handlers with isolated providers", () => {
  const actorId = "00000000-0000-4000-a000-000000000003";
  const queue = { id: "queue-1", flow_id: "flow", entity_type: "company", context_json: { payload: { "azienda.id": id, "azienda.email": "admin@example.it" } } };
  const globals = {
    PLATFORM_ADMIN_COMPANY_ID, PLATFORM_ACTION_IDS, COMPANY_ONLY_ACTION_IDS, PLATFORM_EVENTS, isPlatformCompany,
    flowAuthorIsAllowedSuperAdmin: async () => true,
    resolveUserEmail: async () => "admin@example.it",
    escapeEmailValue, generateTempPassword: () => "test-password-never-sent",
    swallow: async (p: Promise<unknown>) => { try { await p; } catch {} },
    emitPlatformEvent: async () => true,
    creaFasiCommessa: async () => ({ fasi: 4 }),
    platformCompanyAdmin: async () => ({ userId: actorId, email: "admin@example.it" }),
    platformSubscriptionPlan,
    emailContentEmpty,
    brandEmailBody: async (_s: unknown, _c: unknown, body: string) => ({ html: body, text: body }),
    sendEmailUnified: async () => ({ ok: true }),
  };
  const platformDb = (resolver?: (q: Call) => any) => db(q => {
    if (q.table === "companies" && !has(q, "insert")) return { data: { id, email: "admin@example.it" }, error: null };
    if (q.table === "automation_flows") return { data: { created_by: actorId }, error: null };
    return resolver?.(q) ?? { data: { id: chosen }, error: null };
  });
  const run = (mock: any, cfg: Record<string, any>, overrides = {}, item = queue) => load("executeAction", { ...globals, ...overrides })(mock, cfg, id, PLATFORM_ADMIN_COMPANY_ID, item);
  it("never treats a CRM contact ID as an existing target company", async () => {
    const mock = platformDb();
    const result = await run(mock, { item_id: "aggiungi_nota_azienda", testo: "Note" }, {}, { ...queue, entity_type: "contact", context_json: { payload: {} } } as any);
    expect(result.success).toBe(false);
    expect(mock.calls.some(q => has(q, "insert"))).toBe(false);
  });
  it("rejects company actions in the platform area and vice versa", async () => {
    const fn = load("executeAction", globals);
    expect((await fn(db(), { item_id: "crea_cantiere" }, id, PLATFORM_ADMIN_COMPANY_ID, queue)).success).toBe(false);
    expect((await fn(db(), { item_id: "crea_account_azienda" }, id, id, queue)).success).toBe(false);
    expect((await fn(db(), { item_id: "invia_whatsapp_locale" }, id, id, queue)).success).toBe(false);
  });
  it("local WhatsApp cannot read a foreign or trashed contact", async () => {
    const mock = db(() => ({ data: null, error: { message: "not found" } }));
    const wa = load("executeSendWhatsAppLocale", { OPENWA_PLATFORM_COMPANY_ID: PLATFORM_ADMIN_COMPANY_ID });
    expect((await wa(mock, {}, id, PLATFORM_ADMIN_COMPANY_ID)).success).toBe(false);
    expect(eq(mock.calls[0], "company_id")).toBe(PLATFORM_ADMIN_COMPANY_ID);
    expect(mock.calls[0].steps).toContainEqual(["is", "deleted_at", null]);
  });
  it("requires the current role as well as the email allowlist and platform-owned flow", async () => {
    const guard = load("flowAuthorIsAllowedSuperAdmin", { PLATFORM_ADMIN_COMPANY_ID, resolveUserEmail: async () => "allowed@example.it", isSuperAdminEmailAllowed: () => true });
    const missingRole = db(q => ({ data: q.table === "automation_flows" ? { created_by: actorId } : null, error: null }));
    expect(await guard(missingRole, "flow")).toBe(false);
    expect(eq(missingRole.calls[0], "company_id")).toBe(PLATFORM_ADMIN_COMPANY_ID);
    const allowed = db(q => ({ data: q.table === "automation_flows" ? { created_by: actorId } : { user_id: actorId }, error: null }));
    expect(await guard(allowed, "flow")).toBe(true);
    const forbidden = load("flowAuthorIsAllowedSuperAdmin", { PLATFORM_ADMIN_COMPANY_ID, resolveUserEmail: async () => "forbidden@example.it", isSuperAdminEmailAllowed: () => false });
    expect(await forbidden(allowed, "flow")).toBe(false);
  });
  it("emails use platform branding/sender, do not charge tenant credits, and surface provider failure", async () => {
    let args: any, brandingId: any;
    const result = await run(platformDb(), { item_id: "invia_email_admin_azienda", oggetto: "Prova", corpo: "Ciao" }, {
      brandEmailBody: async (_s: unknown, company: string, body: string) => { brandingId = company; return { html: body, text: body }; },
      sendEmailUnified: async (input: any) => { args = input; return { ok: false, status: 503 }; },
    });
    expect(result.success).toBe(false); expect(brandingId).toBe(PLATFORM_ADMIN_COMPANY_ID);
    expect(args).toMatchObject({ companyId: id, platformSender: true, skipCredits: true });
  });
  it("email team notifications actually send emails; no in-app insert is substituted", async () => {
    const mock = platformDb(q => q.table === "user_roles" ? { data: [{ user_id: actorId }], error: null } : undefined);
    let sent = 0;
    const result = await run(mock, { item_id: "invia_notifica_team_admin", canale: "email", messaggio: "Prova" }, { sendEmailUnified: async () => { sent++; return { ok: true }; } });
    expect(result.success).toBe(true); expect(sent).toBe(1);
    expect(mock.calls.some(q => q.table === "notifications" && has(q, "insert"))).toBe(false);
  });
  it("failed team notifications or role reads cannot report green success", async () => {
    const mock = platformDb(q => q.table === "user_roles" ? { data: [{ user_id: actorId }], error: null } : undefined);
    expect((await run(mock, { item_id: "invia_notifica_team_admin", canale: "email" }, { sendEmailUnified: async () => ({ ok: false }) })).success).toBe(false);
    const broken = platformDb(q => q.table === "user_roles" ? { data: null, error: { message: "read failed" } } : undefined);
    expect((await run(broken, { item_id: "invia_notifica_team_admin" })).success).toBe(false);
  });
  it("CS tasks and notes record the actual flow author", async () => {
    for (const cfg of [{ item_id: "crea_cs_task", titolo: "Follow up", scadenza_giorni: 0 }, { item_id: "aggiungi_nota_azienda", testo: "Nota" }]) {
      const mock = platformDb();
      expect((await run(mock, cfg)).success).toBe(true);
      const insert = mock.calls.find(q => has(q, "insert"))!;
      const row = insert.steps.find(s => s[0] === "insert")![1];
      expect(row.created_by ?? row.author_id).toBe(actorId);
    }
  });
  it("a missing provisioning plan fails before an auth user is created", async () => {
    let created = false;
    const mock: any = platformDb(q => q.table === "subscription_plans" ? { data: null, error: null } : undefined);
    mock.auth = { admin: { createUser: async () => { created = true; } } };
    expect((await run(mock, { item_id: "crea_account_azienda", piano: "missing", email: "new@example.it" })).success).toBe(false);
    expect(created).toBe(false);
  });
  const provisioning = (roleFails = false) => {
    const mock: any = db(q => {
      if (q.table === "subscription_plans") return { data: { id: chosen, trial_days: 14 }, error: null };
      if (q.table === "user_roles" && roleFails) return { data: null, error: { message: "role failed" } };
      return { data: { id: chosen }, error: null };
    });
    let deleted = 0;
    mock.auth = { admin: { createUser: async (): Promise<{ data: { user: { id: string } }; error: null }> => ({ data: { user: { id: actorId } }, error: null }), deleteUser: async () => { deleted++; return {}; }, generateLink: async (): Promise<{ data: { properties: { action_link: string } }; error: null }> => ({ data: { properties: { action_link: "https://example.test/one-use-link" } }, error: null }) } };
    return { mock, deleted: () => deleted };
  };
  it.each([0, "0"])("preserves explicit zero trial even when the plan defaults to 14 days: %s", async trial => {
    const { mock } = provisioning();
    const result = await run(mock, { item_id: "crea_account_azienda", piano: "pro", email: "new@example.it", trial_giorni: trial, invia_credenziali: "no" });
    expect(result.success).toBe(true);
    const companyInsert = mock.calls.find((q: Call) => q.table === "companies" && has(q, "insert"));
    const row = companyInsert.steps.find((s: any[]) => s[0] === "insert")[1];
    expect(row.status).toBe("active"); expect(row.trial_ends_at).toBeNull();
  });
  it("role failure is rolled back and never emits a successful new-company event", async () => {
    const { mock, deleted } = provisioning(true); let events = 0;
    const result = await run(mock, { item_id: "crea_account_azienda", piano: "pro", email: "new@example.it" }, { emitPlatformEvent: async () => { events++; return true; } });
    expect(result.success).toBe(false); expect(deleted()).toBe(1); expect(events).toBe(0);
  });
  it("access email includes a personal recovery link, not the generated password", async () => {
    const { mock } = provisioning(); let email: any;
    const result = await run(mock, { item_id: "crea_account_azienda", piano: "pro", email: "new@example.it", nome: "<script>x</script>" }, { sendEmailUnified: async (args: any) => { email = args; return { ok: true }; } });
    expect(result.success).toBe(true); expect(email.html).toContain("one-use-link");
    expect(email.html).not.toContain("test-password-never-sent"); expect(email.html).not.toContain("<script>");
    expect(email).toMatchObject({ platformSender: true, skipCredits: true });
  });
  it("provisioning delivery failures report the created account for recovery without falsely succeeding", async () => {
    const { mock } = provisioning();
    const result = await run(mock, { item_id: "crea_account_azienda", piano: "pro", email: "new@example.it" }, { sendEmailUnified: async () => ({ ok: false }) });
    expect(result.success).toBe(false); expect(result.output["nuovo_account.id"]).toBe(chosen);
  });
  it("invoice retries reuse the same charge, honor a zero-day deadline and never overwrite paid records", async () => {
    let invoice: any = null;
    const mock = platformDb(q => {
      if (q.table === "subscription_invoices") {
        if (has(q, "insert")) { invoice = { ...q.steps.find(s => s[0] === "insert")![1], id: chosen }; return { data: invoice, error: null }; }
        return { data: invoice, error: null };
      }
    });
    const cfg = { item_id: "invia_fattura", importo: 12, scadenza_giorni: 0, invia_email: "no" };
    expect((await run(mock, cfg)).success).toBe(true); expect((await run(mock, cfg)).success).toBe(true);
    expect(invoice.period_end).toBe(invoice.period_start);
    expect(invoice.stripe_invoice_id).toBe("manual_automation_queue-1");
    expect(mock.calls.filter(q => q.table === "subscription_invoices" && has(q, "insert"))).toHaveLength(1);
    expect(mock.calls.some(q => has(q, "update"))).toBe(false);
  });
  it("invoice email failure is not swallowed and the email does not pretend to be a fiscal invoice", async () => {
    let email: any;
    const result = await run(platformDb(q => q.table === "subscription_invoices" ? { data: has(q, "insert") ? { id: chosen } : null, error: null } : undefined),
      { item_id: "invia_fattura", importo: 12, descrizione: "<script>x</script>" },
      { sendEmailUnified: async (input: any) => { email = input; return { ok: false }; } });
    expect(result.success).toBe(false); expect(email.html).toContain("non è una fattura fiscale");
    expect(email.html).not.toContain("<script>");
  });
  it("onboarding respects a selected real template and updates CS on the existing default path", async () => {
    const mock = platformDb(q => {
      if (q.table === "onboarding_templates") return { data: { id: chosen }, error: null };
      if (q.table === "company_onboarding") return { data: has(q, "update") ? null : { id: "onboarding", template_id: chosen, status: "in_progress" }, error: null };
      if (q.table === "user_roles") return { data: { user_id: actorId }, error: null };
    });
    const result = await run(mock, { item_id: "attiva_onboarding", sequenza: chosen, assegna_cs: actorId });
    expect(result.success).toBe(true);
    expect(eq(mock.calls.find(q => q.table === "onboarding_templates")!, "id")).toBe(chosen);
    expect(mock.calls.find(q => q.table === "company_onboarding" && has(q, "update"))?.steps.find(s => s[0] === "update")?.[1]).toEqual({ assigned_cs: actorId });
    expect(mock.calls.some(q => q.table === "company_onboarding" && has(q, "insert"))).toBe(false);
  });
  it("onboarding never replaces a different existing template or clears its progress", async () => {
    const mock = platformDb(q => q.table === "onboarding_templates" ? { data: { id: chosen }, error: null } : q.table === "company_onboarding" ? { data: { id: "onboarding", template_id: id, status: "in_progress" }, error: null } : undefined);
    expect((await run(mock, { item_id: "attiva_onboarding", sequenza: chosen })).success).toBe(false);
    expect(mock.calls.some(q => has(q, "update") || has(q, "delete"))).toBe(false);
  });
  it("new onboarding exposes its persisted ID to later nodes", async () => {
    const mock = platformDb(q => q.table === "onboarding_templates" ? { data: { id: chosen } } : q.table === "company_onboarding" ? { data: has(q, "insert") ? { id: chosen } : null } : undefined);
    expect(await run(mock, { item_id: "attiva_onboarding", sequenza: chosen })).toMatchObject({ success: true, output: { "onboarding.id": chosen } });
  });
  it.each(["crea_cs_task", "invia_fattura", "attiva_onboarding"])("a write without a persisted ID cannot appear successful: %s", item_id => {
    const mock = platformDb(q => has(q, "insert") ? { data: null, error: null } : q.table === "onboarding_templates" ? { data: { id: chosen } } : { data: null });
    return run(mock, { item_id, titolo: "Prova", importo: 12, invia_email: "no", sequenza: chosen }).then((result: any) => expect(result.success).toBe(false));
  });
  it("paid charges succeed without reading an email or sending another notice", async () => {
    const mock = platformDb(q => q.table === "subscription_invoices" ? { data: { id: chosen, company_id: id, amount_due: 1200, status: "paid" } } : undefined);
    let sent = 0;
    const result = await run(mock, { item_id: "invia_fattura", importo: 12 }, { sendEmailUnified: async () => { sent++; return { ok: true }; } });
    expect(result).toMatchObject({ success: true, output: { already_paid: true } });
    expect(sent).toBe(0);
    expect(mock.calls.filter(q => q.table === "companies")).toHaveLength(1); // target existence only
  });
  it("automatic plan changes use the shared Stripe/audit implementation and propagate its failures", async () => {
    const mock = platformDb(q => q.table === "subscription_plans" ? { data: { id: chosen, slug: "pro" }, error: null } : undefined);
    let args: any;
    const result = await run(mock, { item_id: "cambia_piano_azienda", nuovo_piano: "pro" }, { changeCompanyPlan: async (...input: any[]) => { args = input; return new Response(JSON.stringify({ error: "Stripe unavailable" }), { status: 502 }); } });
    expect(result.success).toBe(false); expect(result.error).toContain("Stripe");
    expect(args.slice(1)).toEqual([actorId, { company_id: id, new_plan_id: chosen }]);
    expect(mock.calls.some(q => q.table === "companies" && has(q, "update"))).toBe(false);
  });
});
