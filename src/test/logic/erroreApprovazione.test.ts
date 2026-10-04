import { describe, expect, it } from "vitest";
import { messaggioApprovazione } from "@/lib/campo/erroreApprovazione";

describe("Messaggio quando l'approvazione di un rapportino non riesce", () => {
  const frase = "Marco Verdi ha già 7,5 ore su questo cantiere in questa giornata. Le ore di una persona si contano una volta sola.";

  it("mostra la frase che il database scrive per le regole di lavoro (codice P0001)", () => {
    expect(messaggioApprovazione({ code: "P0001", message: frase, details: null })).toBe(frase);
  });

  it("mostra i messaggi già scritti dal programma", () => {
    expect(messaggioApprovazione(new Error("Rapportino non aggiornato: potrebbe essere già cambiato."))).toBe(
      "Rapportino non aggiornato: potrebbe essere già cambiato.",
    );
  });

  it("non lascia passare il testo grezzo degli altri errori del database", () => {
    expect(
      messaggioApprovazione({ code: "23502", message: 'null value in column "hourly_rate" violates not-null constraint' }),
    ).toBe("Errore durante l'approvazione");
  });

  it("tiene un testo comprensibile quando non c'è nulla da dire", () => {
    expect(messaggioApprovazione(undefined)).toBe("Errore durante l'approvazione");
    expect(messaggioApprovazione({ code: "P0001", message: "   " })).toBe("Errore durante l'approvazione");
    expect(messaggioApprovazione("boom")).toBe("Errore durante l'approvazione");
  });
});
