import "fake-indexeddb/auto";
import { Blob as NodeBlob, File as NodeFile } from "node:buffer";
import { mkdir, writeFile } from "node:fs/promises";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { allegatiDaIncludere, caricaAllegatoLocale, leggiAllegatoLocale } from "@/lib/computo/allegatiLocali";
import { generaDocumentoComputo } from "@/lib/computo/esportaComputo";
import { bozzaVuota, voceVuota, vociDaBozza } from "@/lib/computo/editorNativo";

beforeAll(() => vi.stubGlobal("Blob", NodeBlob));
afterAll(() => vi.unstubAllGlobals());
const file = (nome: string, type: string, data = new Uint8Array([1, 2, 3])) => new NodeFile([data], nome, { type }) as unknown as File;
const voci = () => vociDaBozza({ ...bozzaVuota(), voci: [{ ...voceVuota(), descrizione: "Posa pavimento", quantita: "12", prezzo: "35,50" }] });

describe("progetto e allegati del computo", () => {
  it("conserva il file in locale e lo recupera solo nello stesso ambito", async () => {
    const scope = crypto.randomUUID();
    const meta = await caricaAllegatoLocale(scope, file("foto.png", "image/png"), "foto");
    expect(meta).toMatchObject({ nome: "foto.png", tipo: "foto", includi: true, dimensione: 3 });
    expect(await leggiAllegatoLocale(scope, meta.id)).toBeInstanceOf(NodeBlob);
    expect(await leggiAllegatoLocale("altra-azienda", meta.id)).toBeNull();
    await expect(allegatiDaIncludere("altra-azienda", [meta])).rejects.toThrow(/File non disponibile/);
    expect(await allegatiDaIncludere("altra-azienda", [{ ...meta, includi: false }])).toEqual([]);
  });
  it("rifiuta formati non ammessi e file vuoti", async () => {
    await expect(caricaAllegatoLocale("test", file("programma.exe", "application/octet-stream"), "foto")).rejects.toThrow(/Formato/);
    await expect(caricaAllegatoLocale("test", file("vuoto.pdf", "application/pdf", new Uint8Array()), "planimetria")).rejects.toThrow(/20 MB/);
  });
  it("il PDF include foto/render e una planimetria vettoriale con numerazione unica", async () => {
    const plan = await PDFDocument.create(); const p = plan.addPage([800, 500]);
    p.drawText("TAVOLA DI PROVA LOCALE", { x: 30, y: 450, size: 18, font: await plan.embedFont(StandardFonts.Helvetica) });
    p.drawRectangle({ x: 100, y: 70, width: 550, height: 300, borderWidth: 2, borderColor: rgb(.12, .23, .37), color: rgb(1, 1, 1) });
    p.drawLine({ start: { x: 350, y: 70 }, end: { x: 350, y: 370 }, thickness: 2, color: rgb(.12, .23, .37) });
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==", "base64");
    const blob = await generaDocumentoComputo(voci(), { titolo: "Preventivo con progetto", azienda: "Edilizia in Cloud", presentazione: "preventivo", committente: "Cliente di prova", ivaModalita: "applicata", ivaAliquota: "22" }, [
      { nome: "tavola.pdf", tipo: "planimetria", blob: new NodeBlob([await plan.save()], { type: "application/pdf" }) as unknown as Blob },
      { nome: "render.png", tipo: "render", blob: new NodeBlob([png], { type: "image/png" }) as unknown as Blob },
    ]);
    const bytes = await blob.arrayBuffer(); const pdf = await PDFDocument.load(new Uint8Array(bytes));
    expect(pdf.getPageCount()).toBe(4);
    expect(pdf.getPage(2).getWidth()).toBeGreaterThan(pdf.getPage(2).getHeight());
    if (process.env.COMPUTO_PDF_QA_OUTPUT) {
      await mkdir("output/pdf", { recursive: true }); await writeFile("output/pdf/preventivo-computo-con-allegati.pdf", Buffer.from(bytes));
      await mkdir("output/computo", { recursive: true }); await writeFile("output/computo/planimetria-collaudo.pdf", await plan.save());
    }
  });
  it("un PDF illeggibile non produce un documento parziale", async () => {
    await expect(generaDocumentoComputo(voci(), { titolo: "Test", presentazione: "preventivo" }, [
      { nome: "danneggiato.pdf", tipo: "planimetria", blob: new NodeBlob(["non è un PDF"], { type: "application/pdf" }) as unknown as Blob },
    ])).rejects.toThrow();
  });
});
