import type { VariationDraft } from "./variationDraft";
import type { VariationContext } from "./variationDocumentContext";

export const VARIATION_TEMPLATE_COLORS = { "#1e3a5f": "Blu", "#14532d": "Verde", "#9a3412": "Terracotta" };
export type VariationTemplateContent = {
  name: string; document_heading: string; intro_text: string; conditions_text: string;
  payment_terms: string; day_unit: "calendario" | "lavorativi"; primary_color: string;
}
export type VariationTemplateRow = VariationTemplateContent & {
  id: string; company_id: string; revision: number; is_active: boolean; created_at: string; updated_at: string;
}
export const VARIATION_TEMPLATE_TAGS = ["azienda.ragione_sociale", "cliente.nome_completo", "commessa.numero", "cantiere.indirizzo"] as const;
export const blankVariationTemplate = (): VariationTemplateContent => ({ name: "", document_heading: "Proposta di variazione e lavori extra", intro_text: "", conditions_text: "", payment_terms: "", day_unit: "calendario", primary_color: "#1e3a5f" });
export const VARIATION_TEMPLATE_EXAMPLES: VariationTemplateContent[] = [
  { ...blankVariationTemplate(), name: "Lavori extra standard", intro_text: "Proposta di lavori aggiuntivi riferita alla commessa {{commessa.numero}}.", conditions_text: "Le altre condizioni del contratto originario restano invariate. L'esecuzione dei lavori aggiuntivi è subordinata all'approvazione della presente proposta.", payment_terms: "Condizioni di pagamento da concordare prima dell'accettazione." },
  { ...blankVariationTemplate(), name: "Modifica o sostituzione", document_heading: "Proposta di modifica del contratto", intro_text: "La presente proposta riepiloga le modifiche richieste per la commessa {{commessa.numero}}.", conditions_text: "La descrizione dei lavori deve indicare sia le opere sostituite sia le nuove opere. L'importo rappresenta esclusivamente la differenza rispetto al contratto originario.", primary_color: "#14532d" },
  { ...blankVariationTemplate(), name: "Riduzione dei lavori", document_heading: "Proposta di riduzione dei lavori", intro_text: "Proposta di riduzione delle opere previste nella commessa {{commessa.numero}}.", conditions_text: "Le opere escluse e l'importo da sottrarre sono descritti nella proposta. Eventuali lavorazioni già eseguite restano soggette agli accordi del contratto originario.", primary_color: "#9a3412" },
];
export function validateVariationTemplate(raw: VariationTemplateContent): VariationTemplateContent {
  const limits = { name: 120, document_heading: 120, intro_text: 3000, conditions_text: 10000, payment_terms: 3000 };
  const result = blankVariationTemplate();
  for (const key of Object.keys(limits) as (keyof typeof limits)[]) {
    if (typeof raw[key] !== "string" || raw[key].length > limits[key]) throw new Error("Testo del modello non valido o troppo lungo.");
    result[key] = raw[key].trim();
    for (const tag of result[key].matchAll(/{{([^{}]+)}}/g)) {
      if (!VARIATION_TEMPLATE_TAGS.includes(tag[1] as typeof VARIATION_TEMPLATE_TAGS[number])) throw new Error(`Variabile non supportata: ${tag[1]}`);
    }
    if (result[key].replace(/{{[^{}]+}}/g, "").match(/{{|}}/)) throw new Error("Controlla le parentesi delle variabili.");
  }
  if (!result.name || !result.document_heading) throw new Error("Completa nome e titolo del documento.");
  if (!["calendario", "lavorativi"].includes(raw.day_unit) || !Object.prototype.hasOwnProperty.call(VARIATION_TEMPLATE_COLORS, raw.primary_color)) throw new Error("Stile o tipo di giorni non valido.");
  result.day_unit = raw.day_unit; result.primary_color = raw.primary_color;
  return result;
}
/** Copy the reusable terms into this draft. Later template changes cannot rewrite its public terms. */
export function applyVariationTemplate(draft: VariationDraft, raw: VariationTemplateContent, context: VariationContext): VariationDraft {
  const template = validateVariationTemplate(raw);
  const values: Record<string, string | undefined> = { "azienda.ragione_sociale": context.companyName, "cliente.nome_completo": context.customerName, "commessa.numero": context.orderCode, "cantiere.indirizzo": context.siteAddress };
  const resolve = (text: string) => text.replace(/{{([^{}]+)}}/g, (_, tag: string) => {
    if (!values[tag]?.trim()) throw new Error(`Manca il dato per ${tag}: completa la commessa oppure modifica il modello.`);
    return values[tag]!.trim();
  });
  return { ...draft, documentHeading: resolve(template.document_heading), documentColor: template.primary_color,
    documentIntro: resolve(template.intro_text), additionalTerms: resolve(template.conditions_text), paymentTerms: resolve(template.payment_terms),
    dayUnit: Number(draft.days) > 0 ? draft.dayUnit : template.day_unit };
}
