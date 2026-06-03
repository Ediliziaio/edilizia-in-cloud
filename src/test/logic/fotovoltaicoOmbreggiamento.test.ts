import { describe, it, expect } from "vitest";
import {
  stimaPerditaOrizzontePct,
  pesoSolare,
  parseProfiloPvgis,
  type PuntoOrizzonte,
} from "@/lib/fotovoltaico/ombreggiamento";

/**
 * Test della stima ombreggiamento da orizzonte (src/lib/fotovoltaico/ombreggiamento.ts).
 * Esercita il CODICE DI PRODUZIONE.
 */

const profiloPiatto = (elev: number): PuntoOrizzonte[] =>
  Array.from({ length: 36 }, (_, i) => ({ azimuth_deg: i * 10, elevation_deg: elev }));

describe("pesoSolare — più peso a Sud, zero a Nord", () => {
  it("massimo a Sud (180°), ~0 a Nord (0°)", () => {
    expect(pesoSolare(180)).toBeCloseTo(1, 5);
    expect(pesoSolare(0)).toBe(0);
    expect(pesoSolare(90)).toBeCloseTo(0, 5); // Est sul confine
    expect(pesoSolare(135)).toBeGreaterThan(0);
  });
});

describe("stimaPerditaOrizzontePct", () => {
  it("profilo vuoto o orizzonte piatto a 0° → nessuna perdita", () => {
    expect(stimaPerditaOrizzontePct([])).toBe(0);
    expect(stimaPerditaOrizzontePct(profiloPiatto(0))).toBe(0);
  });

  it("orizzonte più alto → perdita maggiore (monotonica)", () => {
    const bassa = stimaPerditaOrizzontePct(profiloPiatto(5));
    const alta = stimaPerditaOrizzontePct(profiloPiatto(15));
    expect(alta).toBeGreaterThan(bassa);
    expect(bassa).toBeGreaterThan(0);
  });

  it("un ostacolo a SUD pesa più dello stesso ostacolo a NORD", () => {
    const sud: PuntoOrizzonte[] = [{ azimuth_deg: 180, elevation_deg: 25 }];
    const nord: PuntoOrizzonte[] = [{ azimuth_deg: 0, elevation_deg: 25 }];
    expect(stimaPerditaOrizzontePct(sud)).toBeGreaterThan(stimaPerditaOrizzontePct(nord));
    expect(stimaPerditaOrizzontePct(nord)).toBe(0); // peso nord = 0
  });

  it("rispetta il cap massimo", () => {
    const estremo = stimaPerditaOrizzontePct(profiloPiatto(80), { perditaMax: 0.3 });
    expect(estremo).toBeLessThanOrEqual(0.3);
  });
});

describe("parseProfiloPvgis", () => {
  it("estrae il profilo dal formato PVGIS", () => {
    const raw = {
      outputs: {
        horizon_profile: [
          { A: 0, H_hor: 2 },
          { A: 180, H_hor: 12 },
        ],
      },
    };
    const p = parseProfiloPvgis(raw);
    expect(p).toHaveLength(2);
    expect(p[1]).toEqual({ azimuth_deg: 180, elevation_deg: 12 });
  });

  it("formato assente → array vuoto", () => {
    expect(parseProfiloPvgis({})).toEqual([]);
    expect(parseProfiloPvgis(null)).toEqual([]);
  });
});
