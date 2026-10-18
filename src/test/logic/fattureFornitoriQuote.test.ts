import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ effectiveCompany: undefined as unknown }) }));

import { quoteDeiCostiRipartiti } from "@/components/orders/OrderDocumentiFornitore";

describe("quota della commessa sui costi ripartiti (fatture fornitori)", () => {
  it("un costo intestato a questa commessa ma ripartito A 40% · B 60% conta il 40%", () => {
    const quote = quoteDeiCostiRipartiti([
      { id: "c1", order_id: "A", allocations: [{ order_id: "A", pct: 40 }, { order_id: "B", pct: 60 }] },
    ], "A");
    expect(quote.get("c1")).toBe(40);
  });
  it("un costo di un'altra commessa che cita questa al 60% conta il 60%", () => {
    expect(quoteDeiCostiRipartiti([
      { id: "c2", order_id: "A", allocations: [{ order_id: "A", pct: 40 }, { order_id: "B", pct: 60 }] },
    ], "B").get("c2")).toBe(60);
  });
  it("al 100%, senza ripartizione o con una percentuale non valida resta intero", () => {
    const quote = quoteDeiCostiRipartiti([
      { id: "pieno", order_id: "A", allocations: [{ order_id: "A", pct: 100 }] },
      { id: "senza", order_id: "A", allocations: null },
      { id: "altra", order_id: "A", allocations: [{ order_id: "B", pct: 50 }] },
      { id: "rotta", order_id: "A", allocations: [{ order_id: "A", pct: "boh" }] },
    ], "A");
    expect(quote.size).toBe(0);
  });
});
