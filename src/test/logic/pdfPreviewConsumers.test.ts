import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Every shared canvas preview retains its original PDF Blob", () => {
  it.each([
    "src/components/quotes/QuotePdfLivePreview.tsx",
    "src/components/orders/OrderAcceptanceReports.tsx",
    "src/components/orders/VariationTemplatePreview.tsx",
    "src/components/orders/VariationTemplateAttachments.tsx",
    "src/components/preventivi/modules/ModuleDocumentPDF.tsx",
    "src/components/facciate/facPdfAdapter.tsx",
    ...["Bagni","Ristrutturazione","Elettrico","Termoidraulico","Tetti","Piscine","Pavimenti","Climatizzazione"].map(name => `src/hooks/use${name}PDF.ts`),
  ])("%s registers the source instead of relying on fetch(blob:)", file => {
    expect(readFileSync(file, "utf8")).toContain("createPdfPreviewUrl");
  });
  it("gives a reopened or refreshed stored variant its own URL lifetime", () => {
    const source = readFileSync("src/components/orders/VariationLifecycleDialog.tsx", "utf8");
    expect(source).toContain("createPdfPreviewUrl(pdf.blob)");
    expect(source).not.toContain('pdf?.url ?? ""');
  });
});
