import { describe, expect, it } from "vitest";
import { contabilitaOda, type RataOda } from "@/lib/orders/odaContabilita";

const fattura = (totale: number, tipo = "TD01") => ({ totale_documento: totale, tipo_documento: tipo });

describe("Contabilità di un ordine d'acquisto", () => {
  it("senza fatture non c'è niente da confrontare", () => {
    expect(contabilitaOda(1000, [], []).stato).toBe("nessuna");
  });

  it("un acconto del 30% non è un errore: restano da fatturare 700", () => {
    const c = contabilitaOda(1000, [fattura(300)], []);
    expect(c.stato).toBe("parziale");
    expect(c.residuo).toBe(700);
  });

  it("acconto e saldo insieme combaciano con l'ordine", () => {
    expect(contabilitaOda(1000, [fattura(300), fattura(700)], []).stato).toBe("combacia");
  });

  it("la nota di credito toglie, non aggiunge", () => {
    // Prima: 1000 + 200 = 1200, «fattura superiore all'ordine».
    const c = contabilitaOda(800, [fattura(1000), fattura(200, "TD04")], []);
    expect(c.fatturato).toBe(800);
    expect(c.stato).toBe("combacia");
    // Anche se il totale della nota arriva già negativo.
    expect(contabilitaOda(800, [fattura(1000), fattura(-200, "passive_credit_note")], []).fatturato).toBe(800);
  });

  it("fatturato oltre l'ordine: l'avviso, con quanto in più", () => {
    const c = contabilitaOda(1000, [fattura(1150)], []);
    expect(c.stato).toBe("eccede");
    expect(c.eccedenza).toBe(150);
  });

  it("un centesimo di arrotondamento non è uno scostamento", () => {
    expect(contabilitaOda(1000, [fattura(1000.01)], []).stato).toBe("combacia");
  });

  it("la prossima uscita è la rata aperta più vicina; le pagate non contano", () => {
    // Le quattro RiBa Centrufficio di renova, la prima già pagata.
    const rate: RataOda[] = [
      { numero: 1, scadenza: "2026-10-31", importo: 939.7, metodo: "riba", stato: "pagata" },
      { numero: 2, scadenza: "2026-11-30", importo: 939.7, metodo: "riba", stato: "da_pagare" },
      { numero: 4, scadenza: "2027-01-31", importo: 939.7, metodo: "riba", stato: "da_pagare" },
      { numero: 3, scadenza: "2027-01-10", importo: 939.7, metodo: "riba", stato: "avvisata" },
    ];
    const c = contabilitaOda(3758.8, [fattura(3758.8)], rate);
    expect(c.prossima).toMatchObject({ scadenza: "2026-11-30", importo: 939.7 });
    expect(c.rateAperte.map((r) => r.numero)).toEqual([2, 3, 4]);
  });

  it("due rate lo stesso giorno escono insieme", () => {
    const rate: RataOda[] = [
      { numero: 1, scadenza: "2026-11-30", importo: 100, metodo: "bonifico", stato: "da_pagare" },
      { numero: 1, scadenza: "2026-11-30", importo: 250.5, metodo: "bonifico", stato: "da_pagare" },
    ];
    expect(contabilitaOda(350.5, [fattura(350.5)], rate).prossima?.importo).toBe(350.5);
  });

  it("tutte pagate: nessuna prossima uscita", () => {
    const rate: RataOda[] = [{ numero: 1, scadenza: "2026-10-31", importo: 100, metodo: "riba", stato: "pagata" }];
    expect(contabilitaOda(100, [fattura(100)], rate).prossima).toBeNull();
  });
});
