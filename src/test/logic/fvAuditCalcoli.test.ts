/**
 * Fotovoltaico — i conti delle librerie, controllati con risultati fatti a mano o con un
 * calcolo ingenuo scritto qui (mai con la formula del codice): produzione, autoconsumo,
 * cassa a 25 anni, payback, valore attuale, rendimento, noleggio, stringhe, costi a 20
 * anni, bolletta prima e dopo.
 */
import { describe, expect, it } from "vitest";
import {
  autoconsumoPctDaProfilo,
  calcolaAutoconsumoAnno1,
  co2Evitata25Anni,
  produzioneAnnoN,
  produzioneAnnuaLorda,
  produzioneMensile,
} from "@/lib/fotovoltaico/fisica";
import {
  applicaFinanziamento,
  calcolaCassaCumulata,
  calcolaIRR,
  calcolaNPV,
  calcolaPayback,
  type InputCassaCumulata,
} from "@/lib/fotovoltaico/finanziaria";
import { calcolaFvNoleggioOperativo } from "@/lib/fotovoltaico/preventivatore";
import { dimensionaStringhe, INVERTER_DEFAULT, MODULO_DEFAULT_540 } from "@/lib/fotovoltaico/stringhe";
import { derivaSpecModuloDaPotenza } from "@/lib/fotovoltaico/catalogoProdotti";
import {
  aliquotaIvaFv,
  importoPreventivoFv,
  percentualeIvaFv,
} from "@/lib/fotovoltaico/importoPreventivo";
import {
  calcolaBollettaPrimaDopo,
  calcolaCosti20Anni,
  calcolaEnergyFlows,
  quotaAutoconsumo,
} from "../../../supabase/functions/_shared/fvCalcoli.ts";

describe("produzione annua: kWp × ore di sole × PR × (1 − perdite) × (1 − ombra)", () => {
  it.each([
    // [kWp, ore, parametri, atteso a mano]
    [6, 1500, undefined, 6808.5], //                6 × 1.500 = 9.000 · 0,85 = 7.650 · 0,89 = 6.808,5
    [10, 1400, { performance_ratio: 0.88 }, 10964.8], // 14.000 · 0,88 = 12.320 · 0,89
    [6, 1500, { perdita_ombreggiamento_pct: 0.1 }, 6127.65], //   −10% di ombra vicina
    [6, 1500, { perdita_ombreggiamento_pct: 0.8 }, 2723.4], //    l'ombra si ferma al 60%: × 0,4
    [6, 1500, { perdita_ombreggiamento_pct: -0.2 }, 6808.5], //   un'ombra negativa non esiste
    [6, 1500, { perdita_temperatura_pct: 0.1 }, 6349.5], //       perdite 10+2+3+2 = 17% → 0,83 · 7.650
    [6, 1500, { perdita_temperatura_pct: 1.5 }, 0], //            perdite oltre il 100%: zero, non negativo
    [0, 1500, undefined, 0],
    [6, 0, undefined, 0],
    [3.3, 1234.5, undefined, 3081.87], //                         4.073,85 · 0,85 · 0,89 = 3.081,8675
  ])("%s kWp, %s h, %j → %s kWh", (kwp, ore, parametri, atteso) => {
    expect(produzioneAnnuaLorda({ potenza_kwp: kwp, ore_sole_annue: ore, parametri: parametri as never })).toBeCloseTo(atteso, 2);
  });

  it.each(["VI", "TO", "NA", "PA", "RM", "XX", null])("la produzione mensile di %s somma alla produzione dell'anno", (provincia) => {
    const mesi = produzioneMensile(6808.5, provincia);
    expect(mesi).toHaveLength(12);
    expect(mesi.reduce((s, m) => s + m, 0)).toBeCloseTo(6808.5, 0);
  });

  it("col degrado dello 0,5% l'anno: anno 2 = ×0,995, anno 25 = ×0,995^24; l'anno 0 e i negativi restano il primo", () => {
    expect(produzioneAnnoN(1000, 1)).toBe(1000);
    expect(produzioneAnnoN(1000, 2)).toBeCloseTo(995, 6);
    expect(produzioneAnnoN(1000, 25)).toBeCloseTo(1000 * Math.pow(0.995, 24), 6); // 886,9…
    expect(produzioneAnnoN(1000, 0)).toBe(1000);
    expect(produzioneAnnoN(1000, -3)).toBe(1000);
    expect(produzioneAnnoN(1000, 25, 0)).toBe(1000);
  });
});

describe("autoconsumo e risparmio del primo anno", () => {
  it("6.808,5 kWh prodotti, 4.500 consumati, 35% di autoconsumo: 2.382,975 in casa, 4.425,525 ceduti, 762,55 + 442,55 €", () => {
    const r = calcolaAutoconsumoAnno1({ produzione_kwh: 6808.5, consumo_kwh: 4500, autoconsumo_pct: 0.35, prezzo_kwh_acquisto: 0.32, prezzo_rid_kwh: 0.1 });
    expect(r.energia_autoconsumata_kwh).toBeCloseTo(2382.975, 1);
    expect(r.energia_immessa_kwh).toBeCloseTo(4425.525, 1);
    // ciò che entra in casa più ciò che esce in rete è la produzione, al centesimo
    expect(r.energia_autoconsumata_kwh + r.energia_immessa_kwh).toBeCloseTo(6808.5, 2);
    expect(r.risparmio_bolletta_eur).toBeCloseTo(762.55, 2);
    expect(r.ricavi_rid_eur).toBeCloseTo(442.55, 2);
    expect(r.risparmio_totale_eur).toBeCloseTo(1205.10, 2);
    expect(r.warning_sovradimensionato).toBe(false);
  });

  it("non si consuma più di quanto si ha: al 80% sarebbero 5.446,8 kWh, si fermano a 4.500 e l'impianto è sovradimensionato", () => {
    const r = calcolaAutoconsumoAnno1({ produzione_kwh: 6808.5, consumo_kwh: 4500, autoconsumo_pct: 0.8, prezzo_kwh_acquisto: 0.32, prezzo_rid_kwh: 0.1 });
    expect(r.energia_autoconsumata_kwh).toBe(4500);
    expect(r.energia_immessa_kwh).toBe(2308.5);
    expect(r.risparmio_bolletta_eur).toBe(1440);
    expect(r.warning_sovradimensionato).toBe(true);
  });

  it("consumo zero: niente autoconsumo, tutto ceduto", () => {
    const r = calcolaAutoconsumoAnno1({ produzione_kwh: 1000, consumo_kwh: 0, autoconsumo_pct: 0.5, prezzo_kwh_acquisto: 0.3, prezzo_rid_kwh: 0.1 });
    expect(r).toMatchObject({ energia_autoconsumata_kwh: 0, energia_immessa_kwh: 1000, risparmio_bolletta_eur: 0, ricavi_rid_eur: 100 });
  });

  it("le fasce di batteria sono le stesse del client e del server (0 · fino a 5 · fino a 10 · oltre)", () => {
    const profilo = { autoconsumo_no_accumulo: 0.35, autoconsumo_accumulo_5kwh: 0.55, autoconsumo_accumulo_10kwh: 0.7, autoconsumo_accumulo_15kwh: 0.8 };
    for (const kwh of [-1, 0, 0.5, 5, 5.01, 10, 10.01, 15, 15.01, 30]) {
      expect(quotaAutoconsumo({ codice: "misto", ...profilo }, kwh), `${kwh} kWh`).toBe(autoconsumoPctDaProfilo(profilo, kwh));
    }
    expect(quotaAutoconsumo({ codice: "misto", ...profilo }, 5)).toBe(0.55);
    expect(quotaAutoconsumo({ codice: "misto", ...profilo }, 5.01)).toBe(0.7);
  });

  it("CO₂ evitata: 0,319 kg per kWh", () => {
    expect(co2Evitata25Anni(100000)).toBe(31900);
    expect(co2Evitata25Anni(0)).toBe(0);
  });
});

const BASE: InputCassaCumulata = {
  investimento_iniziale: 12000, produzione_anno_1_kwh: 5000, autoconsumo_pct: 0.5,
  costo_kwh_attuale: 0.3, prezzo_rid_kwh: 0.1, detrazione_annua_eur: 0, durata_detrazione_anni: 10,
  inflazione_energia_pct: 0, inflazione_rid_pct: 0, degradazione_pannelli_pct: 0,
  costo_manutenzione_anno_eur: 0, costo_sostituzione_inverter_eur: 0, orizzonte_anni: 25,
};
// 5.000 kWh · 50% = 2.500 in casa · 0,30 = 750 + 2.500 ceduti · 0,10 = 250 → 1.000 € l'anno, costanti.

/** Il rendimento si cerca per bisezione: NPV(r) = 0 sui flussi, senza Newton. */
function irrIngenuo(flussi: number[]): number {
  let lo = -0.5, hi = 1;
  const npv = (r: number) => flussi.reduce((s, f, n) => s + f / Math.pow(1 + r, n), 0);
  for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (npv(lo) * npv(mid) <= 0) hi = mid; else lo = mid; }
  return (lo + hi) / 2;
}

describe("cassa a 25 anni, payback, valore attuale e rendimento", () => {
  it("1.000 € l'anno su 12.000 €: rientra in 12 anni esatti, cumulato finale 13.000", () => {
    const cassa = calcolaCassaCumulata(BASE);
    expect(cassa).toHaveLength(26);
    expect(cassa[0]).toMatchObject({ anno: 0, flusso: -12000, cumulato: -12000 });
    expect(cassa[12].cumulato).toBe(0);
    expect(cassa[25].cumulato).toBe(13000);
    expect(calcolaPayback(cassa)).toBe(12);
  });

  it("il payback si interpola fra due anni: 1.400 € l'anno su 12.000 → 8,57 anni → 8,6", () => {
    const cassa = calcolaCassaCumulata({ ...BASE, costo_kwh_attuale: 0.4, prezzo_rid_kwh: 0.16 });
    // 2.500 · 0,40 + 2.500 · 0,16 = 1.400
    expect(cassa[1].flusso).toBe(1400);
    expect(calcolaPayback(cassa)).toBe(8.6);
  });

  it("se non rientra mai in 25 anni il payback è null; se la cassa parte già in positivo è 0", () => {
    expect(calcolaPayback(calcolaCassaCumulata({ ...BASE, investimento_iniziale: 40000 }))).toBeNull();
    expect(calcolaPayback(calcolaCassaCumulata({ ...BASE, investimento_iniziale: 0 }))).toBe(0);
    expect(calcolaPayback([])).toBeNull();
  });

  it("valore attuale al 4% di 25 rate da 1.000: −12.000 + 1.000 · (1 − 1,04^−25)/0,04 = 3.622,1", () => {
    const rendita = (1 - Math.pow(1.04, -25)) / 0.04; // 15,6221…
    expect(calcolaNPV(calcolaCassaCumulata(BASE), 0.04)).toBeCloseTo(-12000 + 1000 * rendita, 1);
    expect(calcolaNPV(calcolaCassaCumulata(BASE), 0)).toBe(13000);
  });

  it("il rendimento fa tornare a zero il valore attuale (cercato per bisezione, non con la stessa formula)", () => {
    const cassa = calcolaCassaCumulata(BASE);
    const r = calcolaIRR(cassa);
    expect(r).not.toBeNull();
    expect(r as number).toBeCloseTo(irrIngenuo(cassa.map((f) => f.flusso)), 3);
    // il rendimento si legge a quattro decimali (0,01%): il valore attuale lì sta entro 5 € su 12.000
    expect(Math.abs(calcolaNPV(cassa, r as number))).toBeLessThan(5);
  });

  it("detrazione 10 anni e sostituzione dell'inverter al 12°: i flussi cambiano solo in quegli anni", () => {
    const cassa = calcolaCassaCumulata({ ...BASE, detrazione_annua_eur: 600, costo_sostituzione_inverter_eur: 1500 });
    expect(cassa[1].flusso).toBe(1600);
    expect(cassa[10].flusso).toBe(1600);
    expect(cassa[11].flusso).toBe(1000);
    expect(cassa[12].flusso).toBe(-500); // 1.000 − 1.500
    expect(cassa[13].flusso).toBe(1000);
    expect(cassa[12].sostituzione_inverter_eur).toBe(1500);
  });

  it("degrado, inflazione dell'energia (2,5%) e del ritiro (2%): anno 3 = produzione × 0,995² e prezzi × 1,025² / × 1,02²", () => {
    const cassa = calcolaCassaCumulata({ ...BASE, degradazione_pannelli_pct: 0.005, inflazione_energia_pct: 0.025, inflazione_rid_pct: 0.02 });
    const prod = 5000 * Math.pow(0.995, 2);
    const atteso = prod * 0.5 * 0.3 * Math.pow(1.025, 2) + prod * 0.5 * 0.1 * Math.pow(1.02, 2);
    expect(cassa[3].flusso).toBeCloseTo(atteso, 2);
    expect(cassa[3].produzione_kwh).toBeCloseTo(prod, 1);
  });

  it("un impianto che produce meno di quel che si consuma non cede energia: nessun ricavo negativo", () => {
    const cassa = calcolaCassaCumulata({ ...BASE, produzione_anno_1_kwh: 1000, autoconsumo_pct: 1, consumo_annuo_kwh: 400 });
    expect(cassa[1].risparmio_bolletta_eur).toBe(120); // 400 · 0,30 (il resto del 100% è ceduto, non risparmiato)
    expect(cassa[1].ricavi_rid_eur).toBe(60); //         600 · 0,10
  });

  it("finanziato: anticipo all'anno 0, rate dentro ogni anno e l'ultimo anno parziale (100 mesi = 8 anni + 4 mesi)", () => {
    const cash = calcolaCassaCumulata(BASE);
    const fin = applicaFinanziamento(cash, { anticipo_eur: 2000, rata_mensile_eur: 100, durata_mesi: 100 });
    expect(fin[0].flusso).toBe(-2000);
    expect(fin[1].flusso).toBe(1000 - 1200);
    expect(fin[8].flusso).toBe(1000 - 1200);
    expect(fin[9].flusso).toBe(1000 - 400); // solo 4 rate
    expect(fin[10].flusso).toBe(1000);
    // il totale pagato in rate è rata × mesi, né una rata di più né una di meno
    const pagato = cash.slice(1).reduce((s, f, i) => s + (f.flusso - fin[i + 1].flusso), 0);
    expect(pagato).toBe(100 * 100);
  });
});

describe("noleggio operativo: canone, durata e copertura", () => {
  const base = { archetipo: "pmi", investimentoNetto: 100000, risparmioAnno1: 12000, manutenzioneAnnua: 1200, aliquotaRisparmioFiscale: 0.24 };

  it("84 mesi, fattore di serie 1,18: 100.000 · 1,18 / 84 = 1.404,76 + manutenzione 100 → 1.504,76 al mese", () => {
    const r = calcolaFvNoleggioOperativo({ ...base, durataMesi: 84 });
    expect(r.canone_mensile).toBeCloseTo(1504.76, 2);
    expect(r.durata_mesi).toBe(84);
    expect(r.anticipo_eur).toBe(0);
    // beneficio fiscale 24% del canone; costo effettivo = canone − risparmio (1.000) − beneficio
    expect(r.beneficio_fiscale_mensile).toBeCloseTo(361.14, 2);
    expect(r.costo_effettivo_mensile).toBeCloseTo(1504.76 - 1000 - 361.14, 2);
  });

  it.each([
    // [mesi richiesti, mesi usati, fattore di serie]
    [24, 36, 1.12], [36, 36, 1.12], [60, 60, 1.12], [61, 61, 1.18], [84, 84, 1.18], [85, 85, 1.26],
    [120, 120, 1.26], [121, 121, 1.34], [200, 144, 1.34],
  ])("durata %s mesi → si calcola su %s mesi col fattore %s", (richiesti, usati, fattore) => {
    const r = calcolaFvNoleggioOperativo({ ...base, manutenzioneAnnua: 0, durataMesi: richiesti });
    expect(r.durata_mesi).toBe(usati);
    expect(r.canone_mensile).toBeCloseTo((100000 * fattore) / usati, 2);
  });

  it("il fattore scelto dall'azienda sta fra 1 e 1,8; il canone per la durata copre sempre almeno il capitale", () => {
    expect(calcolaFvNoleggioOperativo({ ...base, manutenzioneAnnua: 0, durataMesi: 60, fattoreCanone: 2.5 }).canone_mensile).toBeCloseTo((100000 * 1.8) / 60, 2);
    expect(calcolaFvNoleggioOperativo({ ...base, manutenzioneAnnua: 0, durataMesi: 60, fattoreCanone: 0.5 }).canone_mensile).toBeCloseTo(100000 / 60, 2);
    for (const mesi of [36, 60, 84, 120, 144]) {
      const r = calcolaFvNoleggioOperativo({ ...base, manutenzioneAnnua: 0, durataMesi: mesi });
      expect(r.canone_mensile * r.durata_mesi).toBeGreaterThanOrEqual(100000);
    }
  });

  it("i privati non hanno il noleggio (canone 0), e senza investimento neppure le aziende", () => {
    for (const archetipo of ["privato_prima", "privato_seconda", "privato_isee", null, undefined]) {
      expect(calcolaFvNoleggioOperativo({ ...base, archetipo, durataMesi: 84 })).toMatchObject({ eligible: false, canone_mensile: 0, status: "not_eligible" });
    }
    expect(calcolaFvNoleggioOperativo({ ...base, investimentoNetto: 0 }).eligible).toBe(false);
    expect(calcolaFvNoleggioOperativo({ ...base, investimentoNetto: -5 }).eligible).toBe(false);
  });

  it("senza durata si usano 84 mesi; un valore non numerico non produce NaN", () => {
    expect(calcolaFvNoleggioOperativo({ ...base, durataMesi: null }).durata_mesi).toBe(84);
    expect(calcolaFvNoleggioOperativo({ ...base, durataMesi: Number.NaN }).durata_mesi).toBe(84);
    const r = calcolaFvNoleggioOperativo({ ...base, risparmioAnno1: Number.NaN, manutenzioneAnnua: undefined });
    for (const v of [r.canone_mensile, r.costo_effettivo_mensile, r.copertura_canone_pct, r.beneficio_fiscale_mensile]) expect(Number.isFinite(v)).toBe(true);
  });

  it("la copertura del canone decide lo stato: ≥ 90% consigliato, ≥ 65% da rivedere, sotto non adatto", () => {
    // canone 1.404,76 (senza manutenzione, 84 mesi); copertura = (risparmio + 24% del canone) / canone
    const copertura = (risparmioMensile: number) => (risparmioMensile + 0.24 * 1404.76) / 1404.76;
    for (const [risparmioAnno1, stato] of [[12 * 1100, "recommended"], [12 * 800, "review"], [12 * 400, "not_eligible"]] as const) {
      const r = calcolaFvNoleggioOperativo({ ...base, manutenzioneAnnua: 0, durataMesi: 84, risparmioAnno1 });
      expect(r.status, `${risparmioAnno1 / 12} €/mese → ${copertura(risparmioAnno1 / 12).toFixed(2)}`).toBe(stato);
    }
  });
});

describe("dimensionamento delle stringhe (modulo 540 W, inverter generico 1.000 V, 2 MPPT × 2)", () => {
  it("finestra di tensione: a −10 °C la stringa non supera i 1.000 V (max 18 moduli), a +70 °C resta sopra i 160 V (min 5)", () => {
    const r = dimensionaStringhe(10);
    expect([r.moduli_min_stringa, r.moduli_max_stringa]).toEqual([5, 18]);
    // Voc 49,5 · (1 + 0,0025 · 35) = 53,83 V · 18 = 969 V; Vmp 41,7 · (1 − 0,0029 · 45) = 36,26 V · 5 = 181 V
    expect(r.voc_stringa_freddo_v).toBeCloseTo(53.83 * 10, 0);
    expect(dimensionaStringhe(18).voc_stringa_freddo_v).toBeLessThanOrEqual(1000);
    expect(dimensionaStringhe(19).moduli_per_stringa).toBeLessThanOrEqual(18);
  });

  it.each([
    // [moduli, moduli per stringa, stringhe, valido]
    [5, 5, 1, true], [10, 10, 1, true], [13, 13, 1, true], [18, 18, 1, true], [24, 12, 2, true],
    [27, 9, 3, true], [32, 16, 2, true], [36, 18, 2, true], [4, 0, 0, false], [100, 10, 10, false],
  ])("%s moduli → stringhe da %s × %s, valido %s", (moduli, perStringa, stringhe, valido) => {
    const r = dimensionaStringhe(moduli);
    expect(r.moduli_per_stringa).toBe(perStringa);
    expect(r.numero_stringhe).toBe(stringhe);
    expect(r.valido).toBe(valido);
    expect(r.moduli_collegati + r.moduli_non_assegnati).toBe(moduli);
  });

  it("38 moduli non si dividono in stringhe uguali: 2 × 18 e 2 moduli lasciati fuori, con l'avviso", () => {
    const r = dimensionaStringhe(38);
    expect([r.moduli_per_stringa, r.numero_stringhe, r.moduli_non_assegnati]).toEqual([18, 2, 2]);
    expect(r.warnings.some((w) => w.includes("2 moduli non assegnati"))).toBe(true);
  });

  it("con più inseguitori (3 MPPT × 2) entrano 6 stringhe; con un inverter piccolo (1 MPPT × 1) una sola", () => {
    const grande = { ...INVERTER_DEFAULT, nMppt: 3, maxStringhePerMppt: 2 };
    expect(dimensionaStringhe(60, MODULO_DEFAULT_540, grande).valido).toBe(true); // 6 × 10
    const piccolo = { ...INVERTER_DEFAULT, nMppt: 1, maxStringhePerMppt: 1 };
    expect(dimensionaStringhe(24, MODULO_DEFAULT_540, piccolo).valido).toBe(false); // 2 stringhe su 1 ingresso
    expect(dimensionaStringhe(12, MODULO_DEFAULT_540, piccolo).valido).toBe(true);
  });

  it("un modulo grande da 700 W ha meno moduli per stringa (Voc più alta) e il freddo estremo li riduce ancora", () => {
    const grosso = derivaSpecModuloDaPotenza(700);
    const normale = dimensionaStringhe(10, grosso);
    expect(normale.moduli_max_stringa).toBeLessThan(dimensionaStringhe(10).moduli_max_stringa);
    expect(dimensionaStringhe(10, MODULO_DEFAULT_540, INVERTER_DEFAULT, { tCellaFreddo: -25 }).moduli_max_stringa).toBe(17);
  });

  it("senza moduli o con un numero negativo non si inventa una stringa", () => {
    for (const n of [0, -3]) {
      const r = dimensionaStringhe(n);
      expect(r.valido).toBe(false);
      expect(r.moduli_per_stringa).toBe(0);
    }
  });
});

describe("IVA e importo del preventivo in elenco e scheda", () => {
  it.each([
    [0.1, 0.1, 10], [0.22, 0.22, 22], [0.04, 0.04, 4], [0, 0, 0], [10, 0.1, 10], [22, 0.22, 22],
    [null, 0.1, 10], [undefined, 0.1, 10], ["", 0.1, 10], ["0.22", 0.22, 22], [-5, 0.1, 10], ["abc", 0.1, 10],
  ])("aliquota salvata %j → frazione %s, %s%%", (salvata, frazione, perc) => {
    expect(aliquotaIvaFv(salvata)).toBe(frazione);
    expect(percentualeIvaFv(salvata)).toBe(perc);
  });

  it("il totale calcolato vince sul prezzo del kit; il prezzo a corpo (ricalcolato con la sua IVA) vince su tutto, ma non con un kit", () => {
    expect(importoPreventivoFv({ prezzo_vendita_iva_inclusa: 4818, kit_bundle_id: "k", kit_prezzo: 8000, iva_aliquota: 0.1 })).toBe(4818);
    expect(importoPreventivoFv({ prezzo_vendita_iva_inclusa: null, kit_bundle_id: "k", kit_prezzo: 8000, iva_aliquota: 0.1 })).toBe(8800);
    expect(importoPreventivoFv({ prezzo_vendita_iva_inclusa: 4818, prezzo_vendita_manuale: 5000, iva_aliquota: 0.22 })).toBe(6100);
    expect(importoPreventivoFv({ prezzo_vendita_iva_inclusa: 8800, prezzo_vendita_manuale: 5000, kit_bundle_id: "k", iva_aliquota: 0.1 })).toBe(8800);
  });

  it("mai NaN: valori sporchi o assenti diventano «niente» (null) o 0, non un numero rotto", () => {
    expect(importoPreventivoFv({})).toBeNull();
    expect(importoPreventivoFv({ prezzo_vendita_iva_inclusa: 0 })).toBe(0);
    expect(importoPreventivoFv({ prezzo_vendita_iva_inclusa: "boh" as unknown as number })).toBe(0);
    expect(importoPreventivoFv({ prezzo_vendita_manuale: Number.NaN, prezzo_vendita_iva_inclusa: 100 })).toBe(100);
    expect(importoPreventivoFv({ prezzo_vendita_manuale: "1.234,5" as unknown as number })).toBeNull(); // il testo con la virgola non è un numero: si legge nel wizard, non qui
  });

  it("prezzo a corpo con decimali: 1.234,56 + 22% = 1.506,16 (arrotondato al centesimo, non troncato)", () => {
    expect(importoPreventivoFv({ prezzo_vendita_manuale: 1234.56, iva_aliquota: 0.22 })).toBe(1506.16); // 1.506,1632
  });
});

describe("flussi di energia, bolletta e costi a 20 anni del PDF", () => {
  it.each([
    // [kWp, batteria, kWh batteria, consumo, ore]
    [6, false, 0, 4500, 1500], [6, true, 5, 4500, 1500], [6, true, 12, 2000, 1500], [20, true, 15, 3000, 1700],
    [3, false, 0, 6000, 1300], [6, false, 0, 0, 1500], [6, true, 0, 4500, 1500],
  ])("%s kWp, batteria %s %s kWh, consumo %s: l'energia torna (produzione = in casa + ceduta, consumo = in casa + dalla rete)", (kwp, has, cap, consumo, ore) => {
    const f = calcolaEnergyFlows({ potenza_kwp: kwp, has_accumulo: has, capacita_accumulo_kwh: cap, consumo_annuo_kwh: consumo, ore_sole_annue: ore });
    expect(f.autoconsumo_kwh).toBeLessThanOrEqual(consumo);
    expect(f.autoconsumo_kwh).toBeLessThanOrEqual(f.produzione_kwh);
    expect(f.autoconsumo_kwh + f.ceduto_rete_kwh).toBe(f.produzione_kwh);
    expect(f.autoconsumo_kwh + f.prelievo_rete_kwh).toBe(consumo);
    for (const p of [f.autoconsumo_pct, f.autosufficienza_pct, f.consumo_da_rete_pct, f.consumo_da_fv_pct]) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
    expect(f.consumo_da_rete_pct + f.consumo_da_fv_pct).toBeCloseTo(1, 6);
  });

  it("la produzione calcolata dal server (se c'è) vince sulla stima; con la stima: kWp × ore × PR × 0,89", () => {
    expect(calcolaEnergyFlows({ potenza_kwp: 6, has_accumulo: false, capacita_accumulo_kwh: 0, consumo_annuo_kwh: 4500, ore_sole_annue: 1500, produzione_kwh: 6808.5 }).produzione_kwh).toBe(6809);
    expect(calcolaEnergyFlows({ potenza_kwp: 6, has_accumulo: false, capacita_accumulo_kwh: 0, consumo_annuo_kwh: 4500, ore_sole_annue: 1500 }).produzione_kwh).toBe(Math.round(6808.5));
    expect(calcolaEnergyFlows({ potenza_kwp: 6, has_accumulo: false, capacita_accumulo_kwh: 0, consumo_annuo_kwh: 4500, ore_sole_annue: 1500, performance_ratio: 0.88 }).produzione_kwh).toBe(Math.round(7048.8));
  });

  it("la bolletta prima e dopo: le voci sommano al totale, il totale è consumo × prezzo, il risparmio è il consumato in casa × prezzo", () => {
    // 4.500 kWh · 0,32 = 1.440; presi dalla rete dopo il FV: 2.117 → 677,44
    const righe = calcolaBollettaPrimaDopo({ consumo_annuo_kwh: 4500, prelievo_rete_kwh: 2117, prezzo_kwh: 0.32, ricavi_rid_eur: 442.55 });
    const voci = righe.filter((r) => !r.is_total && !r.is_kwh_row && r.oggi_eur !== 0 || (!r.is_total && !r.is_kwh_row && r.con_fv_eur >= 0));
    const totale = righe.find((r) => r.voce === "Totale bolletta")!;
    expect(totale.oggi_eur).toBe(1440);
    expect(totale.con_fv_eur).toBe(677);
    expect(totale.risparmio_eur).toBe(677 - 1440);
    const delle4 = righe.slice(1, 5);
    expect(delle4.reduce((s, r) => s + r.oggi_eur, 0)).toBe(totale.oggi_eur);
    expect(delle4.reduce((s, r) => s + r.con_fv_eur, 0)).toBe(totale.con_fv_eur);
    expect(voci.length).toBeGreaterThan(0);
    const netta = righe.find((r) => r.voce.startsWith("Spesa netta"))!;
    expect(netta.con_fv_eur).toBe(677 - 443);
  });

  it("costi a 20 anni senza inflazione né degrado: 20 × 1.440 = 28.800 senza FV, 20 × 677,44 = 13.549 con FV", () => {
    const c = calcolaCosti20Anni({ consumo_annuo_kwh: 4500, prelievo_rete_kwh: 2117, prezzo_kwh_attuale: 0.32, inflazione_perc: 0, degrado_pannelli_perc_anno: 0 });
    expect(c.per_anno).toHaveLength(20);
    expect(c.totale_senza_fv_eur).toBe(28800);
    expect(c.totale_con_fv_eur).toBe(Math.round(20 * 2117 * 0.32));
    expect(c.totale_risparmio_eur).toBe(c.totale_senza_fv_eur - c.totale_con_fv_eur);
  });

  it("con l'inflazione del 3% la spesa senza FV è 1.440 · (1,03^20 − 1)/0,03", () => {
    const c = calcolaCosti20Anni({ consumo_annuo_kwh: 4500, prelievo_rete_kwh: 2117, prezzo_kwh_attuale: 0.32, inflazione_perc: 3, degrado_pannelli_perc_anno: 0 });
    expect(c.totale_senza_fv_eur).toBe(Math.round(1440 * ((Math.pow(1.03, 20) - 1) / 0.03)));
  });
});
