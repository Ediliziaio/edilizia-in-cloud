import { beforeEach, describe, expect, it, vi } from "vitest";
import { DbMinimo } from "../helpers/edgeFinto";
import { SILVIO_TOOLS, type ToolContext } from "../../../supabase/functions/_shared/silvioTools";
import { executeToolWithRouting } from "../../../supabase/functions/_shared/silvioToolExecution";
import { canonicalOrderEconomics, assessOrderEconomicsQuality } from "@/lib/orders/economics";
import * as shared from "../../../supabase/functions/_shared/orderEconomics";
import { normalizeMarginalitaCommesse, type MarginalitaCommesseResult } from "../../../supabase/functions/_shared/marginalitaCommesse";

let db: DbMinimo;
let ctx: ToolContext;
let tables: string[];
let failures: Set<string>;
const snapshot = () => ({ id: "order-a", company_id: "company-a", preventivo_contratto: 10000,
  variazioni_approvate: 1000, preventivo_totale: 11000, consuntivo: 6000, margine: 5000,
  margine_perc: 45.5, costo_acquisti: 2000, costo_manodopera: 4000,
  costo_materiali_magazzino: 0, movimenti_magazzino_senza_costo: 0,
  costo_provvigioni: 0, costo_rimborsi_km: 0, rimborsi_km_da_approvare: 0,
  numero_rimborsi_km_da_approvare: 0, costo_errori: 0, costo_diretto: 0 });

beforeEach(() => {
  db = new DbMinimo(); tables = []; failures = new Set();
  db.rpcs.silvio_tool_propose_action = () => ({ proposal_id: "pending-proposal" });
  db.tabelle.orders = [{ id: "order-a", company_id: "company-a", order_code: "TEST-01", description: "Test fittizio" }];
  db.tabelle.v_ordine_marginalita = [snapshot()];
  db.tabelle.order_items = [{ order_id: "order-a", quantity: 1, purchase_price: 2000 }];
  db.tabelle.order_employees = [{ order_id: "order-a", total_cost: 4000 }];
  db.tabelle.order_external_teams = [];
  db.tabelle.order_installments = [{ order_id: "order-a", amount: 3000, is_paid: true }, { order_id: "order-a", amount: 8000, is_paid: false }];
  db.tabelle.prima_nota_entries = [{ company_id: "company-a", order_id: "order-a", direction: "entrata", amount: 3000 }];
  const from = db.from.bind(db);
  db.from = ((name: string) => {
    tables.push(name);
    const query = from(name);
    // This test's ilike supports literal codes (including escaped % and _).
    Object.assign(query, { ilike: (column: string, pattern: string) => {
      if (pattern.startsWith("%") && pattern.endsWith("%")) {
        const matches = (db.tabelle[name] ?? []).filter(row => String(row[column]).includes(pattern.slice(1, -1)));
        return query.in(column, matches.map(row => row[column]));
      }
      return query.eq(column, pattern.replace(/\\([\\%_])/g, "$1"));
    } });
    if (failures.has(name)) Object.assign(query, { then: (resolve: (v: unknown) => unknown) => Promise.resolve(resolve({ data: null, error: { message: "private DB diagnostic" } })) });
    return query;
  }) as typeof db.from;
  ctx = { supabase: db, companyId: "company-a", userId: "user", primaryRole: "company_admin", channel: "internal_chat", personaKey: "silvio" };
});

async function report(code = "TEST-01") {
  return await SILVIO_TOOLS.report_commessa.executor({ commessa_codice: code }, ctx);
}

describe("report Silvio = fonte e regole del dettaglio commessa", () => {
  it("UI and server share the exact same quality and normalization functions", () => {
    expect(canonicalOrderEconomics).toBe(shared.canonicalOrderEconomics);
    expect(assessOrderEconomicsQuality).toBe(shared.assessOrderEconomicsQuality);
  });
  it.each(["interni", "mista", "subappalto"])("handles %s without inventing required cost categories", async type => {
    db.tabelle.order_employees = type === "subappalto" ? [] : [{ order_id: "order-a", total_cost: type === "mista" ? 2000 : 4000 }];
    db.tabelle.order_external_teams = type === "interni" ? [] : [{ order_id: "order-a", total_cost: type === "mista" ? 2000 : 4000 }];
    const result = await report();
    expect(result.margine).toMatchObject({ importo: 5000, parziale: false });
    expect(result.qualita.status).toBe("ready");
    expect(result.costi.manodopera).toBe(4000);
    expect(db.scritture).toEqual([]);
  });
  it("never adds ODA, supplier invoices, SAL or average tariffs to the snapshot", async () => {
    db.tabelle.purchase_orders = [{ order_id: "order-a", total: 2000 }];
    db.tabelle.scadenze = [{ order_id: "order-a", amount: 2000 }];
    db.tabelle.sal_subappaltatori = [{ order_id: "order-a", importo: 4000 }];
    db.tabelle.tariffe_aziendali = [{ company_id: "company-a", costo_interno: 999 }];
    const result = await report();
    expect(result.costi.totale).toBe(6000);
    expect(result.ricavi).toEqual({ contratto: 10000, varianti_approvate: 1000, totale: 11000 });
    expect(tables).not.toContain("purchase_orders");
    expect(tables).not.toContain("scadenze");
    expect(tables).not.toContain("tariffe_aziendali");
    expect(result.link).toBe("/azienda/ordini/order-a?tab=finanza");
  });
  it("keeps cash separate without doubling the same receipt", async () => {
    const result = await report();
    expect(result.cassa).toMatchObject({ incassato_da_rate: 3000, da_incassare_da_rate: 8000, entrate_prima_nota: 3000 });
    expect(result.margine.importo).toBe(5000);
    db.tabelle.prima_nota_entries[0].amount = 2900;
    expect((await report()).avvisi.join(" ")).toContain("non coincidono");
  });
  it("cash failures do not become zero receipts or erase the valid direct margin", async () => {
    failures.add("prima_nota_entries"); failures.add("order_installments");
    const result = await report();
    expect(result.cassa).toMatchObject({ incassato_da_rate: null, entrate_prima_nota: null });
    expect(result.margine.importo).toBe(5000);
  });
  it.each(["v_ordine_marginalita", "order_items", "order_employees", "order_external_teams", "orders"])("fails closed on %s read errors", async table => {
    failures.add(table);
    const result = await report();
    expect(result.margine).toBeNull();
    expect(result.error).toBeTruthy();
    expect(JSON.stringify(result)).not.toContain("private DB diagnostic");
  });
  it("no costs does not become a 100% margin", async () => {
    Object.assign(db.tabelle.v_ordine_marginalita[0], { consuntivo: 0, margine: 11000, margine_perc: 100 });
    expect((await report()).margine).toBeNull();
  });
  it("missing snapshot never falls back to local summation", async () => {
    db.tabelle.v_ordine_marginalita = [];
    expect((await report()).margine).toBeNull();
  });
  it.each([null, undefined, "", "NaN", Infinity])("invalid source amounts (%s) are not coerced to zero", async amount => {
    db.tabelle.v_ordine_marginalita[0].consuntivo = amount;
    expect((await report()).margine).toBeNull();
  });
  it("partial inputs expose the same issues as the UI", async () => {
    db.tabelle.order_employees[0].total_cost = 0;
    db.tabelle.order_items[0].purchase_price = null;
    Object.assign(db.tabelle.v_ordine_marginalita[0], { movimenti_magazzino_senza_costo: 2, numero_rimborsi_km_da_approvare: 1 });
    const result = await report();
    expect(result.qualita.status).toBe("partial");
    expect(result.margine.parziale).toBe(true);
    expect(result.qualita.issues.map((issue: { code: string }) => issue.code)).toEqual(expect.arrayContaining(["employees_without_cost", "items_without_cost", "warehouse_movements_without_cost", "pending_mileage_reimbursements"]));
  });
  it("does not certify potentially truncated quality checks", async () => {
    db.tabelle.order_items = Array.from({ length: 1000 }, () => ({ order_id: "order-a", purchase_price: 1, quantity: 1 }));
    expect((await report()).margine).toBeNull();
  });
  it("tenant filters apply to both order and financial view", async () => {
    db.tabelle.orders.unshift({ id: "order-b", company_id: "company-b", order_code: "TEST-01" });
    db.tabelle.v_ordine_marginalita.unshift({ ...snapshot(), company_id: "company-b", margine: 999999 });
    expect((await report()).margine.importo).toBe(5000);
    ctx.companyId = "company-c";
    tables.length = 0;
    expect((await report()).error).toContain("non trovata");
    expect(tables).toEqual(["orders"]);
  });
  it("ambiguous or blank codes do not read financial data", async () => {
    db.tabelle.orders.push({ ...db.tabelle.orders[0], id: "duplicate" });
    expect((await report()).error).toContain("ambiguo");
    expect(tables).toEqual(["orders"]);
    tables.length = 0;
    expect((await report(" ")).error).toContain("obbligatorio");
    expect(tables).toEqual([]);
  });
  it("wildcards are literal rather than broad order searches", async () => {
    db.tabelle.orders[0].order_code = "TEST_%";
    expect((await report("TEST_%")).margine.importo).toBe(5000);
    expect((await report("%")).error).toContain("non trovata");
  });
  it("transport errors are disclosed without fake financial results", async () => {
    vi.spyOn(db, "from").mockImplementation(() => { throw new Error("private network diagnostic"); });
    const result = await report();
    expect(result.margine).toBeNull();
    expect(result.error).toContain("interrotta");
  });
  it.each([null, undefined, "", " ", true, [], "1.000,00", Number.NaN, Number.POSITIVE_INFINITY])("does not turn a missing/invalid component into zero: %s", value => {
    db.tabelle.v_ordine_marginalita[0].costo_rimborsi_km = value;
    return report().then(result => {
      expect(result.margine).toBeNull();
      expect(result.error).toContain("mancanti o non validi");
    });
  });
  it.each(["preventivo_totale", "consuntivo", "margine", "margine_perc"])("rejects contradictory official %s", async key => {
    db.tabelle.v_ordine_marginalita[0][key] += 100;
    const result = await report();
    expect(result.margine).toBeNull();
    expect(result.error).toContain("non coincidono");
  });
  it("calculates an explicit scenario without changing real figures or writing", async () => {
    const result = await SILVIO_TOOLS.report_commessa.executor({ commessa_codice: "TEST-01", escludi_costo: "materiali" }, ctx);
    expect(result.simulazione).toMatchObject({ costo_escluso: 2000, costi_simulati: 4000, margine_simulato: 7000, ricavi_invariati: 11000 });
    expect(result.margine.importo).toBe(5000);
    expect(result.costi.totale).toBe(6000);
    expect(db.scritture).toEqual([]);
  });
  it("invalid scenario never reads data", async () => {
    expect((await SILVIO_TOOLS.report_commessa.executor({ commessa_codice: "TEST-01", escludi_costo: "tutto" }, ctx)).error).toContain("non valida");
    expect(tables).toEqual([]);
  });
  it("unknown installment status does not become a confirmed outstanding amount", async () => {
    db.tabelle.order_installments[1].is_paid = null;
    expect((await report()).cassa).toMatchObject({ incassato_da_rate: null, da_incassare_da_rate: null, entrate_prima_nota: 3000 });
  });
  it.each(["internal_chat", "whatsapp", "mobile"] as const)("same verified scenario through the real %s permission/routing path", async channel => {
    const result = await executeToolWithRouting("report_commessa", { commessa_codice: "TEST-01", escludi_costo: "materiali" }, { ...ctx, channel });
    expect(result.success, JSON.stringify(result.error)).toBe(true);
    expect(result.data.simulazione).toMatchObject({ costo_escluso: 2000, costi_simulati: 4000, margine_simulato: 7000 });
  });
  it.each(["worker", "subcontractor", "company_staff"])("scenario cannot bypass financial permissions for %s", async primaryRole => {
    const result = await executeToolWithRouting("report_commessa", { commessa_codice: "TEST-01", escludi_costo: "materiali" }, { ...ctx, primaryRole });
    expect(result.success).toBe(false);
    expect(tables).not.toContain("v_ordine_marginalita");
  });
  it("a scenario retains partial-quality status", async () => {
    db.tabelle.order_employees[0].total_cost = 0;
    const result = await SILVIO_TOOLS.report_commessa.executor({ commessa_codice: "TEST-01", escludi_costo: "manodopera" }, ctx);
    expect(result.simulazione.parziale).toBe(true);
    expect(result.avvisi.join(" ")).toContain("operaio senza costo");
  });
});

describe("operational mutations need a real confirmation", () => {
  it.each(["fissa_appuntamento", "registra_rapportino"])("%s creates a proposal without executing", async tool => {
    const result = await executeToolWithRouting(tool, { titolo: "Test", data: "2026-10-07", commessa_codice: "TEST-01", ore: 8 }, ctx);
    expect(result.success, JSON.stringify(result.error)).toBe(true);
    expect(result.riskLevel).toBe("yellow");
    expect(result.proposalId).toBeTruthy();
    expect(db.scritture.some(write => ["appointments", "campo_rapportini"].includes(write.tabella))).toBe(false);
  });
  it.each([
    ["fissa_appuntamento", "appointments"], ["registra_rapportino", "campo_rapportini"],
  ])("%s still executes through the approved routing path", async (tool, table) => {
    const result = await executeToolWithRouting(tool, { titolo: "Test", data: "2026-10-07", commessa_codice: "TEST-01", ore: 8 }, { ...ctx, preApproved: true });
    expect(result.success, JSON.stringify(result.error)).toBe(true);
    expect(result.proposalId).toBeUndefined();
    expect(db.scritture.filter(write => write.tabella === table)).toHaveLength(1);
    expect(result.data).toHaveProperty("link");
  });
});

describe("aggregate margins use the dashboard normalization", () => {
  const input = () => ({ meta: { company_id: "company-a" }, kpi: {}, righe: [
    { id: "started", preventivo: 10000, variazioni: 1000, consuntivo: 3000, margine: 8000, margine_perc: 8000 / 11000 * 100, pct_avanzamento: 50 },
    { id: "early", preventivo: 10000, variazioni: 0, consuntivo: 1000, margine: 9000, pct_avanzamento: 5 },
    { id: "missing", preventivo: 10000, variazioni: 0, consuntivo: 0, margine: 10000, margine_perc: 100, pct_avanzamento: 0 },
    { id: "complete", preventivo: 10000, variazioni: 0, consuntivo: 12000, margine: -2000, pct_avanzamento: 100 },
  ] } as MarginalitaCommesseResult);
  it("normalizes progress, variations and missing costs without mutating the RPC/cache", () => {
    const raw = input();
    const normalized = normalizeMarginalitaCommesse(raw);
    expect(normalized.righe[0]).toMatchObject({ preventivo: 11000, pct_avanzamento: 0.5, costo_atteso: 6000, margine_atteso: 5000 });
    expect(normalized.righe[1].costo_atteso).toBeNull();
    expect(normalized.righe[2].dati_economici_completi).toBe(false);
    expect(normalized.kpi).toMatchObject({ n_in_corso: 2, n_completate: 1, n_da_completare: 1, n_in_perdita: 1, margine_totale: 15000 });
    expect(raw.righe[0].preventivo).toBe(10000);
    expect(raw.righe[0].pct_avanzamento).toBe(50);
    expect(normalizeMarginalitaCommesse(raw)).toEqual(normalized);
  });
  it("actual tool matches the dashboard KPIs and separates uncosted orders", async () => {
    const raw = input();
    db.rpcs.cg_get_marginalita_commesse = () => raw;
    const result = await SILVIO_TOOLS.get_marginalita_commesse.executor({ anno: 2026 }, ctx);
    expect(result.kpi).toEqual(normalizeMarginalitaCommesse(raw).kpi);
    expect(result.commesse_a_margine_piu_basso.map((r: { id: string }) => r.id)).toEqual(["complete", "started", "early"]);
    expect(result.commesse_dati_da_completare[0]).toMatchObject({ id: "missing", margine: null, margine_perc: null });
    expect(result.commesse_a_margine_piu_basso[0]).not.toHaveProperty("costo_manodopera");
    expect(db.rpcChiamate[0].args.p_company_id).toBe("company-a");
  });
});
