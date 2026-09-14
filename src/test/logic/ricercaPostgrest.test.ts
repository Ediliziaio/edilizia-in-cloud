import { describe, expect, it } from "vitest";
import { termineDiRicerca } from "@/lib/ricercaPostgrest";

describe("termineDiRicerca", () => {
  it("toglie quello che spezza il filtro .or() di PostgREST", () => {
    expect(termineDiRicerca("Tubo 20,5 (rame)")).toBe("Tubo 20 5 rame");
    expect(termineDiRicerca('Rubinetto "cromo" 50%\\')).toBe("Rubinetto cromo 50");
  });

  it("lascia i codici col trattino basso e accorcia i testi lunghi", () => {
    expect(termineDiRicerca("  ABC_123  ")).toBe("ABC_123");
    expect(termineDiRicerca("x".repeat(200))).toHaveLength(80);
    expect(termineDiRicerca(null)).toBe("");
  });
});
