import type { ChatDocument, ChatLine } from './quoteChatDocument';
import { readQuoteChatProposal, type QuoteChatProposal } from '../../../supabase/functions/_shared/quoteConversation';
import { readPreliminaryQuoteBudget, type PreliminaryQuoteBudget } from '../../../supabase/functions/_shared/quoteAdvanced';
import { unitaCompatibili } from '@/lib/prezzario/confronto';
import { quoteBudgetOverlaps } from './quoteBudgetQuality';
export type QuotePriceProvenance = { origin: 'manual' | 'company' | 'supplier' | 'ai-estimate' | 'demo'; basis: string; low?: number; high?: number };
export function readQuotePriceProvenance(raw: unknown): QuotePriceProvenance {
  const p = raw as QuotePriceProvenance;
  if (!p || !['manual', 'company', 'supplier', 'ai-estimate', 'demo'].includes(p.origin) || typeof p.basis !== 'string' || !p.basis.trim() || p.basis.length > 1000
    || p.low != null && (!Number.isFinite(p.low) || p.low < .01 || p.low > 1e9) || p.high != null && (!Number.isFinite(p.high) || p.high < .01 || p.high > 1e9)
    || (p.low == null) !== (p.high == null) || p.low != null && p.high! < p.low) throw new Error('Provenienza prezzo non valida.');
  return { origin: p.origin, basis: p.basis, ...(p.low == null ? {} : { low: p.low, high: p.high }) };
}
export function quotePriceLabel(line: ChatLine): string {
  if (line.price == null) return 'Prezzo da completare';
  if (line.pricing) return ({ manual: 'Prezzo manuale', company: 'Prezzo aziendale dichiarato', supplier: 'Offerta fornitore dichiarata', 'ai-estimate': 'Stima AI indicativa', demo: 'Esempio dimostrativo' })[line.pricing.origin];
  if (line.original.quantityBasis.startsWith('ESEMPIO A BUDGET')) return 'Esempio dimostrativo';
  if (line.reference && line.price === line.reference.price) return 'Riferimento di prezzario · corrispondenza da verificare';
  return 'Prezzo manuale · provenienza da verificare';
}
export function quoteHasIndicativePrices(doc: ChatDocument) {
  return doc.lines.some(l => !l.supersededBy?.length && (l.pricing?.origin === 'ai-estimate' || l.pricing?.origin === 'demo' || l.original.quantityBasis.startsWith('ESEMPIO A BUDGET')));
}
export type ProtectedQuoteEdit = { proposal: QuoteChatProposal; fields: Array<'title' | 'description' | 'quantity' | 'unit'> };
export function protectedQuoteEdits(doc: ChatDocument, proposals: QuoteChatProposal[]): ProtectedQuoteEdit[] {
  return proposals.flatMap(raw => {
    const proposal = readQuoteChatProposal(raw); const previous = doc.lines.find(l => l.id === proposal.id && l.manual && !l.supersededBy?.length);
    if (!previous) return [];
    const fields = (['title', 'description', 'quantity', 'unit'] as const).filter(field => previous[field] !== proposal[field]);
    return fields.length ? [{ proposal, fields }] : [];
  }).slice(0, 30);
}
/** Same-ID proposal + explicit revision-bound human approval. Never LLM prices. */
export function applyProtectedQuoteEdits(doc: ChatDocument, proposals: QuoteChatProposal[], revision: number): ChatDocument {
  if (doc.revision !== revision) throw new Error('Modifiche superate: chiedi una nuova proposta sulle voci attuali.');
  const edits = protectedQuoteEdits(doc, proposals);
  if (!edits.length) throw new Error('Nessuna modifica applicabile alle righe protette.');
  return { ...doc, revision: doc.revision + 1, lines: doc.lines.map(line => {
    const edit = edits.find(e => e.proposal.id === line.id); if (!edit) return line;
    const sameUnit = unitaCompatibili(line.unit, edit.proposal.unit);
    return { ...line, title: edit.proposal.title, description: edit.proposal.description, unit: edit.proposal.unit, quantity: edit.proposal.quantity,
      price: sameUnit ? line.price : null, referenceId: sameUnit ? line.referenceId : null, reference: sameUnit ? line.reference : null,
      pricing: sameUnit ? line.pricing : undefined, included: false, manual: true, calculation: undefined, proposedCalculation: undefined, estimate: undefined,
      quantityBasis: `Modifica proposta dall’AI e approvata dall’utente: ${edit.proposal.quantityBasis}`.slice(0, 600) };
  }) };
}
/** Explicitly creates a commercial working draft from AI ranges. It is not a
 * catalogue match, does not replace technical detail or prove profitability. */
export function indicativeBudgetProposal(doc: ChatDocument, raw: PreliminaryQuoteBudget, revision: number, commonNotesStoredSeparately = false): ChatDocument {
  if (revision !== doc.revision) throw new Error('Il budget non corrisponde più alla bozza: aggiornalo prima di convertirlo.');
  const budget = readPreliminaryQuoteBudget(raw);
  const overlaps = quoteBudgetOverlaps(budget);
  if (overlaps.length) throw new Error(`Budget da chiarire prima della conversione: ${overlaps.join(' ')}`);
  if (!budget.groups.length || doc.lines.length + budget.groups.length > 100) throw new Error('Budget vuoto o bozza oltre limite: salva una versione e suddividi il progetto.');
  const lines: ChatLine[] = budget.groups.map((group, index) => {
    const price = Math.round((group.low + group.high) / 2 * 100) / 100;
    if (price < .01 || price > 1_000_000) throw new Error('Importo di capitolo fuori dai limiti del computo: suddividi il budget prima di convertirlo.');
    const proposal: QuoteChatProposal = { id: `budget_ai_r${revision}_${index}`, title: group.label.slice(0, 200), description: (commonNotesStoredSeparately ? group.basis : `${group.basis}\nIpotesi: ${budget.assumptions.join('; ')}\nEsclusioni: ${budget.exclusions.join('; ') || 'da definire'}`).slice(0, 3000), quantity: 1, unit: 'a corpo', referenceId: null, quantityBasis: '1 pacchetto preliminare AI: non computo metrico verificato. Intervallo originale conservato nella provenienza prezzo.' };
    return { ...proposal, original: proposal, reference: null as ChatLine['reference'], price, included: true, manual: true,
      pricing: { origin: 'ai-estimate', basis: group.basis.slice(0, 1000), low: group.low, high: group.high } };
  });
  const ids = lines.map(l => l.id);
  return { title: `PROPOSTA INDICATIVA · ${budget.scope}`.slice(0, 200), revision: revision + 1, lines: [...doc.lines.map(l => ({ ...l, included: false, supersededBy: ids })), ...lines] };
}
