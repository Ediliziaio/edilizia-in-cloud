import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import { avvisiVoce, correggi, daEstrazioneServer, instrada, versoVoceLocale, type VoceImportata } from "@/lib/computo/importaVoci";
import { leggiVociDaFile, MESSAGGIO_SENZA_SERVER, type Avanzamento } from "@/lib/computo/leggiVoci";
import { computoDaTabelleWord, leggiComputoCsv, leggiDocumentoWord, righeCsv, separatoreCsv } from "@/lib/computo/tabelleDocumento";
import { voceVuota } from "@/lib/computo/editorNativo";
import type { ComputoVoceEstratta } from "@/types/computo";

/** Computi inventati per le prove: nessun dato di clienti. */
const CSV = [
  "Computo metrico di prova;;;;;;",
  "N.;Codice;Descrizione;U.M.;Quantità;Prezzo;Importo",
  "1;;OPERE MURARIE;;;;",
  "1.1;A.01;Intonaco civile per interni;mq;10,00;24,00;240,00",
  "1.2;A.02;\"Tinteggiatura, due mani\";mq;20,00;8,00;160,00",
  ";;TOTALE;;;;400,00",
].join("\r\n");

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const cella = (t: string) => `<w:tc><w:p><w:r><w:t>${t}</w:t></w:r></w:p></w:tc>`;
const riga = (...c: string[]) => `<w:tr>${c.map(cella).join("")}</w:tr>`;

async function docx(corpo: string): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="${W}"><w:body>${corpo}</w:body></w:document>`);
  return zip.generateAsync({ type: "arraybuffer" });
}

const TABELLA_WORD = `<w:p><w:r><w:t>Preventivo lavori</w:t></w:r></w:p><w:tbl>${[
  riga("N.", "Descrizione", "U.M.", "Quantità", "Prezzo", "Importo"),
  riga("1", "OPERE EDILI", "", "", "", ""),
  riga("1.1", "Massetto in sabbia e cemento", "mq", "30,00", "18,00", "540,00"),
  riga("1.2", "Posa piastrelle", "mq", "30,00", "35,00", "1.050,00"),
].join("")}</w:tbl>`;

const comeFile = (dati: ArrayBuffer | string, nome: string, type = "") => new File([dati], nome, { type });

async function leggi(file: File, server?: Parameters<typeof leggiVociDaFile>[1]["server"]) {
  const fasi: Avanzamento[] = [];
  const esito = await leggiVociDaFile(file, { onAvanzamento: a => fasi.push(a), server });
  return { esito, fasi: fasi.map(f => f.fase) };
}

const estratta = (p: Partial<ComputoVoceEstratta>): ComputoVoceEstratta => ({
  id: "x", computo_upload_id: "u", company_id: "c", capitolo_numero: 1, capitolo_nome: "Demolizioni", codice_voce: null,
  codice_prezzario: null, descrizione_breve: "Demolizione pavimento", descrizione_estesa: null, unita_misura: "mq",
  quantita: 12, prezzo_unitario_computo: 15, importo_computo: 180, prezzo_unitario_impresa: null, ricarico_percentuale: null,
  sconto_percentuale: 0, importo_impresa: null, confidence: 0.95, warnings: null, ai_notes: null, is_included: true,
  is_modified: false, ordine: 0, created_at: "", matched_template_id: null, matched_family_id: null, matched_tariffa_id: null,
  matched_name: null, match_type: null, match_confidence: null, ...p,
});

describe("Importa voci: ogni formato al suo lettore", () => {
  it.each([
    ["computo.xpwe", "PriMus (XPWE)", "browser"], ["computo.pwe", "PriMus (XPWE)", "browser"],
    ["computo.xlsx", "Excel", "browser"], ["vecchio.xls", "Excel 97-2003", "server"],
    ["voci.csv", "CSV", "browser"], ["capitolato.docx", "Word", "browser"],
    ["computo.pdf", "PDF", "browser"], ["foto.JPG", "Foto", "server"], ["schermata.png", "Foto", "server"],
    ["computo.dcf", "PriMus (DCF)", "no"], ["vecchio.doc", "Word 97-2003", "no"], ["foto.heic", "Foto iPhone", "no"],
    ["archivio.zip", "ZIP", "no"],
  ])("%s → %s (%s)", (nome, formato, via) => {
    expect(instrada({ name: nome, type: "", size: 10 })).toMatchObject({ formato, via });
  });

  it("i file che non si leggono dicono cosa fare, in italiano", () => {
    expect(instrada({ name: "computo.dcf", type: "", size: 10 }).motivo).toContain("File › Esporta › XPWE");
    expect(instrada({ name: "vecchio.doc", type: "", size: 10 }).motivo).toContain("salvalo come .docx");
    expect(instrada({ name: "grande.pdf", type: "", size: 60 * 1024 * 1024 }).motivo).toBe("Il file supera i 50 MB.");
    expect(instrada({ name: "vuoto.csv", type: "", size: 0 }).motivo).toBe("Il file è vuoto.");
  });
});

describe("CSV", () => {
  it("separatore «;», virgolette e virgole dentro le celle", () => {
    expect(righeCsv(CSV)[4]).toEqual(["1.2", "A.02", "Tinteggiatura, due mani", "mq", "20,00", "8,00", "160,00"]);
    expect(righeCsv("a,b\n1,2")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("a «;» anche quando una descrizione ha più virgole dei campi (14/11/2026)", () => {
    // Prima vinceva la virgola: 6 nella riga del cappotto contro 5 punti e virgola, e il file era «Non sembra un computo».
    const csv = [
      "N.;Descrizione;U.M.;Quantità;Prezzo;Importo",
      "1;Isolamento a cappotto con pannelli in EPS sp. 10 cm, compresi collante, tasselli, rete e rasatura;mq;180,00;62,00;11160,00",
      "2;Battiscopa in legno h 8 cm;m;70,00;9,00;630,00",
    ].join("\n");
    expect(separatoreCsv(csv)).toBe(";");
    expect(leggiComputoCsv(csv).voci.map(v => [v.unita_misura, v.quantita])).toEqual([["mq", 180], ["m", 70]]);
    expect(separatoreCsv('descrizione,um,quantita\n"Intonaco, due mani",mq,10\nTinteggiatura,mq,20')).toBe(",");
    expect(separatoreCsv("a\tb\tc\n1\t2,5\t3")).toBe("\t");
  });

  it("legge le voci come un foglio Excel, coi numeri all'italiana", () => {
    const c = leggiComputoCsv(CSV);
    expect(c.voci.map(v => [v.descrizione, v.unita_misura, v.quantita, v.prezzo_unitario])).toEqual([
      ["Intonaco civile per interni", "mq", 10, 24],
      ["Tinteggiatura, due mani", "mq", 20, 8],
    ]);
    expect(c.totale_dichiarato).toBe(400);
  });

  it("dal file: fasi in ordine e voci complete", async () => {
    const { esito, fasi } = await leggi(comeFile(CSV, "voci.csv", "text/csv"));
    expect(fasi).toEqual(["apro", "leggo", "riconosco"]);
    expect(esito).toMatchObject({ formato: "CSV", via: "browser" });
    expect(esito.voci).toHaveLength(2);
    expect(esito.voci.every(v => v.avvisi.length === 0 && v.origine === "voci.csv")).toBe(true);
    expect(esito.esito.totaleDocumento).toBe(400);
    expect(esito.esito.totaleRicalcolato).toBe(400);
  });
});

describe("Word", () => {
  it("le tabelle diventano voci, senza AI", async () => {
    const word = await leggiDocumentoWord(await docx(TABELLA_WORD));
    expect(word.testo).toContain("Preventivo lavori");
    const c = computoDaTabelleWord(word);
    expect(c?.voci.map(v => [v.descrizione, v.quantita, v.prezzo_unitario])).toEqual([
      ["Massetto in sabbia e cemento", 30, 18], ["Posa piastrelle", 30, 35],
    ]);
  });

  it("dal file .docx, nel browser", async () => {
    const server = vi.fn();
    const { esito } = await leggi(comeFile(await docx(TABELLA_WORD), "preventivo.docx"), server);
    expect(esito.via).toBe("browser");
    expect(esito.voci).toHaveLength(2);
    expect(server).not.toHaveBeenCalled();
  });

  it("senza tabella il testo va all'AI come PDF", async () => {
    const server = vi.fn(async () => [estratta({})]);
    const { esito } = await leggi(comeFile(await docx("<w:p><w:r><w:t>Demolizione pavimento 12 mq a 15 euro</w:t></w:r></w:p>"), "lettera.docx"), server);
    expect(server).toHaveBeenCalledTimes(1);
    const inviato = (server.mock.calls[0] as unknown as [File])[0];
    expect(inviato.name).toBe("lettera.pdf");
    expect(inviato.type).toBe("application/pdf");
    expect(esito).toMatchObject({ via: "server", formato: "Word" });
  });

  it("un Word protetto o vecchio si rifiuta con il motivo", async () => {
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 1, 2, 3]).buffer;
    await expect(leggi(comeFile(ole, "protetto.docx"))).rejects.toThrow("protetto da password");
  });
});

describe("Excel e PriMus", () => {
  it("Excel .xlsx: il lettore del computo, nel browser", async () => {
    const libro = new ExcelJS.Workbook();
    const f = libro.addWorksheet("Computo");
    [["N.", "Descrizione", "U.M.", "Quantità", "Prezzo", "Importo"], [1, "OPERE EDILI", null, null, null, null],
      [1.1, "Rasatura pareti", "mq", 50, 12, 600]].forEach(r => f.addRow(r));
    const b = (await libro.xlsx.writeBuffer()) as unknown as Uint8Array;
    const { esito, fasi } = await leggi(comeFile(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer, "computo.xlsx"));
    expect(fasi).toEqual(["apro", "leggo", "riconosco"]);
    expect(esito.voci.map(v => [v.descrizione, v.quantita, v.prezzo])).toEqual([["Rasatura pareti", "50", "12"]]);
  });

  it("PriMus XPWE: voci e righe di misura", async () => {
    const xpwe = readFileSync(resolve(__dirname, "../fixtures/computoSintetico.xpwe"));
    const { esito } = await leggi(comeFile(new Uint8Array(xpwe).buffer as ArrayBuffer, "computo.xpwe"));
    expect(esito).toMatchObject({ formato: "PriMus (XPWE)", via: "browser" });
    expect(esito.voci).toHaveLength(6);
    expect(esito.voci.some(v => v.misure.length > 0)).toBe(true);
  });

  it("il vecchio .xls va alla lettura sul server", async () => {
    const server = vi.fn(async () => [estratta({})]);
    const { esito } = await leggi(comeFile("x", "vecchio.xls"), server);
    expect(esito).toMatchObject({ formato: "Excel 97-2003", via: "server" });
  });
});

describe("Foto, scansioni e PDF qualsiasi: lettura sul server", () => {
  it("le fasi seguono lo stato vero del server, pagine comprese", async () => {
    const fasi: Avanzamento[] = [];
    const server = vi.fn(async (_f: File, onStato: (s: { stato: "uploading" | "extracting_text" | "analyzing_ai" | "review"; dettaglio?: string }) => void) => {
      onStato({ stato: "uploading" });
      onStato({ stato: "extracting_text", dettaglio: "2/4 pagine lette" });
      onStato({ stato: "analyzing_ai", dettaglio: "4/4 pagine lette; analisi delle voci…" });
      onStato({ stato: "review" });
      return [estratta({}), estratta({ descrizione_breve: "Massetto", confidence: 0.4, warnings: ["Unità dedotta"] })];
    });
    const esito = await leggiVociDaFile(comeFile("x", "foto.jpg", "image/jpeg"), { onAvanzamento: a => fasi.push(a), server });
    expect(fasi.map(f => f.fase)).toEqual(["apro", "leggo", "riconosco", "pronte"]);
    expect(fasi[1]).toMatchObject({ dettaglio: "2 pagine su 4", parte: 0.5 });
    expect(esito.voci[0].avvisi).toEqual([]);
    expect(esito.voci[1].avvisi).toEqual(["Lettura incerta: confronta col documento", "Unità dedotta"]);
  });

  it("senza AI attiva, una foto si rifiuta con il motivo", async () => {
    await expect(leggi(comeFile("x", "foto.png", "image/png"))).rejects.toThrow(MESSAGGIO_SENZA_SERVER);
  });

  it("nessuna voce trovata è un errore chiaro", async () => {
    await expect(leggi(comeFile("x", "foto.png", "image/png"), vi.fn(async () => []))).rejects.toThrow("Nel file non ho trovato voci di computo");
  });

  it(".dcf: spiega come esportare da PriMus", async () => {
    await expect(leggi(comeFile("x", "computo.dcf"))).rejects.toThrow("File › Esporta › XPWE");
  });
});

describe("Voci da controllare", () => {
  const voce = (p: Partial<VoceImportata>): VoceImportata => ({ ...voceVuota(), descrizione: "Intonaco", unita: "mq", quantita: "10", prezzo: "24", avvisi: [], origine: "f", ...p });

  it("segnala quello che manca o è a zero", () => {
    expect(avvisiVoce(voce({}))).toEqual([]);
    expect(avvisiVoce(voce({ quantita: "", prezzo: "0" }))).toEqual(["Manca la quantità", "Prezzo a zero"]);
    expect(avvisiVoce(voce({ descrizione: " ", unita: "" }))).toEqual(["Manca la descrizione", "Manca l'unità di misura"]);
  });

  it("una correzione a mano ricalcola gli avvisi", () => {
    const v = voce({ prezzo: "", avvisi: ["Manca il prezzo", "Lettura incerta: confronta col documento"] });
    expect(correggi(v, { prezzo: "30" }).avvisi).toEqual([]);
  });

  it("verso i preventivatori di settore: gli stessi campi dell'estrazione AI", () => {
    const l = versoVoceLocale(voce({ descrizione: "Intonaco\ncompreso ponteggio", tariffa: "A.01", capitolo: "Opere murarie" }), 3);
    expect(l).toMatchObject({
      capitolo_nome: "Opere murarie", descrizione_breve: "Intonaco", descrizione_estesa: "compreso ponteggio",
      unita_misura: "mq", quantita: 10, prezzo_unitario_computo: 24, codice_prezzario: "A.01", ordine: 3, _isIncluded: true,
    });
  });

  it("le voci del server tengono la sicurezza della lettura", () => {
    const { voci } = daEstrazioneServer([estratta({ confidence: 0.69 })], "scansione.pdf");
    expect(voci[0].avvisi).toContain("Lettura incerta: confronta col documento");
  });
});
