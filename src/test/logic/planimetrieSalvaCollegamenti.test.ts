import { beforeEach, describe, expect, it, vi } from "vitest";
import { aggiornaDatiPlanimetria } from "@/lib/planimetrie/archivio";
const db = vi.hoisted(() => ({ from: vi.fn(), update: vi.fn(), eq: vi.fn(), select: vi.fn(), maybeSingle: vi.fn(), rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: db.from, rpc: db.rpc } }));
beforeEach(() => {
  vi.clearAllMocks();
  const query = { update: db.update, eq: db.eq, select: db.select, maybeSingle: db.maybeSingle };
  for (const fn of [db.from, db.update, db.eq, db.select]) fn.mockReturnValue(query);
});
describe("Salvataggio dei riferimenti della pianta", () => {
  it("aggiorna solo le scelte esplicite e controlla azienda e modifica concorrente", async () => {
    db.maybeSingle.mockResolvedValue({ data: { id: "p1" }, error: null });
    await aggiornaDatiPlanimetria("p1", { customerId: "cliente-1", contactId: null }, { companyId: "azienda-A", updatedAt: "data-prima" });
    expect(db.update).toHaveBeenCalledWith({ customer_id: "cliente-1", contact_id: null });
    expect(db.eq.mock.calls).toEqual([["id", "p1"], ["company_id", "azienda-A"], ["updated_at", "data-prima"]]);
  });
  it("non dichiara salvato un aggiornamento che non ha modificato nessuna riga", async () => {
    db.maybeSingle.mockResolvedValue({ data: null, error: null });
    await expect(aggiornaDatiPlanimetria("p1", { quoteId: "q1" })).rejects.toThrow(/ricarica/);
  });
});
