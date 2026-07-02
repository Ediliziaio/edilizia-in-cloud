import { describe, it, expect } from "vitest";
import {
  calcDetraibile,
  superaMassimale,
  INCENTIVI_RISTRUTTURAZIONE,
  INCENTIVI_BAGNI,
  INCENTIVI_TETTI,
  INCENTIVI_CLIMATIZZAZIONE,
  INCENTIVI_ELETTRICO,
  INCENTIVI_TERMOIDRAULICO,
  INCENTIVI_PAVIMENTI,
  INCENTIVI_PISCINE,
} from "./incentivi";

describe("preventivi/incentivi", () => {
  describe("calcDetraibile", () => {
    it("senza massimale: imponibile × %", () => {
      expect(calcDetraibile(10000, 50, null)).toBe(5000);
    });
    it("con massimale, spesa SOTTO il tetto: usa l'imponibile", () => {
      expect(calcDetraibile(50000, 50, 96000)).toBe(25000);
    });
    it("con massimale, spesa OLTRE il tetto: cappa al massimale", () => {
      // 120.000 di spesa, Bonus Casa 50% su max 96.000 → 48.000 (non 60.000)
      expect(calcDetraibile(120000, 50, 96000)).toBe(48000);
    });
    it("aritmetica con tetto generico (80.000 su cap 50.000 al 75%) → 37.500", () => {
      // Solo aritmetica: il 75% barriere è SCADUTO a fine 2025 e non è più nei preset.
      expect(calcDetraibile(80000, 75, 50000)).toBe(37500);
    });
    it("clampa input negativi e percentuali >100", () => {
      expect(calcDetraibile(-5000, 50, null)).toBe(0);
      expect(calcDetraibile(10000, 150, null)).toBe(10000);
    });
  });

  describe("superaMassimale", () => {
    it("true quando la spesa supera il tetto", () => {
      expect(superaMassimale(120000, 96000)).toBe(true);
    });
    it("false quando entro il tetto o senza massimale", () => {
      expect(superaMassimale(50000, 96000)).toBe(false);
      expect(superaMassimale(120000, null)).toBe(false);
    });
  });

  it("quadro 2026: prima casa 50% / altre 36%, tetto 96.000", () => {
    const prima = INCENTIVI_RISTRUTTURAZIONE.find((i) => i.key === "prima_casa_50");
    const altre = INCENTIVI_RISTRUTTURAZIONE.find((i) => i.key === "altre_abitazioni_36");
    expect(prima?.pct).toBe(50);
    expect(prima?.massimale).toBe(96000);
    expect(altre?.pct).toBe(36);
    expect(altre?.massimale).toBe(96000);
    expect(INCENTIVI_RISTRUTTURAZIONE.find((i) => i.key === "nessuno")?.massimale).toBeNull();
  });

  it("nessun preset propone aliquote abolite (65/70/75/80/85/110)", () => {
    // Guardia anti-regressione: Ecobonus 65%, Sismabonus 70-85%, Barriere 75%
    // e Superbonus non esistono più nel quadro 2026 — se qualcuno li
    // reintroduce nei preset, questo test lo blocca.
    const tutti = [
      ...INCENTIVI_RISTRUTTURAZIONE, ...INCENTIVI_BAGNI, ...INCENTIVI_TETTI,
      ...INCENTIVI_CLIMATIZZAZIONE, ...INCENTIVI_ELETTRICO,
      ...INCENTIVI_TERMOIDRAULICO, ...INCENTIVI_PAVIMENTI, ...INCENTIVI_PISCINE,
    ];
    const abolite = new Set([65, 70, 75, 80, 85, 110]);
    for (const inc of tutti) {
      expect(abolite.has(inc.pct), `${inc.key} propone aliquota abolita ${inc.pct}%`).toBe(false);
    }
    // E le uniche aliquote positive ammesse oggi sono 50 e 36.
    for (const inc of tutti) {
      if (inc.pct > 0) expect([50, 36]).toContain(inc.pct);
    }
  });
});
