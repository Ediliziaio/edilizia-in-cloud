import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  destinazione: "cantiere", errore: null as Error | null,
  erroreStock: null as Error | null,
  from: vi.fn(), rpc: vi.fn(), filtri: [] as unknown[][],
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: state.from, rpc: state.rpc } }));
import { riceviResiduoOda } from "@/lib/orders/riceviResiduoOda";

beforeEach(() => {
  vi.clearAllMocks();
  state.destinazione = "cantiere"; state.errore = null; state.filtri = [];
  state.erroreStock = null;
  state.rpc.mockResolvedValue({ data: [{ oda_completo: true, errori: [] }], error: null as Error | null });
  state.from.mockImplementation((table: string) => {
    const result = table === "ddt_ricezione"
      ? { data: { id: "ddt", destinazione: state.destinazione }, error: state.errore }
      : table === "purchase_orders"
        ? { data: { delivery_warehouse_id: "warehouse", supplier_id: "supplier" }, error: null as Error | null }
        : table === "purchase_order_items"
          ? { data: [{ id: "item", description: "Mattoni", sku: "MAT", quantity: 10, quantity_received: 4 }], error: null as Error | null }
          : { data: state.erroreStock ? null : { id: "stock" }, error: state.erroreStock };
    const q = {
      select: () => q, match: () => q, limit: () => q,
      eq: (...args: unknown[]) => { state.filtri.push([table, ...args]); return q; },
      single: () => Promise.resolve(result), maybeSingle: () => Promise.resolve(result),
      then: (resolve: (v: typeof result) => unknown) => Promise.resolve(result).then(resolve),
    };
    return q;
  });
});

describe("Arrivo merce e destinazione della bolla", () => {
  it("in cantiere riceve il residuo senza cercare o creare giacenze", async () => {
    expect(await riceviResiduoOda({ companyId: "company", odaId: "oda", ddtId: "ddt", warehouseId: "warehouse" })).toMatchObject({ completo: true, righe: 1 });
    expect(state.from.mock.calls.flat()).not.toContain("warehouse_stock");
    expect(state.rpc).toHaveBeenCalledWith("oda_registra_arrivo", expect.objectContaining({
      p_warehouse_id: null, p_ddt_id: "ddt", p_righe: [{ item_id: "item", quantity: 6, stock_item_id: null }],
    }));
    expect(state.filtri).toContainEqual(["ddt_ricezione", "company_id", "company"]);
    expect(state.filtri).toContainEqual(["ddt_ricezione", "purchase_order_id", "oda"]);
  });
  it("in magazzino conserva l'abbinamento articolo e il carico del residuo", async () => {
    state.destinazione = "magazzino";
    await riceviResiduoOda({ companyId: "company", odaId: "oda", ddtId: "ddt" });
    expect(state.rpc).toHaveBeenCalledWith("oda_registra_arrivo", expect.objectContaining({
      p_warehouse_id: "warehouse", p_righe: [{ item_id: "item", quantity: 6, stock_item_id: "stock" }],
    }));
  });
  it("se la bolla non è leggibile interrompe prima di muovere l'ordine", async () => {
    state.errore = new Error("Bolla non accessibile");
    await expect(riceviResiduoOda({ companyId: "company", odaId: "oda", ddtId: "ddt" })).rejects.toThrow("Bolla non accessibile");
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.from).toHaveBeenCalledTimes(1);
  });
  it("un errore di ricerca giacenza non diventa un nuovo articolo o un carico", async () => {
    state.destinazione = "magazzino";
    state.erroreStock = new Error("Giacenze non accessibili");
    await expect(riceviResiduoOda({ companyId: "company", odaId: "oda", ddtId: "ddt" })).rejects.toThrow("Giacenze non accessibili");
    expect(state.rpc).not.toHaveBeenCalled();
    expect(state.from.mock.calls.filter(([table]) => table === "warehouse_stock")).toHaveLength(1);
    expect(state.filtri).toContainEqual(["purchase_orders", "company_id", "company"]);
  });
});
