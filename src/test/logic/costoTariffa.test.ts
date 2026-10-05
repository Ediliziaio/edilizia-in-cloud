import { describe, it, expect } from "vitest";
import {
  aliquotaComune, aliquotaValida, costoArticolo, costoTariffa, primoCosto, unitaTariffa,
} from "@/lib/listino/costoTariffa";
import { calcolaAnalisi, incidenzaFrazione } from "@/lib/listino/analisiPrezzo";
import { computeBreakdown } from "@/hooks/useMargineBreakdown";

/**
 * Tariffe: un costo, un'unità, una regola sola (05/10/2026).
 *
 * Il costo di una tariffa sta in tre colonne (costo_interno, prezzo_costo,
 * costo_default) e le prime due hanno DEFAULT 0: 135 voci su 336 avevano
 * costo_interno = 0 e il costo vero solo in prezzo_costo. L'unità vera è
 * unita_fatturazione, ma anche lei ha un DEFAULT («pz») che 35 voci scritte
 * solo nella legacy `unita` non hanno mai sovrascritto.
 */

describe("costoTariffa — l'ordine della pagina Tariffe", () => {
  it("costo_interno vince quando è valorizzato", () => {
    expect(costoTariffa({ costo_interno: 40, prezzo_costo: 30, costo_default: 20 })).toBe(40);
  });

  it("lo 0 di default di costo_interno non nasconde il costo in prezzo_costo", () => {
    expect(costoTariffa({ costo_interno: 0, prezzo_costo: 30, costo_default: null })).toBe(30);
  });

  it("costo_default è l'ultimo ripiego", () => {
    expect(costoTariffa({ costo_interno: 0, prezzo_costo: 0, costo_default: 12.5 })).toBe(12.5);
    expect(costoTariffa({ costo_interno: null, prezzo_costo: null, costo_default: 12.5 })).toBe(12.5);
  });

  it("costo_default non scavalca più costo_interno (prima useMargineBreakdown lo leggeva per primo)", () => {
    expect(costoTariffa({ costo_interno: 55, prezzo_costo: 55, costo_default: 10 })).toBe(55);
  });

  it("uno 0 scritto apposta in tutte le colonne resta 0, non null", () => {
    expect(costoTariffa({ costo_interno: 0, prezzo_costo: 0, costo_default: 0 })).toBe(0);
    expect(costoTariffa({ costo_interno: 0 })).toBe(0);
  });

  it("senza nessun numero valido il costo non si conosce: null", () => {
    expect(costoTariffa({})).toBeNull();
    expect(costoTariffa({ costo_interno: null, prezzo_costo: undefined, costo_default: "" })).toBeNull();
    expect(costoTariffa(null)).toBeNull();
    expect(costoTariffa(undefined)).toBeNull();
  });

  it("i numeric che arrivano come stringa si leggono, quelli non numerici no", () => {
    expect(costoTariffa({ costo_interno: "0", prezzo_costo: "18.40" })).toBe(18.4);
    expect(costoTariffa({ costo_interno: "abc", prezzo_costo: 7 })).toBe(7);
  });

  it("primoCosto: primo positivo, altrimenti primo numero valido", () => {
    expect(primoCosto(0, null, 5)).toBe(5);
    expect(primoCosto(null, 0, 0)).toBe(0);
    expect(primoCosto(NaN, Infinity)).toBeNull();
  });
});

describe("unitaTariffa — unita_fatturazione prima della legacy", () => {
  it("a giornata resta a giornata: la legacy dice «h» perché il CHECK non conosce «gg»", () => {
    expect(unitaTariffa({ unita_fatturazione: "gg", unita: "h" })).toBe("gg");
  });

  it("a chilo e a corpo, idem", () => {
    expect(unitaTariffa({ unita_fatturazione: "kg", unita: "pz" })).toBe("kg");
    expect(unitaTariffa({ unita_fatturazione: "a_corpo", unita: "fisso" })).toBe("a_corpo");
  });

  it("il «pz» di default smentito dalla legacy non vince: la voce era stata scritta solo lì", () => {
    expect(unitaTariffa({ unita_fatturazione: "pz", unita: "mq" })).toBe("mq");
    expect(unitaTariffa({ unita_fatturazione: "pz", unita: "h" })).toBe("h");
    expect(unitaTariffa({ unita_fatturazione: "pz", unita: "fisso" })).toBe("a_corpo");
  });

  it("«pz» confermato dalla legacy, o senza legacy, resta «pz»", () => {
    expect(unitaTariffa({ unita_fatturazione: "pz", unita: "pz" })).toBe("pz");
    expect(unitaTariffa({ unita_fatturazione: "pz" })).toBe("pz");
  });

  it("senza unita_fatturazione si legge la legacy, senza niente il ripiego", () => {
    expect(unitaTariffa({ unita_fatturazione: null, unita: "ml" })).toBe("ml");
    expect(unitaTariffa({ unita: "fisso" })).toBe("a_corpo");
    expect(unitaTariffa({}, "h")).toBe("h");
    expect(unitaTariffa(null)).toBe("pz");
    expect(unitaTariffa({ unita_fatturazione: "  ", unita: "" }, "")).toBe("");
  });
});

describe("costoArticolo — articoli legacy dei pacchetti", () => {
  it("prezzo_acquisto_netto, poi standard_cost", () => {
    expect(costoArticolo({ prezzo_acquisto_netto: 80, standard_cost: 70 })).toBe(80);
    expect(costoArticolo({ prezzo_acquisto_netto: null, standard_cost: 70 })).toBe(70);
  });

  it("lo 0 di default di prezzo_acquisto_netto non nasconde standard_cost", () => {
    expect(costoArticolo({ prezzo_acquisto_netto: 0, standard_cost: 70 })).toBe(70);
  });

  it("senza costi: 0", () => {
    expect(costoArticolo({})).toBe(0);
    expect(costoArticolo(null)).toBe(0);
  });
});

describe("aliquota delle righe senza un prodotto proprio", () => {
  it("aliquotaValida: 0..100, altrimenti il ripiego", () => {
    expect(aliquotaValida(10)).toBe(10);
    expect(aliquotaValida(0)).toBe(0);
    expect(aliquotaValida(null)).toBe(22);
    expect(aliquotaValida(122)).toBe(22);
    expect(aliquotaValida(-4)).toBe(22);
    expect(aliquotaValida("4")).toBe(4);
  });

  it("tutti i prodotti al 10% → 10%", () => {
    expect(aliquotaComune([10, 10, 10])).toBe(10);
  });

  it("aliquote diverse → 22%: scegliere fra due sarebbe inventare", () => {
    expect(aliquotaComune([10, 22])).toBe(22);
    expect(aliquotaComune([4, 10])).toBe(22);
  });

  it("nessun prodotto → 22%", () => {
    expect(aliquotaComune([])).toBe(22);
  });

  it("un prodotto senza aliquota conta come 22%, quella che riceverebbe sulla sua riga", () => {
    expect(aliquotaComune([10, null])).toBe(22);
    expect(aliquotaComune([null, null])).toBe(22);
  });
});

describe("incidenzaFrazione — la colonna vuole 0..1, non il percento", () => {
  it("35,5% → 0,355 (prima si salvava 35,5 e la pagina Tariffe mostrava 3550%)", () => {
    expect(incidenzaFrazione(35.5)).toBe(0.355);
  });

  it("i due decimali del percento restano", () => {
    expect(incidenzaFrazione(31.62)).toBe(0.3162);
    expect(incidenzaFrazione(33.33)).toBe(0.3333);
  });

  it("bordi: 0 e valori non validi → 0, oltre il 100% → 1", () => {
    expect(incidenzaFrazione(0)).toBe(0);
    expect(incidenzaFrazione(-5)).toBe(0);
    expect(incidenzaFrazione(NaN)).toBe(0);
    expect(incidenzaFrazione(100)).toBe(1);
    expect(incidenzaFrazione(150)).toBe(1);
  });

  it("dal risultato dell'analisi: 40 € di manodopera su 126,50 € → 0,3162", () => {
    const r = calcolaAnalisi(
      [
        { tipo: "manodopera", quantita: 2, prezzo_unitario: 20 },
        { tipo: "materiale", quantita: 6, prezzo_unitario: 10 },
      ],
      15,
      10,
    );
    expect(r.incidenzaManodoperaPct).toBe(31.62);
    expect(incidenzaFrazione(r.incidenzaManodoperaPct)).toBe(0.3162);
  });
});

describe("computeBreakdown — il costo della tariffa con la regola unica", () => {
  const riga = () => ({
    id: "item-1",
    quote_id: "quote-1",
    item_type: "service",
    item_category: "posa",
    name: "Posa",
    quantity: 2,
    unit_price: 100,
    discount_percent: 0,
    tariffa_id: "tar-1",
  });

  it("costo_interno a 0 di default e costo vero in prezzo_costo: il margine usa prezzo_costo", () => {
    const r = computeBreakdown(
      [riga()],
      [],
      [{ id: "tar-1", costo_default: null, costo_interno: 0, prezzo_costo: 30, prezzo_vendita: 100 }],
      {},
    );
    expect(r.righe[0].costo_unitario).toBe(30);
    expect(r.righe[0].fonte_costo).toBe("costo_default_tariffa");
    expect(r.totale_costo).toBe(60);
  });

  it("costo_default non scavalca costo_interno", () => {
    const r = computeBreakdown(
      [riga()],
      [],
      [{ id: "tar-1", costo_default: 10, costo_interno: 45, prezzo_costo: 45, prezzo_vendita: 100 }],
      {},
    );
    expect(r.righe[0].costo_unitario).toBe(45);
  });

  it("senza costo noto: 0 e fonte «stimato»", () => {
    const r = computeBreakdown(
      [riga()],
      [],
      [{ id: "tar-1", costo_default: null, costo_interno: 0, prezzo_costo: 0, prezzo_vendita: 100 }],
      {},
    );
    expect(r.righe[0].costo_unitario).toBe(0);
    expect(r.righe[0].fonte_costo).toBe("stimato");
  });
});
