import { describe, expect, it } from "vitest";
import { orePersoneRapportino } from "@/components/orders/OrdineRapportiniCampo";

describe("ore di un rapportino: le persone, come all'approvazione", () => {
  it("di squadra: contano le persone, non la ditta", () => {
    expect(orePersoneRapportino({ ore_lavorate: 8, presenze: [
      { employee_id: "a", ore: 8 }, { employee_id: "b", ore: 6 }, { subappaltatore_id: "ditta", ore: 8 },
    ] })).toBe(14);
  });
  it("senza presenze: le ore dell'autore, straordinario compreso", () => {
    expect(orePersoneRapportino({ ore_lavorate: 7.5, ore_straordinario: 1, presenze: [] })).toBe(8.5);
    expect(orePersoneRapportino({ ore_lavorate: "6", presenze: null })).toBe(6);
  });
});
