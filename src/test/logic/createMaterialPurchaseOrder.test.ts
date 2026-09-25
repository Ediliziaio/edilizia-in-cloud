import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ calls: [] as Array<{ table: string; op: string; values?: unknown; filters: Array<[string, unknown]>; range?: number[] }>, headers: [] as unknown[], orphanRows: [] as unknown[], coverage: [] as unknown[], current: [] as unknown[], coverageError: null as Error | null, lineError: null as Error | null, headerError: null as Error | null, diaryError: null as Error | null, pages: null as unknown[][] | null }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: { id: "company" } }) }));
vi.mock("@/utils/logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  const call: typeof state.calls[number] = { table, op: "select", filters: [] }; state.calls.push(call);
  const result = () => {
    if (table === "order_items") return { data: state.current, error: null };
    if (table === "purchase_orders") return call.op === "insert" ? { data: { id: "po" }, error: state.headerError } : { data: state.headers, error: null };
    if (table === "purchase_order_items" && call.filters.some(f => f[0] === "purchase_order_id")) return { data: state.orphanRows, error: null };
    if (table === "order_events") return { data: null, error: state.diaryError };
    return call.op === "insert" ? { data: null, error: state.lineError } : { data: state.pages ? state.pages[(call.range?.[0] ?? 0) / 500] ?? [] : state.coverage, error: state.coverageError };
  };
  const q = {
    select: () => q, insert: (values: unknown) => { call.op = "insert"; call.values = values; return q; },
    eq: (key: string, value: unknown) => { call.filters.push([key, value]); return q; },
    neq: (key: string, value: unknown) => { call.filters.push([`neq:${key}`, value]); return q; },
    in: (key: string, value: unknown) => { call.filters.push([key, value]); return q; },
    order: () => q, range: (a: number, b: number) => { call.range = [a, b]; return q; },
    single: () => Promise.resolve(result()), then: (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve),
  };
  return q;
} } }));
import { createMaterialPurchaseOrder, IncompletePurchaseOrderError } from "@/lib/orders/createMaterialPurchaseOrder";
import { loadMaterialCoverage } from "@/hooks/useMaterialProcurement";
const item = { id: "a", name: "Pavimento", quantity: 10, purchase_price: 20, vat_rate: 0, supplier_id: "s", status: "da_ordinare" };
const row = { id: "r", order_item_id: "a", quantity: 4, quantity_received: 2, purchase_orders: { id: "old", oda_number: "ODA-1", status: "confermato" } };
const input = () => ({ companyId: "company", orderId: "order", supplierId: "s", items: [item] });
beforeEach(() => Object.assign(state, { calls: [], headers: [], orphanRows: [], coverage: [], current: [item], coverageError: null, lineError: null, headerError: null, diaryError: null, pages: null }));
const inserts = () => state.calls.filter(c => c.op === "insert");

describe("OdA commessa: preflight reale e mutazioni simulate", () => {
  it("crea una bozza collegata con IVA zero e non cambia lo stato dell’articolo", async () => {
    await expect(createMaterialPurchaseOrder(input())).resolves.toEqual({ poId: "po", n: 1 });
    expect(inserts()[0]).toMatchObject({ table: "purchase_orders", values: { company_id: "company", order_id: "order", status: "bozza" } });
    expect(inserts()[1].values).toEqual([expect.objectContaining({ quantity: 10, vat_rate: 0, order_item_id: "a" })]);
    expect(state.calls.some(c => c.op !== "select" && c.table === "order_items")).toBe(false);
  });
  it("se il controllo copertura fallisce non crea nemmeno la testata", async () => {
    state.coverageError = new Error("rete"); await expect(createMaterialPurchaseOrder(input())).rejects.toThrow("rete"); expect(inserts()).toHaveLength(0);
  });
  it("non crea testate vuote se tutto è già in bozza", async () => {
    state.coverage = [{ ...row, quantity: 10 }]; await expect(createMaterialPurchaseOrder(input())).rejects.toThrow("cambiati"); expect(inserts()).toHaveLength(0);
  });
  it("prepara solo il residuo già mostrato all’utente", async () => {
    state.coverage = [row]; await createMaterialPurchaseOrder({ ...input(), items: [{ ...item, quantity: 6 }] });
    expect(inserts()[1].values).toEqual([expect.objectContaining({ quantity: 6 })]);
  });
  it.each(["supplier", "price", "stock", "missing"])("blocca dati modificati da un altro terminale: %s", async what => {
    state.current = what === "missing" ? [] : [{ ...item, ...(what === "supplier" ? { supplier_id: "other" } : what === "price" ? { purchase_price: 999 } : { stock_item_id: "stock" }) }];
    await expect(createMaterialPurchaseOrder(input())).rejects.toThrow("cambiati"); expect(inserts()).toHaveLength(0);
  });
  it("senza selezione non fa scritture", async () => { await expect(createMaterialPurchaseOrder({ ...input(), items: [] })).rejects.toThrow("Nessun articolo"); expect(inserts()).toHaveLength(0); });
  it("un errore sulle righe restituisce la bozza da verificare senza cancellarla", async () => {
    state.lineError = new Error("rete"); await expect(createMaterialPurchaseOrder(input())).rejects.toMatchObject({ poId: "po", name: "Error" });
    try { await createMaterialPurchaseOrder(input()); } catch (e) { expect(e).toBeInstanceOf(IncompletePurchaseOrderError); }
    expect(state.calls.every(c => c.op !== "delete")).toBe(true);
  });
  it("riconosce ordini preesistenti senza righe collegate e non duplica acquisti", async () => {
    state.headers = [{ id: "legacy", oda_number: "ODA-LEGACY", supplier_id: "s" }];
    state.orphanRows = [{ id: "line", purchase_order_id: "legacy", order_item_id: null }];
    await expect(createMaterialPurchaseOrder(input())).rejects.toThrow("ODA-LEGACY");
    expect(inserts()).toHaveLength(0);
  });
  it("riconosce anche una bozza rimasta vuota", async () => {
    state.headers = [{ id: "legacy", oda_number: "ODA-LEGACY", supplier_id: "s" }];
    await expect(createMaterialPurchaseOrder(input())).rejects.toThrow("senza righe");
    expect(inserts()).toHaveLength(0);
  });
  it("ordini interamente collegati non bloccano il residuo", async () => {
    state.headers = [{ id: "legacy", oda_number: "ODA-LEGACY", supplier_id: "s" }];
    state.orphanRows = [{ id: "line", purchase_order_id: "legacy", order_item_id: "a" }];
    await expect(createMaterialPurchaseOrder(input())).resolves.toMatchObject({ poId: "po" });
  });
  it("errore testata non avvia insert righe", async () => {
    state.headerError = new Error("RLS"); await expect(createMaterialPurchaseOrder(input())).rejects.toThrow("RLS"); expect(inserts()).toHaveLength(1);
  });
  it("errore diario non fa credere che l’OdA sia fallito", async () => {
    state.diaryError = new Error("diario"); await expect(createMaterialPurchaseOrder(input())).resolves.toMatchObject({ poId: "po" });
  });
  it("due click simultanei nella stessa app non creano due ordini", async () => {
    const results = await Promise.allSettled([createMaterialPurchaseOrder(input()), createMaterialPurchaseOrder(input())]);
    expect(results.map(r => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    expect(inserts().filter(c => c.table === "purchase_orders")).toHaveLength(1);
  });
  it("tutte le letture sono circoscritte ad azienda e commessa", async () => {
    await createMaterialPurchaseOrder(input());
    expect(state.calls.find(c => c.table === "order_items")?.filters).toEqual(expect.arrayContaining([["order_id", "order"], ["orders.company_id", "company"]]));
    expect(state.calls.find(c => c.table === "purchase_order_items" && c.op === "select")?.filters).toEqual(expect.arrayContaining([["company_id", "company"], ["purchase_orders.company_id", "company"], ["neq:purchase_orders.status", "annullato"]]));
  });
  it("legge anche coperture oltre una pagina", async () => {
    state.pages = [Array.from({ length: 500 }, (_, i) => ({ ...row, id: String(i) })), [row]];
    expect(await loadMaterialCoverage("company", ["a"])).toHaveLength(501);
    expect(state.calls.map(c => c.range)).toEqual([[0, 499], [500, 999]]);
  });
  it("non nasconde un errore di lettura", async () => {
    state.coverageError = new Error("lettura"); await expect(loadMaterialCoverage("company", ["a"])).rejects.toThrow("lettura");
  });
});
