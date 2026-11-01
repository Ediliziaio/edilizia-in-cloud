import { describe, expect, it } from "vitest";
import { buildForecastLedger, emptyForecastSources, type GaranziaRow } from "@/lib/finance/forecastLedger";

const g = (patch: Partial<GaranziaRow> = {}): GaranziaRow => ({
  id: "g1", direzione: "attiva", importo: 7500, stato: "trattenuta", data_svincolo_prevista: "2027-06-30",
  controparte: "Condominio Aurora", order_id: "o1", ...patch,
});

describe("previsionale: ritenute di garanzia allo svincolo (01/11/2026)", () => {
  it("attiva = entrata dal committente, passiva = uscita al subappaltatore, alla data di svincolo", () => {
    const s = emptyForecastSources();
    s.garanzie = [g(), g({ id: "g2", direzione: "passiva", importo: 53.5, controparte: "Edil Rossi", data_svincolo_prevista: "2027-03-31" })];
    const m = buildForecastLedger(s, "2026-11-01").movements.filter((x) => x.id.startsWith("garanzia:"));
    expect(m.map((x) => [x.direction, x.cents, x.date, x.orderId])).toEqual(
      expect.arrayContaining([["in", 750000, "2027-06-30", "o1"], ["out", 5350, "2027-03-31", "o1"]]),
    );
    expect(m.every((x) => x.estimated)).toBe(true);
  });

  it("svincolata o annullata non torna nel piano", () => {
    const s = emptyForecastSources();
    s.garanzie = [g({ stato: "svincolata" }), g({ id: "g3", stato: "annullata" })];
    expect(buildForecastLedger(s, "2026-11-01").movements.filter((x) => x.id.startsWith("garanzia:"))).toHaveLength(0);
  });
});
