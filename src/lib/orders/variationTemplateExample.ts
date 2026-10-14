import { applyVariationTemplate, type VariationTemplateContent } from "./variationTemplates";
import { emptyVariationDraft, prepareVariation } from "./variationDraft";
import { variationDocumentContext } from "./variationDocumentContext";

/** One real PDF builder for the visual preview and the downloadable example. No data access. */
export async function variationTemplateExamplePdf(content: VariationTemplateContent) {
  const context = { companyName: "Impresa DEMO · dati fittizi", customerName: "Cliente DEMO", orderCode: "COMMESSA-DEMO", siteAddress: "Cantiere dimostrativo", currentNet: 10000, vatRate: 10 };
  const draft = applyVariationTemplate({ ...emptyVariationDraft(), documentCompanyName: context.companyName,
    documentCustomerName: context.customerName, title: "ESEMPIO · opere aggiuntive",
    description: "Opere dimostrative da descrivere nella commessa reale.", amount: "500", days: "2", dayUnit: content.day_unit },
    { ...content, name: content.name.trim() || "Modello non salvato" }, context);
  const { variationProposalPdf } = await import("./variationPreviewPdf");
  return variationProposalPdf(prepareVariation(draft), variationDocumentContext(draft, context));
}

/** Metadata, revision and the library name do not alter the printed document. */
export function variationTemplateVisualKey(content: VariationTemplateContent) {
  return JSON.stringify([content.document_heading, content.intro_text, content.conditions_text,
    content.payment_terms, content.day_unit, content.primary_color]);
}
