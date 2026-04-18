import { describe, it, expect } from "vitest";
import {
  calcolaPrezzoSerramento,
  findExactGridCell,
  findNearestGridCell,
} from "@/features/serramenti-listini/utils/pricing";
import type { PricingInput } from "@/features/serramenti-listini/types";

/**
 * Test formula prezzo serramenti — STEP 0 (listini avanzati).
 *
 * Copre:
 *  - formula base senza maggiorazioni
 *  - sconto fornitore + ricarico azienda
 *  - maggiorazioni percentuali e fisse
 *  - manodopera aggiunta
 *  - margine calcolo corretto
 *  - edge cases: sconto=0, ricarico=0, input NaN/negativi
 *  - griglia: exact match, nearest, empty
 */

function baseInput(overrides: Partial<PricingInput> = {}): PricingInput {
  return {
    prezzo_listino: 1000,
    sconto_fornitore: 0,
    ricarico_azienda: 0,
    maggiorazioni_percentuali: 0,
    maggiorazioni_fisse: 0,
    manodopera: 0,
    ...overrides,
  };
}

describe("calcolaPrezzoSerramento — formula base", () => {
  it("senza sconto e senza ricarico: vendita = acquisto = listino", () => {
    const r = calcolaPrezzoSerramento(baseInput());
    expect(r.prezzo_acquisto).toBe(1000);
    expect(r.prezzo_vendita_no_posa).toBe(1000);
    expect(r.prezzo_vendita_totale).toBe(1000);
    expect(r.margine_percentuale).toBe(0);
  });

  it("sconto fornitore 55% + ricarico 100%: acquisto=450, vendita=900", () => {
    // listino 1000 → acquisto 1000×0.45 = 450 → vendita 450×2 = 900
    const r = calcolaPrezzoSerramento(
      baseInput({ sconto_fornitore: 0.55, ricarico_azienda: 1.0 }),
    );
    expect(r.prezzo_acquisto).toBe(450);
    expect(r.prezzo_vendita_no_posa).toBe(900);
    expect(r.prezzo_vendita_totale).toBe(900);
    expect(r.margine_percentuale).toBe(50); // (900-450)/900 = 50%
  });

  it("sconto 40% + ricarico 80% + manodopera 200", () => {
    // 1000 × 0.6 = 600 acquisto; × 1.8 = 1080 vendita; + 200 = 1280 totale
    const r = calcolaPrezzoSerramento(
      baseInput({ sconto_fornitore: 0.4, ricarico_azienda: 0.8, manodopera: 200 }),
    );
    expect(r.prezzo_acquisto).toBe(600);
    expect(r.prezzo_vendita_no_posa).toBe(1080);
    expect(r.prezzo_vendita_totale).toBe(1280);
  });
});

describe("calcolaPrezzoSerramento — maggiorazioni varianti", () => {
  it("maggiorazione % colore +5%: vendita × 1.05", () => {
    // 1000 × (1-0.55) × (1+1) × 1.05 = 945
    const r = calcolaPrezzoSerramento(
      baseInput({
        sconto_fornitore: 0.55,
        ricarico_azienda: 1.0,
        maggiorazioni_percentuali: 5,
      }),
    );
    expect(r.prezzo_vendita_no_posa).toBe(945);
  });

  it("mix magg % (15%) + magg fissa €50", () => {
    // 1000 × 0.45 × 2 × 1.15 + 50 = 1085
    const r = calcolaPrezzoSerramento(
      baseInput({
        sconto_fornitore: 0.55,
        ricarico_azienda: 1.0,
        maggiorazioni_percentuali: 15,
        maggiorazioni_fisse: 50,
      }),
    );
    expect(r.prezzo_vendita_no_posa).toBe(1085);
  });

  it("più assi cumulati: colore +5% + vetro +10% + telaio +5% = +20%", () => {
    const r = calcolaPrezzoSerramento(
      baseInput({
        sconto_fornitore: 0.5,
        ricarico_azienda: 1.0,
        maggiorazioni_percentuali: 20,
      }),
    );
    // 1000 × 0.5 × 2 × 1.2 = 1200
    expect(r.prezzo_vendita_no_posa).toBe(1200);
  });
});

describe("calcolaPrezzoSerramento — input sanitization", () => {
  it("NaN prezzo listino → 0, nessun crash", () => {
    const r = calcolaPrezzoSerramento(baseInput({ prezzo_listino: NaN }));
    expect(r.prezzo_acquisto).toBe(0);
    expect(r.prezzo_vendita_no_posa).toBe(0);
    expect(r.margine_percentuale).toBe(0);
  });

  it("sconto > 1 clampato a 1 (massimo: gratis)", () => {
    const r = calcolaPrezzoSerramento(
      baseInput({ sconto_fornitore: 1.5, ricarico_azienda: 1.0 }),
    );
    expect(r.prezzo_acquisto).toBe(0);
  });

  it("sconto negativo clampato a 0", () => {
    const r = calcolaPrezzoSerramento(
      baseInput({ sconto_fornitore: -0.1, ricarico_azienda: 0 }),
    );
    expect(r.prezzo_acquisto).toBe(1000);
  });

  it("ricarico negativo clampato a 0", () => {
    const r = calcolaPrezzoSerramento(baseInput({ ricarico_azienda: -0.5 }));
    expect(r.prezzo_vendita_no_posa).toBe(1000);
  });

  it("manodopera negativa clampata a 0", () => {
    const r = calcolaPrezzoSerramento(baseInput({ manodopera: -50 }));
    expect(r.prezzo_vendita_totale).toBe(1000);
  });
});

describe("calcolaPrezzoSerramento — margine", () => {
  it("margine 50% se vendita = 2× acquisto", () => {
    const r = calcolaPrezzoSerramento(
      baseInput({ sconto_fornitore: 0.5, ricarico_azienda: 1.0 }),
    );
    expect(r.margine_percentuale).toBe(50);
  });

  it("margine 0 se ricarico=0 e no maggiorazioni", () => {
    const r = calcolaPrezzoSerramento(
      baseInput({ sconto_fornitore: 0.3 }),
    );
    expect(r.margine_percentuale).toBe(0);
  });

  it("margine non conteggia manodopera (costo esterno reale)", () => {
    const r = calcolaPrezzoSerramento(
      baseInput({
        sconto_fornitore: 0.5,
        ricarico_azienda: 1.0,
        manodopera: 500, // non deve influenzare il margine
      }),
    );
    expect(r.margine_percentuale).toBe(50);
    expect(r.prezzo_vendita_totale).toBe(1500);
  });
});

describe("findExactGridCell / findNearestGridCell", () => {
  const grid = [
    { valore_x: 1000, valore_y: 1000, prezzo_vendita: 100 },
    { valore_x: 1200, valore_y: 1200, prezzo_vendita: 150 },
    { valore_x: 1500, valore_y: 1500, prezzo_vendita: 200 },
  ];

  it("exact trova cella esatta", () => {
    const c = findExactGridCell(grid, 1200, 1200);
    expect(c?.prezzo_vendita).toBe(150);
  });

  it("exact null se non trovato", () => {
    expect(findExactGridCell(grid, 1050, 1050)).toBeNull();
  });

  it("nearest: 1050×1050 → cella 1000×1000 (più vicina)", () => {
    const c = findNearestGridCell(grid, 1050, 1050);
    expect(c?.prezzo_vendita).toBe(100);
  });

  it("nearest: 1300×1300 → cella 1200×1200 (distanza Manhattan minima)", () => {
    const c = findNearestGridCell(grid, 1300, 1300);
    expect(c?.prezzo_vendita).toBe(150);
  });

  it("nearest null se grid vuota", () => {
    expect(findNearestGridCell([], 1000, 1000)).toBeNull();
  });
});

describe("calcolaPrezzoSerramento — scenario reale utente", () => {
  it("esempio utente: sconto 55% + ricarico 100% + manodopera", () => {
    // Simula: finestra 1 anta listino 800€, fornitore sconta 55%, azienda ricarica 100%,
    // colore standard +5%, manodopera 150€
    const r = calcolaPrezzoSerramento({
      prezzo_listino: 800,
      sconto_fornitore: 0.55,
      ricarico_azienda: 1.0,
      maggiorazioni_percentuali: 5,
      maggiorazioni_fisse: 0,
      manodopera: 150,
    });
    // acquisto: 800 × 0.45 = 360
    // vendita_no_posa: 360 × 2 × 1.05 = 756
    // totale: 756 + 150 = 906
    // margine: (756-360)/756 ≈ 52.38%
    expect(r.prezzo_acquisto).toBe(360);
    expect(r.prezzo_vendita_no_posa).toBe(756);
    expect(r.prezzo_vendita_totale).toBe(906);
    expect(r.margine_percentuale).toBeCloseTo(52.38, 1);
  });
});
