import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { PLATFORM_ADMIN_COMPANY_ID, PLATFORM_EVENTS } from "../../../supabase/functions/_shared/platformAutomation";
import { platformAvailableCredits, platformInvoiceDeadline, platformLifecycleWindows, platformRows, stripeInvoiceDeadline } from "../../../supabase/functions/_shared/platformLifecycle";
import { platformCompanyAdmin } from "../../../supabase/functions/_shared/platformCompanyAdmin";
import { platformSubscriptionPlan } from "../../../supabase/functions/_shared/platformSubscriptionPlan";
const cron = fs.readFileSync("supabase/functions/platform-lifecycle-cron/index.ts", "utf8");
const plans = fs.readFileSync("supabase/functions/_shared/changeCompanyPlan.ts", "utf8");
type Query = { table: string; steps: any[][] };
function database(resolve: (q: Query) => any) {
  const calls: Query[] = [];
  return { calls, from(table: string) {
    const q: Query = { table, steps: [] };
    const chain: any = new Proxy({}, { get(_, key) {
      if (key === "then") return (ok: any, bad: any) => { calls.push(q); return Promise.resolve(resolve(q)).then(ok, bad); };
      return (...args: any[]) => { q.steps.push([String(key), ...args]); return chain; };
    } });
    return chain;
  } };
}
function compile(text: string, globals: Record<string, any>) {
  const js = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  return vm.runInNewContext(js, { exports: {}, Date, Response, Request, Set, Map, console: { error() {}, warn() {} }, ...globals });
}
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const errorResponse = (message: string, status = 500) => jsonResponse({ error: message }, status);
function lifecycle(mock: any, overrides = {}) {
  const ast = ts.createSourceFile("cron.ts", cron, ts.ScriptTarget.Latest, true);
  const statement = ast.statements.find(n => ts.isExpressionStatement(n) && ts.isCallExpression(n.expression) && n.expression.expression.getText(ast) === "serveConMetricheRapida") as ts.ExpressionStatement;
  const handler = (statement.expression as ts.CallExpression).arguments[1].getText(ast);
  return compile(`const run = ${handler}; run;`, {
    createClient: () => mock, Deno: { env: { get: () => "test" } }, getCorsHeaders: () => ({}),
    requireInternalSecret: () => {}, jsonResponse, errorResponse,
    PLATFORM_ADMIN_COMPANY_ID, PLATFORM_EVENTS, platformAvailableCredits, platformInvoiceDeadline, platformLifecycleWindows, platformRows, ...overrides,
  });
}
const id = "11111111-2222-4333-8444-555555555555";
const planId = "22222222-2222-4333-8444-555555555555";
const call = () => new Request("https://local.test", { method: "POST" });
describe("platform scheduler: complete handler without external calls", () => {
  it("authenticates before reading any tenant data", async () => {
    const mock = database(() => ({ data: [], error: null }));
    const response = await lifecycle(mock, { requireInternalSecret: () => { throw new Response("Unauthorized", { status: 401 }); } })(call());
    expect(response.status).toBe(401); expect(mock.calls).toHaveLength(0);
  });
  it("does not emit anything when there are no published platform flows", async () => {
    const mock = database(() => ({ data: [], error: null }));
    const response = await lifecycle(mock)(call());
    expect(await response.json()).toMatchObject({ ok: true, trial_expiring: 0 });
    expect(mock.calls).toHaveLength(1);
    expect(mock.calls[0].steps).toContainEqual(["eq", "company_id", PLATFORM_ADMIN_COMPANY_ID]);
  });
  it("database failure cannot appear as zero alerts and a successful scan", async () => {
    const response = await lifecycle(database(() => ({ data: null, error: new Error("database down") })))(call());
    expect(response.status).toBe(500);
  });
  it("30-day trials are discovered; duplicate daily events are not inserted twice", async () => {
    const seen = new Set<string>(); let deadline = "";
    const trialEnd = new Date(Date.now() + 20 * 86400000).toISOString();
    const mock = database(q => {
      if (q.table === "automation_flows") return { data: [{ id: "flow" }], error: null };
      if (q.table === "automation_nodes") return { data: [{ config_json: { item_id: "trial_in_scadenza", giorni_prima: 30 } }], error: null };
      if (q.table === "companies") {
        deadline = q.steps.find(s => s[0] === "lte")?.[2];
        return { data: [{ id, name: "Demo", trial_ends_at: trialEnd }], error: null };
      }
      const key = q.steps.find(s => s[0] === "insert")?.[1].dedup_key;
      if (seen.has(key)) return { error: { code: "23505" } };
      seen.add(key); return { error: null };
    });
    expect((await (await lifecycle(mock)(call())).json()).trial_expiring).toBe(1);
    expect(Date.parse(deadline) - Date.now()).toBeGreaterThan(29 * 86400000);
    expect((await (await lifecycle(mock)(call())).json()).trial_expiring).toBe(0);
  });
  it("credits include the free balance and inactive companies are excluded in the query", async () => {
    const mock = database(q => {
      if (q.table === "automation_flows") return { data: [{ id: "flow" }], error: null };
      if (q.table === "automation_nodes") return { data: [{ config_json: { item_id: "crediti_ai_bassi", soglia_eur: 5 } }], error: null };
      if (q.table === "ai_credits") return { data: [{ company_id: id, balance_eur: 0, free_balance_eur: 10, total_available_eur: 10 }, { company_id: planId, balance_eur: 0, free_balance_eur: 2, total_available_eur: 2 }], error: null };
      if (q.table === "companies") return { data: [{ id, name: "Has free credits" }, { id: planId, name: "Low credits" }], error: null };
      return { error: null };
    });
    expect((await (await lifecycle(mock)(call())).json()).ai_credits_low).toBe(1);
    const companyQuery = mock.calls.find(q => q.table === "companies")!;
    expect(companyQuery.steps).toContainEqual(["in", "status", ["active", "trial", "free"]]);
    const payload = mock.calls.find(q => q.table === "automation_trigger_events")!.steps.find(s => s[0] === "insert")![1].payload;
    expect(payload["crediti.saldo"]).toBe(2);
  });
  it("event write failures are reported, not silently discarded", async () => {
    const mock = database(q => {
      if (q.table === "automation_flows") return { data: [{ id: "flow" }], error: null };
      if (q.table === "automation_nodes") return { data: [{ config_json: { item_id: "crediti_ai_bassi", soglia_eur: 5 } }], error: null };
      if (q.table === "ai_credits") return { data: [{ company_id: id, total_available_eur: 2 }], error: null };
      if (q.table === "companies") return { data: [{ id, name: "Demo" }], error: null };
      return { data: null, error: new Error("write failed") };
    });
    expect((await lifecycle(mock)(call())).status).toBe(500);
  });
  it("a zero credit threshold remains enabled and matches only a negative balance", async () => {
    const mock = database(q => {
      if (q.table === "automation_flows") return { data: [{ id: "flow" }], error: null };
      if (q.table === "automation_nodes") return { data: [{ config_json: { item_id: "crediti_ai_bassi", soglia_eur: 0 } }], error: null };
      if (q.table === "ai_credits") return { data: [{ company_id: id, total_available_eur: -1 }, { company_id: planId, total_available_eur: 0 }], error: null };
      if (q.table === "companies") return { data: [{ id }, { id: planId }], error: null };
      return { error: null };
    });
    expect((await (await lifecycle(mock)(call())).json()).ai_credits_low).toBe(1);
  });
  it("a Stripe period end produces no false overdue notification", async () => {
    const mock = database(q => {
      if (q.table === "automation_flows") return { data: [{ id: "flow" }], error: null };
      if (q.table === "automation_nodes") return { data: [{ config_json: { item_id: "fattura_piattaforma_scaduta", giorni_ritardo_min: 1 } }], error: null };
      if (q.table === "subscription_invoices") return { data: [{ id, company_id: id, stripe_invoice_id: "in_actual", period_end: "2020-01-01", amount_due: 1000 }], error: null };
      return { error: null };
    });
    expect((await (await lifecycle(mock)(call())).json()).invoice_overdue).toBe(0);
    expect(mock.calls.some(q => q.table === "automation_trigger_events")).toBe(false);
  });
  it("reads and emits the real deadline for an unpaid Stripe invoice", async () => {
    const mock = database(q => {
      if (q.table === "automation_flows") return { data: [{ id: "flow" }], error: null };
      if (q.table === "automation_nodes") return { data: [{ config_json: { item_id: "fattura_piattaforma_scaduta", giorni_ritardo_min: 1 } }], error: null };
      if (q.table === "subscription_invoices") return { data: [{ id, company_id: id, stripe_invoice_id: "in_actual", due_date: "2020-01-01", period_end: "2099-01-01", amount_due: 1000 }], error: null };
      return { error: null };
    });
    expect((await (await lifecycle(mock)(call())).json()).invoice_overdue).toBe(1);
    expect(mock.calls.find(q => q.table === "subscription_invoices")?.steps.find(s => s[0] === "select")?.[1]).toContain("due_date");
    const payload = mock.calls.find(q => q.table === "automation_trigger_events")?.steps.find(s => s[0] === "insert")?.[1].payload;
    expect(payload["fattura.scadenza"]).toBe("2020-01-01");
    expect(payload["fattura.importo"]).toBe(10);
  });
});

describe("Stripe persistence before automation events", () => {
  const text = fs.readFileSync("supabase/functions/stripe-webhook/index.ts", "utf8");
  const ast = ts.createSourceFile("stripe.ts", text, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "upsertSubscriptionInvoice")!;
  const persist = compile(`${fn.getText(ast)}; upsertSubscriptionInvoice;`, { stripeInvoiceDeadline });
  it("stores due_date in UTC, leaving period_end intact", async () => {
    const mock = database(() => ({ error: null }));
    await persist(mock, id, { id: "in_actual", due_date: 1791540000, period_end: 1790000000 }, "cus_actual");
    const row = mock.calls[0].steps.find(s => s[0] === "upsert")?.[1];
    expect(row.due_date).toBe(new Date(1791540000 * 1000).toISOString());
    expect(row.period_end).toBe(new Date(1790000000 * 1000).toISOString());
  });
  it("a database failure rejects processing so Stripe can retry", async () => {
    await expect(persist(database(() => ({ error: { message: "write denied" } })), id, { id: "in_actual" }, "cus_actual")).rejects.toThrow("write denied");
  });
});
function planChange(mock: any, stripeClient: any, stripeKey: string | null = "test-key") {
  const ast = ts.createSourceFile("plan.ts", plans, ts.ScriptTarget.Latest, true);
  const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "changeCompanyPlan")!;
  return compile(`${fn.getText(ast)}; changeCompanyPlan;`, {
    UUID_RE: /^[0-9a-f-]{36}$/i, APP_BASE: "https://local.test", jsonResponse, errorResponse,
    getPlatformSetting: async () => stripeKey, planStripeClient: async () => stripeClient,
    emitPlatformEvent: async (_s: any, _e: string, payload: any) => { mock.events.push(payload); },
    PLATFORM_EVENTS, platformCompanyAdmin: async (): Promise<null> => null,
  });
}
function planDatabase(customer = true, currentPlan = id) {
  const mock: any = database(q => {
    if (q.table === "companies") return { data: { id, name: "Demo", subscription_plan_id: currentPlan, stripe_customer_id: customer ? "customer" : null, status: "active" }, error: null };
    if (q.table === "subscription_plans") return { data: q.steps.some(s => s[0] === "eq" && s[2] === planId)
      ? { id: planId, name: "Pro", price_monthly: 100, stripe_price_monthly_id: "price_month", stripe_price_yearly_id: "price_year" }
      : { id, name: "Starter", price_monthly: 50 }, error: null };
    return { data: null, error: null };
  });
  mock.events = []; return mock;
}
describe("shared manual/automatic plan change", () => {
  it.each(["month", "year"])("preserves Stripe billing interval and synchronizes before committing: %s", async interval => {
    const mock = planDatabase(); const sequence: string[] = []; let update: any;
    const client = { subscriptions: { list: async () => ({ data: [{ id: "sub", status: "trialing", items: { data: [{ id: "item", price: { recurring: { interval } } }] } }] }), update: async (_id: string, args: any) => { sequence.push("stripe"); update = args; } } };
    const response = await planChange(mock, client)(mock, id, { company_id: id, new_plan_id: planId });
    expect(response.status).toBe(200); expect(update.items[0].price).toBe(interval === "year" ? "price_year" : "price_month");
    expect(sequence).toEqual(["stripe"]);
    expect(mock.calls.find((q: Query) => q.table === "companies" && q.steps.some(s => s[0] === "update"))).toBeTruthy();
    expect(mock.events[0].payload["piano.tipo_cambio"]).toBe("upgrade");
  });
  it("Stripe failure never modifies the company's plan", async () => {
    const mock = planDatabase();
    const client = { subscriptions: { list: async () => { throw new Error("Stripe unavailable"); } } };
    const response = await planChange(mock, client)(mock, id, { company_id: id, new_plan_id: planId });
    expect(response.status).toBe(502);
    expect(mock.calls.some((q: Query) => q.table === "companies" && q.steps.some(s => s[0] === "update"))).toBe(false);
  });
  it("multiple subscriptions are not changed arbitrarily", async () => {
    const mock = planDatabase();
    const client = { subscriptions: { list: async () => ({ data: [{ status: "active" }, { status: "trialing" }] }) } };
    expect((await planChange(mock, client)(mock, id, { company_id: id, new_plan_id: planId })).status).toBe(502);
  });
  it("repeating a completed plan change is an idempotent no-op", async () => {
    const mock = planDatabase(true, planId);
    const response = await planChange(mock, { subscriptions: { list: async () => { throw new Error("must not call Stripe"); } } })(mock, id, { company_id: id, new_plan_id: planId });
    expect(await response.json()).toMatchObject({ success: true, no_change: true });
    expect(mock.calls.some((q: Query) => q.steps.some(s => s[0] === "update"))).toBe(false);
  });
});
describe("platform email recipients", () => {
  it("selects a company administrator, not the first worker or a billing email", async () => {
    const mock: any = database(q => q.table === "profiles"
      ? { data: [{ id: "worker" }, { id: "admin" }], error: null }
      : { data: [{ user_id: "admin" }], error: null });
    const lookedUp: string[] = [];
    mock.auth = { admin: { getUserById: async (userId: string): Promise<{ data: { user: { email: string } }; error: null }> => { lookedUp.push(userId); return { data: { user: { email: "admin@example.it" } }, error: null }; } } };
    expect(await platformCompanyAdmin(mock, id)).toEqual({ userId: "admin", email: "admin@example.it", firstName: "" });
    expect(lookedUp).toEqual(["admin"]);
    expect(mock.calls[0].steps).toContainEqual(["eq", "company_id", id]);
    expect(mock.calls[1].steps).toContainEqual(["eq", "role", "company_admin"]);
  });
  it("fails visibly if role lookup is unavailable, instead of sending to another recipient", async () => {
    const mock = database(q => q.table === "profiles" ? { data: [{ id }], error: null } : { data: null, error: new Error("roles unavailable") });
    await expect(platformCompanyAdmin(mock, id)).rejects.toThrow("roles unavailable");
  });
  it("returns no recipient when the company has no administrator", async () => {
    const mock = database(q => ({ data: q.table === "profiles" ? [{ id }] : [], error: null }));
    expect(await platformCompanyAdmin(mock, id)).toBeNull();
  });
});
describe("unambiguous billable plan lookup", () => {
  it("does not transform Pro+ into Pro or interpolate a PostgREST filter", async () => {
    const mock = database(q => ({ data: q.steps.some(s => s[0] === "eq" && s[1] === "name" && s[2] === "Pro+") ? { id: planId, name: "Pro+" } : null, error: null }));
    expect((await platformSubscriptionPlan(mock, "Pro+")).id).toBe(planId);
    expect(mock.calls[0].steps).toContainEqual(["eq", "slug", "pro+"]);
    expect(mock.calls.some(q => q.steps.some(s => s[0] === "or" || s[0] === "ilike"))).toBe(false);
  });
  it("accepts a precise UUID and does not silently pick the first ambiguous name", async () => {
    const mock = database(() => ({ data: { id: planId }, error: null }));
    expect((await platformSubscriptionPlan(mock, planId)).id).toBe(planId);
    expect(mock.calls[0].steps).toContainEqual(["eq", "id", planId]);
    const ambiguous = database(q => q.steps.some(s => s[0] === "eq" && s[1] === "name") ? { data: null, error: new Error("multiple plans") } : { data: null, error: null });
    await expect(platformSubscriptionPlan(ambiguous, "Pro")).rejects.toThrow("multiple plans");
  });
});
