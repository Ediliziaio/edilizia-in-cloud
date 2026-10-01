import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadApprovedRevenueVariations, loadIssuedCommitments } from "@/lib/orders/loadEconomicCommitments";
const mocks = vi.hoisted(() => ({ eq: vi.fn(), range: vi.fn(), from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => {
  const chain = { select: () => chain, eq: mocks.eq, in: () => chain, order: () => chain, range: mocks.range };
  mocks.eq.mockReturnValue(chain); mocks.from.mockReturnValue(chain);
  return { supabase: { from: mocks.from } };
});
beforeEach(() => { mocks.range.mockReset(); mocks.eq.mockClear(); mocks.from.mockClear(); });
describe("lettori economici riusano i registri e falliscono visibilmente", () => {
  it("pagina oltre 500 righe e applica company e order a ogni pagina", async () => {
    mocks.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, () => ({ subtotal: 1 })), error: null }).mockResolvedValueOnce({ data: [{ subtotal: 2 }], error: null });
    expect(await loadIssuedCommitments("c1", "o1")).toHaveLength(501);
    expect(mocks.eq.mock.calls.filter(c => c[0] === "company_id")).toEqual([["company_id", "c1"], ["company_id", "c1"]]);
    expect(mocks.range).toHaveBeenNthCalledWith(2, 500, 999);
  });
  it("errore nella seconda pagina non restituisce un totale parziale", async () => {
    mocks.range.mockResolvedValueOnce({ data: Array.from({ length: 500 }, () => ({ subtotal: 1 })), error: null }).mockResolvedValueOnce({ data: null, error: new Error("offline") });
    await expect(loadIssuedCommitments("c1", "o1")).rejects.toThrow("offline");
  });
  it("variazione approvata senza importo non diventa zero", async () => {
    mocks.range.mockResolvedValue({ data: [{ impatto_economico: null }], error: null });
    await expect(loadApprovedRevenueVariations("c1", "o1")).rejects.toThrow("senza importo");
  });
  it("riduzione approvata negativa è valida sul ricavo", async () => {
    mocks.range.mockResolvedValue({ data: [{ impatto_economico: -100 }], error: null });
    expect(await loadApprovedRevenueVariations("c1", "o1")).toEqual([{ impatto_economico: -100 }]);
  });
  it("senza tenant non legge nulla", async () => {
    await expect(loadIssuedCommitments("", "o1")).rejects.toThrow();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
