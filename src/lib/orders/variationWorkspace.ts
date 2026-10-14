import { emptyVariationDraft, prepareVariation, type VariationDraft, type PreparedVariation } from "./variationDraft";
import { variationDocumentContext, type VariationContext } from "./variationDocumentContext";

export const VARIATION_DOCUMENT_BUCKET = "order-variation-documents";
export const isVariationUuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
export interface VariationWorkspace { variation_id: string; company_id: string; order_id: string; revision: number; content: VariationDraft; context: VariationContext; current_document_id: string | null }
export interface VariationDocumentFile { id: string; name: string; path: string; size: number; hash: string; source_id?: string }
export interface VariationDocument { id: string; variation_id: string; company_id: string; order_id: string; source_revision: number; pdf_path: string; pdf_name: string; pdf_size: number; document_hash: string; public_terms: PreparedVariation; context: VariationContext; attachments: VariationDocumentFile[]; created_at: string }

/** Public DTOs are explicit. A caller cannot smuggle a token, status or signature into a draft. */
export function validateVariationWorkspace(raw: unknown, rawContext: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Bozza non valida.");
  const source = raw as Record<string, unknown>;
  const content = emptyVariationDraft();
  const bounds = { title: 120, description: 15000, phase: 180, amount: 30, days: 10, reason: 3000, requester: 200, internalNotes: 3000, estimatedCost: 30,
    contractReference: 500, paymentTerms: 3000, documentCompanyName: 300, documentCompanyDetails: 4000, documentCustomerName: 300, documentCustomerDetails: 4000,
    documentHeading: 120, documentIntro: 3000, additionalTerms: 10000 };
  for (const [key, max] of Object.entries(bounds)) {
    const value = source[key] ?? (content as unknown as Record<string, unknown>)[key] ?? "";
    if (typeof value !== "string" || value.length > max) throw new Error("Un campo della bozza non è valido o è troppo lungo.");
    (content as unknown as Record<string, unknown>)[key] = value;
  }
  if (!["aggiunta", "modifica", "riduzione"].includes(String(source.kind)) || !["corpo", "voci"].includes(String(source.pricing)) || !["calendario", "lavorativi"].includes(String(source.dayUnit))) throw new Error("Tipo di variante, prezzo o giorni non valido.");
  content.kind = source.kind as VariationDraft["kind"]; content.pricing = source.pricing as VariationDraft["pricing"]; content.dayUnit = source.dayUnit as VariationDraft["dayUnit"];
  if (source.documentColor !== undefined) {
    if (!["#1e3a5f", "#14532d", "#9a3412"].includes(String(source.documentColor))) throw new Error("Colore del documento non valido.");
    content.documentColor = String(source.documentColor);
  }
  for (const key of ["phaseId", "templateId"] as const) {
    if (source[key]) { if (!isVariationUuid(source[key])) throw new Error("Riferimento della bozza non valido."); content[key] = source[key]; }
  }
  if (source.templateRevision !== undefined) {
    if (!Number.isSafeInteger(source.templateRevision) || Number(source.templateRevision) < 1) throw new Error("Versione del modello non valida.");
    content.templateRevision = Number(source.templateRevision);
  }
  if (!Array.isArray(source.lines) || source.lines.length > 100) throw new Error("Aggiungi al massimo 100 voci.");
  content.lines = source.lines.map(line => {
    if (!line || typeof line !== "object" || !isVariationUuid(line.id) || typeof line.description !== "string" || line.description.length > 1000 || typeof line.quantity !== "string" || line.quantity.length > 30 || typeof line.price !== "string" || line.price.length > 30) throw new Error("Voce della variante non valida.");
    return { id: line.id, description: line.description, quantity: line.quantity, price: line.price };
  });
  const ids = source.attachmentIds ?? [];
  if (!Array.isArray(ids) || ids.length > 10 || ids.some(id => !isVariationUuid(id)) || new Set(ids).size !== ids.length) throw new Error("Seleziona al massimo 10 allegati diversi.");
  content.attachmentIds = ids;
  if (ids.length && !content.templateId) throw new Error("Gli allegati devono appartenere a un modello selezionato.");
  const input = rawContext && typeof rawContext === "object" && !Array.isArray(rawContext) ? rawContext as Record<string, unknown> : {};
  const context: VariationContext = {};
  for (const key of ["companyName", "companyDetails", "customerName", "customerAddress", "orderCode", "siteAddress"] as const) {
    if (input[key] !== undefined) { if (typeof input[key] !== "string" || input[key].length > 4000) throw new Error("Dati del documento non validi."); context[key] = input[key]; }
  }
  // Economic values are re-read by the server from the real order, never trusted from this DTO.
  return { content, context: variationDocumentContext(content, context) };
}
export function variationDraftPublicTerms(content: VariationDraft): PreparedVariation {
  try { return prepareVariation(content); } catch {
    return { titolo: content.title.trim() || "Bozza variante", descrizione: content.description.trim() || "Bozza da completare", motivazione: null, impatto_economico: 0, impatto_giorni: 0, richiesto_da: null, note_interne: null };
  }
}
export function checkVariationDocument(row: VariationDocument, company: string, order: string, variation: string) {
  const prefix = `${company}/${order}/${variation}/${row.id}/`;
  if (![row.id, company, order, variation].every(isVariationUuid) || row.company_id !== company || row.order_id !== order || row.variation_id !== variation || row.pdf_path !== `${prefix}proposal.pdf` || !/^[a-f0-9]{64}$/.test(row.document_hash) || !Number.isSafeInteger(row.pdf_size) || row.pdf_size < 5 || row.pdf_size > 10 * 1024 * 1024 || !Array.isArray(row.attachments) || row.attachments.length > 10) throw new Error("Documento non verificabile per questa commessa.");
  for (const file of row.attachments) if (!isVariationUuid(file.id) || file.path !== `${prefix}${file.id}.pdf` || !/^[a-f0-9]{64}$/.test(file.hash) || file.size < 5 || file.size > 10 * 1024 * 1024) throw new Error("Allegato del documento non verificabile.");
  return row;
}
