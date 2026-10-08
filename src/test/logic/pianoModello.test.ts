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
  it("l'amministratore ha SEMPRE Silvio, anche se l'intent sembra operativo", () => {
    // Un audio del titolare che chiede i dati può essere classificato «rapportino»:
    // non deve mai finire sul percorso economico senza strumenti.
    for (const i of ["rapportino", "ddt", "conferma", "presenze", "foto_cantiere", "segnalazione", "annulla", "domanda", "unknown"]) {
      const p = pianoModello("admin", i);
      expect(p.taskKind).toBe("bot_operativo_titolare");
      expect(p.usaSilvio).toBe(true);
      expect(p.approfondito).toBe(true);
      expect(p.maxTokens).toBeGreaterThanOrEqual(2000);
    }
  });
  it("l'ufficio resta economico sulle azioni semplici ma mantiene gli strumenti", () => {
    for (const i of ["ddt", "conferma", "presenze", "foto_cantiere", "annulla"]) {
      const p = pianoModello("ufficio", i);
      expect(p.taskKind).toBe("bot_operativo_operaio");
      expect(p.usaSilvio).toBe(true);
      expect(p.approfondito).toBe(false);
    }
  });
  it("l'ufficio con domanda/rapportino/segnalazione/unknown va sul forte con Silvio", () => {
    for (const i of ["domanda", "rapportino", "segnalazione", "unknown"]) {
      const p = pianoModello("ufficio", i);
      expect(p.taskKind).toBe("bot_operativo_titolare");
      expect(p.usaSilvio).toBe(true);
    }
  });
});
