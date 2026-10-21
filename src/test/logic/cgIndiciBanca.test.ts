import { describe, expect, it } from "vitest";
import {
  angoloLancetta,
  calcolaDscr,
  calcolaRotazione,
  classeDaPunteggio,
  formatEuro,
  formatEuroBreve,
  formatNumero,
  formatObiettivoIndicatore,
  formatRapportoPct,
  formatValoreCheck,
  formatValoreIndicatore,
  giorniPeriodo,
  indicatoreCalcolabile,
  levaPiano,
  parseImportoIt,
  roePiano,
  variazioneLeggibile,
} from "@/lib/controlloGestione/indiciBanca";

const MENO = "−";

describe("indici banca: formati it-IT", () => {
  it("usa la virgola e il meno tipografico, mai NaN o Infinity", () => {
    expect(formatNumero(3.1234)).toBe("3,12");
    expect(formatNumero(-0.5)).toBe(`${MENO}0,50`);
    expect(formatNumero(Number.NaN)).toBe("—");
    expect(formatNumero(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatRapportoPct(0.3892)).toBe("38,9%");
    expect(formatEuro(1346331.55)).toBe("1.346.332 €");
    expect(formatEuroBreve(4_700_000)).toBe("4,7 Mln €");
    expect(formatEuroBreve(-414_000)).toBe(`${MENO}414 mila €`);
    expect(formatEuroBreve(950)).toBe("950 €");
  });

  it("formatta in euro i controlli che sono importi", () => {
    expect(formatValoreCheck("patrimonio_netto", 100000)).toBe("100.000 €");
    expect(formatValoreCheck("quadratura_sp", 1346331.55)).toBe("1.346.332 €");
    expect(formatValoreCheck("cedolini", 337)).toBe("337");
  });

  it("legge gli importi scritti all'italiana", () => {
    expect(parseImportoIt("1.234.567,89")).toBe(1234567.89);
    expect(parseImportoIt("1234567,89")).toBe(1234567.89);
    expect(parseImportoIt("1234567.89")).toBe(1234567.89);
    expect(parseImportoIt("12.000")).toBe(12000);
    expect(parseImportoIt("€ 4.700.000")).toBe(4700000);
    expect(parseImportoIt("-514.335")).toBe(-514335);
    expect(parseImportoIt("")).toBeNull();
    expect(parseImportoIt("abc")).toBeNaN();
  });
});

describe("indici banca: periodo dell'anno", () => {
  it("anno in corso = giorni trascorsi, anni chiusi = giorni dell'anno, futuro = null", () => {
    const oggi = new Date(2026, 9, 22, 23, 30); // 22 ottobre, sera (niente slittamento UTC)
    expect(giorniPeriodo(2026, oggi)).toBe(295);
    expect(giorniPeriodo(2025, oggi)).toBe(365);
    expect(giorniPeriodo(2024, oggi)).toBe(366);
    expect(giorniPeriodo(2027, oggi)).toBeNull();
  });
});

describe("indici banca: rotazione (Demo 2, 2026 al 22/10)", () => {
  const base = {
    crediti_clienti: 1_037_822.19,
    rimanenze: 173_192,
    ricavi: 4_655_616.76,
    costo_venduto: 3_040_031.16,
    acquisti: 3_122_183.16, // materie + servizi + commerciali + amministrativi
  };

  it("DSO sui giorni trascorsi, non su 365", () => {
    const r = calcolaRotazione({ ...base, debiti_fornitori: 157_388 }, 295);
    expect(r.dso).toBeCloseTo((1_037_822.19 / 4_655_616.76) * 295, 6);
    expect(Math.round(r.dso!)).toBe(66); // era 81 con ×365
    expect(Math.round(r.dpo!)).toBe(15);
    expect(r.ccc).toBeCloseTo(r.dso! + r.dsi! - r.dpo!, 6);
  });

  it("senza debiti fornitori il DPO è non calcolabile, non 0 giorni, e il CCC non esce", () => {
    const r = calcolaRotazione({ ...base, debiti_fornitori: 0 }, 295);
    expect(r.dpo).toBeNull();
    expect(r.motivoDpo).toMatch(/debito verso fornitori/);
    expect(r.ccc).toBeNull();
  });

  it("anno futuro: niente indici", () => {
    const r = calcolaRotazione({ ...base, debiti_fornitori: 1 }, null);
    expect([r.dso, r.dpo, r.dsi, r.ccc]).toEqual([null, null, null, null]);
  });
});

describe("indici banca: DSCR", () => {
  it("confronta il flusso del periodo con le rate dello stesso periodo", () => {
    // Demo 2: flusso 367.734,24 € in 295 giorni, rate 45.600 € l'anno.
    const d = calcolaDscr(367_734.24, 45_600, 295);
    expect(d.ratePeriodo).toBeCloseTo(36_854.79, 2);
    expect(d.valore).toBe(9.98);
    expect(d.classe).toBe("eccellente");
  });
  it("senza mutui: non applicabile", () => {
    expect(calcolaDscr(100, 0, 365)).toEqual({ valore: null, ratePeriodo: 0, classe: "na" });
  });
  it("soglie bancarie", () => {
    expect(calcolaDscr(119, 100, 365).classe).toBe("critico");
    expect(calcolaDscr(120, 100, 365).classe).toBe("buono");
    expect(calcolaDscr(99, 100, 365).classe).toBe("insufficiente");
  });
});

describe("rating bancario", () => {
  it("la lancetta va a sinistra con punteggio basso e a destra con punteggio alto", () => {
    expect(angoloLancetta(0)).toBe(180);
    expect(angoloLancetta(100)).toBe(360);
    expect(angoloLancetta(95)).toBeGreaterThan(angoloLancetta(10));
    expect(angoloLancetta(Number.NaN)).toBe(180);
  });

  it("classi con le stesse soglie del database", () => {
    expect(classeDaPunteggio(95)).toBe("AAA");
    expect(classeDaPunteggio(90)).toBe("AAA");
    expect(classeDaPunteggio(89)).toBe("AA");
    expect(classeDaPunteggio(55)).toBe("BBB");
    expect(classeDaPunteggio(54)).toBe("BB");
    expect(classeDaPunteggio(19)).toBe("CCC");
  });

  it("valori e obiettivi in it-IT", () => {
    expect(formatValoreIndicatore({ codice: "liquidita", valore: 3.9447, punteggio: 25 })).toBe("3,94");
    expect(formatValoreIndicatore({ codice: "indipendenza", valore: 0.3892, punteggio: 20 })).toBe("38,9%");
    expect(formatValoreIndicatore({ codice: "oneri_finanziari", valore: 0.0005, punteggio: 25 })).toBe("0,1%");
    expect(formatObiettivoIndicatore("liquidita", 1.8)).toBe("da 1,80 in su");
    expect(formatObiettivoIndicatore("oneri_finanziari", 0.015)).toBe("fino a 1,5%");
  });

  it("riconosce i valori non calcolabili, vecchi e nuovi", () => {
    expect(indicatoreCalcolabile({ codice: "oneri_finanziari", valore: 1, punteggio: 0 })).toBe(false);
    expect(indicatoreCalcolabile({ codice: "liquidita", valore: 0, punteggio: 0 })).toBe(false);
    expect(indicatoreCalcolabile({ codice: "liquidita", valore: null, punteggio: 25, calcolabile: true })).toBe(true);
    expect(formatValoreIndicatore({ codice: "liquidita", valore: null, punteggio: 25, calcolabile: true })).toBe("nessun debito a breve");
  });
});

describe("piano industriale", () => {
  it("variazione in % solo tra valori positivi, altrimenti in euro", () => {
    expect(variazioneLeggibile(110, 100)).toBe("+10,0%");
    expect(variazioneLeggibile(-353_000, -414_000)).toBe(`+61 mila €`);
    expect(variazioneLeggibile(-100_000, 50_000)).toBe(`${MENO}150 mila €`);
    expect(variazioneLeggibile(0, 0)).toBe("=");
  });

  it("ROE e leva non calcolabili con mezzi propri negativi, con il motivo", () => {
    const p = { ricavi: 1, ebitda: 0, ammortamenti: 0, oneri_finanziari: 0, utile: -514_000, cespiti: 0, mezzi_propri: -327_000, debito_mlt: 243_500 };
    expect(roePiano(p)).toEqual({ valore: null, motivo: "mezzi propri negativi o nulli" });
    expect(levaPiano(p).valore).toBeNull();
    expect(levaPiano({ ...p, mezzi_propri: 487_000 }).valore).toBeCloseTo(0.5, 6);
  });
});
