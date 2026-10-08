import { describe, expect, it, vi, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { DbMinimo } from "../helpers/edgeFinto";
import { classifySite, isSiteHealthQuestion, romeDay, silvioSiteHealth, siteHealthPreflight, siteHealthDirectAnswer, SITE_HEALTH_TOOL } from "../../../supabase/functions/_shared/silvioSiteHealth";
import { SILVIO_TOOLS, getToolsForChannel, type ToolContext } from "../../../supabase/functions/_shared/silvioTools";
import { executeToolWithRouting } from "../../../supabase/functions/_shared/silvioToolExecution";
import { classifyOperationalMessage } from "../../../supabase/functions/whatsapp-ai-processor/operationalTriage";
import { SILVIO_REPLY_STYLE, WHATSAPP_SILVIO_REPLY_STYLE } from "../../../supabase/functions/_shared/silvioReplyStyle";

const today = "2026-10-08";
const now = new Date("2026-10-08T12:00:00Z");
const row = (id = "a") => ({ id, company_id: "demo", order_code: `ORD-${id}`, deleted_at: null as string | null,
  description: "Dato fittizio", status: "in_corso", fulfillment_status: "not_started",
  work_end_date: "2026-09-27", percentuale_avanzamento: 50 });
function fixture(channel: "internal_chat" | "whatsapp" = "internal_chat") {
  const db = new DbMinimo(); db.tabelle.orders = [row()];
  db.tabelle.v_ordine_marginalita = [{ id: "a", company_id: "demo", preventivo_totale: 10000, consuntivo: 12000 }];
  const ctx: ToolContext = { supabase: db, companyId: "demo", userId: "owner", primaryRole: "company_admin", channel, personaKey: "silvio" };
  return { db, ctx };
}
afterEach(() => vi.useRealTimers());
async function availableHealth(ctx: ToolContext) {
  const result = await silvioSiteHealth(ctx, now);
  if ("error" in result) throw new Error(result.error);
  return result;
}

describe("app/WhatsApp: same actual site analysis, not forecasts or unpaid balances", () => {
  it.each(["Quanti cantierei sono in ritardo?", "Quali cantieri sono in ritardo o sopra budget? Riassumi lo stato.",
    "Dimmi la situazione delle commesse in ritardo", "Elenca i cantieri a rischio"])("recognizes %s", text => {
    expect(isSiteHealthQuestion(text)).toBe(true);
    expect(classifyOperationalMessage({ contentText: text, messageType: "text" }).intent).toBe("domanda");
  });
  it.each(["Sposta la fine delle commesse in ritardo", "Crea un rapporto e invia i cantieri in ritardo",
    "Quanti cantieri erano in ritardo nel 2025?", "Quanti cantieri erano in ritardo la settimana scorsa?",
    "Sono in cantiere, ecco le foto", "ok"])("does not intercept %s", text => expect(isSiteHealthQuestion(text)).toBe(false));
  it("completed but unpaid is not a work delay; paid but unfinished can be", () => {
    expect(classifySite({ ...row(), percentuale_avanzamento: 100, balance_paid: false }, today)).toMatchObject({ stato: "completata", giorni_ritardo: null });
    expect(classifySite({ ...row(), balance_paid: true }, today)).toMatchObject({ stato: "in_ritardo", giorni_ritardo: 11 });
  });
  it("completion status overrides inconsistent progress, without inventing an actual end date", () => {
    expect(classifySite({ ...row(), status: "completato" }, today).stato).toBe("completata");
    expect(classifySite({ ...row(), fulfillment_status: "completed" }, today).stato).toBe("completata");
  });
  it.each([null, "", "2026-02-30", "bad"])("missing/invalid end date %s is unknown", date => {
    expect(classifySite({ ...row(), work_end_date: date }, today)).toMatchObject({ stato: "non_verificabile", giorni_ritardo: null });
  });
  it.each([null, -1, 101, NaN])("missing/invalid progress %s is not zero", progress => {
    expect(classifySite({ ...row(), percentuale_avanzamento: progress }, today).stato).toBe("non_verificabile");
  });
  it("does not invent a delay or prediction from low progress before/today's deadline", () => {
    expect(classifySite({ ...row(), work_end_date: today, percentuale_avanzamento: 1 }, today).stato).toBe("non_in_ritardo");
    expect(classifySite({ ...row(), work_end_date: "2026-10-31", percentuale_avanzamento: 35 }, today).stato).toBe("non_in_ritardo");
  });
  it("uses the Italian calendar across midnight and DST", () => {
    expect(romeDay(new Date("2026-10-07T22:30:00Z"))).toBe(today);
    expect(romeDay(new Date("2026-12-31T23:30:00Z"))).toBe("2027-01-01");
    expect(classifySite({ ...row(), work_end_date: "2026-10-07" }, today).giorni_ritardo).toBe(1);
  });
  it("reads beyond the first 50 and 250, reports full counts and truncated detail", async () => {
    const { db, ctx } = fixture(); db.tabelle.orders = Array.from({ length: 501 }, (_, i) => row(String(i).padStart(4, "0")));
    const result = await availableHealth(ctx);
    expect(result).toMatchObject({ conteggio_ritardi: 501, copertura_completa: true, commesse_lette: 501, elenco_ritardi_troncato: true });
    expect(result.ritardi).toHaveLength(50);
  });
  it("capped scans never claim complete coverage or a total count", async () => {
    const { db, ctx } = fixture(); db.tabelle.orders = Array.from({ length: 5001 }, (_, i) => row(String(i).padStart(5, "0")));
    expect(await silvioSiteHealth(ctx, now)).toMatchObject({ copertura_completa: false, conteggio_ritardi: null, ritardi_rilevati: 5000 });
  });
  it("excludes deleted and other-tenant data and marks cancellations separately", async () => {
    const { db, ctx } = fixture(); db.tabelle.orders.push({ ...row("b"), deleted_at: "2026-10-08" },
      { ...row("c"), company_id: "other" }, { ...row("d"), status: "annullato" });
    expect(await silvioSiteHealth(ctx, now)).toMatchObject({ commesse_lette: 2, conteggio_ritardi: 1, escluse: 1 });
    expect(db.scritture).toEqual([]);
  });
  it("empty prediction table does not erase actual delays", async () => {
    const { db, ctx } = fixture(); db.rpcs.silvio_tool_lista_cantieri_a_rischio = () => [];
    expect(await SILVIO_TOOLS.lista_cantieri_a_rischio.executor({}, ctx)).toEqual([]);
    expect(await silvioSiteHealth(ctx, now)).toMatchObject({ conteggio_ritardi: 1 });
    expect(SILVIO_TOOLS.lista_cantieri_a_rischio.schema.function.description).toContain("NON ritardi reali");
  });
  it("budget is not revenue; costs above revenue are only a separate registered-cost signal", async () => {
    const { ctx } = fixture(); const result = await availableHealth(ctx);
    expect(result.budget).toMatchObject({ verificabile: false, numero_superamenti_ricavi: 1,
      costi_superiori_ai_ricavi: [{ order_id: "a", ricavi: 10000, costi_registrati: 12000, eccedenza: 2000 }] });
  });
  it("missing economics are not zero budget overruns or perfect margins", async () => {
    const { db, ctx } = fixture(); db.tabelle.v_ordine_marginalita = [];
    expect((await availableHealth(ctx)).budget).toMatchObject({ verificabile: false, consuntivi_disponibili: false });
  });
  it("staff operational access does not grant financial access", async () => {
    const { db, ctx } = fixture(); ctx.primaryRole = "company_staff";
    const from = vi.spyOn(db, "from");
    const result = await availableHealth(ctx);
    expect(result.budget).toMatchObject({ verificabile: false });
    expect(result.budget).not.toHaveProperty("costi_superiori_ai_ricavi");
    expect(from.mock.calls.every(([table]) => table !== "v_ordine_marginalita")).toBe(true);
  });
  it.each(["only_assigned", "only_my_warehouse"])("%s scopes totals BEFORE aggregation in both channels", async permission => {
    for (const channel of ["internal_chat", "whatsapp"] as const) {
      const { db, ctx } = fixture(channel); ctx.primaryRole = "company_staff";
      ctx.staffPermissions = { [permission]: true, can_view_orders: true };
      db.tabelle.orders.push(row("hidden"));
      db.rpcs.silvio_commesse_visibili = () => [{ id: "a", order_code: "ORD-a" }];
      const result = await silvioSiteHealth(ctx, now);
      expect(result).toMatchObject({ conteggio_ritardi: 1, commesse_lette: 1, copertura_completa: true, perimetro: "solo commesse visibili a questo utente" });
      expect(JSON.stringify(result)).not.toContain("hidden");
    }
  });
  it("an empty authorized perimeter is not the company-wide total", async () => {
    const { db, ctx } = fixture(); ctx.primaryRole = "salesperson"; ctx.staffPermissions = { only_assigned: true };
    db.rpcs.silvio_commesse_visibili = () => [];
    const from = vi.spyOn(db, "from");
    expect(await silvioSiteHealth(ctx, now)).toMatchObject({ conteggio_ritardi: 0, commesse_lette: 0 });
    expect(from.mock.calls.some(([table]) => table === "orders")).toBe(false);
  });
  it("an unavailable authorized perimeter fails closed without reading all orders", async () => {
    const { db, ctx } = fixture(); ctx.primaryRole = "company_staff"; ctx.staffPermissions = { only_assigned: true };
    db.rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "private" } });
    const from = vi.spyOn(db, "from");
    expect(await silvioSiteHealth(ctx, now)).toMatchObject({ conteggio_ritardi: null, copertura_completa: false });
    expect(from.mock.calls.some(([table]) => table === "orders")).toBe(false);
  });
  it("query failures do not become no delays, and private DB errors are not exposed", async () => {
    const { db, ctx } = fixture(); const from = db.from.bind(db);
    db.from = ((table: string) => Object.assign(from(table), { then: (resolve: (r: unknown) => unknown) =>
      Promise.resolve(resolve({ data: null, error: { message: "private diagnostic" } })) })) as typeof db.from;
    const result = await silvioSiteHealth(ctx, now);
    expect(result).toMatchObject({ conteggio_ritardi: null, copertura_completa: false });
    expect(JSON.stringify(result)).not.toContain("private diagnostic");
  });
  it("executes the real shared registry in both channels with identical data", async () => {
    vi.useFakeTimers(); vi.setSystemTime(now);
    const a = fixture("internal_chat"), w = fixture("whatsapp");
    const execute = async (ctx: ToolContext) => executeToolWithRouting(SITE_HEALTH_TOOL, {}, ctx);
    const app = await siteHealthPreflight("Quali cantieri sono in ritardo o sopra budget?", [SITE_HEALTH_TOOL], () => execute(a.ctx));
    const wa = await siteHealthPreflight("Quanti cantierei sono in ritardo?", [SITE_HEALTH_TOOL], () => execute(w.ctx));
    // Ignore routing duration (telemetry), not data/coverage/definitions.
    expect(JSON.parse(app[1].content!).data).toEqual(JSON.parse(wa[1].content!).data);
    expect(JSON.parse(app[1].content!).data.conteggio_ritardi).toBe(1);
    expect(siteHealthDirectAnswer("Quanti cantierei sono in ritardo?", app)).toBe(siteHealthDirectAnswer("Quanti cantierei sono in ritardo?", wa));
    expect(a.db.scritture.every(s => s.tabella === "tool_execution_log")).toBe(true);
    expect(w.db.scritture.every(s => s.tabella === "tool_execution_log")).toBe(true);
  });
  it("simple question returns verified counts without a model reinterpretation", async () => {
    const { ctx } = fixture();
    const messages = await siteHealthPreflight("Quanti cantieri sono in ritardo?", [SITE_HEALTH_TOOL],
      async () => ({ ok: true, data: await silvioSiteHealth(ctx, now) }));
    expect(siteHealthDirectAnswer("Quanti cantieri sono in ritardo?", messages)).toContain("**1 cantiere risulta in ritardo**");
    expect(siteHealthDirectAnswer("Quali cantieri sono in ritardo o sopra budget? Riassumi lo stato.", messages)).toContain("**Budget non verificabile**");
    expect(siteHealthDirectAnswer("Quali cantieri sono in ritardo e perché?", messages)).toBeNull();
    expect(siteHealthDirectAnswer("Quanti cantieri sono in ritardo?", [])).toBeNull();
  });
  it("simple failed reads are explicit, not zero problems, and no provider is needed", async () => {
    const messages = await siteHealthPreflight("Quanti cantieri sono in ritardo?", [SITE_HEALTH_TOOL], async () => ({ success: false }));
    expect(siteHealthDirectAnswer("Quanti cantieri sono in ritardo?", messages)).toContain("Non riesco a verificare");
  });
  it("never prefetches when the catalog excludes the tool (role, granular permission or agent ban)", async () => {
    const execute = vi.fn();
    for (const role of ["company_staff", "worker"]) {
      const tools = getToolsForChannel({ channel: "whatsapp", role, personaKey: "silvio", staffPermissions: { can_view_orders: false } });
      expect(await siteHealthPreflight("Quanti cantieri sono in ritardo?", tools.map(t => t.schema.function.name), execute)).toEqual([]);
    }
    expect(await siteHealthPreflight("Quanti cantieri sono in ritardo?", [], execute)).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  });
  it("re-checks forbidden roles in the execution router before database reads", async () => {
    const { db, ctx } = fixture(); ctx.primaryRole = "worker";
    const from = vi.spyOn(db, "from");
    expect((await executeToolWithRouting(SITE_HEALTH_TOOL, {}, ctx)).success).toBe(false);
    expect(from.mock.calls.some(([table]) => table === "orders")).toBe(false);
  });
  it("both handlers really run the preflight and share reply rules, preserving format differences only", () => {
    for (const path of ["silvio-chat/index.ts", "whatsapp-ai-processor/index.ts"]) {
      const source = readFileSync(`supabase/functions/${path}`, "utf8");
      expect(source).toContain("await siteHealthPreflight(");
    }
    expect(WHATSAPP_SILVIO_REPLY_STYLE).toContain(SILVIO_REPLY_STYLE);
    expect(WHATSAPP_SILVIO_REPLY_STYLE).toContain("non usare tabelle");
  });
});
