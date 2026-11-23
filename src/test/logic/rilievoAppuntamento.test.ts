import { describe, expect, it } from "vitest";
import {
  appuntamentoConRilievo, modelloDiPartenza, preparaRilievoDiPartenza, tipoRilievoDaAppuntamento,
} from "@/lib/surveys/rilievoAppuntamento";

describe("rilievo che nasce con l'appuntamento", () => {
  it("solo i sopralluoghi portano un rilievo", () => {
    for (const t of ["sopralluogo_preventivo", "rilievo_tecnico", "sopralluogo_tecnico", "sopralluogo", "misurazione"]) {
      expect(appuntamentoConRilievo(t)).toBe(true);
    }
    for (const t of ["generico", "inizio_lavori", "videocall", "", null, undefined]) {
      expect(appuntamentoConRilievo(t)).toBe(false);
    }
  });

  it("il sopralluogo preventivo è commerciale, il resto tecnico (come nel database)", () => {
    expect(tipoRilievoDaAppuntamento("sopralluogo_preventivo")).toBe("commerciale");
    expect(tipoRilievoDaAppuntamento("rilievo_tecnico")).toBe("tecnico");
    expect(tipoRilievoDaAppuntamento("sopralluogo")).toBe("tecnico");
  });

  it("di partenza si prepara per il tecnico, non per il commerciale", () => {
    expect(preparaRilievoDiPartenza("rilievo_tecnico")).toBe(true);
    expect(preparaRilievoDiPartenza("misurazione")).toBe(true);
    expect(preparaRilievoDiPartenza("sopralluogo_preventivo")).toBe(false);
    expect(preparaRilievoDiPartenza("generico")).toBe(false);
  });

  it("propone l'ultimo modello usato se c'è ancora, altrimenti il primo", () => {
    const modelli = [
      { id: "a", name: "Infissi", category: "infissi" },
      { id: "b", name: "Bagno", category: "bagno" },
    ];
    expect(modelloDiPartenza(modelli, "b")).toBe("b");
    expect(modelloDiPartenza(modelli, "spento")).toBe("a");
    expect(modelloDiPartenza(modelli, null)).toBe("a");
    expect(modelloDiPartenza([], "b")).toBeNull();
  });
});
