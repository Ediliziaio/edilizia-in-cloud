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
import { calendarioDelGiorno } from "../../../supabase/functions/_shared/attesaCalendario";
import { numeroWhatsApp } from "../../../supabase/functions/_shared/sequenzaContatto";
import { romaVersoUtc } from "../../../supabase/functions/_shared/appuntamentiPubblici";
import { pickOpenWaNumber } from "../../../supabase/functions/_shared/openwaPickNumber";
import { automationEmailDelayMs } from "../../../supabase/functions/_shared/automationEmail";
import { canaleDelFreno, LIMITE_AL_MINUTO, riprovaDopoFreno } from "../../../supabase/functions/_shared/frenoInvii";

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
