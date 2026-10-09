import { beforeEach, describe, expect, it, vi } from "vitest";
const db = vi.hoisted(() => ({ data: null as Record<string, number | null> | null, error: null as { message: string } | null, update: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => {
  const chain = { select: () => chain, eq: () => chain,
    maybeSingle: async () => ({ data: db.data, error: db.error }),
    update: (patch: unknown) => { db.update(patch); return chain; },
    then: (resolve: (value: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve),
  }; return chain;
} } }));
import { updateManodopera } from "@/lib/serramenti/api";

beforeEach(() => { db.data = null; db.error = null; db.update.mockClear(); });
describe("service totals read guard", () => {
  it("does not write on failed reads", async () => {
    db.error = { message: "network" };
    await expect(updateManodopera("service", { quantita: 2 })).rejects.toThrow("Impossibile leggere");
    expect(db.update).not.toHaveBeenCalled();
  });
  it("does not write if the service is missing", async () => {
    await expect(updateManodopera("service", { quantita: 2 })).rejects.toThrow("Servizio non trovato");
    expect(db.update).not.toHaveBeenCalled();
  });
  it("retains authoritative quantities when updating just the selling price", async () => {
    db.data = { quantita: 3, prezzo_unitario_costo: 40, prezzo_unitario_vendita: 80 };
    await updateManodopera("service", { prezzo_unitario_vendita: 100 });
    expect(db.update).toHaveBeenCalledWith({ prezzo_unitario_vendita: 100, prezzo_totale_costo: 120, prezzo_totale_vendita: 300 });
  });
});
