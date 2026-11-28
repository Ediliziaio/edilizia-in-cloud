import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
import { filtraScadenzario } from "@/lib/finance/fontiScadenzario";

/** Un finto costruttore di query che registra le chiamate. */
function registra() {
  const chiamate: Array<[string, ...unknown[]]> = [];
  const q: Record<string, unknown> = {};
  for (const m of ["eq", "neq", "in", "is", "lt", "gte", "lte", "ilike", "or"]) q[m] = (...a: unknown[]) => { chiamate.push([m, ...a]); return q; };
  return { q, chiamate };
}

describe("filtraScadenzario: fornitore e cantiere", () => {
  it("il fornitore filtra su supplier_id", () => {
    const { q, chiamate } = registra();
    filtraScadenzario(q, { supplierId: "f-1" });
    expect(chiamate).toContainEqual(["eq", "supplier_id", "f-1"]);
  });
  it("il cantiere senza costi ripartiti filtra su order_id", () => {
    const { q, chiamate } = registra();
    filtraScadenzario(q, { orderId: "c-1" });
    expect(chiamate).toContainEqual(["eq", "order_id", "c-1"]);
  });
  it("il cantiere con costi ripartiti raggiunge anche le loro rate (cost_id)", () => {
    const { q, chiamate } = registra();
    filtraScadenzario(q, { orderId: "c-1", orderCostIds: ["k-1", "k-2"] });
    expect(chiamate).toContainEqual(["or", "order_id.eq.c-1,cost_id.in.(k-1,k-2)"]);
    expect(chiamate.some(c => c[0] === "eq" && c[1] === "order_id")).toBe(false);
  });
  it("senza fornitore né cantiere non aggiunge filtri", () => {
    const { q, chiamate } = registra();
    filtraScadenzario(q, {});
    expect(chiamate.some(c => c[1] === "supplier_id" || c[1] === "order_id")).toBe(false);
  });
  it("fornitore, cantiere e Ri.Ba. insieme (estrazione di fine mese) si sommano", () => {
    const { q, chiamate } = registra();
    filtraScadenzario(q, { supplierId: "f-1", orderId: "c-1", metodo: "riba", dateFrom: "2026-11-01", dateTo: "2026-11-30", soloAperte: true });
    expect(chiamate).toContainEqual(["eq", "supplier_id", "f-1"]);
    expect(chiamate).toContainEqual(["eq", "order_id", "c-1"]);
    expect(chiamate.filter(c => c[0] === "or").length).toBe(1);
  });
});

describe("filtraScadenzario: Altri filtri (importo, note, documento)", () => {
  it("importo da/a filtra su amount, anche con 0", () => {
    const { q, chiamate } = registra();
    filtraScadenzario(q, { importoMin: 0, importoMax: 500 });
    expect(chiamate).toContainEqual(["gte", "amount", 0]);
    expect(chiamate).toContainEqual(["lte", "amount", 500]);
  });
  it("solo con note esclude note vuote e nulle", () => {
    const { q, chiamate } = registra();
    filtraScadenzario(q, { soloConNote: true });
    expect(chiamate).toContainEqual(["neq", "notes", ""]);
  });
  it("solo con documento: fattura o costo collegato", () => {
    const { q, chiamate } = registra();
    filtraScadenzario(q, { soloConDocumento: true });
    expect(chiamate).toContainEqual(["or", "invoice_id.not.is.null,cost_id.not.is.null"]);
  });
  it("senza i nuovi filtri non aggiunge nulla", () => {
    const { q, chiamate } = registra();
    filtraScadenzario(q, {});
    expect(chiamate.some(c => ["gte", "lte"].includes(c[0]) || c[1] === "notes")).toBe(false);
  });
  it("la chiave del riepilogo cambia con i nuovi filtri (riquadri e linguette li seguono)", async () => {
    const { chiaveRiepilogo } = await import("@/lib/finance/riepilogoPeriodoScadenzario");
    expect(chiaveRiepilogo("c", { importoMin: 10 })).not.toEqual(chiaveRiepilogo("c", {}));
    expect(chiaveRiepilogo("c", { soloConNote: true })).not.toEqual(chiaveRiepilogo("c", {}));
    expect(chiaveRiepilogo("c", { soloConDocumento: true })).not.toEqual(chiaveRiepilogo("c", {}));
  });
});

describe("Modalità «Non indicata»", () => {
  it("prende null e vuoto, non i codici MP", async () => {
    const { filtroMetodo, gruppoMetodo, GRUPPI_METODO } = await import("@/lib/finance/metodoScadenza");
    expect(filtroMetodo("non_indicata")).toBe("payment_method.is.null,payment_method.eq.");
    expect(filtroMetodo("non_indicata")).not.toMatch(/MP/);
    expect(gruppoMetodo("MP12")).toBe("riba");
    expect(GRUPPI_METODO.map(g => g.value)).toContain("non_indicata");
  });
  it("lato server si somma alle date come gli altri gruppi", () => {
    const { q, chiamate } = registra();
    filtraScadenzario(q, { metodo: "non_indicata", dateFrom: "2026-11-01", dateTo: "2026-11-30" });
    expect(chiamate.find(c => c[0] === "or")?.[1]).toContain("or(payment_method.is.null,payment_method.eq.)");
  });
});
