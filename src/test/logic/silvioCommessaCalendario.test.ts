/**
 * Il calendario vero (fase 5, lotto 5.2): feste nazionali con Pasqua e Pasquetta calcolate,
 * patrono, chiusura estiva dell'azienda, e le date proposte che li saltano; il meteo di stagione
 * per le fasi all'aperto e gli adempimenti prima di partire.
 */
import { describe, expect, it } from "vitest";
import {
  calendarioAzienda, cittaDaIndirizzo, festaNazionale, lavorativiTra, motivoChiuso, pasqua, patronoDaIndirizzo,
  primoGiornoUtile, spostaLavorativi,
} from "../../../shared/silvio-commessa/calendario.ts";
import { adempimentiPrimaDiPartire, avvisiMeteo, faseAllAperto, uominiGiorno } from "../../../shared/silvio-commessa/partenza.ts";
import { dateDelleFasi } from "../../../shared/silvio-commessa/modelliLavoro.ts";
import { applica, pianoVuoto, spostaGiorniLavorativi } from "../../../shared/silvio-commessa/fondi.ts";

describe("feste e giorni lavorativi", () => {
  it("Pasqua e Pasquetta calcolate, non scritte a mano", () => {
    expect([2025, 2026, 2027, 2028].map(pasqua)).toEqual(["2025-04-20", "2026-04-05", "2027-03-28", "2028-04-16"]);
    expect(festaNazionale("2027-03-29")).toBe("Lunedì dell'Angelo");
    expect(festaNazionale("2026-04-06")).toBe("Lunedì dell'Angelo");
    expect(festaNazionale("2026-12-08")).toBe("Immacolata");
    expect(festaNazionale("2026-12-09")).toBeNull();
  });

  it("le date saltano Ferragosto, anche senza calendario dell'azienda", () => {
    expect(motivoChiuso("2028-08-15")).toBe("Ferragosto");
    expect(spostaLavorativi("2028-08-14", 1)).toBe("2028-08-16");
    // il motore della bozza (fondi.ts) usa lo stesso calendario
    expect(spostaGiorniLavorativi("2028-08-14", 1)).toBe("2028-08-16");
    expect(dateDelleFasi([{ name: "Posa", giorno_inizio: 1, giorni: 3 }], "2028-08-11").map((f) => [f.start_date, f.end_date]))
      .toEqual([["2028-08-11", "2028-08-16"]]);
  });

  it("la chiusura estiva e le chiusure dell'azienda", () => {
    const cal = { chiusuraEstiva: { dal: "08-10", al: "08-23" }, chiusure: ["2027-11-02", "12-24"] };
    expect(spostaLavorativi("2027-08-09", 1, cal)).toBe("2027-08-24");
    expect(primoGiornoUtile("2027-08-12", cal)).toBe("2027-08-24");
    expect(motivoChiuso("2027-11-02", cal)).toBe("chiusura dell'azienda");
    expect(motivoChiuso("2030-12-24", cal)).toBe("chiusura dell'azienda");
    // a cavallo d'anno
    expect(motivoChiuso("2027-01-04", { chiusuraEstiva: { dal: "12-27", al: "01-05" } })).toBe("chiusura estiva dell'azienda");
  });

  it("il sabato solo se l'azienda lo lavora", () => {
    expect(spostaLavorativi("2026-11-13", 1)).toBe("2026-11-16");
    expect(spostaLavorativi("2026-11-13", 1, { sabato: true })).toBe("2026-11-14");
  });

  it("il patrono: della città dopo il CAP o dopo l'ultima virgola, mai «Via Roma»", () => {
    expect(cittaDaIndirizzo("Via Roma 3, 20121 Milano (MI)")).toBe("milano");
    expect(cittaDaIndirizzo("Via Garibaldi 10, Torino")).toBe("torino");
    expect(cittaDaIndirizzo("Via Roma 3")).toBeNull();
    expect(patronoDaIndirizzo("Via Roma 3")).toBeNull();
    expect(patronoDaIndirizzo("Piazza Duomo 1, 20122 Milano")?.giorno).toBe("12-07");
    const cal = calendarioAzienda({ calendario: null, festivita: [] }, "Via Prova 1, 20900 Monza (MB)");
    expect(motivoChiuso("2027-06-24", cal)).toMatch(/patrono/);
    // quello scritto nelle impostazioni vale per tutti i cantieri
    const scritto = calendarioAzienda({ calendario: { patrono: "10-04", patrono_nome: "San Petronio" }, festivita: [] }, "Via Prova 1, 20900 Monza (MB)");
    expect(motivoChiuso("2027-06-24", scritto)).toBeNull();
    expect(motivoChiuso("2027-10-04", scritto)).toBe("patrono (San Petronio)");
  });

  it("le festività di Personale: ricorrenti per giorno, le altre per data", () => {
    const cal = calendarioAzienda({ festivita: [{ data: "2026-12-31", ricorrente: true }, { data: "2027-01-07", ricorrente: false }] });
    expect(motivoChiuso("2030-12-31", cal)).toBe("chiusura dell'azienda");
    expect(motivoChiuso("2027-01-07", cal)).toBe("chiusura dell'azienda");
    expect(motivoChiuso("2028-01-07", cal)).toBeNull();
  });

  it("giorni lavorativi fra due date, saltando l'Immacolata", () => {
    expect(lavorativiTra("2026-11-11", "2026-11-16")).toBe(3);
    expect(lavorativiTra("2026-11-16", "2026-11-11")).toBe(-3);
    expect(lavorativiTra("2026-12-04", "2026-12-09")).toBe(2);
  });

  it("«sposta» nella bozza segue il calendario dell'azienda del piano", () => {
    const piano = {
      ...pianoVuoto("c"),
      calendario: { chiusuraEstiva: { dal: "08-10", al: "08-23" } },
      aree: { fasi: { "fasi.work_start_date": { valore: "2027-08-09", fonte: { tipo: "modello" as const, etichetta: "x" }, fiducia: 1, stato: "fatto" as const } } },
    };
    const { piano: dopo } = applica(piano, { tipo: "sposta_date", giorniLavorativi: 1 });
    expect(dopo.aree.fasi?.["fasi.work_start_date"]?.valore).toBe("2027-08-24");
  });
});

describe("meteo di stagione (nessun servizio meteo)", () => {
  it("il tetto di novembre ha l'avviso, il bagno no, il tetto di maggio no", () => {
    const avvisi = avvisiMeteo([
      { nome: "Rifacimento tetto", dal: "2026-11-16", al: "2026-11-27" },
      { nome: "Rivestimenti bagno", dal: "2026-11-16", al: "2026-11-27" },
      { nome: "Rifacimento tetto", dal: "2027-05-10", al: "2027-05-20" },
    ]);
    expect(avvisi).toHaveLength(1);
    expect(avvisi[0]).toMatchObject({ fase: "Rifacimento tetto", tipo: "copertura", mesi: ["novembre"] });
    expect(avvisi[0].motivo).toMatch(/5 °C/);
  });

  it("facciata, scavi ed esterni sono fasi all'aperto", () => {
    expect(faseAllAperto("Cappotto termico facciata")).toBe("facciata");
    expect(faseAllAperto("Scavo e fondazioni")).toBe("scavi");
    expect(faseAllAperto("Pavimentazione esterna cortile")).toBe("esterni");
    expect(faseAllAperto("Impianto elettrico")).toBeNull();
    expect(avvisiMeteo([{ nome: "Cappotto termico facciata", dal: "2027-01-11", al: "2027-02-05" }])[0].mesi).toEqual(["gennaio", "febbraio"]);
  });
});

describe("adempimenti prima di partire", () => {
  it("ristrutturazione con una ditta: CILA o SCIA, cartello, notifica preliminare, suolo pubblico, con le scadenze sui giorni lavorativi", () => {
    const a = adempimentiPrimaDiPartire({ lavoro: "Ristrutturazione appartamento", inizio: "2026-12-09", ditte: 1,
      fasi: [{ nome: "Demolizioni", dal: "2026-12-09", al: "2026-12-11" }] });
    expect(a.map((x) => [x.tipo, x.scadenza])).toEqual([
      ["cila_scia", "2026-12-01"], // 5 giorni lavorativi prima, saltando l'Immacolata
      ["cartello_cantiere", "2026-12-09"],
      ["notifica_preliminare", "2026-12-03"],
      ["suolo_pubblico", "2026-11-24"],
    ]);
    expect(a.find((x) => x.tipo === "notifica_preliminare")!.testo).toMatch(/più imprese/);
  });

  it("serramenti con un'impresa sola: niente", () => {
    expect(adempimentiPrimaDiPartire({ lavoro: "Sostituzione serramenti", inizio: "2026-12-09", ditte: 0,
      fasi: [{ nome: "Posa serramenti", dal: "2026-12-09", al: "2026-12-11" }] })).toEqual([]);
  });

  it("oltre 200 uomini-giorno la notifica serve anche con un'impresa sola", () => {
    expect(uominiGiorno({ lavoro: "", inizio: null, ditte: 0, fasi: [{ nome: "a", dal: "2026-11-02", al: "2026-11-13" }] })).toBe(20);
    const grande = adempimentiPrimaDiPartire({ lavoro: "Impianto elettrico capannone", inizio: "2027-02-01", ditte: 0,
      fasi: [{ nome: "Impianto", dal: null, al: null, giorni: 60, persone: 4 }] });
    expect(grande.map((x) => x.tipo)).toEqual(["notifica_preliminare"]);
    expect(grande[0].testo).toMatch(/240 uomini-giorno/);
  });

  it("senza inizio lavori le scadenze restano vuote: arrivano con le date", () => {
    const a = adempimentiPrimaDiPartire({ lavoro: "Rifacimento bagno", inizio: null, ditte: 0, fasi: [{ nome: "Demolizione", dal: null, al: null }] });
    expect(a.length).toBeGreaterThan(0);
    expect(a.every((x) => x.scadenza === null)).toBe(true);
  });
});
