import { describe, it, expect } from "vitest";
import {
  derivaSpecModuloDaPotenza,
  specModuloDaArticolo,
  specInverterDaArticolo,
} from "@/lib/fotovoltaico/catalogoProdotti";
import { INVERTER_DEFAULT } from "@/lib/fotovoltaico/stringhe";

/**
 * Test dell'adapter catalogo→specifiche elettriche
 * (src/lib/fotovoltaico/catalogoProdotti.ts). Esercita il CODICE DI PRODUZIONE.
 */

describe("derivaSpecModuloDaPotenza", () => {
  it("per ~540 Wp dà valori vicini al modulo standard", () => {
    const s = derivaSpecModuloDaPotenza(540);
    expect(s.voc).toBeGreaterThan(46);
    expect(s.voc).toBeLessThan(53);
    expect(s.vmp).toBeGreaterThan(38);
    expect(s.vmp).toBeLessThan(44);
    expect(s.voc).toBeGreaterThan(s.vmp); // Voc > Vmp sempre
  });

  it("scala con la potenza (400 Wp < 540 Wp)", () => {
    expect(derivaSpecModuloDaPotenza(400).voc).toBeLessThan(derivaSpecModuloDaPotenza(540).voc);
  });

  it("potenza non valida → fallback 540", () => {
    expect(derivaSpecModuloDaPotenza(0)).toEqual(derivaSpecModuloDaPotenza(540));
  });
});

describe("specModuloDaArticolo", () => {
  it("usa i datasheet reali se presenti", () => {
    const s = specModuloDaArticolo({ potenza_unitaria_w: 500, voc: 45.2, vmp: 38.1 });
    expect(s.voc).toBe(45.2);
    expect(s.vmp).toBe(38.1);
  });

  it("senza datasheet deriva dalla potenza dell'articolo", () => {
    const s = specModuloDaArticolo({ potenza_unitaria_w: 540 });
    expect(s).toEqual(derivaSpecModuloDaPotenza(540));
  });

  it("articolo nullo → fallback 540", () => {
    expect(specModuloDaArticolo(null)).toEqual(derivaSpecModuloDaPotenza(540));
  });
});

describe("specInverterDaArticolo", () => {
  it("usa i campi inverter reali se presenti", () => {
    const s = specInverterDaArticolo({ inverter_vmax_dc: 600, inverter_n_mppt: 3 });
    expect(s.vMaxDc).toBe(600);
    expect(s.nMppt).toBe(3);
    expect(s.vMpptMin).toBe(INVERTER_DEFAULT.vMpptMin); // non fornito → default
  });

  it("senza campi → default inverter", () => {
    expect(specInverterDaArticolo({})).toEqual(INVERTER_DEFAULT);
    expect(specInverterDaArticolo(null)).toEqual(INVERTER_DEFAULT);
  });
});
