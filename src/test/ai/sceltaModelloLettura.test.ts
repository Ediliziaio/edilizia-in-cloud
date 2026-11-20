import { describe, expect, it } from "vitest";
import {
  contaPaginePdf, contaPaginePdfCompleto, MODELLO_LETTURA_ACCURATA as SONNET, MODELLO_LETTURA_BREVE as HAIKU,
  primoModelloLettura, serveLetturaAccurata,
} from "../../../supabase/functions/_shared/sceltaModelloLettura";
import { PDFDocument } from "pdf-lib";

const pdfFinto = (pagine: number) =>
  new TextEncoder().encode(`%PDF-1.4\n1 0 obj << /Type /Pages /Count ${pagine} >> endobj\n` +
    Array.from({ length: pagine }, (_, i) => `${i + 2} 0 obj << /Type /Page /Parent 1 0 R >> endobj\n`).join(""));

describe("scelta del modello che legge i contratti (banco del 17/11/2026)", () => {
  it("conta le pagine senza contare /Pages, e null se non le trova", () => {
    expect(contaPaginePdf(pdfFinto(4))).toBe(4);
    expect(contaPaginePdf(new TextEncoder().encode("%PDF-1.7 flussi compressi"))).toBeNull();
  });

  it("preventivo di 4 pagine stampato da PDF (712 kB): Haiku", () => {
    expect(primoModelloLettura({ mime: "application/pdf", byte: 712_117, pagine: 4 })).toBe(HAIKU);
  });

  it("preventivo firmato scansionato (14 pagine, 9 MB), offerta di 23 pagine, contratto di 76: Sonnet", () => {
    expect(primoModelloLettura({ mime: "application/pdf", byte: 9_123_291, pagine: 14 })).toBe(SONNET);
    expect(primoModelloLettura({ mime: "application/pdf", byte: 4_736_134, pagine: 23 })).toBe(SONNET);
    expect(primoModelloLettura({ mime: "application/pdf", byte: 8_612_810, pagine: 76 })).toBe(SONNET);
  });

  it("scansione breve (3 pagine da 2 MB) e foto: Sonnet; testo incollato: Haiku", () => {
    expect(primoModelloLettura({ mime: "application/pdf", byte: 6_000_000, pagine: 3 })).toBe(SONNET);
    expect(primoModelloLettura({ mime: "image/jpeg", byte: 300_000, pagine: null })).toBe(SONNET);
    expect(primoModelloLettura({ mime: "text/plain", byte: 4_000, pagine: null })).toBe(HAIKU);
  });

  it("pagine ignote: il peso non prova che un PDF compresso sia breve", () => {
    expect(primoModelloLettura({ mime: "application/pdf", byte: 900_000, pagine: null })).toBe(SONNET);
    expect(primoModelloLettura({ mime: "application/pdf", byte: 3_000_000, pagine: null })).toBe(SONNET);
  });

  it("si rilegge con Sonnet se la risposta è illeggibile o se c'è il totale senza voci", () => {
    expect(serveLetturaAccurata(null)).toBe(true);
    expect(serveLetturaAccurata({ importo_totale_eur: 28800, voci: [] })).toBe(true);
    expect(serveLetturaAccurata({ importo_totale_eur: 28800, voci: [{ descrizione: "x" }] })).toBe(false);
    expect(serveLetturaAccurata({ importo_totale_eur: null, voci: [] })).toBe(false);
    expect(serveLetturaAccurata({ dati_appalto: { stima_eur: 202018.97 } })).toBe(true);
    expect(serveLetturaAccurata({ dati_appalto: { stima_eur: 202018.97 }, voci: [] })).toBe(true);
  });
  it.each([1, 14])("legge %i pagine compresse senza scambiare un preventivo breve per un PDF di lunghezza ignota", async pagine => {
    const pdf = await PDFDocument.create();
    for (let i = 0; i < pagine; i++) pdf.addPage();
    const bytes = await pdf.save({ useObjectStreams: true });
    expect(contaPaginePdf(bytes)).toBeNull();
    const n = await contaPaginePdfCompleto(bytes, async b => (await PDFDocument.load(b)).getPageCount());
    expect(n).toBe(pagine);
    expect(primoModelloLettura({ mime: "application/pdf", byte: bytes.length, pagine: n })).toBe(pagine === 1 ? HAIKU : SONNET);
  });
  it("un conteggio strutturale fallito conserva il modello accurato, senza indovinare dal peso", async () => {
    const n = await contaPaginePdfCompleto(new Uint8Array(2), async () => { throw new Error("PDF non leggibile"); });
    expect(n).toBeNull();
    expect(primoModelloLettura({ mime: "application/pdf", byte: 2, pagine: n })).toBe(SONNET);
  });
});
