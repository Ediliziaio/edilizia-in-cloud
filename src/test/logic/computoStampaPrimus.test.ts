import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import type { jsPDF } from "jspdf";
import { leggiComputoPrimus, type PdfPaginaPosizionata } from "@/lib/computo/primusPdf";
import { applicaImportComputo, bozzaDaComputoStrutturato } from "@/lib/computo/importaComputo";
import { bozzaVuota, vociDaBozza } from "@/lib/computo/editorNativo";
import { generaComputoPdf, type IntestazioneComputo } from "@/lib/computo/esportaComputo";
import { computoCompletoDimostrativo } from "../fixtures/computoCompleto";

/**
 * Il computo «come PriMus» (formati «Computo dettagliato» e «Computo senza
 * prezzi» dell'editor). Le regole che un direttore dei lavori dà per scontate:
 * ogni voce chiude con SOMMANO, ogni pagina dopo la prima riparte dal RIPORTO,
 * una voce spezzata dice da dove continua, il totale è quello del computo.
 *
 * Con COMPUTO_PDF_QA_DIR=cartella i PDF si scrivono lì, per guardarli.
 */

function pagineGenzano(): PdfPaginaPosizionata[] {
  const pagine: PdfPaginaPosizionata[] = [];
  for (const riga of readFileSync(resolve(__dirname, "../fixtures/computoPrimusGenzano.tsv"), "utf8").split("\n")) {
    if (!riga || riga.startsWith("# ")) continue;
    if (riga.startsWith("### ")) { pagine.push({ page: Number(riga.slice(4)), items: [] }); continue; }
    const [x, right, y, ...testo] = riga.split("\t");
    pagine.at(-1)!.items.push({ x: Number(x), right: Number(right), y: Number(y), text: testo.join("\t") });
  }
  return pagine;
}

const AZIENDA: Partial<IntestazioneComputo> = {
  azienda: "Demo Azienda 2 S.r.l.", dettagliAzienda: "Via Roma 1, 20121 Milano | P.IVA 01234567890",
  colore: "#1E3A5F", ivaModalita: "applicata", ivaAliquota: "10", stato: "BOZZA LOCALE - non inviata",
};

/**
 * Il testo di ogni pagina, una riga per pezzo scritto. jsPDF nel flusso dei
 * contenuti scappa le parentesi («\(») e scrive l'euro come carattere 128
 * (WinAnsi), a volte in ottale: qui si decodifica, così i test leggono quello
 * che legge chi apre il PDF.
 */
const testoPagine = (doc: jsPDF) =>
  Array.from({ length: doc.getNumberOfPages() }, (_, p) => {
    const flusso = (doc.internal.pages as unknown as Record<number, string[]>)[p + 1].join("\n");
    return [...flusso.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)]
      .map(([, s]) => s.replace(/\\([0-7]{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8))).replace(/\\(.)/g, "$1").replace(/\u0080/g, "€"))
      .join("\n");
  });
const conta = (s: string, cosa: RegExp) => (s.match(cosa) ?? []).length;

async function salva(nome: string, doc: jsPDF) {
  const dir = process.env.COMPUTO_PDF_QA_DIR;
  if (!dir) return;
  await mkdir(dir, { recursive: true });
  await writeFile(resolve(dir, nome), Buffer.from(doc.output("arraybuffer")));
}

describe("computo come PriMus: il computo vero di Genzano", () => {
  let doc: jsPDF; let pagine: string[]; let tutto: string;
  beforeAll(async () => {
    const b = applicaImportComputo({ ...bozzaVuota(), titolo: "Casa di riposo Genzano", numero: "CM-2026-118", dataDocumento: "29/10/2026", tecnico: "Geom. Marco Rossi" },
      bozzaDaComputoStrutturato(leggiComputoPrimus(pagineGenzano())));
    doc = await generaComputoPdf(vociDaBozza(b), { ...AZIENDA, titolo: b.titolo, committente: b.committente, numero: b.numero,
      dataDocumento: b.dataDocumento, tecnico: b.tecnico, impaginazione: "primus", dettaglioMisure: true } as IntestazioneComputo);
    pagine = testoPagine(doc); tutto = pagine.join("\n");
    await salva("genzano-estimativo.pdf", doc);
  });

  it("ogni voce chiude con SOMMANO: 226 voci, 226 righe", () => {
    expect(conta(tutto, /^SOMMANO/gm)).toBe(226);
  });

  it("il totale dei lavori è quello del documento PriMus", () => {
    expect(tutto).toContain("2.642.936,35 €");
  });

  it("ogni pagina della tabella dopo la prima riparte dal RIPORTO, e chi riporta lo dice in fondo", () => {
    const tabella = pagine.filter(p => p.includes("DESIGNAZIONE DEI LAVORI"));
    expect(tabella.length).toBeGreaterThan(20);
    tabella.slice(1).forEach(p => expect(p).toMatch(/^RIPORTO$/m));
    tabella.slice(0, -1).forEach(p => expect(p).toMatch(/^A RIPORTARE$/m));
  });

  it("una voce spezzata fra due pagine dice da dove continua", () => {
    expect(tutto).toMatch(/^segue voce 32 · Isolamento termico a cappotto/m);
  });

  it("la voce in percentuale porta l'importo di PriMus, non cento volte tanto", () => {
    expect(tutto).toMatch(/^6\.352,39$/m);
    expect(tutto).not.toContain("635.238,90");
  });

  it("la pagina del riepilogo non ripete colonne né RIPORTO", () => {
    const riepilogo = pagine.find(p => /^Riepilogo$/m.test(p))!;
    const inizio = riepilogo.search(/^Riepilogo$/m);
    expect(riepilogo.slice(inizio)).not.toContain("DESIGNAZIONE DEI LAVORI");
    // Se il riepilogo apre una pagina sua, quella pagina non ha né colonne né RIPORTO.
    if (!/^SOMMANO/m.test(riepilogo.slice(0, inizio))) expect(riepilogo).not.toMatch(/^RIPORTO$/m);
  });

  it("gli oneri della sicurezza sono quelli del riepilogo PriMus (153.873,55), al netto della voce che li sposta", () => {
    expect(tutto).toContain("153.873,55 €");
  });
});

describe("computo come PriMus: il dimostrativo", () => {
  const b = computoCompletoDimostrativo();
  const base = { ...AZIENDA, titolo: b.titolo, committente: b.committente, oggetto: b.oggetto, numero: b.numero, dataDocumento: b.dataDocumento,
    tecnico: b.tecnico, indirizzoIntervento: b.indirizzo, riferimentoPrezzi: b.riferimentoPrezzi, condizioni: b.condizioni,
    impaginazione: "primus" as const, dettaglioMisure: true } as IntestazioneComputo;

  it("le formule si stampano con la virgola decimale", async () => {
    const doc = await generaComputoPdf(vociDaBozza(b), base);
    await salva("demo-estimativo.pdf", doc);
    const tutto = testoPagine(doc).join("\n");
    expect(tutto).toContain("= (3+2)*2*2,4");
    expect(tutto).not.toContain("2*2.4");
  });

  it("il totale IVA inclusa è lo stesso del preventivo editoriale", async () => {
    const tutto = testoPagine(await generaComputoPdf(vociDaBozza(b), base)).join("\n");
    expect(tutto).toContain("13.729,80 €");
    expect(tutto).toContain("15.102,78 €");
  });

  it("senza prezzi non c'è un solo importo: niente unitario, totale, RIPORTO o euro", async () => {
    const doc = await generaComputoPdf(vociDaBozza(b, true), { ...base, senzaPrezzi: true });
    await salva("demo-senza-prezzi.pdf", doc);
    const tutto = testoPagine(doc).join("\n");
    expect(tutto).toContain("C O M P U T O   M E T R I C O");
    expect(tutto).not.toContain("E S T I M A T I V O");
    expect(tutto).not.toMatch(/^(unitario|totale|RIPORTO|A RIPORTARE|450,00)$|€/m);
    expect(conta(tutto, /^SOMMANO/gm)).toBe(b.voci.length);
  });
});
