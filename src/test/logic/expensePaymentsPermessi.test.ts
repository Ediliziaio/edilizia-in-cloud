import { beforeEach, expect, it, vi } from "vitest";
import { registerExpensePayment } from "@/lib/orders/expensePayments";

const stato = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: stato.rpc } }));
beforeEach(() => { stato.rpc.mockReset().mockResolvedValue({ data: { residuo: 0 }, error: null }); });

it("anche il pagamento rapido dalla lista costi usa il percorso con permessi verificati", async () => {
  await registerExpensePayment({ costId: "costo", requestId: "richiesta", date: "2026-11-27" });
  expect(stato.rpc).toHaveBeenCalledWith("registra_pagamento_costo_con_conto", expect.objectContaining({
    p_costo: "costo", p_richiesta: "richiesta", p_conto_banca: null, p_conto_liquidita: null,
  }));
});

it("un collegamento a banca mantiene il percorso che controlla il movimento originale", async () => {
  await registerExpensePayment({ costId: "costo", requestId: "richiesta", date: "2026-11-27", bankId: "banca", existingId: "pagamento" });
  expect(stato.rpc).toHaveBeenCalledWith("registra_pagamento_costo", expect.objectContaining({ p_banca: "banca", p_esistente: "pagamento" }));
});
