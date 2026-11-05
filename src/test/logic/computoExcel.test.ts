import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { leggiComputoExcel, MESSAGGIO_XLS } from "@/lib/computo/computoExcel";
import { leggiFileComputo } from "@/lib/computo/leggiFileComputo";
import { applicaImportComputo, bozzaDaComputoStrutturato } from "@/lib/computo/importaComputo";
import { bozzaVuota } from "@/lib/computo/editorNativo";
import { frammentoDaFileComputo } from "@/lib/silvio-commessa/lettori/computo";
import type { FaseDelPiano } from "../../../shared/silvio-commessa/piano.ts";

type Riga = Array<string | number | null | ExcelJS.CellValue>;

async function comeBuffer(libro: ExcelJS.Workbook): Promise<ArrayBuffer> {
  const b = (await libro.xlsx.writeBuffer()) as unknown as Uint8Array;
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
}

async function foglio(righe: Riga[], prepara?: (f: ExcelJS.Worksheet) => void): Promise<ArrayBuffer> {
  const libro = new ExcelJS.Workbook();
  const f = libro.addWorksheet("Foglio1");
  for (const r of righe) f.addRow(r);
  prepara?.(f);
  return comeBuffer(libro);
}

const formula = (testo: string, risultato: number): ExcelJS.CellValue => ({ formula: testo, result: risultato });

/** Un computo inventato con la forma che si vede in giro: titolo e note uniti, intestazione doppia. */
const INTESTAZIONE: Riga = ["Nr. Progr.", "Nr. Articolo", "DESIGNAZIONE DEI LAVORI", "U.M.", "Quantità", "unitario", "TOTALE"];
const COMPUTO: Riga[] = [
  [null, null, null, null, null, null, null],
  ["Ristrutturazione palazzina di prova", null, null, null, null, null, null],
  ["ELENCO DELLE LAVORAZIONI", null, null, null, null, null, null],
  ["Nota Bene: quantità da verificare", null, null, null, null, null, null],
  INTESTAZIONE,
  [null, null, null, null, null, null, null],
  [1, null, "ALLESTIMENTO", null, null, null, formula("SUM(G8:G11)", 3100)],
  [1.1, "GRU", "Montaggio della gru di cantiere con tutti gli accessori necessari al lavoro", "a.c.", 1, 2000, formula("E8*F8", 2000)],
  [null, null, "Nolo mensile", "mese", 12, 0, null],
  [1.2, "BARACCA", "Baracca di cantiere", "mese", 2, 500, formula("E10*F10", 1000)],
  [1.2, "RECINTO", "Recinzione", "m", 10, 10, formula("E11*F11", 100)],
  [null, null, null, null, null, null, null],
  [2, null, "SCAVI", null, null, null, formula("SUM(G14:G17)", 5000)],
  [2.1, "SCAVO", "Scavo come da progetto", null, null, 0, null],
  [2.2, "PONTEGGI", "Ponteggi di facciata", null, null, null, null],
  [null, null, "montaggio", "mq", 100, 10, formula("E16*F16", 1000)],
  [null, "PT", "nolo", "mq/mesi", formula("100*2", 200), 20, formula("E17*F17", 4000)],
  [3, null, "SERRAMENTI", null, null, null, formula("SUM(G19:G25)", 1380)],
  [3.1, "FINESTRE", "Fornitura e posa di serramenti", "mq", 2, 690, formula("E19*F19", 1380)],
  [null, "PT", "120 x 135 cm", null, null, null, null],
  [3, null, "COPERTURA", null, null, null, 800],
  ["3.1", "TEGOLE", "Manto di copertura", "mq", 8, 100, 800],
  [null, null, "TOTALE LAVORI", null, null, null, formula("G7+G13+G18+G21", 10280)],
  [null, null, "Sconto a Voi riservato", null, null, null, 280],
  [null, null, "TOTALE LAVORI NETTI", null, null, null, 10000],
  [null, null, null, null, null, null, null],
  ["Le quantità sono indicative", null, null, null, null, null, null],
  ["Il presente documento non è un'offerta", null, null, null, null, null, null],
];

const comeSiStampa = (f: ExcelJS.Worksheet) => {
  for (const riga of [2, 3, 4, 27, 28]) f.mergeCells(riga, 1, riga, 5);
  for (let c = 1; c <= 7; c++) f.mergeCells(5, c, 6, c);
};

describe("leggiComputoExcel", () => {
  it("capitoli, voci, dettagli, celle unite, formule e numeri ripetuti", async () => {
    const c = await leggiComputoExcel(await foglio(COMPUTO, comeSiStampa));
    expect(c.formato).toBe("excel");
    expect(c.metadata.oggetto_lavori).toBe("Ristrutturazione palazzina di prova");

    // Due capitoli col numero 3 restano due capitoli; «1.2» due volte sono due voci.
    expect([...new Set(c.voci.map(v => v.categoria?.nome))]).toEqual(["ALLESTIMENTO", "SCAVI", "SERRAMENTI", "COPERTURA"]);
    expect(c.voci.filter(v => v.numero_ordine === "1.2").map(v => v.codice_tariffa)).toEqual(["BARACCA", "RECINTO"]);
    expect(c.voci).toHaveLength(9);

    // Le formule valgono il risultato salvato.
    const nolo = c.voci.find(v => v.unita_misura === "mq/mesi");
    expect(nolo).toMatchObject({ quantita: 200, prezzo_unitario: 20, importo: 4000, codice_tariffa: "PT" });
    // Un dettaglio col suo prezzo è una voce col nome del padre; l'intestazione non è una voce.
    expect(nolo?.descrizione.split("\n")[0]).toBe("Ponteggi di facciata — PT nolo");
    expect(c.voci.some(v => v.descrizione === "Ponteggi di facciata")).toBe(false);
    // Il testo senza numeri precisa la voce sopra.
    expect(c.voci.find(v => v.codice_tariffa === "FINESTRE")?.descrizione).toBe("Fornitura e posa di serramenti\nPT 120 x 135 cm");
  });

  it("quantità vuota e prezzo 0 restano come sono, e si segnalano", async () => {
    const c = await leggiComputoExcel(await foglio(COMPUTO, comeSiStampa));
    expect(c.voci.find(v => v.codice_tariffa === "SCAVO")).toMatchObject({ quantita: null, prezzo_unitario: 0, importo: null });
    expect(c.voci.find(v => v.unita_misura === "mese" && v.prezzo_unitario === 0)).toMatchObject({ quantita: 12, importo: null });
    expect(c.voci.find(v => v.codice_tariffa === "GRU")?.a_corpo).toBe(true);
    expect(c.avvisi.join("\n")).toMatch(/2 voci sono da definire.*1\.1, 2\.1/);
    expect(c.avvisi.join("\n")).toMatch(/Numeri ripetuti.*1\.2.*3/);
  });

  it("i totali che tornano non fanno rumore; sconto e netto si leggono; le note restano", async () => {
    const c = await leggiComputoExcel(await foglio(COMPUTO, comeSiStampa));
    expect(c.totale_dichiarato).toBe(10280);
    expect(c.sconto).toEqual({ importo: 280, descrizione: "Sconto a Voi riservato" });
    expect(c.totale_netto).toBe(10000);
    const avvisi = c.avvisi.join("\n");
    expect(avvisi).not.toMatch(/le voci sommano/);
    expect(avvisi).toMatch(/Nota Bene: quantità da verificare/);
    expect(avvisi).toMatch(/Le quantità sono indicative/);
    expect(avvisi).toMatch(/non è un'offerta/);
  });

  it("dice quando la somma non torna col capitolo e col totale", async () => {
    const righe = COMPUTO.map((r): Riga => (r[2] === "SCAVI" ? [2, null, "SCAVI", null, null, null, 5500] : r));
    const c = await leggiComputoExcel(await foglio(righe, comeSiStampa));
    expect(c.avvisi.join("\n")).toMatch(/Capitolo «SCAVI»: le voci sommano 5\.000,00 €, il foglio dice 5\.500,00 €/);
    const altro = COMPUTO.map((r): Riga => (r[2] === "TOTALE LAVORI" ? [null, null, "TOTALE LAVORI", null, null, null, 99999] : r));
    expect((await leggiComputoExcel(await foglio(altro, comeSiStampa))).avvisi.join("\n"))
      .toMatch(/Il totale del foglio è 99\.999,00 €, le voci sommano 10\.280,00 €/);
  });

  it("colonne in altro ordine e con altri nomi, capitoli senza numero, numeri scritti come testo", async () => {
    const c = await leggiComputoExcel(await foglio([
      ["Committente: Mario Prova"],
      ["Importo", "Descrizione", "Q.tà", "Prezzo", "UM", "Codice"],
      [null, "OPERE MURARIE", null, null, null, null],
      [150, "Tramezzi", 10, 15, "mq", "A.1"],
      ["1.200,50", "Intonaci", "100", "12,005", "mq", "A.2"],
      [null, "Pitture", null, null, null, null],
      [50, "Tinteggio scale", 5, 10, "mq", "B.1"],
      [1400.5, "Totale", null, null, null, null],
    ]));
    expect(c.metadata.committente).toBe("Mario Prova");
    expect(c.voci.map(v => [v.categoria?.nome, v.codice_tariffa, v.quantita, v.prezzo_unitario, v.importo])).toEqual([
      ["OPERE MURARIE", "A.1", 10, 15, 150],
      ["OPERE MURARIE", "A.2", 100, 12.005, 1200.5],
      ["OPERE MURARIE", "B.1", 5, 10, 50],
    ]);
    expect(c.totale_dichiarato).toBe(1400.5);
  });

  it("l'intestazione su due righe con «Prezzo» unito sopra «unitario» e «totale»; capitolo in grassetto", async () => {
    const c = await leggiComputoExcel(await foglio([
      ["N.", "Lavorazione", "Unità", "Quantità", "Prezzo", null],
      [null, null, null, null, "unitario", "totale"],
      [null, "Demolizioni", null, null, null, null],
      [1, "Rimozione pavimenti", "mq", 20, 10, 200],
      [2, "Rimozione rivestimenti", "mq", 10, 5, formula("D5*E5", 50)],
    ], (f) => { f.mergeCells(1, 5, 1, 6); f.getCell(3, 2).font = { bold: true }; }));
    expect(c.voci.map(v => [v.numero_ordine, v.categoria?.nome, v.prezzo_unitario, v.importo])).toEqual([
      ["1", "Demolizioni", 10, 200], ["2", "Demolizioni", 5, 50],
    ]);
  });

  it("una formula senza risultato salvato non si ricalcola: si dice", async () => {
    const c = await leggiComputoExcel(await foglio([
      ["Descrizione", "UM", "Quantità", "Prezzo", "Importo"],
      ["Scavo", "mc", 2, 10, { formula: "C2*D2" } as ExcelJS.CellValue],
    ]));
    expect(c.voci[0].importo).toBeNull();
    expect(c.avvisi.join("\n")).toMatch(/1 formule non hanno il risultato salvato/);
  });

  it("un foglio che non è un computo dice perché", async () => {
    await expect(leggiComputoExcel(await foglio([["Nome", "Telefono"], ["Anna", "333"]]))).rejects.toThrow(/^Non sembra un computo: /);
    await expect(leggiComputoExcel(await foglio([["Descrizione", "Quantità", "Prezzo"]]))).rejects.toThrow(/^Non sembra un computo: /);
    await expect(leggiComputoExcel(await comeBuffer(new ExcelJS.Workbook()))).rejects.toThrow(/^Non sembra un computo: /);
  });

  it("legge il primo foglio che è un computo e dice degli altri", async () => {
    const libro = new ExcelJS.Workbook();
    libro.addWorksheet("Note").addRow(["Appunti vari"]);
    const uno = libro.addWorksheet("Lotto A");
    uno.addRow(["Descrizione", "Quantità", "Prezzo", "Importo"]);
    uno.addRow(["Scavo", 1, 10, 10]);
    const due = libro.addWorksheet("Lotto B");
    due.addRow(["Descrizione", "Quantità", "Prezzo", "Importo"]);
    due.addRow(["Getto", 1, 20, 20]);
    const c = await leggiComputoExcel(await comeBuffer(libro));
    expect(c.voci.map(v => v.descrizione)).toEqual(["Scavo"]);
    expect(c.avvisi.join("\n")).toMatch(/«Lotto B» sembra un computo/);
  });

  it("un .xls vecchio chiede di salvarlo come .xlsx, dal nome e dal contenuto", async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]);
    await expect(leggiComputoExcel(ole.buffer as ArrayBuffer)).rejects.toThrow(/salvalo come \.xlsx/);
    await expect(leggiFileComputo(new File([ole], "Computo.xls"))).rejects.toThrow(MESSAGGIO_XLS);
    await expect(leggiComputoExcel(new Uint8Array([1, 2, 3, 4]).buffer as ArrayBuffer)).rejects.toThrow(/non è un foglio Excel/);
  });
});

describe("il foglio nel popup e nell'editor", () => {
  it("capitoli → fasi, voci → sottofasi; importo netto da confermare; i prezzi non diventano costi", async () => {
    const c = await leggiComputoExcel(await foglio(COMPUTO, comeSiStampa));
    const fr = frammentoDaFileComputo(c, "prova.xlsx", { inizio: "2027-01-11" });

    const fasi = fr.aree.fasi?.["fasi.order_work_phases"]?.valore as FaseDelPiano[];
    expect(fasi.map(f => f.name)).toEqual(["ALLESTIMENTO", "SCAVI", "SERRAMENTI", "COPERTURA"]);
    expect(fasi.flatMap(f => f.sottofasi ?? [])).toHaveLength(9);
    expect(fasi[1].sottofasi?.reduce((s, v) => s + (v.importo ?? 0), 0)).toBe(5000);

    expect(fr.aree.economia?.["economia.total_amount"]).toMatchObject({ valore: 10000, stato: "proposta" });
    expect(fr.aree.economia?.["economia.total_amount"]?.nota).toMatch(/prezzi di vendita/);
    expect(fr.aree.costi?.["costi.previsti"]).toBeUndefined();
    const avvisi = (fr.avvisi ?? []).join("\n");
    expect(avvisi).toMatch(/nessuna voce ha un costo stimato/);
    expect(avvisi).toMatch(/se è l'offerta di una ditta, il totale è un costo/);
    expect(avvisi).not.toMatch(/non torna col ricalcolo/);
  });

  it("nell'editor lo sconto del foglio vale per una bozza nuova, non per una con altre voci", async () => {
    const c = await leggiComputoExcel(await foglio(COMPUTO, comeSiStampa));
    const esito = bozzaDaComputoStrutturato(c);
    expect(esito.totaleRicalcolato).toBe(10280);
    expect(applicaImportComputo(bozzaVuota(), esito).sconto).toMatchObject({ tipo: "importo", valore: "280" });
    const conVoci = applicaImportComputo(bozzaVuota(), { ...esito, sconto: null });
    expect(applicaImportComputo(conVoci, esito).sconto?.tipo).toBe("nessuno");
  });
});
