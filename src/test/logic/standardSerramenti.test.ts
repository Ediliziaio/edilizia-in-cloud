import { describe, expect, it } from "vitest";
import {
  anteprima,
  avvisiStandard,
  codiceLinea,
  margine,
  percentualiOpzioni,
  prezzoLinea,
  validaStandard,
  variantiLinea,
  type StandardSerramenti,
} from "@/lib/listino/standardSerramenti";

/** Il caso reale di Renova: due linee PVC, prezzo al mq, posa inclusa. */
const renova: StandardSerramenti = {
  linee: [
    { nome: "Salamander 76", materiale: "PVC", differenzaPct: 0 },
    { nome: "Aluplast Ideal 5000", materiale: "PVC", differenzaPct: -8 },
  ],
  prezzoAcquistoMq: 180,
  prezzoVenditaMq: 600,
  colore: { standardPct: 10, fuoriStandardPct: 15 },
  vetro: { antisonoroPct: 12, antisfondamentoPct: 20 },
};

describe("standard listino infissi", () => {
  it("la linea base tiene il prezzo, la seconda scende della sua percentuale", () => {
    expect(prezzoLinea(renova, renova.linee[0])).toEqual({ acquisto: 180, vendita: 600 });
    expect(prezzoLinea(renova, renova.linee[1])).toEqual({ acquisto: 165.6, vendita: 552 });
  });

  it("lo sconto di linea non tocca il margine: scende anche l'acquisto", () => {
    const base = prezzoLinea(renova, renova.linee[0]);
    const seconda = prezzoLinea(renova, renova.linee[1]);
    expect(margine(base.acquisto, base.vendita)).toBeCloseTo(0.7, 6);
    expect(margine(seconda.acquisto, seconda.vendita)).toBeCloseTo(0.7, 6);
  });

  it("anteprima su una misura vera: 1200×1400 fa 1,68 mq", () => {
    const righe = anteprima(renova, 1200, 1400);
    expect(righe[0]).toMatchObject({ linea: "Salamander 76", mq: 1.68, vendita: 1008, acquisto: 302.4 });
    expect(righe[1]).toMatchObject({ linea: "Aluplast Ideal 5000", vendita: 927.36, acquisto: 278.21 });
  });

  it("le opzioni si moltiplicano al prezzo della linea", () => {
    const [salamander] = anteprima(renova, 1200, 1400, { colore: "fuoriStandardPct", vetro: "antisonoroPct" });
    // 1008 × 1,15 (colore) × 1,12 (vetro)
    expect(salamander.vendita).toBeCloseTo(1298.3, 1);
  });

  it("le linee diventano varianti: la prima è quella di default e non ha maggiorazione", () => {
    const varianti = variantiLinea(renova.linee);
    expect(varianti).toHaveLength(2);
    expect(varianti[0]).toMatchObject({ valore: "salamander_76", is_default: true, maggiorazione_tipo: "none", maggiorazione_valore: 0 });
    expect(varianti[1]).toMatchObject({
      valore: "aluplast_ideal_5000",
      is_default: false,
      maggiorazione_tipo: "percentuale",
      maggiorazione_valore: -8,
      maggiorazione_acquisto: -8,
    });
  });

  it("il codice della linea regge accenti, spazi e simboli", () => {
    expect(codiceLinea("PVC Salamander 76")).toBe("pvc_salamander_76");
    expect(codiceLinea("Alluminio/Legno — Serie 1")).toBe("alluminio_legno_serie_1");
    expect(codiceLinea("   ")).toBe("linea");
  });

  it("le percentuali delle opzioni finiscono sulle varianti giuste", () => {
    const p = percentualiOpzioni(renova);
    expect(p.bianco).toBe(0);
    expect(p.colore_fuori_standard).toBe(15);
    expect(p.antisonoro).toBe(12);
    expect(p.antisfondamento).toBe(20);
  });

  it("blocca chi non può essere salvato", () => {
    expect(validaStandard(renova)).toEqual([]);
    expect(validaStandard({ ...renova, linee: [] })).toContain("Serve almeno una linea (il modello di profilo che vendi).");
    expect(validaStandard({ ...renova, prezzoVenditaMq: 0 })[0]).toMatch(/vendita/);
    expect(validaStandard({ ...renova, prezzoAcquistoMq: 700 })[0]).toMatch(/margine/);
    expect(
      validaStandard({ ...renova, linee: [{ nome: "A", differenzaPct: 0 }, { nome: "A", differenzaPct: -5 }] }),
    ).toContain("Due linee hanno lo stesso nome.");
    expect(validaStandard({ ...renova, linee: [{ nome: "A", differenzaPct: -100 }] })[0]).toMatch(/azzera/);
  });

  it("avvisa quando le opzioni restano gratis o il margine è basso", () => {
    const senzaOpzioni: StandardSerramenti = {
      ...renova,
      colore: { standardPct: 0, fuoriStandardPct: 0 },
      vetro: { antisonoroPct: 0, antisfondamentoPct: 0 },
    };
    const a = avvisiStandard(senzaOpzioni);
    expect(a.some((x) => x.includes("Colore"))).toBe(true);
    expect(a.some((x) => x.includes("Vetro"))).toBe(true);
    expect(avvisiStandard({ ...renova, prezzoAcquistoMq: 550 })[0]).toMatch(/Margine/);
  });
});
