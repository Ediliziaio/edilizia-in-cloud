import { describe, expect, it } from "vitest";
import { pianoModello } from "../../../supabase/functions/_shared/pianoModello";

describe("scelta del modello e dei token per turno", () => {
  it("l'operaio è sempre economico, stringato, senza Silvio", () => {
    const p = pianoModello("operaio", "rapportino");
    expect(p.taskKind).toBe("bot_operativo_operaio");
    expect(p.usaSilvio).toBe(false);
    expect(p.maxTokens).toBeLessThanOrEqual(800);
    expect(p.approfondito).toBe(false);
  });
  it("l'amministratore su un'azione operativa resta economico e senza Silvio", () => {
    for (const i of ["ddt", "conferma", "presenze", "foto_cantiere", "segnalazione", "annulla"]) {
      const p = pianoModello("admin", i);
      expect(p.taskKind).toBe("bot_operativo_operaio");
      expect(p.usaSilvio).toBe(false);
    }
  });
  it("l'amministratore che chiede dati va sul modello forte, approfondito, con Silvio", () => {
    const p = pianoModello("admin", "domanda");
    expect(p.taskKind).toBe("bot_operativo_titolare");
    expect(p.usaSilvio).toBe(true);
    expect(p.approfondito).toBe(true);
    expect(p.maxTokens).toBeGreaterThanOrEqual(2000);
  });
  it("anche l'ufficio con una domanda ambigua (unknown) va sul forte", () => {
    expect(pianoModello("ufficio", "unknown").taskKind).toBe("bot_operativo_titolare");
  });
});
