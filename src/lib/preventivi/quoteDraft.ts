import { z } from "zod";
import type { QuoteItemPro } from "@/types/quoteItem";
import type { BonusLine } from "@/lib/orders/bonusFiscali";
import type { FinancingProposal } from "@/components/marketing/preventivi/QuoteFinancingPanel";

const text = z.string();
const number = z.number().finite();
const flag = z.boolean();
const nullableText = text.nullable();
const item = z.object({
  item_type: z.enum(["product", "service"]),
  item_category: z.enum(["prodotto", "posa", "trasporto", "smaltimento", "nolo", "nota", "subtotale", "sconto"]),
  name: text, description: text, quantity: number, unit_price: number,
  discount_percent: number, vat_rate: number, unit_of_measure: text,
  sort_order: number, prezzo_acquisto: number, mostra_nel_pdf: flag, is_optional: flag,
}).passthrough();

// Versione 2 mantiene anche i campi facoltativi del documento. Le vecchie
// bozze piatte sono leggibili; campi assenti NON resettano i default aziendali.
export const quoteDraftSchema = z.object({
  schemaVersion: z.literal(2).optional(),
  savedAt: text.optional(),
  step: number.int().min(0).max(2).optional(),
  partialQuoteId: nullableText,
  contactId: nullableText, clientName: text, clientEmail: text, clientPhone: text,
  clientCompany: text, clientAddress: text, clientFiscalCode: text, clientVatNumber: text,
  title: text, description: text, validityDays: number, notes: text, internalNotes: text,
  tipoLavoro: text, indirizzoLavori: text, pianoInstallazione: number, kmCantiere: number,
  salespersonId: nullableText, sedeId: nullableText,
  discountPercent: number, prezzoManuale: number.nullable(), prezzoManualeIvaPct: number.nullable(),
  provvigionePct: number, items: z.array(item),
  paymentMethod: text,
  paymentPhases: z.array(z.object({
    label: text, type: z.enum(["deposit", "balance", "financing"]), percent: number, amount: number,
  })),
  bonusLines: z.array(z.object({
    id: text.optional(), position: number, presetId: nullableText, label: text,
    imponibile: number, aliquotaDetrazione: number.nullable(), causale: text, note: nullableText.optional(),
  })),
  selectedRenders: z.array(z.object({
    id: text, result_url: nullableText, render_type: text, session_table: text,
  })),
  selectedMaterials: z.array(text),
  renderUrl: nullableText, renderSessionId: nullableText, renderOriginalUrl: nullableText,
  selectedTemplateId: nullableText,
  layoutOverride: z.enum(["classic", "modern", "minimal", "bold"]).nullable(),
  financingProposal: z.object({
    table_id: text, amount: number, num_installments: number,
    monthly_rate: number, total_due: number, calculation: z.object({
      importo_richiesto: number, numero_rate: number,
      modalita: z.enum(["esatto", "interpolato", "errore"]),
    }).passthrough(),
  }).nullable(),
  pdfPrezziRiga: flag, pdfSoloTotale: flag, pdfSconti: flag, pdfImmagini: flag,
  pdfSchedeTecniche: flag, pdfFirma: flag, pdfMisure: flag, pdfAttributi: flag,
  pdfNoteCliente: flag, pdfCondizioni: flag, pdfWatermarkText: text, pdfCopiaDestinatario: text,
}).partial();

export type QuoteDraft = Omit<z.infer<typeof quoteDraftSchema>,
  "items" | "bonusLines" | "selectedRenders" | "financingProposal"> & {
  items?: QuoteItemPro[];
  bonusLines?: BonusLine[];
  selectedRenders?: { id: string; result_url: string | null; render_type: string; session_table: string }[];
  financingProposal?: FinancingProposal | null;
};

export function readQuoteDraft(raw: string): QuoteDraft {
  const value = quoteDraftSchema.parse(JSON.parse(raw));
  if (!Object.keys(value).some((key) => !["schemaVersion", "savedAt"].includes(key)))
    throw new Error("La bozza non contiene dati riconoscibili.");
  return value as QuoteDraft;
}

export function serializeQuoteDraft(draft: QuoteDraft, now = new Date()): string {
  return JSON.stringify({ ...draft, schemaVersion: 2, savedAt: now.toISOString() });
}
