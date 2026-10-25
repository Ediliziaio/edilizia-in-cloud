import type { ChatDocument } from './quoteChatDocument';
import type { PreliminaryQuoteBudget } from '../../../supabase/functions/_shared/quoteAdvanced';
export function quoteBudgetNotes(budget: PreliminaryQuoteBudget) {
  return `Ipotesi del budget preliminare (non computo verificato):\n${budget.assumptions.map(a => `• ${a}`).join('\n')}\nEsclusioni:\n${budget.exclusions.map(a => `• ${a}`).join('\n') || 'Da definire'}`;
}
/** Presentation-only upgrade for older AI packages. Preserve the original row,
 * move identical global notes below the table instead of repeating every row. */
export function quoteDocumentNotes(doc: ChatDocument, notes = '', proposalNotes = '') {
  const global = new Set([notes, proposalNotes].filter(Boolean));
  const descriptions = new Map<string, string>();
  for (const row of doc.lines.filter(r => !r.supersededBy?.length && r.included)) {
    const marker = row.pricing?.origin === 'ai-estimate' ? row.description.indexOf('\nIpotesi:') : -1;
    descriptions.set(row.id, marker < 0 ? row.description : row.description.slice(0, marker));
    if (marker >= 0) global.add(row.description.slice(marker + 1));
  }
  return { descriptions, notes: [...global].join('\n\n') };
}
