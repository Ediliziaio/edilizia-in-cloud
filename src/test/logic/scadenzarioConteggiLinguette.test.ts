import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));
import { filtraScadenzario } from "@/lib/finance/fontiScadenzario";

function registra() {
  const chiamate: Array<[string, ...unknown[]]> = [];
  const q: Record<string, unknown> = {};
  for (const m of ["eq", "neq", "in", "is", "lt", "ilike", "or"]) q[m] = (...a: unknown[]) => { chiamate.push([m, ...a]); return q; };
  return { q, chiamate };
}

describe("Scadenzario: annullate", () => {
  it("con status annullata legge solo le annullate (nessun neq)", () => {
    const { q, chiamate } = registra();
    filtraScadenzario(q, { status: "annullata" });
    expect(chiamate).toContainEqual(["eq", "status", "annullata"]);
    expect(chiamate.some(c => c[0] === "neq")).toBe(false);
  });
  it("senza status le annullate restano fuori", () => {
    const { q, chiamate } = registra();
    filtraScadenzario(q, {});
    expect(chiamate).toContainEqual(["neq", "status", "annullata"]);
  });
});
