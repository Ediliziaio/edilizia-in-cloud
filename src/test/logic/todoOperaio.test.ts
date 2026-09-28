import { describe, expect, it } from "vitest";
import { componiTodoOperaio } from "../../../supabase/functions/_shared/todoOperaio";

describe("cose del giorno all'operaio", () => {
  it("elenca i cantieri assegnati", () => {
    const t = componiTodoOperaio("Marco", ["ORD-12 Cappotto Rossi", "ORD-15 Facciata Bianchi"]);
    expect(t).toContain("Ciao Marco,");
    expect(t).toContain("• ORD-12 Cappotto Rossi");
    expect(t).toContain("• ORD-15 Facciata Bianchi");
    expect(t).toContain("rapportino");
  });
  it("senza cantieri lo dice", () => {
    expect(componiTodoOperaio("Luca", [])).toContain("non risultano cantieri assegnati");
  });
  it("regge il nome vuoto", () => {
    expect(componiTodoOperaio(null, ["X"])).toContain("Ciao,");
  });
});
