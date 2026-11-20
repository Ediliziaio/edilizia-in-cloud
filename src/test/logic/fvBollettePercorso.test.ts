import { describe, expect, it } from "vitest";
import {
  analisiConsumiIniziale,
  datiBollettaVuoti,
  type DocumentoBollettaFv,
  leggiAnalisiConsumi,
  leggiBollettaDeterministica,
  problemiConsumiFv,
  riepilogoBollette,
  selezionaFornituraFv,
  validaLetturaBolletta,
} from "../../../supabase/functions/_shared/fvBollette";
import {
  calcolaCosti20Anni,
  calcolaEnergyFlows,
} from "../../../supabase/functions/_shared/fvCalcoli";
import { simulaEnergiaFv } from "../../../supabase/functions/_shared/fvSimulazioneEnergetica";
import { datiBilancioEnergia } from "../../../supabase/functions/_shared/fvBilancioEnergia";
import {
  coordinateDaMetri,
  coordinateDaPixel,
  leggiMappaFv,
  type MappaFv,
  metriDaCoordinate,
  pixelDaCoordinate,
  resaMappaFv,
  rettangoloRuotatoFv,
} from "../../../supabase/functions/_shared/fvMappa";
import {
  edificioDaMappaFv,
  pianoDaMappaFv,
} from "@/components/fotovoltaico/tetto/mappaGeometria";
import {
  dalDisegnoAlMondo,
  dallaFotoAlDisegno,
} from "@/components/fotovoltaico/tetto/tettoReale";
import {
  areaPoligono,
  disponiModuliOttimizzati,
  leggiDisegnoCommerciale,
  pannelliDaRivedere,
} from "../../../supabase/functions/_shared/fvDisegnoCommerciale";
import { datiDalDisegno } from "@/lib/fotovoltaico/disegnoPreventivo";
import { stimaProduzioneFv } from "@/lib/fotovoltaico/anteprima";
import { INITIAL } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/constants";
import { validatePersistedDraft } from "@/pages/azienda/fotovoltaico/FotovoltaicoWizard/helpers";
const pod = "IT001E12345678", altroPod = "IT002E87654321";
const doc = (
  over: Partial<DocumentoBollettaFv["dati"]> = {},
  hash = "a".repeat(64),
): DocumentoBollettaFv => {
  const dati = {
    ...datiBollettaVuoti(),
    pod,
    periodo_dal: "2025-01-01",
    periodo_al: "2025-12-31",
    consumo_periodo_kwh: 6000,
    consumo_annuo_kwh: 6000,
    totale_da_pagare: 1800,
    quote_fisse: 360,
    ...over,
  };
  return {
    id: hash + ":0",
    hash,
    nome: "bolletta.pdf",
    path:
      `00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002/${hash}.pdf`,
    mime: "application/pdf",
    dati,
    estratti: structuredClone(dati),
    confermato: true,
    pagine_totali: 3,
    pagine_non_lette: [],
    metodo: "ai",
  };
};
const analisi = (documenti: DocumentoBollettaFv[]) => ({
  ...analisiConsumiIniziale(),
  podSelezionato: pod,
  documenti,
});
describe("Bollette confermate e POD", () => {
  it("separa la spesa totale dalle quote fisse e dai kWh evitabili", () => {
    const a = analisi([doc()]);
    a.correzioni = {
      spesaAnnua: 1800,
      costiFissiAnnui: 360,
      costiEvitabiliAnnui: 1440,
    };
    const r = riepilogoBollette(a);
    expect(r.spesaAnnua).toBe(1800);
    expect(r.fissiAnnui).toBe(360);
    expect(r.costoEvitabileKwh).toBe(.24);
    expect(3000 * r.costoEvitabileKwh!).toBe(720);
  });
  it("non ricava una tariffa dal totale da pagare", () => {
    expect(riepilogoBollette(analisi([doc()])).costoEvitabileKwh).toBeNull();
  });
  it("non somma consumi annui ripetuti né file duplicati", () => {
    const a = analisi([doc(), doc()]);
    const r = riepilogoBollette(a);
    expect(r.consumoAnnuo).toBe(6000);
    expect(r.giorniCoperti).toBe(365);
    expect(r.esclusi).toHaveLength(1);
  });
  it("separa due POD anche nello stesso documento", () => {
    const a = analisi([
      doc(),
      doc({ pod: altroPod, consumo_annuo_kwh: 50000 }),
    ]);
    expect(riepilogoBollette(a).consumoAnnuo).toBe(6000);
    a.podSelezionato = altroPod;
    expect(riepilogoBollette(a).consumoAnnuo).toBe(50000);
  });
  it("esclude un periodo sovrapposto e non lo annualizza due volte", () => {
    const r = riepilogoBollette(
      analisi([
        doc({
          consumo_annuo_kwh: null,
          periodo_dal: "2025-01-01",
          periodo_al: "2025-02-28",
          consumo_periodo_kwh: 500,
        }),
        doc({
          consumo_annuo_kwh: null,
          periodo_dal: "2025-02-01",
          periodo_al: "2025-03-31",
          consumo_periodo_kwh: 600,
        }, "b".repeat(64)),
      ]),
    );
    expect(r.giorniCoperti).toBe(59);
    expect(r.esclusi).toHaveLength(1);
    expect(r.stimato).toBe(true);
    expect(r.pronto).toBe(false);
  });
  it("una proiezione richiede conferma dell'operatore", () => {
    const a = analisi([
      doc({
        consumo_annuo_kwh: null,
        periodo_dal: "2025-01-01",
        periodo_al: "2025-01-31",
        consumo_periodo_kwh: 310,
      }),
    ]);
    expect(riepilogoBollette(a).consumoAnnuo).toBe(3650);
    expect(riepilogoBollette(a).pronto).toBe(false);
    a.proiezioneConfermata = true;
    expect(riepilogoBollette(a).pronto).toBe(true);
  });
  it("usa uno storico di dodici mesi senza sommare i mesi ripetuti", () => {
    const storico = Array.from(
      { length: 12 },
      (_, i) => ({ mese: `2025-${String(i + 1).padStart(2, "0")}`, kwh: 500 }),
    );
    const a = analisi([
      doc({
        consumo_annuo_kwh: null,
        consumo_periodo_kwh: null,
        storico_mensile: storico,
      }),
      doc({
        consumo_annuo_kwh: null,
        consumo_periodo_kwh: null,
        storico_mensile: storico,
      }, "b".repeat(64)),
    ]);
    expect(riepilogoBollette(a).consumoAnnuo).toBe(6000);
    expect(riepilogoBollette(a).stimato).toBe(false);
  });
  it("non aggiunge un conguaglio ai consumi già fatturati", () => {
    const a = analisi([
      doc(),
      doc({
        rettifica: true,
        consumo_periodo_kwh: 2000,
        consumo_annuo_kwh: null,
      }, "b".repeat(64)),
    ]);
    expect(riepilogoBollette(a).consumoAnnuo).toBe(6000);
    expect(riepilogoBollette(a).esclusi).toHaveLength(1);
  });
  it("conserva le correzioni aggiungendo un documento discordante", () => {
    const a = analisi([doc()]);
    a.correzioni = { consumoAnnuo: 7200, costiEvitabiliAnnui: 1440 };
    a.documenti.push(doc({ consumo_annuo_kwh: 9000 }, "b".repeat(64)));
    expect(riepilogoBollette(a).consumoAnnuo).toBe(7200);
    expect(riepilogoBollette(a).costoEvitabileKwh).toBe(.2);
    expect(riepilogoBollette(a).avvisi.join(" ")).toMatch(/discordanti/);
  });
  it("legge numeri italiani univoci con la pagina di origine", () => {
    const r = leggiBollettaDeterministica([{
      page: 2,
      text: `POD ${pod}\nConsumo annuo: 6.000 kWh\nPotenza impegnata: 6,0 kW`,
    }]);
    expect(r.consumo_annuo_kwh).toBe(6000);
    expect(r.potenza_impegnata_kw).toBe(6);
    expect(r.pagine.consumo_annuo_kwh).toBe(2);
  });
  it("lascia dubbia una lettura nativa con due valori annuali diversi", () => {
    const r = leggiBollettaDeterministica([{
      page: 1,
      text: "Consumo annuo: 6.000 kWh\nConsumo annuo: 8.000 kWh",
    }]);
    expect(r.consumo_annuo_kwh).toBeNull();
  });
  it("rifiuta date e numeri non validi senza far fallire il modulo", () => {
    const r = validaLetturaBolletta({
      periodo_dal: "2025-99-99",
      pod: "POD NON VALIDO",
      consumo_annuo_kwh: -100,
      spesa_annua: Infinity,
    });
    expect(r.periodo_dal).toBeNull();
    expect(r.pod).toBeNull();
    expect(r.consumo_annuo_kwh).toBeNull();
    expect(r.spesa_annua).toBeNull();
  });
  it("mantiene campi e fonti nel salvataggio della bozza e accetta le vecchie bozze", () => {
    const a = analisi([doc()]);
    const r = validatePersistedDraft({
      step: 3,
      data: { ...INITIAL, analisi_consumi: a },
      completedSteps: [1, 2],
      savedAt: Date.now(),
    });
    expect(r?.data.analisi_consumi?.documenti[0].estratti.pod).toBe(pod);
    expect(leggiAnalisiConsumi(a)?.documenti[0].confermato).toBe(true);
    expect(
      validatePersistedDraft({
        step: 3,
        data: { cliente_nome: "Mario" },
        savedAt: Date.now(),
      })?.data.analisi_consumi,
    ).toBeNull();
  });
});
const baseEnergia = {
  consumoAnnuo: 6000,
  produzioneAnnua: 8000,
  batteriaKwh: 0,
  costoEvitabileKwh: .24,
  prezzoImmissione: .08,
  profilo: analisiConsumiIniziale().profilo,
};
describe("Simulazione oraria e accumulo", () => {
  it("conserva l'energia senza batteria", () => {
    const f = simulaEnergiaFv(baseEnergia);
    expect(f.autoconsumo + f.acquistata).toBeCloseTo(6000, 7);
    expect(f.autoconsumo + f.immessa).toBeCloseTo(8000, 7);
    expect(f.risparmioAcquisti).toBeCloseTo(f.autoconsumo * .24, 7);
  });
  it("non crea energia con la batteria e ne separa perdite e residuo", () => {
    const f = simulaEnergiaFv({ ...baseEnergia, batteriaKwh: 10 }),
      senza = simulaEnergiaFv(baseEnergia);
    expect(f.autoconsumo).toBeGreaterThan(senza.autoconsumo);
    expect(
      f.autoconsumo + f.immessa + f.perditeAccumulo + f.energiaFinaleBatteria,
    ).toBeCloseTo(8000, 7);
    expect(f.autoconsumo + f.acquistata).toBeCloseTo(6000, 7);
    expect(f.perditeAccumulo).toBeGreaterThan(0);
  });
  it("normalizza un'attività lunedì-venerdì ed esplicita i consumi futuri", () => {
    const profilo = analisiConsumiIniziale(true).profilo;
    profilo.aumentoConsumiPct = 20;
    const f = simulaEnergiaFv({ ...baseEnergia, profilo });
    expect(f.consumo).toBe(7200);
    expect(f.mensili.reduce((s, m) => s + m.consumo, 0)).toBeCloseTo(7200, 7);
    expect(f.mensili.reduce((s, m) => s + m.autoconsumo, 0)).toBeCloseTo(
      f.autoconsumo,
      7,
    );
  });
  it("senza produzione non crea risparmio o carica", () => {
    const f = simulaEnergiaFv({
      ...baseEnergia,
      produzioneAnnua: 0,
      batteriaKwh: 10,
    });
    expect(f.autoconsumo).toBe(0);
    expect(f.risparmioAcquisti).toBe(0);
    expect(f.energiaFinaleBatteria).toBe(0);
    expect(f.acquistata).toBeCloseTo(6000, 7);
  });
  it("rifiuta un profilo con orari impossibili o tutti i mesi spenti", () => {
    expect(() =>
      simulaEnergiaFv({
        ...baseEnergia,
        profilo: { ...baseEnergia.profilo, oraInizio: 18, oraFine: 8 },
      })
    ).toThrow();
    expect(() =>
      simulaEnergiaFv({
        ...baseEnergia,
        profilo: { ...baseEnergia.profilo, pesiMensili: Array(12).fill(0) },
      })
    ).toThrow();
  });
  it("riusa il motore orario nel PDF senza dichiarare perdite come immissioni", () => {
    const a = analisiConsumiIniziale();
    const f = calcolaEnergyFlows({
      potenza_kwp: 6,
      produzione_kwh: 8000,
      consumo_annuo_kwh: 6000,
      has_accumulo: true,
      capacita_accumulo_kwh: 10,
      analisi_consumi: a,
    });
    expect(datiBilancioEnergia(f, 6000).perdite).toBeGreaterThan(0);
    expect(f.ceduto_rete_kwh).toBeLessThan(
      f.produzione_kwh - f.autoconsumo_kwh,
    );
  });
  it("mantiene le quote fisse anche nelle proiezioni", () => {
    const r = calcolaCosti20Anni({
      consumo_annuo_kwh: 6000,
      prelievo_rete_kwh: 3000,
      prezzo_kwh_attuale: .24,
      inflazione_perc: 0,
      orizzonte_anni: 1,
      costi_fissi_annui_eur: 360,
    });
    expect(r.per_anno[0]).toMatchObject({
      costo_senza_fv_eur: 1800,
      costo_con_fv_eur: 1080,
      risparmio_anno_eur: 720,
    });
  });
});
const mappa = (): MappaFv => ({
  versione: 1,
  origine: { lat: 41.9, lng: 12.5 },
  ricerca: {
    indirizzo: "Via Esempio 1",
    posizione: { lat: 41.9001, lng: 12.5001 },
  },
  distanzaOstacoli: .4,
  falde: [{
    id: "falda-a",
    nome: "Falda A",
    punti: rettangoloRuotatoFv({ x: 0, y: 0 }, 12, 8, 0),
    inclinazione: 30,
    azimut: 180,
    inclinazioneStimata: false,
  }, {
    id: "falda-b",
    nome: "Falda B",
    punti: rettangoloRuotatoFv({ x: 14, y: 0 }, 10, 8, 0),
    inclinazione: 20,
    azimut: 90,
    inclinazioneStimata: false,
  }],
});
describe("Mappa e posa metrica", () => {
  it("mantiene separati indirizzo cercato e tetto confermato alla riapertura", () => {
    const m = mappa(),
      p = pianoDaMappaFv(m, { corto: 1.1, lungo: 1.8, stimato: false }),
      r = leggiDisegnoCommerciale(JSON.parse(JSON.stringify(p)));
    expect(r?.mappa?.origine).toEqual(m.origine);
    expect(r?.mappa?.ricerca.posizione).not.toEqual(m.origine);
  });
  it("ha conversioni reversibili tra coordinate, pixel e metri", () => {
    const origine = mappa().origine, p = { lat: 41.90015, lng: 12.5002 };
    expect(coordinateDaMetri(metriDaCoordinate(p, origine), origine)).toEqual(
      p,
    );
    const q = coordinateDaPixel(pixelDaCoordinate(p, origine, 20), origine, 20);
    expect(q.lat).toBeCloseTo(p.lat, 10);
    expect(q.lng).toBeCloseTo(p.lng, 10);
  });
  it("calcola la superficie della falda inclinata e proietta la posa sulla mappa", () => {
    const m = mappa(),
      p = pianoDaMappaFv(m, { corto: 1.1, lungo: 1.8, stimato: false }),
      ed = edificioDaMappaFv(m);
    expect(areaPoligono(p.falde[0].punti)).toBeCloseTo(
      96 / Math.cos(Math.PI / 6),
      5,
    );
    const q = p.falde[0].punti[0], world = dalDisegnoAlMondo(ed, "falda-a", q);
    const r = dallaFotoAlDisegno(ed, "falda-a", world);
    expect(r.x).toBeCloseTo(q.x, 8);
    expect(r.y).toBeCloseTo(q.y, 8);
  });
  it("conta soltanto pannelli fisici con due falde e un lucernario", () => {
    let p = pianoDaMappaFv(mappa(), { corto: 1.1, lungo: 1.8, stimato: false });
    p = {
      ...p,
      ostacoli: [{
        id: "lucernario",
        x: p.falde[0].punti[0].x + 2,
        y: p.falde[0].punti[0].y + 2,
        w: 1,
        h: 1,
      }],
    };
    const posato = disponiModuliOttimizzati(p, 18);
    expect(posato.pannelli).toHaveLength(18);
    expect(pannelliDaRivedere(posato)).toEqual([]);
    expect(datiDalDisegno(posato, 450).potenza_kwp).toBe(8.1);
    expect(datiDalDisegno(posato, 450).numero_pannelli_scelti).toBe(18);
  });
  it("rivalida i pannelli quando cambia la dimensione del modulo", () => {
    const p = disponiModuliOttimizzati(
      pianoDaMappaFv(mappa(), { corto: 1, lungo: 1.6, stimato: false }),
      200,
    );
    expect(pannelliDaRivedere(p)).toEqual([]);
    expect(
      pannelliDaRivedere({
        ...p,
        modulo: { corto: 1.6, lungo: 3.2, stimato: false },
      }).length,
    ).toBeGreaterThan(0);
  });
  it("pesa la produzione PVGIS sulla posa effettiva e mantiene lo snapshot", () => {
    const m = mappa();
    m.solare = [{
      faldaId: "falda-a",
      ore: 1800,
      pesiMensili: Array(12).fill(1 / 12),
    }, { faldaId: "falda-b", ore: 1400, pesiMensili: Array(12).fill(1 / 12) }];
    let p = pianoDaMappaFv(m, { corto: 1.1, lungo: 1.8, stimato: false });
    p = disponiModuliOttimizzati(p, 18, false, "falda-b");
    expect(resaMappaFv(p)?.ore).toBeCloseTo(1400, 8);
    expect(
      stimaProduzioneFv({
        potenza_kwp: 8.1,
        ore_sole_annue: 1800,
        layout_overlay: p,
      }),
    ).toBeCloseTo(8.1 * 1400 * .7565, 8);
    expect(leggiMappaFv(m)?.solare).toHaveLength(2);
  });
});

describe("Copertura parziale, costi e falde non duplicati", () => {
  it("annualizza mesi completi parziali soltanto dopo la conferma", () => {
    const a = analisi([
      doc({
        consumo_annuo_kwh: null,
        consumo_periodo_kwh: null,
        storico_mensile: [{ mese: "2025-01", kwh: 310 }, {
          mese: "2025-02",
          kwh: 280,
        }],
      }),
    ]);
    const r = riepilogoBollette(a);
    expect(r.giorniCoperti).toBe(59);
    expect(r.mesiCoperti).toEqual(["2025-01", "2025-02"]);
    expect(r.consumoAnnuo).toBe(3650);
    expect(r.pronto).toBe(false);
    a.proiezioneConfermata = true;
    expect(riepilogoBollette(a).pronto).toBe(true);
  });
  it("blocca l'applicazione di fissi ed evitabili superiori alla spesa ricorrente", () => {
    const a = analisi([doc()]);
    a.correzioni = {
      spesaAnnua: 1800,
      costiFissiAnnui: 360,
      costiEvitabiliAnnui: 1800,
    };
    expect(riepilogoBollette(a)).toMatchObject({
      pronto: false,
      costiCoerenti: false,
    });
  });
  it("non accetta due falde coincidenti per aumentare la capacità", () => {
    const m = mappa();
    m.falde[1].punti = structuredClone(m.falde[0].punti);
    expect(() => pianoDaMappaFv(m, { corto: 1.1, lungo: 1.8, stimato: false }))
      .toThrow(/sovrappongono/);
  });
  it("accetta due falde adiacenti con bordo condiviso", () => {
    const m = mappa();
    m.falde[1].punti = rettangoloRuotatoFv({ x: 11, y: 0 }, 10, 8, 0);
    expect(() => pianoDaMappaFv(m, { corto: 1.1, lungo: 1.8, stimato: false }))
      .not.toThrow();
  });
});

describe("Conferma consapevole e cambio fornitura", () => {
  it("conserva le correzioni nel POD corretto senza applicarle a un altro contatore", () => {
    const a = analisi([doc(), doc({ pod: altroPod, consumo_annuo_kwh: 9000 })]);
    a.correzioni = { consumoAnnuo: 7200, costiEvitabiliAnnui: 1440 };
    const b = selezionaFornituraFv(a, altroPod);
    expect(riepilogoBollette(b).consumoAnnuo).toBe(9000);
    expect(b.correzioni).toEqual({});
    const c = selezionaFornituraFv(b, pod);
    expect(riepilogoBollette(c).consumoAnnuo).toBe(7200);
    expect(
      leggiAnalisiConsumi(JSON.parse(JSON.stringify(c)))?.correzioniPerPod
        ?.[pod],
    ).toEqual(a.correzioni);
  });
  it("non permette un calcolo con dati non applicati o tariffa inventata", () => {
    const a = analisi([doc()]);
    a.correzioni = { costiEvitabiliAnnui: 1440 };
    expect(problemiConsumiFv(a, 5000, .32).join(" ")).toContain(
      "Applica al simulatore",
    );
    expect(problemiConsumiFv(a, 6000, null).join(" ")).toContain(
      "Conferma il costo",
    );
    expect(problemiConsumiFv(a, 6000, .24)).toEqual([]);
  });
});
