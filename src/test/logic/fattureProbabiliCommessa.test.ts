import { describe, expect, it } from "vitest";
import { fattureProbabili, type FatturaCandidata } from "@/components/orders/CollegaFatturaRicevutaDialog";

const fattura = (id: string, punteggio: number, motivi: string[]): FatturaCandidata => ({
  id, numero_fattura: id, data_fattura: null, fornitore: "F", imponibile: 100, totale: 122, tipo_documento: "TD01",
  assegnata_pct: 0, commesse_collegate: [], punteggio, motivi, company_cost_id: null, riferimenti: [],
});

describe("fattureProbabili (avviso nella scheda della commessa)", () => {
  it("propone quelle con un motivo vero, non quelle solo suggerite dall'AI né quelle già nella scheda", () => {
    const candidate = [
      fattura("bolla", 100, ["Bolla 12 di questa commessa"]),
      fattura("ai", 48, ["Suggerita dall'AI"]),
      fattura("ai+fornitore", 88, ["Suggerita dall'AI", "Fornitore della commessa"]),
      fattura("gia", 140, ["Bolla 3 di questa commessa"]),
      fattura("nessuna", 0, []),
    ];
    expect(fattureProbabili(candidate, new Set(["gia"])).map((f) => f.id)).toEqual(["bolla", "ai+fornitore"]);
  });
});
