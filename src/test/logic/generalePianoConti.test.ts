import { describe, expect, it } from "vitest";
import {
  aFinireVoce, calcolaPianoEconomico, capitaleInvestitoOggi, capitaleMassimo, confrontoVoci, distanzaMesi,
  distribuisci, dividiAlCentesimo, flussoPrevisto, flussoStima, indicatori, numeriPerInvestitori,
  ripartisciCostiComuni, serieMensile, tirAnnuo, tirMensile, valoreAttuale,
  type DatiUnita, type Incasso, type RigaReale, type VocePiano,
} from "@/lib/orders/generali/pianoConti";

/**
 * Piano economico della commessa generale (tappa 2): previsto → reale → a finire.
 * Le righe del reale arrivano già abbinate alle voci (regola in SQL); qui si controllano
 * i conti: a finire, stima finale, scostamenti, cassa, capitale, TIR, m², scenari, comuni.
 */

const voce = (p: Partial<VocePiano> & Pick<VocePiano, "id">): VocePiano => ({
  tipo: "costo", categoria: "costruzione", descrizione: "Voce", importo: 0, mese: null, durataMesi: 1,
  figliaId: null, categorieCosto: [], aFinire: null, nota: null, ordine: 0, origineId: null,
  ...p,
});

const riga = (p: Partial<RigaReale> & Pick<RigaReale, "id" | "importo">): RigaReale => ({
  fonte: "spesa", rifId: null, orderId: "f1", data: null, tipo: "costo", chiave: "materiali",
  categoria: null, descrizione: "Spesa", voceId: null,
  ...p,
});

describe("a finire e distribuzione sui mesi", () => {
  it("a finire: previsto − reale, mai sotto zero; quello scritto a mano vince", () => {
    expect(aFinireVoce(100_000, 30_000, null)).toBe(70_000);
    expect(aFinireVoce(100_000, 130_000, null)).toBe(0);
    expect(aFinireVoce(100_000, 30_000, 90_000)).toBe(90_000);
    expect(aFinireVoce(100_000, 30_000, 0)).toBe(0);
    expect(aFinireVoce(100_000, 30_000, -5)).toBe(0);
  });

  it("divide al centesimo e la somma torna, anche in negativo", () => {
    const q = distribuisci(1000, "2026-11", 3);
    expect(q.map((x) => x.mese)).toEqual(["2026-11", "2026-12", "2027-01"]);
    expect(q.map((x) => x.importo)).toEqual([333.34, 333.33, 333.33]);
    const n = distribuisci(-10.01, "2027-01", 3);
    expect(n.reduce((t, x) => t + x.importo, 0)).toBeCloseTo(-10.01, 10);
    expect(distribuisci(500, "2027-05", 0)).toEqual([{ mese: "2027-05", importo: 500 }]);
  });

  it("conta i mesi tra due mesi", () => {
    expect(distanzaMesi("2026-11", "2027-02")).toBe(3);
    expect(distanzaMesi("2027-02", "2027-02")).toBe(0);
  });
});

describe("confronto voce per voce", () => {
  const voci = [
    voce({ id: "ric", tipo: "ricavo", categoria: "vendite", descrizione: "Vendite", importo: 1_000_000, ordine: 1 }),
    voce({ id: "ter", categoria: "terreno", descrizione: "Terreno", importo: 200_000, ordine: 2 }),
    voce({ id: "cos", categoria: "costruzione", descrizione: "Costruzione", importo: 500_000, ordine: 3, aFinire: 450_000 }),
  ];
  const righe = [
    riga({ id: "a", importo: 210_000, voceId: "ter", chiave: "terreno" }),
    riga({ id: "b", importo: 80_000, voceId: "cos" }),
    riga({ id: "c", importo: 20_000, voceId: "cos", chiave: "manodopera" }),
    riga({ id: "d", importo: 300_000, voceId: "ric", tipo: "ricavo", chiave: "ricavi" }),
    riga({ id: "e", importo: 5_000, chiave: "generali" }),
    riga({ id: "f", importo: 1_000, chiave: "generali" }),
    riga({ id: "g", importo: 2_500, chiave: "finanziari", voceId: "voce-che-non-c-e" }),
  ];

  it("previsto, reale, a finire, stima e scostamento per voce", () => {
    const c = confrontoVoci(voci, righe);
    const ter = c.costi.find((r) => r.chiave === "ter")!;
    expect(ter).toMatchObject({ previsto: 200_000, reale: 210_000, aFinire: 0, stima: 210_000, scostamento: 10_000 });
    const cos = c.costi.find((r) => r.chiave === "cos")!;
    expect(cos).toMatchObject({ reale: 100_000, aFinire: 450_000, aFinireManuale: true, stima: 550_000, scostamento: 50_000 });
    expect(cos.righe.map((r) => r.id)).toEqual(["b", "c"]);
    const ric = c.ricavi[0];
    expect(ric).toMatchObject({ reale: 300_000, aFinire: 700_000, stima: 1_000_000, scostamento: 0 });
  });

  it("il reale senza voce resta fuori piano ma è contato, raggruppato per parola", () => {
    const c = confrontoVoci(voci, righe);
    const fuori = c.costi.filter((r) => r.voce === null);
    expect(fuori.map((r) => r.etichetta)).toEqual(["Fuori piano · Spese generali", "Fuori piano · Oneri finanziari"]);
    expect(fuori[0]).toMatchObject({ previsto: 0, reale: 6_000, stima: 6_000, scostamento: 6_000 });
    // Una voce sparita (riga abbinata a una voce di un'altra versione) non perde l'euro.
    expect(fuori[1].reale).toBe(2_500);
    expect(c.totali.costi.reale).toBe(210_000 + 100_000 + 6_000 + 2_500);
  });

  it("totali e margine nelle stesse colonne", () => {
    const { totali } = confrontoVoci(voci, righe);
    expect(totali.ricavi).toMatchObject({ previsto: 1_000_000, reale: 300_000, aFinire: 700_000, stima: 1_000_000 });
    expect(totali.costi.previsto).toBe(700_000);
    expect(totali.costi.stima).toBe(210_000 + 550_000 + 6_000 + 2_500);
    expect(totali.margine.previsto).toBe(300_000);
    expect(totali.margine.stima).toBe(1_000_000 - 768_500);
    expect(totali.margine.scostamento).toBe(totali.margine.stima - totali.margine.previsto);
    expect(totali.margine.approvato).toBeNull();
  });

  it("da una revisione: l'approvato per voce, le voci nuove e quelle tolte", () => {
    const approvate = [
      voce({ id: "A-ter", categoria: "terreno", importo: 180_000 }),
      voce({ id: "A-cos", categoria: "costruzione", importo: 480_000 }),
      voce({ id: "A-imp", categoria: "imprevisti", descrizione: "Imprevisti", importo: 20_000 }),
      voce({ id: "A-ric", tipo: "ricavo", categoria: "vendite", importo: 950_000 }),
    ];
    const revisione = [
      { ...voci[0], origineId: "A-ric" },
      { ...voci[1], origineId: "A-ter" },
      { ...voci[2], origineId: "A-cos" },
      voce({ id: "nuova", categoria: "oneri", importo: 30_000, ordine: 9 }),
    ];
    const c = confrontoVoci(revisione, [], approvate);
    expect(c.costi.find((r) => r.chiave === "ter")!.approvato).toBe(180_000);
    expect(c.costi.find((r) => r.chiave === "nuova")!.approvato).toBeNull();
    expect(c.vociTolte.map((v) => v.id)).toEqual(["A-imp"]);
    expect(c.totali.costi.approvato).toBe(680_000);
    expect(c.totali.ricavi.approvato).toBe(950_000);
    expect(c.totali.margine.approvato).toBe(270_000);
  });

  it("guardando l'approvato stesso, l'approvato è il previsto", () => {
    const c = confrontoVoci(voci, [], voci);
    expect(c.costi.find((r) => r.chiave === "ter")!.approvato).toBe(200_000);
    expect(c.vociTolte).toEqual([]);
  });

  it("le rettifiche dello scenario toccano solo quello che manca", () => {
    const c = confrontoVoci(voci, righe, null, { prezzoPct: 10, costiPct: 20 });
    expect(c.ricavi[0]).toMatchObject({ reale: 300_000, aFinire: 630_000, stima: 930_000 });
    expect(c.costi.find((r) => r.chiave === "cos")!.aFinire).toBe(540_000);
    expect(c.costi.find((r) => r.chiave === "ter")!.aFinire).toBe(0);
  });
});

describe("flusso di cassa e capitale", () => {
  it("il previsto: ogni voce sui suoi mesi, cumulato, senza buchi; senza mese non entra", () => {
    const serie = flussoPrevisto([
      voce({ id: "t", importo: 100_000, mese: "2026-11" }),
      voce({ id: "c", importo: 300_000, mese: "2027-01", durataMesi: 3 }),
      voce({ id: "v", tipo: "ricavo", categoria: "vendite", importo: 600_000, mese: "2027-04", durataMesi: 2 }),
      voce({ id: "x", importo: 50_000, mese: null }),
    ], "2026-10");
    expect(serie.map((m) => m.mese)).toEqual(["2026-11", "2026-12", "2027-01", "2027-02", "2027-03", "2027-04", "2027-05"]);
    expect(serie.map((m) => m.netto)).toEqual([-100_000, 0, -100_000, -100_000, -100_000, 300_000, 300_000]);
    expect(serie.map((m) => m.cumulato)).toEqual([-100_000, -100_000, -200_000, -300_000, -400_000, -100_000, 200_000]);
    expect(capitaleMassimo(serie)).toEqual({ importo: 400_000, mese: "2027-03" });
  });

  it("capitale massimo zero se la cassa non va mai sotto", () => {
    expect(capitaleMassimo(serieMensile([], "2026-10"))).toEqual({ importo: 0, mese: null });
  });

  it("la stima: reale nei suoi mesi, incassi alla data, fatture da incassare il mese dopo, a finire sui mesi che restano", () => {
    const voci = [
      voce({ id: "cos", importo: 120_000, mese: "2026-08", durataMesi: 6 }),
      voce({ id: "ric", tipo: "ricavo", categoria: "vendite", importo: 200_000, mese: "2027-02", durataMesi: 2 }),
      voce({ id: "ter", categoria: "terreno", importo: 50_000, mese: "2026-05" }),
    ];
    const righe = [
      riga({ id: "r1", importo: 30_000, voceId: "cos", data: "2026-08-10" }),
      riga({ id: "r2", importo: 10_000, voceId: "cos", data: "2026-09-02" }),
      riga({ id: "r3", importo: 40_000, voceId: "ric", tipo: "ricavo", chiave: "ricavi", data: "2026-09-30" }),
    ];
    const incassi: Incasso[] = [{ fatturaId: "i", data: "2026-10-05", importo: 25_000 }];
    const c = confrontoVoci(voci, righe);
    const serie = flussoStima(c, righe, incassi, "2026-10");
    const m = (mese: string) => serie.find((x) => x.mese === mese)!;
    expect(m("2026-08").uscite).toBe(30_000);
    expect(m("2026-09").uscite).toBe(10_000);
    expect(m("2026-08").passato).toBe(true);
    // costruzione: a finire 80.000 sui mesi rimasti (ott, nov, dic, gen)
    expect(m("2026-10").uscite).toBe(20_000 + 50_000); // + terreno in ritardo: tutto in questo mese
    expect(m("2026-10").entrate).toBe(25_000);
    expect(m("2026-11").entrate).toBe(15_000); // fatturato non incassato
    expect(m("2027-01").uscite).toBe(20_000);
    expect(m("2027-02").entrate).toBe(80_000);
    expect(m("2027-03").entrate).toBe(80_000);
    const totale = serie.reduce((t, x) => t + x.netto, 0);
    expect(totale).toBeCloseTo(25_000 + 15_000 + 160_000 - 40_000 - 80_000 - 50_000, 6);
  });

  it("il ritardo sposta solo gli incassi che mancano", () => {
    const voci = [
      voce({ id: "cos", importo: 100_000, mese: "2026-11" }),
      voce({ id: "ric", tipo: "ricavo", categoria: "vendite", importo: 150_000, mese: "2027-01" }),
    ];
    const c = confrontoVoci(voci, []);
    const serie = flussoStima(c, [], [], "2026-10", { ritardoMesi: 3 });
    expect(serie.find((x) => x.mese === "2026-11")!.uscite).toBe(100_000);
    expect(serie.find((x) => x.mese === "2027-04")!.entrate).toBe(150_000);
    expect(serie.find((x) => x.mese === "2027-01")!.entrate).toBe(0);
  });

  it("capitale investito a oggi: costi registrati meno incassi, mai sotto zero", () => {
    const righe = [riga({ id: "a", importo: 70_000 }), riga({ id: "b", importo: 50_000, tipo: "ricavo", chiave: "ricavi" })];
    expect(capitaleInvestitoOggi(righe, [{ fatturaId: "x", data: null, importo: 20_000 }])).toBe(50_000);
    expect(capitaleInvestitoOggi(righe, [{ fatturaId: "x", data: null, importo: 90_000 }])).toBe(0);
  });
});

describe("rendimento (TIR)", () => {
  it("un mese: 1.000 investiti, 1.100 dopo un mese → 10% al mese", () => {
    expect(tirMensile([-1000, 1100])).toBeCloseTo(0.1, 8);
  });

  it("un anno: 100 oggi, 110 tra dodici mesi → 10% l'anno", () => {
    const flussi = [-100, ...Array(11).fill(0), 110];
    expect(tirAnnuo(flussi)).toBeCloseTo(0.1, 6);
  });

  it("azzera davvero il valore attuale con flussi da business plan", () => {
    const flussi = [-300_000, -50_000, -80_000, -80_000, -80_000, 0, 250_000, 250_000, 200_000];
    const r = tirMensile(flussi)!;
    expect(r).toBeGreaterThan(0);
    expect(Math.abs(valoreAttuale(flussi, r))).toBeLessThan(0.01);
  });

  it("rendimento negativo quando si perde", () => {
    expect(tirAnnuo([-1000, 0, 0, 900])!).toBeLessThan(0);
  });

  it("niente TIR se i flussi non cambiano segno", () => {
    expect(tirMensile([-100, -50])).toBeNull();
    expect(tirMensile([100, 50])).toBeNull();
    expect(tirMensile([])).toBeNull();
  });
});

describe("indicatori", () => {
  const serie = flussoPrevisto([
    voce({ id: "c", importo: 800_000, mese: "2027-01", durataMesi: 4 }),
    voce({ id: "v", tipo: "ricavo", categoria: "vendite", importo: 1_000_000, mese: "2027-06" }),
  ], "2026-10");

  it("margine, %, ROI, durata e capitale", () => {
    const i = indicatori({ ricavi: 1_000_000, costi: 800_000, costiCantiere: 600_000 }, serie, null);
    expect(i.margine).toBe(200_000);
    expect(i.marginePct).toBeCloseTo(0.2, 10);
    expect(i.roi).toBeCloseTo(0.25, 10);
    expect(i.durataMesi).toBe(6);
    expect(i.inizio).toBe("2027-01");
    expect(i.fine).toBe("2027-06");
    expect(i.capitaleMassimo).toBe(800_000);
    expect(i.tir).toBeGreaterThan(0);
    expect(i.costoMq).toBeNull();
    expect(i.pareggioMq).toBeNull();
  });

  it("al m²: costo di cantiere, prezzo medio e prezzo di pareggio", () => {
    const i = indicatori({ ricavi: 1_000_000, costi: 800_000, costiCantiere: 600_000 }, serie, 400);
    expect(i.mq).toBe(400);
    expect(i.costoMq).toBe(1_500);
    expect(i.prezzoMq).toBe(2_500);
    expect(i.pareggioMq).toBe(2_000);
  });

  it("senza ricavi né costi non divide per zero", () => {
    const i = indicatori({ ricavi: 0, costi: 0, costiCantiere: 0 }, [], 0);
    expect(i.marginePct).toBeNull();
    expect(i.roi).toBeNull();
    expect(i.durataMesi).toBeNull();
    expect(i.mq).toBeNull();
  });
});

describe("costi comuni ripartiti sulle figlie", () => {
  const figlie = [
    { id: "a", nome: "A1", importo: 300_000 },
    { id: "b", nome: "A2", importo: 100_000 },
    { id: "c", nome: "A3", importo: 0 },
  ];

  it("per millesimi quando ogni figlia li ha", () => {
    const unita = new Map<string, DatiUnita>([
      ["a", { mq: 100, millesimi: 500 }], ["b", { mq: 60, millesimi: 300 }], ["c", { mq: 40, millesimi: 200 }],
    ]);
    const r = ripartisciCostiComuni(figlie, unita, 10_000);
    expect(r.criterio).toBe("millesimi");
    expect(r.quote.map((q) => q.importo)).toEqual([5_000, 3_000, 2_000]);
    expect(r.motivo).toBe("Ripartiti per millesimi.");
  });

  it("per m² se mancano dei millesimi, e lo dice", () => {
    const unita = new Map<string, DatiUnita>([
      ["a", { mq: 100, millesimi: 500 }], ["b", { mq: 60, millesimi: null }], ["c", { mq: 40, millesimi: 0 }],
    ]);
    const r = ripartisciCostiComuni(figlie, unita, 1_000);
    expect(r.criterio).toBe("mq");
    expect(r.quote.map((q) => q.importo)).toEqual([500, 300, 200]);
    expect(r.motivo).toContain("mancano i millesimi di 2 su 3");
  });

  it("per importo senza unità (modulo Unità non ancora attivo)", () => {
    const r = ripartisciCostiComuni(figlie, null, 4_000);
    expect(r.criterio).toBe("importo");
    expect(r.quote.map((q) => q.importo)).toEqual([3_000, 1_000, 0]);
  });

  it("in parti uguali se nessuna ha un importo, e i centesimi tornano", () => {
    const r = ripartisciCostiComuni(figlie.map((f) => ({ ...f, importo: null as number | null })), new Map(), 100);
    expect(r.criterio).toBe("parti_uguali");
    expect(r.quote.map((q) => q.importo)).toEqual([33.34, 33.33, 33.33]);
    expect(r.quote.reduce((t, q) => t + q.quota, 0)).toBeCloseTo(1, 10);
  });

  it("nessuna figlia: niente quote", () => {
    expect(ripartisciCostiComuni([], null, 500).quote).toEqual([]);
  });

  it("divide al centesimo coi resti più grandi", () => {
    expect(dividiAlCentesimo(0.1, [1, 1, 1])).toEqual([0.04, 0.03, 0.03]);
    expect(dividiAlCentesimo(10, [0, 0])).toEqual([0, 0]);
  });
});

describe("tutto insieme", () => {
  const voci = [
    voce({ id: "ric", tipo: "ricavo", categoria: "vendite", descrizione: "Vendite", importo: 900_000, mese: "2027-09", durataMesi: 3, ordine: 1 }),
    voce({ id: "ter", categoria: "terreno", descrizione: "Terreno", importo: 150_000, mese: "2026-09", ordine: 2 }),
    voce({ id: "cos", categoria: "costruzione", descrizione: "Costruzione", importo: 500_000, mese: "2026-11", durataMesi: 10, ordine: 3 }),
    voce({ id: "imp", categoria: "imprevisti", descrizione: "Imprevisti", importo: 25_000, ordine: 4 }),
  ];
  const righe = [
    riga({ id: "t", importo: 155_000, voceId: "ter", orderId: "G", chiave: "terreno", data: "2026-09-12" }),
    riga({ id: "n", importo: 3_000, orderId: "G", chiave: "generali", data: "2026-10-01" }),
    riga({ id: "c1", importo: 40_000, voceId: "cos", orderId: "f1", data: "2026-10-20" }),
  ];
  const input = {
    oggi: "2026-10-30",
    generaleId: "G",
    voci,
    righe,
    incassi: [] as Incasso[],
    figlie: [{ id: "f1", nome: "A1", importo: 450_000 }, { id: "f2", nome: "A2", importo: 450_000 }],
    unita: new Map<string, DatiUnita>([["f1", { mq: 120, millesimi: null }], ["f2", { mq: 80, millesimi: null }]]),
  };

  it("stima, capitale, costi comuni, m² e avvisi", () => {
    const p = calcolaPianoEconomico(input);
    expect(p.oggi).toBe("2026-10");
    expect(p.confronto.totali.costi.stima).toBe(155_000 + 3_000 + 500_000 + 25_000);
    expect(p.costiComuni.totale).toBe(158_000);
    expect(p.costiComuni.ripartizione.criterio).toBe("mq");
    expect(p.costiComuni.ripartizione.quote.map((q) => q.importo)).toEqual([94_800, 63_200]);
    expect(p.mq).toBe(200);
    expect(p.indicatori.stima.pareggioMq).toBe(Math.round((683_000 / 200) * 100) / 100);
    expect(p.indicatori.stima.costoMq).toBe((500_000 + 25_000) / 200);
    expect(p.capitale.investitoOggi).toBe(198_000);
    expect(p.capitale.massimoStima).toBeGreaterThan(p.capitale.investitoOggi);
    expect(p.avvisi.some((a) => a.includes("«Imprevisti» non ha il mese"))).toBe(true);
    expect(p.avvisi.some((a) => a.includes("non ha una voce nel piano"))).toBe(true);
    expect(p.indicatori.scenario).toBeNull();
  });

  it("uno scenario peggiore abbassa margine e rendimento", () => {
    const base = calcolaPianoEconomico(input);
    const s = calcolaPianoEconomico({ ...input, scenario: { prezzoPct: 10, ritardoMesi: 4, costiPct: 5 } });
    expect(s.indicatori.scenario!.margine).toBeLessThan(base.indicatori.stima.margine);
    expect(s.indicatori.scenario!.ricavi).toBe(810_000);
    expect(s.indicatori.scenario!.costi).toBeCloseTo(158_000 + 40_000 + 483_000 + 26_250, 6);
    expect(s.indicatori.scenario!.durataMesi!).toBeGreaterThan(base.indicatori.stima.durataMesi!);
    expect(s.indicatori.scenario!.tir!).toBeLessThan(base.indicatori.stima.tir!);
    // Lo scenario non cambia la stima: è un «e se…».
    expect(s.indicatori.stima.margine).toBe(base.indicatori.stima.margine);
  });

  it("i numeri per gli investitori", () => {
    const n = numeriPerInvestitori(calcolaPianoEconomico(input));
    expect(n.stimaFinale.margine).toBe(900_000 - 683_000);
    expect(n.previsto.costi).toBe(675_000);
    expect(n.capitaleInvestitoOggi).toBe(198_000);
    expect(n.flussoMensile[0].mese).toBe("2026-09");
    expect(n.flussoMensile[n.flussoMensile.length - 1].cumulato).toBeCloseTo(900_000 - 683_000 + 25_000, 6);
    expect(n.capitaleMassimoImpegnato).toBe(Math.max(...n.flussoMensile.map((m) => -m.cumulato)));
  });
});
