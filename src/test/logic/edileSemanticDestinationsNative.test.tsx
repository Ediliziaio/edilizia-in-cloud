import React from "react";
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
// The repository's shared setup requires jsdom. Select the native Node renderer
// explicitly instead of the package's browser entry for this buffer regression.
import { renderToBuffer } from "@react-pdf/renderer/lib/react-pdf.js";
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString } from "pdf-lib";
import { DocumentoEdilePDF } from "@/components/preventivi/pdf/DocumentoEdilePDF";
import { FacciatePDF } from "@/components/facciate/facPdfAdapter";
import { buildFacModulePreview, createFullFacTemplate } from "@/lib/moduli-vendita/fullFacModules";
import { edileSectionDestination } from "@/components/preventivi/pdf/sectionDestinations";
import { MODULI_EDILI } from "@/components/preventivi/pdf/moduliEdili";

// Real native pagination, offline text fixture; no backend/enrichment/browser.
function fixture() {
  const data = buildFacModulePreview("qa", createFullFacTemplate({ company_id: "qa" }, "cappotto"), "cappotto");
  const model = data.modello;
  data.azienda.logoUrl = null; data.azienda.logoChiaroUrl = null;
  model.copertina.logoUrl = null; model.copertina.immagineUrl = null;
  model.chiSiamoFotoUrl = null; model.fotoChiusura = null; model.fotoRiempimento = {};
  model.galleriaLavori = []; data.fotoProgetto = [];
  for (const block of Object.values(model.blocchi)) block.foto = [];
  for (const page of model.pagineLibere) page.fotoUrl = null;
  model.condizioniLegali = []; model.conRecesso = false;
  model.blocchi.controlli.titolo = "ANCORACONTROLLO";
  model.blocchi.protezione.titolo = "ANCORAPROTEZIONE";
  return data;
}

async function readNative(element: React.ReactElement) {
  const bytes = await renderToBuffer(element);
  // Base64 crosses the jsdom/Node Uint8Array realms without instanceof issues.
  const document = await PDFDocument.load(bytes.toString("base64"));
  const refs = document.getPages().map(page => page.ref.toString());
  const found = new Map<string, number>();
  const walk = (tree: PDFDict) => {
    const names = tree.lookupMaybe(PDFName.of("Names"), PDFArray);
    if (names) for (let i = 0; i < names.size(); i += 2) {
      const key = names.lookup(i, PDFString).decodeText();
      const destination = names.lookup(i + 1, PDFArray);
      found.set(key, refs.indexOf(destination.get(0).toString()) + 1);
    }
    const kids = tree.lookupMaybe(PDFName.of("Kids"), PDFArray);
    if (kids) for (let i = 0; i < kids.size(); i++) walk(kids.lookup(i, PDFDict));
  };
  const names = document.catalog.lookup(PDFName.of("Names"), PDFDict);
  walk(names.lookup(PDFName.of("Dests"), PDFDict));
  const pages = execFileSync("pdftotext", ["-", "-"], { input: bytes, encoding: "utf8" }).split("\f").filter(text => text.trim());
  const pageOf = (key: string) => found.get(edileSectionDestination(key));
  return { found, pages, pageOf };
}

describe("native metadata survives pagination without editable-title lookup", () => {
  it.each(Object.entries(MODULI_EDILI))("%s has destinations on actual native pages", async (_sector, modulo) => {
    const data = fixture(); data.modulo = modulo;
    const result = await readNative(<DocumentoEdilePDF dati={data} />);
    expect(result.pageOf("cover")).toBe(1);
    for (const [key, title] of [["controlli", "ANCORACONTROLLO"], ["protezione", "ANCORAPROTEZIONE"]]) {
      expect(result.pageOf(key)).toBe(result.pages.findIndex(text => text.includes(title)) + 1);
    }
    expect(result.pageOf("chiusura")).toBeGreaterThan(1);
  });
  it("Facciate uses the same metadata even after reordering and hiding a section", async () => {
    const data = fixture();
    const control = data.modello.ordineCapitoli.find(row => row.chiave === "controlli")!;
    data.modello.ordineCapitoli = [control, ...data.modello.ordineCapitoli.filter(row => row.chiave !== "controlli")];
    data.modello.ordineCapitoli = data.modello.ordineCapitoli.map(row => row.chiave === "protezione" ? { ...row, visibile: false } : row);
    const result = await readNative(<FacciatePDF dati={data} />);
    expect(result.pageOf("controlli")).toBe(result.pages.findIndex(text => text.includes("ANCORACONTROLLO")) + 1);
    expect(result.pageOf("controlli")).toBeLessThan(result.pageOf("piano")!);
    expect(result.pageOf("protezione")).toBeUndefined();
    expect(result.pageOf("recensioni")).toBeUndefined(); // Empty is not an invented page.
  });
  it("long and freely authored sections target their first page, never their continuation", async () => {
    const data = fixture();
    data.modello.mostraChiSiamo = true;
    data.modello.chiSiamoHtml = "<p>AZIENDALUNGA Descrizione di prova del lavoro e dei materiali concordati, con indicazioni complete.</p>".repeat(100);
    data.modello.faq = Array.from({ length: 8 }, (_, index) => ({ domanda: `DOMANDANATIVA${index}`, risposta: `RISPOSTANATIVA${index} ${"Precisazioni sulle opere concordate e sui materiali da scegliere. ".repeat(14)}` }));
    data.modello.pagineLibere = [{ id: "a/b 1", occhiello: "Scheda", titolo: "PAGINALIBERANATIVA", testoHtml: "<p>CONTENUTOLIBERO Informazioni aggiuntive della singola impresa.</p>".repeat(90), fotoUrl: null as null, didascalia: null as null }];
    const result = await readNative(<DocumentoEdilePDF dati={data} />);
    const firstCompany = result.pages.findIndex(text => text.includes("AZIENDALUNGA")) + 1;
    expect(result.pageOf("chiSiamo")).toBe(firstCompany);
    expect(result.pages.filter(text => text.includes("AZIENDALUNGA")).length).toBeGreaterThan(1);
    // The editable free-page title also appears in the opening table of contents.
    expect(result.pageOf("libera:a/b 1")).toBe(result.pages.findIndex(text => text.includes("CONTENUTOLIBERO")) + 1);
    expect(result.pages.filter(text => text.includes("CONTENUTOLIBERO")).length).toBeGreaterThan(1);
    expect(result.pageOf("domande")).toBe(result.pages.findIndex(text => text.includes("DOMANDANATIVA0")) + 1);
    expect(result.pages.findIndex(text => text.includes("DOMANDANATIVA7")) + 1).toBeGreaterThan(result.pageOf("domande")!);
  });
  it("emits distinct legal, signature and withdrawal metadata only when rendered", async () => {
    const data = fixture();
    data.modello.condizioniLegali = [{ tipo: "p", testo: "CONDIZIONINATIVE Testo fittizio di prova della navigazione." }];
    data.modello.conRecesso = true;
    const result = await readNative(<DocumentoEdilePDF dati={data} />);
    expect(result.pageOf("condizioni")).toBe(result.pages.findIndex(text => text.includes("CONDIZIONINATIVE")) + 1);
    expect(result.pageOf("firma")).toBeGreaterThan(result.pageOf("condizioni")!);
    expect(result.pageOf("recesso")).toBeGreaterThan(result.pageOf("firma")!);
  });
});
