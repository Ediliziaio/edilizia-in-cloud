import { describe, it, expect, vi } from "vitest";
import { pdfTextByLines, pdfCoverage, readPdfPages, splitPdfTextAtRows, hasLargePdfImage, type PdfPageLike } from "../../../supabase/functions/_shared/pdfExtraction";

const item = (str: string, x = 0, y = 100) => ({ str, transform: [1, 0, 0, 1, x, y] });
const native = (text: string): PdfPageLike => ({ getTextContent: async () => ({ items: [item(text)] }), getOperatorList: async () => ({ fnArray: [1] }) });
const scan = (header = ""): PdfPageLike => ({ getTextContent: async () => ({ items: header ? [item(header)] : [] }), getOperatorList: async () => ({ fnArray: [99] }) });
const document = (pages: PdfPageLike[]) => ({ numPages: pages.length, getPage: async (n: number) => pages[n - 1] });

describe("page-level PDF coverage", () => {
  it("preserves table rows and column order", () => {
    expect(pdfTextByLines([item("10,50", 150), item("Posa", 0), item("2", 100), item("Totale", 0, 70)])).toBe("Posa\t2\t10,50\nTotale");
  });
  it("honors explicit row breaks and ignores marked content items", () => {
    expect(pdfTextByLines([{ str: "Uno", hasEOL: true }, {}, { str: "Due" }])).toBe("Uno\nDue");
  });
  it("reads a mixed native/scanned document page by page", async () => {
    const ocr = vi.fn(async () => ({ text: "Posa\t2\t10\t20", finishReason: "stop" }));
    const result = await readPdfPages(document([native("Copertina"), scan("Testata"), native("Totale 20")]), { imageOps: [99], maxChars: 1000, ocrPage: ocr });
    expect(ocr).toHaveBeenCalledExactlyOnceWith(2);
    expect(result.coverage).toMatchObject({ complete: true, pages_native: [1, 3], pages_ocr: [2], pages_inspected: 3 });
    expect(result.text).toContain("--- Pagina 2 (ocr) ---");
  });
  it("does not let a long header conceal a scanned table", async () => {
    const result = await readPdfPages(document([scan("Header ".repeat(60))]), { imageOps: [99], maxChars: 2000, ocrPage: async () => ({ text: "tabella", finishReason: "stop" }) });
    expect(result.coverage.pages_ocr).toEqual([1]);
  });
  it("distinguishes a small logo from a large scanned table", () => {
    const config = { imageOps: [9], transformOp: 3, saveOp: 1, restoreOp: 2 };
    const ops = (size: number) => ({ fnArray: [1, 3, 9, 2], argsArray: [[], [size, 0, 0, size, 0, 0], [], []] });
    expect(hasLargePdfImage(ops(30), config, { width: 600, height: 800 })).toBe(false);
    expect(hasLargePdfImage(ops(500), config, { width: 600, height: 800 })).toBe(true);
    expect(hasLargePdfImage({ fnArray: [9] }, config)).toBe(true);
  });
  it("restores graphics transforms after a logo", () => {
    expect(hasLargePdfImage({ fnArray: [1,3,9,2,3,9], argsArray: [[],[30,0,0,30,0,0],[],[],[500,0,0,500,0,0],[]] }, { imageOps: [9], transformOp: 3, saveOp: 1, restoreOp: 2 }, { width: 600, height: 800 })).toBe(true);
  });
  it("detects a scan assembled from smaller image tiles", () => {
    expect(hasLargePdfImage({ fnArray: [1,3,9,2,1,3,9,2], argsArray: [[],[120,0,0,120,0,0],[],[],[],[120,0,0,120,0,0],[],[]] }, { imageOps: [9], transformOp: 3, saveOp: 1, restoreOp: 2 }, { width: 600, height: 800 })).toBe(true);
  });
  it.each(["length", "max_tokens", "content_filter", undefined])("marks interrupted OCR (%s) as incomplete", async finishReason => {
    const result = await readPdfPages(document([scan()]), { imageOps: [99], maxChars: 1000, ocrPage: async () => ({ text: "partial row", finishReason }) });
    expect(result.coverage).toMatchObject({ complete: false, pages_unreadable: [1] });
  });
  it("marks empty OCR as incomplete", async () => {
    expect((await readPdfPages(document([scan()]), { imageOps: [99], maxChars: 1000, ocrPage: async () => ({ text: " ", finishReason: "stop" }) })).coverage.complete).toBe(false);
  });
  it("records scan pages beyond the OCR budget", async () => {
    const result = await readPdfPages(document([scan(), scan(), scan()]), { imageOps: [99], maxChars: 1000, maxOcrPages: 1, ocrPage: async () => ({ text: "row", finishReason: "stop" }) });
    expect(result.coverage).toMatchObject({ complete: false, pages_ocr: [1], pages_unreadable: [2, 3], pages_inspected: 3 });
  });
  it("does not confuse unreadable text with a truly empty page", async () => {
    const blank: PdfPageLike = { getTextContent: async () => ({ items: [] }), getOperatorList: async () => ({ fnArray: [] }) };
    const fail: PdfPageLike = { getTextContent: async () => { throw new Error("bad page"); } };
    expect((await readPdfPages(document([blank, fail]), { imageOps: [99], maxChars: 1000 })).coverage).toMatchObject({ pages_blank: [1], pages_unreadable: [2], complete: false });
  });
  it("marks text truncation even when all pages were visited", async () => {
    const result = await readPdfPages(document([native("Text".repeat(100))]), { imageOps: [], maxChars: 20 });
    expect(result.text).toHaveLength(20);
    expect(result.coverage).toMatchObject({ text_truncated: true, complete: false, pages_inspected: 1 });
  });
  it("records unvisited pages at the page/deadline limit", async () => {
    expect((await readPdfPages(document([native("A"), native("B")]), { imageOps: [], maxChars: 1000, maxPages: 1 })).coverage.pages_unreadable).toEqual([2]);
    expect((await readPdfPages(document([native("A")]), { imageOps: [], maxChars: 1000, deadlineMs: 0 })).coverage.pages_unreadable).toEqual([1]);
  });
  it("cleanup failures do not erase successful coverage", async () => {
    const page = native("row"); page.cleanup = () => { throw new Error("cleanup"); };
    expect((await readPdfPages(document([page]), { imageOps: [], maxChars: 1000 })).coverage.complete).toBe(true);
  });
  it("an empty PDF is not a complete extraction", () => { expect(pdfCoverage([], 0).complete).toBe(false); });
});

describe("PDF text chunking", () => {
  it("does not split or duplicate data rows and repeats source page markers", () => {
    const rows = Array.from({ length: 12 }, (_, i) => `Voce ${i}: ${"x".repeat(30)}`);
    const parts = splitPdfTextAtRows(["--- Pagina 1 (native) ---", ...rows].join("\n"), 120);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every(p => p.length <= 120 && p.startsWith("--- Pagina 1"))).toBe(true);
    expect(parts.flatMap(p => p.split("\n").filter(l => l.startsWith("Voce")))).toEqual(rows);
  });
  it("uses the correct page at a chunk boundary", () => {
    const parts = splitPdfTextAtRows(`--- Pagina 1 ---\n${"A".repeat(70)}\n--- Pagina 2 ---\n${"B".repeat(70)}`, 100);
    expect(parts.at(-1)).toContain("--- Pagina 2 ---");
    expect(parts.at(-1)).not.toContain("Pagina 1");
  });
  it("fails clearly rather than slicing an oversized row", () => {
    expect(() => splitPdfTextAtRows("x".repeat(101), 100)).toThrow(/riga/i);
    expect(() => splitPdfTextAtRows("x", 0)).toThrow();
  });
});
