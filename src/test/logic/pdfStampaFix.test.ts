import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

describe("fix impaginazione stampa/PDF (audit)", () => {
  describe("generate-native-pdf (fatture)", () => {
    const source = read("supabase/functions/generate-native-pdf/index.ts");

    it("forza i colori in stampa (badge tipo documento visibile)", () => {
      expect(source).toContain("-webkit-print-color-adjust: exact");
      expect(source).toContain("print-color-adjust: exact");
    });

    it("evita spezzature di righe e blocco totali tra le pagine", () => {
      expect(source).toContain("break-inside: avoid");
      expect(source).toContain("page-break-inside: avoid");
      expect(source).toContain('class="totali"');
    });

    it("azzera il padding del body in stampa (niente margini doppi con @page)", () => {
      expect(source).toContain("@media print { body { padding: 0; } }");
    });
  });

  describe("EditorPreviewDialog + PreviewFattura (stampa anteprima)", () => {
    const dialog = read("src/pages/azienda/fatturazione/editor/EditorPreviewDialog.tsx");
    const preview = read("src/components/fatturazione/PreviewFattura.tsx");

    it("forza transform none in stampa (niente fattura all'85%)", () => {
      expect(dialog).toContain(".preview-fattura-scale { transform: none !important; }");
    });

    it("porta il foglio nell'area stampabile (190mm con @page margin 10mm)", () => {
      expect(dialog).toContain("width: 190mm !important");
    });

    it("forza i colori in stampa anche nell'anteprima", () => {
      expect(dialog).toContain("print-color-adjust: exact");
      expect(preview).toContain('printColorAdjust: "exact"');
    });

    it("il wrapper e il foglio hanno le classi target usate dal CSS di stampa", () => {
      expect(preview).toContain("preview-fattura-scale");
      expect(preview).toContain("preview-fattura-sheet");
    });
  });

  describe("altri template edge (colori invisibili in stampa)", () => {
    it("generate-sal-pdf contiene print-color-adjust", () => {
      const source = read("supabase/functions/generate-sal-pdf/index.ts");
      expect(source).toContain("print-color-adjust: exact");
    });

    it("generate-cedolino-pdf contiene print-color-adjust e @page A4", () => {
      const source = read("supabase/functions/generate-cedolino-pdf/index.ts");
      expect(source).toContain("print-color-adjust: exact");
      expect(source).toContain("@page { size: A4; margin: 12mm; }");
    });

    it("generate-giornale-pdf contiene print-color-adjust", () => {
      const source = read("supabase/functions/generate-giornale-pdf/index.ts");
      expect(source).toContain("print-color-adjust: exact");
    });

    it("SicurezzaCantiere dichiara @page A4 nel documento di stampa", () => {
      const source = read("src/pages/azienda/SicurezzaCantiere.tsx");
      expect(source).toContain("@page { size: A4; margin: 15mm; }");
    });
  });

  describe("exportOfferPdf (jsPDF)", () => {
    const source = read("src/lib/pacchetto-custom/exportOfferPdf.ts");

    it("disegna il footer con numerazione su tutte le pagine", () => {
      expect(source).toContain("getNumberOfPages");
      expect(source).toContain("doc.setPage(p)");
      expect(source).toContain("Pagina ${p} di ${totalPages}");
    });

    it("ridisegna l'intestazione tabella dopo ogni addPage", () => {
      expect(source).toContain("drawTableHeader");
      expect(source).toContain("y = drawTableHeader(margin)");
    });

    it("protegge il blocco note dal fine pagina", () => {
      expect(source).toContain("if (y + notes.length * 4 > pageHeight - 50)");
    });
  });

  describe("gps/exportPdf (jsPDF)", () => {
    const source = read("src/lib/gps/exportPdf.ts");

    it("ridisegna l'intestazione colonne dopo ogni addPage", () => {
      expect(source).toContain("disegnaIntestazioneTabella");
      expect(source).toContain("yPos = disegnaIntestazioneTabella(15)");
    });
  });

  describe("CustomerSheetsExportDialog (jsPDF)", () => {
    const source = read("src/components/orders/CustomerSheetsExportDialog.tsx");

    it("le note hanno guardia di fine pagina per riga", () => {
      expect(source).toContain("if (y > 780)");
      expect(source).toContain("y = 40;");
    });
  });

  describe("OrderDiaryTab (jsPDF)", () => {
    const source = read("src/components/orders/OrderDiaryTab.tsx");

    it("tronca i dettagli a 500 caratteri", () => {
      expect(source).toContain("MAX_DETTAGLI_LENGTH = 500");
      expect(source).toContain("truncateDettagli(JSON.stringify(entry.data.payload ?? {}))");
    });

    it("guardia fine pagina anche dentro il loop righe del blocco", () => {
      expect(source).toMatch(/lines\.slice\(1\)\.forEach[\s\S]{0,200}pageHeight - 48/);
    });
  });

  describe("roiSimulatorPdf (jsPDF)", () => {
    const source = read("src/lib/roiSimulatorPdf.ts");

    it("headline CTA con wrap calcolato e sottotitolo sotto l'ultima riga", () => {
      expect(source).toContain("splitTextToSize(ctaHeadline");
      expect(source).toContain("(headlineLines.length - 1) * headlineLineH");
    });
  });
});
