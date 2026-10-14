import { describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { VARIATION_TEMPLATE_EXAMPLES } from "@/lib/orders/variationTemplates";
import { variationTemplateExamplePdf, variationTemplateVisualKey } from "@/lib/orders/variationTemplateExample";
describe("Documento unico per anteprima e allegato", () => {
  it("rappresenta testi, colore e unità di giorni attuali senza dati reali o salvataggi", async () => {
    const model = { ...VARIATION_TEMPLATE_EXAMPLES[0], document_heading: "ESEMPIO - Variante personalizzata", conditions_text: "CONDIZIONE_VISIBILE_NEL_PDF\nCondizioni di esempio da adattare prima dell'accettazione.", primary_color: "#14532d", day_unit: "lavorativi" as const };
    const pdf = await variationTemplateExamplePdf(model);
    const source = pdf.output(); expect(source).toContain("CONDIZIONE_VISIBILE_NEL_PDF"); expect(source).toContain("2 giorni lavorativi"); expect(source).toContain("DA APPROVARE"); expect(source).not.toContain("{{");
    if (process.env.VARIATION_VISUAL_PREVIEW_PROOF) writeFileSync(process.env.VARIATION_VISUAL_PREVIEW_PROOF, Buffer.from(pdf.output("arraybuffer")));
  });
  it("le pagine non dipendono da nome, revisione o metadati della libreria", () => {
    const content = VARIATION_TEMPLATE_EXAMPLES[0];
    expect(variationTemplateVisualKey({ ...content, name: "Un altro nome" })).toBe(variationTemplateVisualKey(content));
    expect(variationTemplateVisualKey({ ...content, primary_color: "#14532d" })).not.toBe(variationTemplateVisualKey(content));
  });
  it("permette una bozza visiva prima di dare un nome alla libreria, ma non inventa un titolo vuoto", async () => {
    await expect(variationTemplateExamplePdf({ ...VARIATION_TEMPLATE_EXAMPLES[0], name: "" })).resolves.toBeDefined();
    await expect(variationTemplateExamplePdf({ ...VARIATION_TEMPLATE_EXAMPLES[0], document_heading: "" })).rejects.toThrow("Completa nome e titolo");
  });
});
