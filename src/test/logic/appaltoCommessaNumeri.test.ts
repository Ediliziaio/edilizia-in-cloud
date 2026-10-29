/**
 * I conti della commessa in appalto per l'intestazione, e il periodo da
 * proporre quando si compone un rendiconto.
 *
 * Due cose trovate camminando il flusso il 29/10/2026:
 *  - l'intestazione di una commessa in appalto mostrava cinque zeri su un
 *    cantiere con migliaia di euro rendicontati;
 *  - «Componi» proponeva il mese appena chiuso anche quando tutto il lavoro in
 *    attesa era di questo mese, e il rendiconto usciva vuoto con un errore.
 */
import { describe, it, expect } from "vitest";
import {
  totaliCommessaAppalto,
  periodoDaRigheInAttesa,
  type RigaPerTotali,
} from "@/lib/appalto/rendiconto";

const r = (o: Partial<RigaPerTotali>): RigaPerTotali => ({
  importo: 100, costo_interno: 70, margine: 30, stato: "confermata", extra_contratto: false, ...o,
});

describe("totaliCommessaAppalto", () => {
  it("il cantiere vale tutto il lavoro valorizzato, non solo quello da chiudere", () => {
    const t = totaliCommessaAppalto([
      r({ importo: 1260, costo_interno: 570, margine: 690, stato: "confermata" }),
      r({ importo: 525, costo_interno: 357, margine: 168, stato: "in_sal" }),
      r({ importo: 1450, costo_interno: 1030, margine: 420, stato: "fatturata" }),
      r({ importo: 340, costo_interno: 220, margine: 120, stato: "bozza" }),
    ]);
    expect(t.rendicontato).toBe(3235);   // le tre valorizzate, la bozza fuori
    expect(t.inBozza).toBe(340);
    expect(t.daRendicontare).toBe(1260);
    expect(t.chiuso).toBe(1975);         // in_sal + fatturata
    expect(t.fatturato).toBe(1450);
    expect(t.margine).toBe(1278);
    expect(t.marginePct).toBe(39.5);
  });

  it("«già fatturato» lo dice il rendiconto, non la riga: le righe non arrivano mai a «fatturata»", () => {
    const t = totaliCommessaAppalto([
      r({ importo: 3235, stato: "in_sal", sal_stato: "fatturato" }),
      r({ importo: 1000, stato: "in_sal", sal_stato: "approvato" }),
      r({ importo: 500, stato: "confermata" }),
    ]);
    expect(t.fatturato).toBe(3235);
    expect(t.chiuso).toBe(4235);
    expect(t.daRendicontare).toBe(500);
  });

  it("senza lo stato del rendiconto il fatturato resta zero, non inventa", () => {
    const t = totaliCommessaAppalto([r({ importo: 900, stato: "in_sal" })]);
    expect(t.fatturato).toBe(0);
    expect(t.chiuso).toBe(900);
  });

  it("la percentuale si divide per il ricavo di cui si conosce il costo", () => {
    const t = totaliCommessaAppalto([
      r({ importo: 1000, costo_interno: 700, margine: 300 }),
      r({ importo: 500, costo_interno: null, margine: null }),
    ]);
    expect(t.rendicontatoConCosto).toBe(1000);
    expect(t.righeSenzaCosto).toBe(1);
    expect(t.marginePct).toBe(30);       // non 20, che uscirebbe dividendo per 1500
  });

  it("senza nessun costo il margine resta vuoto, non zero", () => {
    const t = totaliCommessaAppalto([r({ costo_interno: null, margine: null })]);
    expect(t.margine).toBeNull();
    expect(t.marginePct).toBeNull();
    expect(t.rendicontato).toBe(100);
  });

  it("solo bozze: niente rendicontato e niente margine, ma le bozze si vedono", () => {
    const t = totaliCommessaAppalto([r({ stato: "bozza", importo: 3235 })]);
    expect(t.rendicontato).toBe(0);
    expect(t.inBozza).toBe(3235);
    expect(t.margine).toBeNull();
  });

  it("il fuori contratto si conta a parte, bozze escluse", () => {
    const t = totaliCommessaAppalto([
      r({ importo: 1450, extra_contratto: true }),
      r({ importo: 900, extra_contratto: true, stato: "bozza" }),
      r({ importo: 500 }),
    ]);
    expect(t.extra).toBe(1450);
  });

  it("nessuna riga, nessun numero inventato", () => {
    const t = totaliCommessaAppalto([]);
    expect(t.rendicontato).toBe(0);
    expect(t.margine).toBeNull();
    expect(t.righeSenzaCosto).toBe(0);
  });
});

describe("periodoDaRigheInAttesa", () => {
  it("copre i mesi in cui sta il lavoro in attesa, per intero", () => {
    expect(periodoDaRigheInAttesa(["2026-10-09", "2026-10-29", "2026-10-16"]))
      .toEqual({ dal: "2026-10-01", al: "2026-10-31" });
  });

  it("se il lavoro in attesa è vecchio di mesi, li prende tutti", () => {
    expect(periodoDaRigheInAttesa(["2026-08-21", "2026-10-09"]))
      .toEqual({ dal: "2026-08-01", al: "2026-10-31" });
  });

  it("l'ultimo giorno è quello vero del mese, anche a febbraio", () => {
    expect(periodoDaRigheInAttesa(["2027-02-03"]).al).toBe("2027-02-28");
    expect(periodoDaRigheInAttesa(["2028-02-03"]).al).toBe("2028-02-29");
    expect(periodoDaRigheInAttesa(["2026-11-04"]).al).toBe("2026-11-30");
  });

  it("senza righe in attesa torna la regola di prima: il mese appena chiuso", () => {
    expect(periodoDaRigheInAttesa([], new Date(2026, 9, 29)))
      .toEqual({ dal: "2026-09-01", al: "2026-09-30" });
  });

  it("le date sporche non spostano il periodo", () => {
    expect(periodoDaRigheInAttesa(["2026-10-09T00:00:00Z", "", null as unknown as string]))
      .toEqual({ dal: "2026-10-01", al: "2026-10-31" });
  });
});
