import { describe, it, expect } from "vitest";
import { calcDetraibile, superaMassimale, INCENTIVI_RISTRUTTURAZIONE } from "./incentivi";

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
    it("barriere 75% su 80.000 con tetto 50.000 → 37.500", () => {
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

  it("i preset ristrutturazione hanno chiavi e massimali coerenti", () => {
    const bonus = INCENTIVI_RISTRUTTURAZIONE.find((i) => i.key === "bonus_casa");
    expect(bonus?.pct).toBe(50);
    expect(bonus?.massimale).toBe(96000);
    expect(INCENTIVI_RISTRUTTURAZIONE.find((i) => i.key === "nessuno")?.massimale).toBeNull();
  });
});
