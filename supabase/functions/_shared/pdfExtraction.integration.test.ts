import { PDFDocument, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { extractPdfWithCoverage } from "./pdfExtraction.ts";

function assert(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const pixel = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZeUAAAAASUVORK5CYII="), c => c.charCodeAt(0));
async function fixture(largeScan: boolean) {
  const doc = await PDFDocument.create(), font = await doc.embedFont(StandardFonts.Helvetica);
  const cover = doc.addPage([600,800]); cover.drawText("Computo originale", { x: 20, y: 750, font });
  const page = doc.addPage([600,800]);
  page.drawText("Posa pavimento", { x: 20, y: 730, font });
  page.drawText("2", { x: 300, y: 730, font }); page.drawText("10", { x: 400, y: 730, font });
  const image = await doc.embedPng(pixel);
  page.drawImage(image, { x: 20, y: 50, width: largeScan ? 550 : 30, height: largeScan ? 600 : 30 });
  doc.addPage([600,800]);
  return await doc.save();
}

Deno.test("real mixed PDF: OCR receives only the scanned page and retains native/blank pages", async () => {
  const bytes = await fixture(true), calls: number[] = [];
  const read = await extractPdfWithCoverage(bytes.buffer as ArrayBuffer, { maxChars: 10000, ocrPage: async (page, single) => {
    calls.push(page);
    assert((await PDFDocument.load(single)).getPageCount() === 1, "OCR received a full document");
    return { text: "Posa pavimento\t2\t10\t20", finishReason: "stop" };
  } });
  assert(JSON.stringify(calls) === "[2]", `Unexpected OCR pages: ${calls}`);
  assert(read.coverage.complete && read.coverage.pages_native[0] === 1 && read.coverage.pages_blank[0] === 3, "Mixed PDF coverage incorrect");
});
Deno.test("real native PDF: a small logo does not trigger OCR and rows keep columns", async () => {
  const bytes = await fixture(false);
  const read = await extractPdfWithCoverage(bytes.buffer as ArrayBuffer, { maxChars: 10000, ocrPage: () => Promise.reject(new Error("Unexpected OCR")) });
  assert(read.coverage.complete && read.coverage.pages_ocr.length === 0, "Logo triggered OCR");
  assert(read.text.includes("Posa pavimento\t2\t10"), `Columns were lost: ${read.text}`);
});
Deno.test("real mixed PDF: provider truncation makes coverage incomplete", async () => {
  const bytes = await fixture(true);
  const read = await extractPdfWithCoverage(bytes.buffer as ArrayBuffer, { maxChars: 10000, ocrPage: () => Promise.resolve({ text: "Partial", finishReason: "length" }) });
  assert(!read.coverage.complete && read.coverage.pages_unreadable[0] === 2, "Truncation went undetected");
});
