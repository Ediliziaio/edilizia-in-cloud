import { describe, it, expect } from "vitest";
import {
  puntoCardinale,
  etichettaAzimut,
  azimutSolareAPvgis,
  segmentoTettoDominante,
  type SegmentoTetto,
} from "@/lib/fotovoltaico/tetto";

/**
 * Test degli helper di orientamento falde (src/lib/fotovoltaico/tetto.ts).
 * Esercita il CODICE DI PRODUZIONE poi rispecchiato nell'edge fv-solar-api-fetch.
 */

describe("puntoCardinale — azimut Google (0=N, orario)", () => {
  it("mappa i punti principali", () => {
    expect(puntoCardinale(0)).toBe("N");
    expect(puntoCardinale(90)).toBe("E");
    expect(puntoCardinale(180)).toBe("S");
    expect(puntoCardinale(270)).toBe("O");
    expect(puntoCardinale(135)).toBe("SE");
    expect(puntoCardinale(225)).toBe("SO");
  });

  it("normalizza angoli fuori range e negativi", () => {
    expect(puntoCardinale(360)).toBe("N");
    expect(puntoCardinale(-90)).toBe("O");
    expect(puntoCardinale(450)).toBe("E");
  });
});

describe("etichettaAzimut", () => {
  it("produce 'PUNTO gradi°'", () => {
    expect(etichettaAzimut(180)).toBe("S 180°");
    expect(etichettaAzimut(135)).toBe("SE 135°");
    expect(etichettaAzimut(-90)).toBe("O 270°");
  });
});

describe("azimutSolareAPvgis — Google→PVGIS aspect (0=S, +O, -E)", () => {
  it("converte i punti cardinali", () => {
    expect(azimutSolareAPvgis(180)).toBe(0); // Sud → 0
    expect(azimutSolareAPvgis(90)).toBe(-90); // Est → -90
    expect(azimutSolareAPvgis(270)).toBe(90); // Ovest → +90
    expect(Math.abs(azimutSolareAPvgis(0))).toBe(180); // Nord → ±180
  });

  it("resta nel range [-180, 180]", () => {
    for (const az of [0, 45, 90, 135, 180, 225, 270, 315, 359]) {
      const a = azimutSolareAPvgis(az);
      expect(a).toBeGreaterThanOrEqual(-180);
      expect(a).toBeLessThanOrEqual(180);
    }
  });
});

describe("segmentoTettoDominante", () => {
  it("sceglie la falda con area maggiore", () => {
    const segs: SegmentoTetto[] = [
      { area_mq: 12, azimuth_deg: 90, pitch_deg: 20 },
      { area_mq: 30, azimuth_deg: 180, pitch_deg: 28 },
      { area_mq: 8, azimuth_deg: 270, pitch_deg: 15 },
    ];
    const dom = segmentoTettoDominante(segs)!;
    expect(dom.area_mq).toBe(30);
    expect(dom.azimuth_deg).toBe(180);
    expect(etichettaAzimut(dom.azimuth_deg)).toBe("S 180°");
  });

  it("lista vuota → null", () => {
    expect(segmentoTettoDominante([])).toBeNull();
  });
});
