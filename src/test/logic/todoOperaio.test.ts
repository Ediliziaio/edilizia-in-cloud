import { describe, expect, it } from "vitest";
import { componiTodoOperaio } from "../../../supabase/functions/_shared/todoOperaio";

describe("cose del giorno all'operaio", () => {
  it("mette titolo, indirizzo, descrizione e con chi", () => {
    const t = componiTodoOperaio("Marco", [{
      titolo: "ORD-12 — Cappotto Rossi",
      indirizzo: "Via Mazzini 14, Como",
      descrizione: "Posa pannelli lato nord",
      conChi: ["Luca", "Antonio"],
    }]);
    expect(t).toContain("Ciao Marco,");
    expect(t).toContain("📍 ORD-12 — Cappotto Rossi");
    expect(t).toContain("📌 Via Mazzini 14, Como");
    expect(t).toContain("Posa pannelli lato nord");
    expect(t).toContain("👷 Con: Luca, Antonio");
    expect(t).toContain("rapportino");
  });
  it("omette le parti che non ci sono", () => {
    const t = componiTodoOperaio("Luca", [{ titolo: "ORD-9" }]);
    expect(t).toContain("📍 ORD-9");
    expect(t).not.toContain("📌");
    expect(t).not.toContain("👷");
  });
  it("più cantieri, e senza cantieri lo dice", () => {
    expect(componiTodoOperaio("Y", [{ titolo: "A" }, { titolo: "B" }])).toContain("📍 B");
    expect(componiTodoOperaio("X", [])).toContain("non risultano cantieri assegnati");
  });
});
