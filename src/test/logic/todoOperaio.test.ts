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

describe("cose del giorno: cosa fare e parametro del modello Meta (18/10/2026)", () => {
  it("dice le fasi di oggi e le attività in scadenza", async () => {
    const { componiTodoOperaio } = await import("../../../supabase/functions/_shared/todoOperaio");
    const testo = componiTodoOperaio("Mario Rossi", [{ titolo: "ORD-7 — Villa Rossi", indirizzo: "Via Roma 1", fasi: ["Massetto piano terra"], conChi: ["Luca"] }], ["Ritirare il ponteggio"]);
    expect(testo).toContain("🔨 Oggi: Massetto piano terra");
    expect(testo).toContain("👷 Con: Luca");
    expect(testo).toContain("✅ Da fare: Ritirare il ponteggio");
  });

  it("il testo per il modello Meta sta su una riga: Meta rifiuta gli a capo (#132018)", async () => {
    const { testoPerModello } = await import("../../../supabase/functions/_shared/routineOperativa");
    const riga = testoPerModello("Ciao Mario,\n\n📍 ORD-7\n📌 Via Roma\t1     interno");
    expect(riga).not.toMatch(/[\n\t]| {2,}/);
    expect(riga).toBe("Ciao Mario, · 📍 ORD-7 · 📌 Via Roma 1 interno");
    expect(testoPerModello("x".repeat(2000)).length).toBeLessThanOrEqual(1000);
  });
});

describe("rapportino della sera: chi l'ha già mandato (18/10/2026)", () => {
  it("conta l'autore, la squadra nelle presenze e le ore registrate dall'ufficio", async () => {
    const { copertiDaRapportini } = await import("../../../supabase/functions/_shared/todoOperaio");
    const coperti = copertiDaRapportini([
      { user_id: "u-capo", presenze: [{ employee_id: "e-1" }, { employee_id: "e-2" }] },
      { user_id: null, ufficio_employee_id: "e-3" },
      { user_id: null, presenze: [{ employee_id: "e-4", nome: "Senza account" }] },
    ], (u) => (u === "u-capo" ? "e-capo" : null));
    expect([...coperti].sort()).toEqual(["e-1", "e-2", "e-3", "e-4", "e-capo"]);
  });
});
