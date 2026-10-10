import { describe, expect, it } from "vitest";
import { ACTION_CATALOG, TRIGGER_CATALOG } from "../../lib/flow-node-catalog";
import { PLATFORM_ACTION_IDS, PLATFORM_TRIGGER_EVENT_MAP, PLATFORM_ADMIN_COMPANY_ID } from "../../../supabase/functions/_shared/platformAutomation";
import { automationEventPayload } from "../../../supabase/functions/_shared/automationContext";
import { automationTriggerConfigErrors, matchesAutomationTriggerConfig } from "../../../supabase/functions/_shared/automationFilters";
import { platformAvailableCredits, platformInvoiceDeadline, platformLifecycleWindows, platformRows, stripeInvoiceDeadline } from "../../../supabase/functions/_shared/platformLifecycle";
import { automationNextContext } from "../../../supabase/functions/_shared/automationNextContext";
import { actionConfigErrors } from "../../../supabase/functions/_shared/automationValidation";
import { previewAutomationPath } from "@/lib/automationPreview";
import { automationTemplateInScope } from "@/lib/automationTemplateScope";
import { FLOW_TEMPLATES, type FlowTemplate } from "@/lib/flow-templates";
const id = "11111111-2222-4333-8444-555555555555";
describe("platform automation quick filters", () => {
  it.each([
    [{ item_id: "trial_in_scadenza", giorni_prima: 3 }, { "trial.giorni_rimasti": 8 }, false],
    [{ item_id: "trial_in_scadenza", giorni_prima: 3 }, { "trial.giorni_rimasti": 3 }, true],
    [{ item_id: "trial_in_scadenza", giorni_prima: 3 }, { "trial.giorni_rimasti": -1 }, false],
    [{ item_id: "trial_in_scadenza", giorni_prima: 3 }, {}, false],
    [{ item_id: "contratto_in_scadenza", giorni_prima: 30 }, {}, true],
    [{ item_id: "azienda_creata" }, { "trial.giorni_rimasti": null }, true],
    [{ trigger_event: "PLATFORM_TRIAL_EXPIRING" }, { "trial.giorni_rimasti": 5 }, false],
    [{ soglia_eur: 5 }, { "crediti.saldo": 5 }, false],
    [{ soglia_eur: 5 }, { "crediti.saldo": 4.99 }, true],
    [{ soglia_eur: 0 }, { "crediti.saldo": 0 }, false],
    [{ soglia_eur: 0 }, { "crediti.saldo": -1 }, true],
    [{ soglia_eur: 5 }, {}, false],
    [{ giorni_ritardo_min: 7 }, { "fattura.giorni_ritardo": 6 }, false],
    [{ giorni_ritardo_min: 7 }, { "fattura.giorni_ritardo": 7 }, true],
    [{ tipo_cambio: "upgrade" }, { "piano.tipo_cambio": "downgrade" }, false],
    [{ tipo_cambio: "downgrade" }, { "piano.tipo_cambio": "downgrade" }, true],
    [{ tipo_cambio: "upgrade" }, { "piano.nuovo": "Enterprise" }, false],
    [{ priorita_filtro: "alta" }, { "ticket.priorita": "high" }, true],
    [{ priorita_filtro: "alta" }, { priority: "low" }, false],
  ])("matches %j against %j: %s", (config, payload, expected) => expect(matchesAutomationTriggerConfig(config, payload)).toBe(expected));
  it.each([{ soglia_eur: -1 }, { soglia_eur: true }, { giorni_ritardo_min: 0 }, { giorni_ritardo_min: 1.5 }, { item_id: "trial_in_scadenza", giorni_prima: 31 }, { tipo_cambio: "unknown" }])("rejects malformed quick filters: %j", config => {
    expect(automationTriggerConfigErrors(config).length).toBeGreaterThan(0);
    expect(matchesAutomationTriggerConfig(config, {})).toBe(false);
  });
});
describe("platform lifecycle scheduling", () => {
  it("scans the largest configured window, not a fixed seven-day or five-euro default", () => {
    expect(platformLifecycleWindows([{ item_id: "trial_in_scadenza", giorni_prima: 30 }, { item_id: "trial_in_scadenza", giorni_prima: 1 }, { trigger_type: "crediti_ai_bassi", soglia_eur: 20 }])).toEqual({ trialDays: 30, creditThreshold: 20 });
  });
  it("does not scan unused schedules", () => expect(platformLifecycleWindows([])).toEqual({ trialDays: 0, creditThreshold: 0 }));
  it("includes free credits, respects an explicit total zero and rejects invalid balances", () => {
    expect(platformAvailableCredits({ balance_eur: 2, free_balance_eur: 10 })).toBe(12);
    expect(platformAvailableCredits({ balance_eur: 10, total_available_eur: 0 })).toBe(0);
    expect(() => platformAvailableCredits({ total_available_eur: "invalid" })).toThrow();
  });
  it("Stripe period end must never masquerade as an unpaid invoice deadline", () => {
    expect(platformInvoiceDeadline({ stripe_invoice_id: "in_stripe", period_end: "2026-10-01" })).toBeNull();
    expect(platformInvoiceDeadline({ stripe_invoice_id: "manual_automation_1", period_end: "2026-10-01" })).toBe("2026-10-01");
    expect(platformInvoiceDeadline({ due_date: "2026-10-15", period_end: "2026-10-01" })).toBe("2026-10-15");
  });
  it("reads past the first page and reports errors instead of returning partial success", async () => {
    const offsets: number[] = [];
    const rows = await platformRows(async offset => { offsets.push(offset); return { data: Array.from({ length: offset ? 1 : 500 }, (_, i) => ({ id: i + offset })), error: null }; });
    expect(offsets).toEqual([0, 500]); expect(rows).toHaveLength(501);
    await expect(platformRows(async () => ({ data: null, error: new Error("database down") }))).rejects.toThrow("database down");
  });
});
describe("platform configuration, context and safe preview", () => {
  it.each([
    { item_id: "crea_account_azienda", trial_giorni: 1.5 },
    { item_id: "crea_account_azienda", trial_giorni: false },
    { item_id: "invia_fattura", scadenza_giorni: -1 },
    { item_id: "crea_cs_task", scadenza_giorni: 366 },
    { item_id: "invia_fattura", importo: "NaN" },
    { item_id: "invia_notifica_team_admin", canale: "sms" },
    { item_id: "invia_fattura", importo: false },
    { item_id: "invia_fattura", importo: {} },
    { item_id: "invia_fattura", importo: " " },
    { item_id: "invia_fattura", importo: 21474836.48 },
    { item_id: "crea_cs_task", priorita: "inventata" },
    { item_id: "crea_account_azienda", invia_credenziali: "maybe" },
    { item_id: "invia_fattura", invia_email: "maybe" },
  ])("blocks invalid platform actions: %j", config => expect(actionConfigErrors(config).length).toBeGreaterThan(0));
  it("explicit zero trial and same-day invoice deadlines are valid", () => {
    expect(actionConfigErrors({ item_id: "crea_account_azienda", trial_giorni: 0 })).toEqual([]);
    expect(actionConfigErrors({ item_id: "invia_fattura", scadenza_giorni: 0, importo: 0 })).toEqual([]);
  });
  it("provisioning output addresses the new account without replacing the original contact or exposing secrets", () => {
    const output = { "nuovo_account.id": id, "nuovo_account.email_admin": "admin@example.it", password: { secret: true }, "fattura.id": id };
    const next = automationNextContext({ payload: { id: "original-contact", "azienda.id": "old" } }, output);
    expect(next.payload["azienda.id"]).toBe(id); expect(next.payload.id).toBe("original-contact");
    expect(next.payload["nuovo_account.email_admin"]).toBe("admin@example.it");
    expect(next.payload.invoice_id).toBeUndefined(); expect(next.payload.password).toBeUndefined();
  });
  it("invalid platform IDs cannot overwrite the target company", () => expect(automationNextContext({ payload: { "azienda.id": id } }, { "nuovo_account.id": "not-a-uuid" }).payload["azienda.id"]).toBe(id));
  it("even a stale invalid output cannot become a company ID and secrets are not exposed as template variables", () => {
    const next = automationNextContext({ payload: { "azienda.id": id, "nuovo_account.id": "bad" } }, { "nuovo_account.id": "bad", password: "secret", access_token: "token" });
    expect(next.payload["azienda.id"]).toBe(id);
    expect(next.payload["risultato.password"]).toBeUndefined();
    expect(next.payload["risultato.access_token"]).toBeUndefined();
  });
  it("platform preview checks only the chosen event, resolves exact namespaced values and sends nothing", () => {
    const nodes = [
      { id: "trial", type: "trigger", data: { itemId: "trial_in_scadenza", giorni_prima: 3 } },
      { id: "other", type: "trigger", data: { itemId: "azienda_creata" } },
      { id: "mail", type: "action", data: { itemId: "invia_email_admin_azienda", oggetto: "Prova", corpo: "Ciao {{azienda.name}} / {{nuovo_account.id}}" } },
    ];
    const result = previewAutomationPath(nodes, [{ source: "trial", target: "mail" }], {}, "Europe/Rome", { triggerId: "trial", payload: { "azienda.name": "Renova", "trial.giorni_rimasti": 2 } });
    expect(result.find(r => r.nodeId === "other")?.status).toBe("skipped");
    expect(result.find(r => r.nodeId === "mail")).toMatchObject({ status: "unverified", text: "Ciao Renova / {{nuovo_account.id}}" });
  });
  it("missing simulated credit data is unverified, not a false claim that the business trigger did not match", () => {
    const result = previewAutomationPath([{ id: "credits", type: "trigger", data: { itemId: "crediti_ai_bassi", soglia_eur: 5 } }], [], {}, "Europe/Rome", { triggerId: "credits", payload: { "crediti.saldo": null } });
    expect(result[0]).toMatchObject({ status: "unverified" });
    expect(result[0].detail).toContain("Completa");
  });
  it("hides construction-order templates from superadmin and rejects platform templates in the company area", () => {
    const construction = FLOW_TEMPLATES.find(t => t.id === "t03-deal-vinto")!;
    expect(automationTemplateInScope(construction, true)).toBe(false);
    expect(automationTemplateInScope(construction, false)).toBe(true);
    const platform: FlowTemplate = { ...construction, nodes: [{ id: "t", nodeType: "trigger", posX: 0, posY: 0, label: "Trial", configJson: { trigger_type: "trial_in_scadenza" } }] };
    expect(automationTemplateInScope(platform, true)).toBe(true);
    expect(automationTemplateInScope(platform, false)).toBe(false);
  });
});

describe("real Stripe invoice deadlines", () => {
  it("preserves a real due date and never invents one from a billing period", () => {
    expect(stripeInvoiceDeadline({ due_date: 1791540000 })).toBe(new Date(1791540000 * 1000).toISOString());
    expect(stripeInvoiceDeadline({ due_date: null, period_end: 1791540000 })).toBeNull();
    expect(stripeInvoiceDeadline({})).toBeNull();
  });
  it.each([false, "1791540000", -1, 1.5, Infinity, 999999999999999])("rejects invalid deadline %s", due_date => {
    expect(() => stripeInvoiceDeadline({ due_date })).toThrow();
  });
});

describe("every platform catalog entry has a matching runtime contract", () => {
  it.each(TRIGGER_CATALOG.filter(t => t.categoria === "piattaforma"))("$id maps to its real emitted event", trigger => {
    expect(PLATFORM_TRIGGER_EVENT_MAP[trigger.id]).toBe(trigger.dbEvent);
    expect(automationTriggerConfigErrors({ item_id: trigger.id, ...Object.fromEntries(trigger.configSchema.filter(f => f.defaultValue != null).map(f => [f.id, f.defaultValue])) })).toEqual([]);
  });
  it("all nine platform actions, including local WhatsApp, are guarded in the worker", () => {
    expect(ACTION_CATALOG.filter(a => a.categoria === "piattaforma").map(a => a.id).sort()).toEqual([...PLATFORM_ACTION_IDS].sort());
  });
  it("won deals expose the actual scoped contact, never an invented company or plan", async () => {
    const queries: any[] = [];
    const db = { from(table: string) { const q: any = { table, steps: [] }; queries.push(q); const chain: any = new Proxy({}, { get(_target, key) { if (key === "then") return (ok: any) => Promise.resolve({ data: table === "marketing_opportunities" ? { id, contact_id: id, value: 120 } : { id, email: "buyer@example.test", company_name: "Nuova azienda" } }).then(ok); return (...args: any[]) => { q.steps.push([key, ...args]); return chain; }; } }); return chain; } };
    const payload = await automationEventPayload(db, "opportunity_won", "opportunity", id, PLATFORM_ADMIN_COMPANY_ID, { value: 150 });
    expect(payload["contatto.email"]).toBe("buyer@example.test");
    expect(payload["opportunita.value"]).toBe(150);
    expect(payload["azienda.id"]).toBeUndefined();
    expect(payload["opportunita.piano"]).toBeUndefined();
    expect(queries[1].steps).toContainEqual(["eq", "company_id", PLATFORM_ADMIN_COMPANY_ID]);
    expect(queries[1].steps).toContainEqual(["is", "deleted_at", null]);
  });
});
