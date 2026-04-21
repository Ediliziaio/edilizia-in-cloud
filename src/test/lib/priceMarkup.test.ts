import { describe, it, expect } from "vitest";
import {
  applyMarkup,
  applyScontiFornitore,
  resolvePrezzoVendita,
} from "@/lib/priceMarkup";

describe("applyMarkup — markup percentuale", () => {
  it("+45% su acquisto 100 → vendita 145", () => {
    const r = applyMarkup({
      prezzoAcquisto: 100,
      markupTipo: "percentuale",
      markupValore: 45,
    });
    expect(r.prezzoVendita).toBeCloseTo(145, 2);
    expect(r.margineEuro).toBeCloseTo(45, 2);
    expect(r.marginePercentualeSuVendita).toBeCloseTo((45 / 145) * 100, 2);
  });

  it("0% markup → vendita uguale ad acquisto", () => {
    const r = applyMarkup({
      prezzoAcquisto: 200,
      markupTipo: "percentuale",
      markupValore: 0,
    });
    expect(r.prezzoVendita).toBe(200);
    expect(r.margineEuro).toBe(0);
  });

  it("markup percentuale negativo → clamp a 0 (vendita = acquisto)", () => {
    const r = applyMarkup({
      prezzoAcquisto: 100,
      markupTipo: "percentuale",
      markupValore: -50,
    });
    expect(r.prezzoVendita).toBe(100);
  });
});

describe("applyMarkup — markup fisso per pezzo", () => {
  it("+120€ su acquisto 300 → vendita 420", () => {
    const r = applyMarkup({
      prezzoAcquisto: 300,
      markupTipo: "fisso_pz",
      markupValore: 120,
    });
    expect(r.prezzoVendita).toBe(420);
    expect(r.margineEuro).toBe(120);
  });

  it("markup fisso negativo → clamp a 0", () => {
    const r = applyMarkup({
      prezzoAcquisto: 100,
      markupTipo: "fisso_pz",
      markupValore: -50,
    });
    expect(r.prezzoVendita).toBe(100);
  });
});

describe("applyMarkup — none", () => {
  it("none → vendita = acquisto, margine = 0", () => {
    const r = applyMarkup({
      prezzoAcquisto: 500,
      markupTipo: "none",
      markupValore: 999, // ignorato
    });
    expect(r.prezzoVendita).toBe(500);
    expect(r.margineEuro).toBe(0);
    expect(r.marginePercentualeSuVendita).toBe(0);
  });
});

describe("applyMarkup — edge cases", () => {
  it("acquisto 0 → vendita 0 (qualunque markup)", () => {
    const r = applyMarkup({
      prezzoAcquisto: 0,
      markupTipo: "percentuale",
      markupValore: 100,
    });
    expect(r.prezzoVendita).toBe(0);
    expect(r.marginePercentualeSuVendita).toBeNull();
  });

  it("NaN viene sanitizzato a 0", () => {
    const r = applyMarkup({
      prezzoAcquisto: Number.NaN,
      markupTipo: "percentuale",
      markupValore: 45,
    });
    expect(r.prezzoVendita).toBe(0);
  });

  it("Infinity viene sanitizzato a 0", () => {
    const r = applyMarkup({
      prezzoAcquisto: Number.POSITIVE_INFINITY,
      markupTipo: "percentuale",
      markupValore: 45,
    });
    expect(r.prezzoVendita).toBe(0);
  });
});

describe("resolvePrezzoVendita", () => {
  it("mode=vendita → usa prezzo_vendita diretto, ignora acquisto+markup", () => {
    const p = resolvePrezzoVendita({
      prezzoBaseMode: "vendita",
      prezzoVenditaInput: 299,
      prezzoAcquistoInput: 500, // ignorato
      markupTipo: "percentuale",
      markupValore: 50, // ignorato
    });
    expect(p).toBe(299);
  });

  it("mode=acquisto_markup → calcola via applyMarkup, ignora prezzo_vendita_input", () => {
    const p = resolvePrezzoVendita({
      prezzoBaseMode: "acquisto_markup",
      prezzoVenditaInput: 999, // ignorato
      prezzoAcquistoInput: 100,
      markupTipo: "percentuale",
      markupValore: 45,
    });
    expect(p).toBeCloseTo(145, 2);
  });

  it("mode=vendita con input negativo → clamp a 0", () => {
    const p = resolvePrezzoVendita({
      prezzoBaseMode: "vendita",
      prezzoVenditaInput: -100,
      prezzoAcquistoInput: 0,
      markupTipo: "none",
      markupValore: 0,
    });
    expect(p).toBe(0);
  });

  it("mode=acquisto_markup con sconti 0/0 → retrocompat: input trattato come netto", () => {
    const p = resolvePrezzoVendita({
      prezzoBaseMode: "acquisto_markup",
      prezzoVenditaInput: 0,
      prezzoAcquistoInput: 100,
      markupTipo: "percentuale",
      markupValore: 45,
      scontoFornitore1: 0,
      scontoFornitore2: 0,
    });
    // Stessi 145 del caso pre-feature: conferma retrocompat.
    expect(p).toBeCloseTo(145, 2);
  });

  it("mode=acquisto_markup con sconti 55% + 3% + markup 40% → cascata completa", () => {
    // Caso business "Finestra a Wasistas": lordo 1000, sconti 55+3, markup 40%.
    // netto = 1000 × 0.45 × 0.97 = 436.50
    // vendita = 436.50 × 1.40 = 611.10
    const p = resolvePrezzoVendita({
      prezzoBaseMode: "acquisto_markup",
      prezzoVenditaInput: 0,
      prezzoAcquistoInput: 1000,
      markupTipo: "percentuale",
      markupValore: 40,
      scontoFornitore1: 55,
      scontoFornitore2: 3,
    });
    expect(p).toBeCloseTo(611.1, 2);
  });
});

describe("applyScontiFornitore — cascata 2 sconti", () => {
  it("55% + 3% su 1000 → 436.50 (Finestra a Wasistas)", () => {
    expect(applyScontiFornitore(1000, 55, 3)).toBeCloseTo(436.5, 2);
  });

  it("0/0 → lordo invariato (no sconto)", () => {
    expect(applyScontiFornitore(500, 0, 0)).toBe(500);
  });

  it("solo s1=40%, s2=0 → lordo × 0.6", () => {
    expect(applyScontiFornitore(250, 40, 0)).toBeCloseTo(150, 2);
  });

  it("s1 + s2 NON sommabili: 50% + 50% ≠ 100% (cascata)", () => {
    // 1000 × 0.5 × 0.5 = 250 (non 0, non 500)
    expect(applyScontiFornitore(1000, 50, 50)).toBeCloseTo(250, 2);
  });

  it("sconto > 100 → clamp a 100 (gratis)", () => {
    expect(applyScontiFornitore(1000, 150, 0)).toBe(0);
  });

  it("sconto negativo → clamp a 0 (nessuna maggiorazione)", () => {
    expect(applyScontiFornitore(1000, -10, 0)).toBe(1000);
  });

  it("lordo NaN → 0", () => {
    expect(applyScontiFornitore(Number.NaN, 55, 3)).toBe(0);
  });

  it("lordo negativo → 0 (defensive)", () => {
    expect(applyScontiFornitore(-100, 55, 3)).toBe(0);
  });
});
