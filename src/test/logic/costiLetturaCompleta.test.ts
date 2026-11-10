import { beforeEach, describe, expect, it, vi } from "vitest";
import { leggiCostiAzienda } from "@/lib/finance/leggiCostiAzienda";
const state = vi.hoisted(() => ({ failAt: -1, filters: [] as unknown[][], ranges: [] as number[][] }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: (table: string) => {
  state.filters.push(["from", table]);
  const q: Record<string, unknown> = {};
  for (const method of ["select", "eq", "gte", "lte", "order"]) q[method] = (...args: unknown[]) => { state.filters.push([method, ...args]); return q; };
  q.range = async (from: number, to: number): Promise<{ data: Array<{ id: string; amount: number }> | null; error: Error | null }> => {
    state.ranges.push([from, to]);
    return from === state.failAt
      ? { data: null, error: new Error("Seconda pagina non disponibile") }
      : { data: Array.from({ length: Math.max(0, Math.min(to + 1, 1003) - from) }, (_, i) => ({ id: String(from + i), amount: 1 })), error: null };
  };
  return q;
} } }));
beforeEach(() => { state.failAt = -1; state.filters = []; state.ranges = []; });
describe("costi oltre il limite REST", () => {
  it("legge anche dopo la millesima riga, con azienda, periodo e ordine stabile in ogni pagina", async () => {
    const rows = await leggiCostiAzienda("demo", "2026-01-01", "2026-12-31");
    expect(rows).toHaveLength(1003);
    expect(state.ranges).toEqual([[0,499],[500,999],[1000,1499]]);
    for (const filter of [["eq","company_id","demo"],["gte","due_date","2026-01-01"],["lte","due_date","2026-12-31"],["order","id",{ascending:true}]]) expect(state.filters.filter(f => JSON.stringify(f) === JSON.stringify(filter))).toHaveLength(3);
  });
  it("se una pagina fallisce non espone un totale incompleto come successo", async () => {
    state.failAt = 500;
    await expect(leggiCostiAzienda("demo")).rejects.toThrow("Seconda pagina non disponibile");
    expect(state.ranges).toHaveLength(2);
  });
});
