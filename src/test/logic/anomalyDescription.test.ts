import { describe, expect, it } from "vitest";
import { anomalyDescription, restoreAnomalyDescription } from "@/lib/orders/anomalyDescription";

describe("descrizione strutturata delle anomalie", () => {
  it("separa il dettaglio conservando causa, origine e soggetto e aggiornando l'azione", () => {
    const parsed = anomalyDescription("Causa precisa: Misura errata\nOrigine processo: Sopralluogo\nSoggetto da verificare: Tecnico\nAzione correttiva: Verificare\nDettaglio: Serramento troppo largo\nNota aggiuntiva");
    expect(parsed.detail).toBe("Serramento troppo largo\nNota aggiuntiva");
    expect(restoreAnomalyDescription(parsed, "Misura verificata", "Sostituire")).toBe("Causa precisa: Misura errata\nOrigine processo: Sopralluogo\nSoggetto da verificare: Tecnico\nAzione correttiva: Sostituire\nDettaglio: Misura verificata");
  });
  it("non interpreta prosa libera o strutture sconosciute come campi da rimuovere", () => {
    for (const text of ["Causa precisa: ancora da stabilire", "Nota del tecnico\nDettaglio: prova", "Campo futuro: valore\nDettaglio: testo"]) {
      const parsed = anomalyDescription(text);
      expect(parsed.detail).toBe(text);
      expect(restoreAnomalyDescription(parsed, text, "")).toBe(text);
    }
  });
});
