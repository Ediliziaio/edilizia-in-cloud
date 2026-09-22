import { describe, it, expect } from "vitest";
import {
  calcolaPrezzoSerramento,
} from "@/features/serramenti-listini/utils/pricing";
import type { PricingInput } from "@/features/serramenti-listini/types";
import {
  calcolaPrezzoProdotto as calcolaPrezzoProdottoPreventivo,
  listinoSenzaPrezzoDiVendita,
} from "@/lib/serramenti/pricing";
import type { ListinoFamily } from "@/lib/serramenti/api";

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

describe("calcolaPrezzoProdotto — griglia preventivatore", () => {
  const family = {
    id: "fam-1",
    nome: "Finestra test",
    descrizione: null,
    immagine_url: null,
    vertical: "serramentista",
    prezzo_base_vendita: 0,
    vat_rate: null,
    modalita_prezzo_base: "griglia",
    categoria_id: null,
    custom_field_values: {},
    manodopera_modalita: "nessuna",
    posa_tariffa_default_id: null,
    posa_quantita_default: null,
    posa_linked: null,
    manodopera_unita: null,
    manodopera_costo_acquisto: null,
    manodopera_prezzo_vendita: null,
  } satisfies ListinoFamily;

  it("separa due linee fornitore con stessa misura e applica ricarico su prezzo_acquisto", () => {
    const result = calcolaPrezzoProdottoPreventivo(
      family,
      1000,
      1200,
      2,
      [
        {
          id: "cell-basic",
          valore_x: 1000,
          valore_y: 1200,
          prezzo_vendita: 900,
          prezzo_acquisto: 300,
          supplier_catalog_id: "sup-1",
          supplier_product_line_id: "line-basic",
        },
        {
          id: "cell-premium",
          valore_x: 1000,
          valore_y: 1200,
          prezzo_vendita: 1400,
          prezzo_acquisto: 500,
          supplier_catalog_id: "sup-1",
          supplier_product_line_id: "line-premium",
        },
      ],
      {
        supplierProductLineId: "line-premium",
        supplierLines: [{ id: "line-premium", supplier_catalog_id: "sup-1", ricarico_default: 1 }],
      },
    );

    expect(result.matchedGrigliaId).toBe("cell-premium");
    expect(result.supplierProductLineId).toBe("line-premium");
    expect(result.prezzo).toBe(2000); // 500 acquisto × (1 + 100%) × 2 pz
  });

  it("richiede scelta linea quando la griglia contiene piu' linee fornitore", () => {
    const result = calcolaPrezzoProdottoPreventivo(
      family,
      900,
      1000,
      1,
      [
        { id: "a", valore_x: 1000, valore_y: 1200, prezzo_vendita: 800, supplier_product_line_id: "line-a" },
        { id: "b", valore_x: 1000, valore_y: 1200, prezzo_vendita: 900, supplier_product_line_id: "line-b" },
      ],
    );

    expect(result.requiresSupplierLine).toBe(true);
    expect(result.prezzo).toBe(0);
  });

  it("sceglie la cella contenente piu' piccola, non il prezzo piu' basso tra celle grandi", () => {
    const result = calcolaPrezzoProdottoPreventivo(
      family,
      950,
      1100,
      1,
      [
        { id: "small-containing", valore_x: 1000, valore_y: 1200, prezzo_vendita: 600 },
        { id: "huge-discounted", valore_x: 2000, valore_y: 2400, prezzo_vendita: 100 },
      ],
    );

    expect(result.matchedGrigliaId).toBe("small-containing");
    expect(result.prezzo).toBe(600);
  });
});

describe("calcolaPrezzoProdotto — prodotti a ricarico sull'acquisto", () => {
  const aRicarico: ListinoFamily = {
    id: "fam-ricarico",
    nome: "Tapparella a ricarico",
    descrizione: null,
    immagine_url: null,
    vertical: "serramentista",
    prezzo_base_vendita: 0,
    vat_rate: null,
    modalita_prezzo_base: "mq",
    categoria_id: null,
    custom_field_values: {},
    manodopera_modalita: "nessuna",
    posa_tariffa_default_id: null,
    posa_quantita_default: null,
    posa_linked: null,
    manodopera_unita: null,
    manodopera_costo_acquisto: null,
    manodopera_prezzo_vendita: null,
    prezzo_base_mode: "acquisto_markup",
    prezzo_base_acquisto: 100,
    sconto_fornitore_1: 10,
    sconto_fornitore_2: 0,
    markup_tipo: "percentuale",
    markup_valore: 50,
  };

  it("senza vendita salvata calcola da acquisto, sconti e ricarico invece di dare 0 €", () => {
    // 100 − 10% = 90 di acquisto netto, +50% = 135 €/m², per 1 m².
    expect(calcolaPrezzoProdottoPreventivo(aRicarico, 1000, 1000, 1, []).prezzo).toBe(135);
  });

  it("la vendita salvata resta quella usata: non si ricalcola di nascosto", () => {
    expect(calcolaPrezzoProdottoPreventivo({ ...aRicarico, prezzo_base_vendita: 150 }, 1000, 1000, 1, []).prezzo).toBe(150);
  });

  it("in griglia una cella con il solo acquisto prende il prezzo dal ricarico", () => {
    const result = calcolaPrezzoProdottoPreventivo(
      { ...aRicarico, modalita_prezzo_base: "griglia", sconto_fornitore_1: 0, markup_valore: 100 },
      900,
      900,
      2,
      [{ id: "c1", valore_x: 1000, valore_y: 1000, prezzo_vendita: null, prezzo_acquisto: 200 }],
    );
    expect(result.prezzo).toBe(800);
  });

  it("un prodotto a prezzo di vendita non guarda l'acquisto", () => {
    expect(calcolaPrezzoProdottoPreventivo({ ...aRicarico, prezzo_base_mode: "vendita" }, 1000, 1000, 1, []).prezzo).toBe(0);
  });
});

describe("listinoSenzaPrezzoDiVendita — chi lo usa scrive il prezzo a mano (Infissi e Living)", () => {
  const senzaPrezzo: ListinoFamily = {
    id: "fam-senza-prezzo",
    nome: "PVC Salamander proEvolution 72",
    descrizione: null,
    immagine_url: null,
    vertical: "serramentista",
    prezzo_base_vendita: 0,
    vat_rate: null,
    modalita_prezzo_base: "mq",
    categoria_id: null,
    custom_field_values: {},
    manodopera_modalita: "nessuna",
    posa_tariffa_default_id: null,
    posa_quantita_default: null,
    posa_linked: null,
    manodopera_unita: null,
    manodopera_costo_acquisto: null,
    manodopera_prezzo_vendita: null,
    prezzo_base_mode: "vendita",
    prezzo_base_acquisto: null,
    sconto_fornitore_1: 0,
    sconto_fornitore_2: 0,
    markup_tipo: null,
    markup_valore: null,
  };

  it("nessuna family: non è mai un prodotto senza prezzo (il picker non ha ancora scelto niente)", () => {
    expect(listinoSenzaPrezzoDiVendita(null)).toBe(false);
    expect(listinoSenzaPrezzoDiVendita(undefined)).toBe(false);
  });

  it("mq senza prezzo di vendita né di acquisto: sì, il prezzo va scritto a mano", () => {
    expect(listinoSenzaPrezzoDiVendita(senzaPrezzo)).toBe(true);
  });

  it("pz senza prezzo di vendita né di acquisto: sì", () => {
    expect(listinoSenzaPrezzoDiVendita({ ...senzaPrezzo, modalita_prezzo_base: "pz" })).toBe(true);
  });

  it("misura libera: sempre sì, indipendentemente dal prezzo", () => {
    expect(listinoSenzaPrezzoDiVendita({ ...senzaPrezzo, modalita_prezzo_base: "misura_libera", prezzo_base_vendita: 150 })).toBe(true);
  });

  it("prezzo di vendita salvato: no, il calcolo produce un totale vero", () => {
    expect(listinoSenzaPrezzoDiVendita({ ...senzaPrezzo, prezzo_base_vendita: 150 })).toBe(false);
  });

  it("prezzo ad acquisto+ricarico configurato: no, non è \"senza prezzo\" solo perché prezzo_base_vendita è 0", () => {
    expect(listinoSenzaPrezzoDiVendita({
      ...senzaPrezzo,
      prezzo_base_mode: "acquisto_markup",
      prezzo_base_acquisto: 100,
      markup_tipo: "percentuale",
      markup_valore: 50,
    })).toBe(false);
  });

  it("griglia: fuori scope di questa funzione, i suoi 0€ sono già gestiti da fuoriRange/requiresSupplierLine", () => {
    expect(listinoSenzaPrezzoDiVendita({ ...senzaPrezzo, modalita_prezzo_base: "griglia" })).toBe(false);
  });
});
