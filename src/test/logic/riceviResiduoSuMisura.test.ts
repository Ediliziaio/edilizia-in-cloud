import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: state.from, rpc: state.rpc } }));
import { riceviResiduoOda } from "@/lib/orders/riceviResiduoOda";

const risposte: Record<string, unknown> = {
  purchase_orders: { data: { delivery_warehouse_id: null, supplier_id: "s" }, error: null },
  purchase_order_items: { data: [
    { id: "su", description: "Finestra", sku: null, quantity: 1, quantity_received: 0, unit_price: 1, vat_rate: 22, order_item_id: "o1" },
    { id: "no", description: "Silicone", sku: null, quantity: 2, quantity_received: 0, unit_price: 1, vat_rate: 22, order_item_id: "o2" },
  ], error: null },
  order_items: { data: [{ id: "o1", gruppo_id: "g", measure_status: null }, { id: "o2", gruppo_id: null, measure_status: null }], error: null },
  warehouse_stock: { data: { id: "st" }, error: null },
};

beforeEach(() => {
  vi.clearAllMocks();
  state.rpc.mockResolvedValue({ data: [{ oda_completo: false, errori: [] }], error: null });
  state.from.mockImplementation((t: string) => {
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "ilike", "match", "limit", "insert"]) q[m] = () => q;
    q.single = q.maybeSingle = async () => risposte[t];
    q.then = (r: (v: unknown) => unknown) => Promise.resolve(risposte[t]).then(r);
    return q;
  });
});

describe("«È arrivato tutto» e il su misura", () => {
  it("non segna buone le posizioni su misura: restano da spuntare", async () => {
    const esito = await riceviResiduoOda({ companyId: "c", odaId: "oda" });
    const righe = state.rpc.mock.calls[0][1].p_righe;
    expect(righe.map((r: { item_id: string }) => r.item_id)).toEqual(["no"]);
    expect(esito).toMatchObject({ suMisura: 1, completo: false });
  });
});
