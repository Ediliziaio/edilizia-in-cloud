import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CATEGORIE_COSTO, CATEGORIE_PIANO, CATEGORIE_RICAVO, VOCI_DI_PARTENZA,
  aggiungiMesi, indovinaCategoria, vociDiPartenza,
} from "@/lib/orders/generali/pianoCategorie";
import { leggiIncolla, leggiMese, leggiNumeroItaliano } from "@/lib/orders/generali/pianoExcel";
import { dataDaMese, leggiFotografie, leggiReale, leggiUnita, leggiVersioni, leggiVoci, meseDaData } from "@/lib/orders/generali/pianoLettura";

/**
 * Piano economico: categorie e voci di partenza, «Incolla da Excel» e lettura dal database.
 * Il business plan oggi sta in un foglio di calcolo: incollarlo deve funzionare al primo colpo.
 */

describe("numeri e mesi come li scrive una persona", () => {
  it.each([
    ["1.250.000,50 €", 1_250_000.5],
    ["€ 1.500", 1500],
    ["1500", 1500],
    ["1,5", 1.5],
    ["1234.56", 1234.56],
    ["1,234,567", 1_234_567],
    ["1.234.567", 1_234_567],
    ["1,234.50", 1234.5],
    ["(2.000)", -2000],
    ["-350,00", -350],
    ["12'000", 12000],
  ])("«%s» → %s", (testo, atteso) => {
    expect(leggiNumeroItaliano(testo)).toBe(atteso);
  });

  it.each(["", "abc", "12,5%", "1.2.a"])("«%s» non è un numero", (testo) => {
    expect(leggiNumeroItaliano(testo)).toBeNull();
  });

  it.each([
    ["2027-03", "2027-03"],
    ["2027-03-15", "2027-03"],
    ["03/2027", "2027-03"],
    ["3/27", "2027-03"],
    ["15/03/2027", "2027-03"],
    ["mar 2027", "2027-03"],
    ["Marzo-27", "2027-03"],
    ["dic. 2026", "2026-12"],
    ["sett 2027", "2027-09"],
    ["46447", "2027-03"],
  ])("«%s» → %s", (testo, atteso) => {
    expect(leggiMese(testo)).toBe(atteso);
  });

  it("«Mese 4» si conta dal mese di partenza", () => {
    expect(leggiMese("Mese 4", "2026-11")).toBe("2027-02");
    expect(leggiMese("M1", "2026-11")).toBe("2026-11");
    expect(leggiMese("Mese 4")).toBeNull();
  });

  it.each(["", "13/2027", "boh", "15/03"])("«%s» non è un mese", (testo) => {
    expect(leggiMese(testo)).toBeNull();
  });
});

describe("incolla da Excel", () => {
  const figlie = [
    { id: "f1", codice: "C-101", nome: "Appartamento A1" },
    { id: "f2", codice: "C-102", nome: "Appartamento A2" },
  ];

  it("con l'intestazione: colonne per nome, totali saltati, tipo e categoria capiti", () => {
    const testo = [
      "Voce\tCategoria\tImporto\tMese\tDurata",
      "Acquisto terreno\tTerreno e acquisto\t350.000,00 €\t11/2026\t1",
      "Oneri di urbanizzazione\t\t48.000\tgen 2027\t",
      "Costruzione\tCostruzione\t1.200.000\t03/2027\t16",
      "Vendite appartamenti\t\t2.400.000\tgiu 2028\t8",
      "Totale\t\t3.998.000\t\t",
      "",
    ].join("\n");
    const e = leggiIncolla(testo);
    expect(e.intestazione).toBe(true);
    expect(e.saltate).toBe(2);
    expect(e.righe).toHaveLength(4);
    expect(e.righe[0]).toMatchObject({ riga: 2, tipo: "costo", categoria: "terreno", importo: 350_000, mese: "2026-11", durataMesi: 1, problemi: [] });
    expect(e.righe[1]).toMatchObject({ categoria: "oneri", importo: 48_000, mese: "2027-01" });
    expect(e.righe[2]).toMatchObject({ categoria: "costruzione", durataMesi: 16 });
    expect(e.righe[3]).toMatchObject({ tipo: "ricavo", categoria: "vendite", importo: 2_400_000, mese: "2028-06" });
  });

  it("senza intestazione: si capisce quale colonna è cosa", () => {
    const testo = "Progettazione\t03/2027\t85.000\nAllacci Enel e acqua\t09/2028\t12.500\nPubblicità e agenzia\t01/2028\t60.000";
    const e = leggiIncolla(testo);
    expect(e.intestazione).toBe(false);
    expect(e.righe.map((r) => [r.categoria, r.importo, r.mese])).toEqual([
      ["progettazione", 85_000, "2027-03"],
      ["allacci", 12_500, "2028-09"],
      ["commercializzazione", 60_000, "2028-01"],
    ]);
  });

  it("col punto e virgola, importi negativi come costi, colonna del tipo", () => {
    const e = leggiIncolla("Descrizione;Tipo;Importo\nAnticipo cliente;Entrata;100.000\nNotaio;;-4.500\nVarie;Uscita;1.000");
    expect(e.righe.map((r) => [r.tipo, r.categoria, r.importo])).toEqual([
      ["ricavo", "vendite", 100_000],
      ["costo", "terreno", 4_500],
      ["costo", "altri_costi", 1_000],
    ]);
    expect(e.righe[2].categoriaSicura).toBe(false);
  });

  it("dice cosa non va, riga per riga", () => {
    const e = leggiIncolla("Voce\tImporto\tMese\tDurata\tUnità\nCappotto\tcirca 20k\tprossimo anno\t200\tA9", { figlie });
    expect(e.righe[0].problemi).toEqual([
      "Importo non riconosciuto: «circa 20k»",
      "Mese non riconosciuto: «prossimo anno»",
      "Durata non valida: «200» (da 1 a 120 mesi)",
      "Commessa non trovata: «A9»",
    ]);
    expect(e.righe[0].importo).toBeNull();
    expect(e.righe[0].durataMesi).toBe(1);
  });

  it("aggancia le righe alle commesse per codice o nome", () => {
    const e = leggiIncolla("Voce\tImporto\tCommessa\nFiniture\t30.000\tC-102\nCucina\t12.000\tappartamento a1", { figlie });
    expect(e.righe.map((r) => r.figliaId)).toEqual(["f2", "f1"]);
  });

  it("«Mese 1, Mese 2» dal mese di partenza", () => {
    const e = leggiIncolla("Voce\tMese\tImporto\nTerreno\tMese 1\t100.000\nCantiere\tMese 6\t50.000", { partenza: "2026-11" });
    expect(e.righe.map((r) => r.mese)).toEqual(["2026-11", "2027-04"]);
  });

  it("niente da leggere", () => {
    expect(leggiIncolla("\n\n")).toEqual({ righe: [], intestazione: false, saltate: 0 });
  });
});

describe("categorie e voci di partenza", () => {
  it("ogni modello parte con voci coerenti, il ricavo dal valore della generale", () => {
    for (const voci of Object.values(VOCI_DI_PARTENZA)) {
      for (const v of voci) expect(CATEGORIE_PIANO[v.categoria].tipo).toBe(v.tipo);
      expect(voci.filter((v) => v.tipo === "ricavo")).toHaveLength(1);
    }
    const sviluppo = vociDiPartenza("sviluppo", "2026-11", 2_400_000);
    expect(sviluppo.map((v) => v.categoria)).toEqual([
      "vendite", "terreno", "oneri", "progettazione", "costruzione", "allacci", "commercializzazione", "finanziari", "imprevisti",
    ]);
    expect(sviluppo[0]).toMatchObject({ importo: 2_400_000, mese: "2028-05", durataMesi: 8 });
    expect(sviluppo[1]).toMatchObject({ importo: 0, mese: "2026-11" });
    expect(vociDiPartenza("appalto", "2026-11", null)[0].importo).toBe(0);
  });

  it("i mesi scavalcano l'anno", () => {
    expect(aggiungiMesi("2026-11", 3)).toBe("2027-02");
    expect(aggiungiMesi("2027-01", -1)).toBe("2026-12");
    expect(aggiungiMesi("2026-12", 25)).toBe("2029-01");
  });

  it("indovina la categoria dal nome o dagli indizi, rispettando il tipo", () => {
    expect(indovinaCategoria("Oneri finanziari")).toMatchObject({ categoria: "finanziari", sicura: true });
    expect(indovinaCategoria("Interessi passivi mutuo")).toMatchObject({ categoria: "finanziari" });
    expect(indovinaCategoria("Provvigioni agenzia")).toMatchObject({ categoria: "commercializzazione" });
    expect(indovinaCategoria("Vendita box", "ricavo")).toMatchObject({ tipo: "ricavo", categoria: "vendite" });
    expect(indovinaCategoria("Vendita box", "costo")).toMatchObject({ tipo: "costo", categoria: "commercializzazione" });
    expect(indovinaCategoria("qualcosa", "ricavo")).toMatchObject({ categoria: "altri_ricavi", sicura: false });
  });

  it("le categorie sono le stesse del vincolo nel database", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20281031110000_generale_piano_economico.sql"), "utf8");
    const vincolo = sql.slice(sql.indexOf("constraint generale_piano_voci_categoria"), sql.indexOf("constraint generale_piano_voci_importo"));
    const nelDb = [...vincolo.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).filter((c) => c !== "ricavo" && c !== "costo");
    expect(new Set(nelDb)).toEqual(new Set([...CATEGORIE_RICAVO, ...CATEGORIE_COSTO]));
  });
});

describe("lettura dal database", () => {
  it("voci: scarta le righe storte, mesi e numeri al loro posto", () => {
    const voci = leggiVoci([
      { id: "b", tipo: "costo", categoria: "terreno", descrizione: "Terreno", importo: "150000.00", mese: "2026-11-01", durata_mesi: 1, figlia_id: null, categorie_costo: ["materiali_edili"], a_finire: null, ordine: 2, origine_id: "x" },
      { id: "a", tipo: "ricavo", categoria: "vendite", importo: 10, mese: null, durata_mesi: 0, ordine: 1, a_finire: "5" },
      { id: "c", tipo: "costo", categoria: "inventata", importo: 1 },
      { id: "d", tipo: "boh", categoria: "terreno", importo: 1 },
      null,
    ]);
    expect(voci.map((v) => v.id)).toEqual(["a", "b"]);
    expect(voci[1]).toMatchObject({ importo: 150_000, mese: "2026-11", categorieCosto: ["materiali_edili"], origineId: "x" });
    expect(voci[0]).toMatchObject({ durataMesi: 1, aFinire: 5, mese: null, descrizione: "" });
  });

  it("versioni dalla più recente", () => {
    const v = leggiVersioni([{ id: "1", numero: 1, stato: "superata" }, { id: "2", numero: 2, stato: "approvata", approvata_at: "2026-10-01" }, { id: "3", numero: 3, stato: "x" }]);
    expect(v.map((x) => [x.numero, x.stato])).toEqual([[3, "bozza"], [2, "approvata"], [1, "superata"]]);
  });

  it("il reale della RPC", () => {
    const r = leggiReale({
      oggi: "2026-10-30",
      permessi: { costi: true, importi: false },
      righe: [
        { id: "spesa:1:f", fonte: "spesa", rif_id: "1", order_id: "f", data: "2026-10-01", tipo: "costo", chiave: "materiali", categoria: "materiali_edili", descrizione: "Sabbia", importo: 120.5, voce_id: "v" },
        { id: "x", order_id: "f", tipo: "costo", importo: "no" },
      ],
      incassi: [{ fattura_id: "i", data: null, importo: 50 }],
      categorie: [{ chiave: "materiali_edili", etichetta: "materiali_edili" }, { chiave: "" }],
    });
    expect(r.permessi).toEqual({ costi: true, importi: false });
    expect(r.righe).toHaveLength(1);
    expect(r.righe[0]).toMatchObject({ voceId: "v", importo: 120.5, rifId: "1" });
    expect(r.incassi).toEqual([{ fatturaId: "i", data: null, importo: 50 }]);
    expect(r.categorie).toHaveLength(1);
    expect(leggiReale(null).righe).toEqual([]);
  });

  it("unità: millesimi e m² per figlia, qualunque sia la colonna del legame", () => {
    const u = leggiUnita([
      { order_id: "f1", mq_commerciali: "95.5", millesimi: 120 },
      { commessa_id: "f2", mq_commerciali: 80, millesimi: null },
      { mq_commerciali: 10 },
    ]);
    expect(u.get("f1")).toEqual({ mq: 95.5, millesimi: 120 });
    expect(u.get("f2")).toEqual({ mq: 80, millesimi: null });
    expect(u.size).toBe(2);
  });

  it("fotografie in ordine di mese", () => {
    const f = leggiFotografie([{ mese: "2026-11-01", ricavi_stima: 10, origine: "manuale" }, { mese: "2026-10-01", ricavi_stima: "5" }]);
    expect(f.map((x) => [x.mese, x.ricaviStima, x.origine])).toEqual([["2026-10", 5, "automatica"], ["2026-11", 10, "manuale"]]);
  });

  it("mese ↔ data", () => {
    expect(meseDaData("2027-03-01")).toBe("2027-03");
    expect(dataDaMese("2027-03")).toBe("2027-03-01");
    expect(dataDaMese(null)).toBeNull();
    expect(dataDaMese("marzo")).toBeNull();
  });
});
