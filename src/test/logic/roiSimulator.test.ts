import { describe, it, expect } from "vitest";
import {
  computeRoi,
  sumHours,
  DEFAULT_INPUTS,
  DEFAULT_ASSUMPTIONS,
  type RoiInputs,
} from "@/lib/roiSimulator";

/**
 * Test del modello ROI (puro, critico per la vendita).
 *
 * Il modello è stato evoluto da "ore perse" generico a proposta di valore
 * ancorata alle funzioni reali di EdiliziaInCloud, dove la leva dominante è il
 * **margine recuperato col controllo di gestione** (% del fatturato).
 *
 * Tutto il calcolo deve essere difensivo: mai NaN/Infinity/negativi dai numeri,
 * percentuali clampate, payback definito solo con guadagno positivo.
 */

/** Helper: parte dai default e applica override mirati. */
function build(overrides: Partial<RoiInputs> = {}): RoiInputs {
  return { ...structuredClone(DEFAULT_INPUTS), ...overrides };
}

describe("sumHours", () => {
  it("somma le 5 voci di tempo perso", () => {
    expect(sumHours(build())).toBe(3 + 3 + 2 + 2 + 2); // 12
  });

  it("ignora voci negative/NaN (clamp a 0)", () => {
    const inputs = build({
      oreFatturazione: -5,
      orePreventivi: Number.NaN,
      oreCantieri: 2,
      oreRicercaDocumenti: 0,
      oreDoppieImmissioni: 1,
    });
    expect(sumHours(inputs)).toBe(3); // solo cantieri(2)+doppie(1)
  });
});

describe("computeRoi — scenario di default", () => {
  const r = computeRoi(build());

  it("ore/settimana = somma delle 5 voci (12h)", () => {
    expect(r.oreSettimana).toBe(12);
  });

  it("valoreTempo = ore * settimane * costoOrario * pctTempoRecuperato", () => {
    // 12 * 47 * 25 * 0.65 = 9165
    expect(r.valoreTempo).toBeCloseTo(12 * 47 * 25 * 0.65, 5);
    expect(r.valoreTempo).toBeCloseTo(9165, 5);
  });

  it("valoreMargine = fatturato * pctMargineRecuperato/100 (leva principale)", () => {
    // 400000 * 2.0/100 = 8000
    expect(r.valoreMargine).toBeCloseTo(400000 * 0.02, 5);
    expect(r.valoreMargine).toBe(8000);
  });

  it("valoreRischio = erroriAnnui * pctRischioEvitato/100", () => {
    // 3000 * 0.8 = 2400
    expect(r.valoreRischio).toBeCloseTo(3000 * 0.8, 5);
    expect(r.valoreRischio).toBe(2400);
  });

  it("nessuna crescita di default (toggle off → 0)", () => {
    expect(r.valoreCrescita).toBe(0);
  });

  it("softwareEliminato = softwareMensile * 12", () => {
    expect(r.softwareEliminato).toBe(80 * 12); // 960
  });

  it("canoneAnno = abbonamentoMensile * 12", () => {
    expect(r.canoneAnno).toBe(149 * 12); // 1788
  });

  it("valoreGeneratoAnnuo = tempo + margine + rischio + crescita", () => {
    expect(r.valoreGeneratoAnnuo).toBeCloseTo(9165 + 8000 + 2400 + 0, 5); // 19565
  });

  it("costoInazioneAnnuo = valoreGenerato + softwareEliminato", () => {
    expect(r.costoInazioneAnnuo).toBeCloseTo(19565 + 960, 5); // 20525
  });

  it("guadagnoNettoAnnuo = costoInazione - canone", () => {
    expect(r.guadagnoNettoAnnuo).toBeCloseTo(20525 - 1788, 5); // 18737
  });

  it("guadagnoNettoMensile = annuo/12, giornaliero = annuo/365", () => {
    expect(r.guadagnoNettoMensile).toBeCloseTo(18737 / 12, 5);
    expect(r.guadagnoNettoGiornaliero).toBeCloseTo(18737 / 365, 5);
  });

  it("roiMultiplo = guadagnoNetto / canone (ogni 1€ → X€)", () => {
    expect(r.roiMultiplo).toBeCloseTo(18737 / 1788, 5); // ~10.48
  });

  it("paybackGiorni = round(365 * canone / guadagnoNetto)", () => {
    expect(r.paybackGiorni).toBe(Math.round((365 * 1788) / 18737)); // 35
  });
});

describe("computeRoi — array leve (breakdown)", () => {
  it("ordina le leve per valore decrescente", () => {
    const r = computeRoi(build());
    const valori = r.leve.map((l) => l.valore);
    const sorted = [...valori].sort((a, b) => b - a);
    expect(valori).toEqual(sorted);
  });

  it("coi default la leva margine domina il tempo", () => {
    const r = computeRoi(build({ fatturatoAnnuo: 1_000_000 }));
    // margine = 1M*2% = 20000 → deve essere la prima leva
    expect(r.leve[0].key).toBe("margine");
    expect(r.leve[0].valore).toBe(20000);
  });

  it("ogni leva ha label e funzione descrittiva (per PDF/UI)", () => {
    const margine = computeRoi(build()).leve.find((l) => l.key === "margine");
    expect(margine?.label).toBe("Controllo di gestione e margini");
    expect(margine?.funzione).toContain("conto economico");
  });

  it("la leva crescita compare SOLO quando > 0", () => {
    const senza = computeRoi(build());
    expect(senza.leve.find((l) => l.key === "crescita")).toBeUndefined();

    const con = computeRoi(
      build({
        abilitaCrescita: true,
        preventiviMese: 8,
        valoreMedioPreventivo: 15000,
        tassoChiusuraPct: 25,
        upliftPreventiviPct: 20,
      }),
    );
    const crescita = con.leve.find((l) => l.key === "crescita");
    expect(crescita).toBeDefined();
    expect(crescita!.valore).toBeGreaterThan(0);
  });

  it("include sempre margine, tempo, rischio e software", () => {
    const keys = computeRoi(build()).leve.map((l) => l.key);
    expect(keys).toContain("margine");
    expect(keys).toContain("tempo");
    expect(keys).toContain("rischio");
    expect(keys).toContain("software");
  });
});

describe("computeRoi — crescita opzionale", () => {
  it("valoreCrescita = preventiviMese*12 * uplift% * valoreMedio * tassoChiusura%", () => {
    const r = computeRoi(
      build({
        abilitaCrescita: true,
        preventiviMese: 8,
        valoreMedioPreventivo: 15000,
        tassoChiusuraPct: 25,
        upliftPreventiviPct: 20,
      }),
    );
    // (8*12 * 20/100) * 15000 * 25/100 = (96*0.2)*15000*0.25 = 19.2*15000*0.25 = 72000
    expect(r.valoreCrescita).toBeCloseTo((8 * 12 * 0.2) * 15000 * 0.25, 3);
    expect(r.valoreCrescita).toBeCloseTo(72000, 3);
  });

  it("toggle off azzera la crescita anche con campi valorizzati", () => {
    const r = computeRoi(
      build({
        abilitaCrescita: false,
        preventiviMese: 8,
        valoreMedioPreventivo: 15000,
        tassoChiusuraPct: 25,
        upliftPreventiviPct: 20,
      }),
    );
    expect(r.valoreCrescita).toBe(0);
  });
});

describe("computeRoi — clamp difensivi (mai NaN/Infinity/negativi)", () => {
  it("input negativi/NaN trattati come 0", () => {
    const r = computeRoi(
      build({
        fatturatoAnnuo: -1000,
        costoOrario: Number.NaN,
        erroriAnnui: -500,
        softwareMensile: Number.NaN,
      }),
    );
    expect(r.valoreMargine).toBe(0);
    expect(r.valoreTempo).toBe(0); // costoOrario NaN → 0
    expect(r.valoreRischio).toBe(0);
    expect(r.softwareEliminato).toBe(0);
    expect(Number.isFinite(r.guadagnoNettoAnnuo)).toBe(true);
  });

  it("pctMargineRecuperato clampata a 0..10 (non 0..100)", () => {
    const alto = computeRoi(build({ pctMargineRecuperato: 999 }));
    // clamp a 10% → 400000 * 10% = 40000
    expect(alto.valoreMargine).toBe(40000);

    const negativo = computeRoi(build({ pctMargineRecuperato: -5 }));
    expect(negativo.valoreMargine).toBe(0);
  });

  it("pctTempoRecuperato/pctRischioEvitato clampate a 0..100", () => {
    const r = computeRoi(build({ pctTempoRecuperato: 999, pctRischioEvitato: -10 }));
    // tempo: 12*47*25*1.0 = 14100 ; rischio: 3000*0 = 0
    expect(r.valoreTempo).toBeCloseTo(12 * 47 * 25 * 1.0, 5);
    expect(r.valoreRischio).toBe(0);
  });

  it("canone = 0 → ROI e payback = 0 (niente divisione per zero)", () => {
    const r = computeRoi(build({ abbonamentoMensile: 0 }));
    expect(r.canoneAnno).toBe(0);
    expect(r.roiMultiplo).toBe(0);
    expect(r.paybackGiorni).toBe(0);
    expect(Number.isFinite(r.roiMultiplo)).toBe(true);
  });

  it("guadagno netto negativo → payback 0 (non si ripaga)", () => {
    // canone enorme, valore basso → guadagno netto < 0
    const r = computeRoi(
      build({
        abbonamentoMensile: 100000,
        fatturatoAnnuo: 0,
        oreFatturazione: 0,
        orePreventivi: 0,
        oreCantieri: 0,
        oreRicercaDocumenti: 0,
        oreDoppieImmissioni: 0,
        erroriAnnui: 0,
        softwareMensile: 0,
      }),
    );
    expect(r.guadagnoNettoAnnuo).toBeLessThan(0);
    expect(r.paybackGiorni).toBe(0);
  });

  it("tollera input completamente vuoto (campi mancanti) senza NaN", () => {
    // @ts-expect-error: simuliamo una simulazione salvata legacy/parziale
    const r = computeRoi({});
    for (const v of [
      r.valoreTempo,
      r.valoreMargine,
      r.valoreRischio,
      r.valoreCrescita,
      r.valoreGeneratoAnnuo,
      r.costoInazioneAnnuo,
      r.guadagnoNettoAnnuo,
      r.roiMultiplo,
      r.paybackGiorni,
    ]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });
});

describe("compat — campi legacy ancora presenti (PDF/email round 1)", () => {
  it("espone gli alias legacy mappati sul nuovo modello", () => {
    const r = computeRoi(build());
    // Il generatore PDF e l'email leggono ancora questi campi.
    expect(r.softwareAnnuo).toBe(r.softwareEliminato);
    expect(r.oreSettimanaTotali).toBe(r.oreSettimana);
    expect(r.costoErroriAnnuo).toBe(r.valoreRischio);
    expect(r.costoAttualeAnnuo).toBe(r.costoInazioneAnnuo);
    expect(r.risparmioAnnuo).toBe(r.guadagnoNettoAnnuo);
    expect(r.risparmioMensile).toBe(r.guadagnoNettoMensile);
    // "Con EiC" = solo il canone (tutto il resto è valore recuperato).
    expect(r.costoConEicAnnuo).toBe(r.canoneAnno);
  });
});

describe("DEFAULT — costanti coerenti con la spec", () => {
  it("DEFAULT_INPUTS ha i valori chiave attesi", () => {
    expect(DEFAULT_INPUTS.fatturatoAnnuo).toBe(400000);
    expect(DEFAULT_INPUTS.abbonamentoMensile).toBe(149);
    expect(DEFAULT_INPUTS.abilitaCrescita).toBe(false);
  });

  it("DEFAULT_ASSUMPTIONS coerenti (settimane 47, margine 2%)", () => {
    expect(DEFAULT_ASSUMPTIONS.settimaneAnno).toBe(47);
    expect(DEFAULT_ASSUMPTIONS.pctMargineRecuperato).toBe(2.0);
    expect(DEFAULT_ASSUMPTIONS.pctTempoRecuperato).toBe(65);
    expect(DEFAULT_ASSUMPTIONS.pctRischioEvitato).toBe(80);
  });
});
