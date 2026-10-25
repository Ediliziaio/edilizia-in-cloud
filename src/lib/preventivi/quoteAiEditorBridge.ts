import type { QuoteItemPro } from '@/types/quoteItem';
import type { QuoteDraft } from './quoteDraft';
import { chatLineIssue, type ChatDocument, type ChatLine } from './quoteChatDocument';
import type { QuoteChatProposal } from '../../../supabase/functions/_shared/quoteConversation';
import { readQuoteProject, type QuoteProject } from './quoteProject';

/** Local editor sentinel flags: a missing value is never a confirmed zero. */
export type AiEditorItem = QuoteItemPro & { ai_missing_quantity?: boolean; ai_missing_price?: boolean };
const structural = (item: QuoteItemPro) => ['nota', 'subtotale', 'sconto'].includes(item.item_category);
export function aiEditorDraft(document: ChatDocument, metadata?: QuoteDraft, project?: QuoteProject): QuoteDraft {
  const previous = new Map(metadata?.items?.map(item => [item.client_temp_id, item]));
  const items = document.lines.filter(line => !line.supersededBy?.length).map((line, index): AiEditorItem => ({
      item_type: 'service', item_category: 'posa', discount_percent: 0, vat_rate: null,
      prezzo_acquisto: 0, mostra_nel_pdf: true, ...previous.get(line.id),
      id: undefined, client_temp_id: line.id, name: line.title, description: line.description,
      quantity: line.quantity ?? 0, unit_price: line.price ?? 0, unit_of_measure: line.unit,
      sort_order: index, is_optional: !line.included || !!chatLineIssue(line),
      ai_missing_quantity: line.quantity == null, ai_missing_price: line.price == null,
    }));
  // Notes, subtotals and explicit discount rows belong to the classic editor,
  // not to the LLM's list of billable works. Keep them in the same local draft.
  metadata?.items?.forEach((item, index) => { if (structural(item)) items.splice(Math.min(index, items.length), 0, item); });
  return { ...metadata, ...(project ? { notes: project.notes, indirizzoLavori: project.address } : {}), partialQuoteId: null, title: document.title, step: metadata?.step ?? 1, items: items.map((item, index) => ({ ...item, sort_order: index })) };
}

/** Customer billing details are not the property's address. Empty edits are intentional. */
export function applyAiEditorProject(project: QuoteProject, draft: QuoteDraft): QuoteProject {
  return readQuoteProject({ ...project, notes: draft.notes ?? project.notes,
    address: draft.indirizzoLavori ?? project.address });
}

/** Both directions keep identities and original catalogue evidence, not two independent quotes. */
export function applyAiEditorDraft(document: ChatDocument, draft: QuoteDraft, previous?: QuoteDraft, editorLabel = 'classico'): ChatDocument {
  const old = new Map(document.lines.map(line => [line.id, line]));
  const ids = new Set<string>();
  const works = (draft.items ?? []).filter(item => !structural(item));
  if (works.length > 100) throw new Error('Al massimo 100 lavorazioni per questa prova locale.');
  const lines: ChatLine[] = works.map((raw, index) => {
    const item = raw as AiEditorItem;
    const id = item.client_temp_id || `editor-${index}`;
    if (ids.has(id)) throw new Error('Identità duplicate nell’editor: nessuna modifica applicata.');
    ids.add(id);
    const prior = old.get(id);
    const previousItem = previous?.items?.find(item => item.client_temp_id === id);
    const quantity = !item.ai_missing_quantity && Number.isFinite(item.quantity) && item.quantity >= .01 && item.quantity <= 1_000_000 ? item.quantity : null;
    const price = !item.ai_missing_price && Number.isFinite(item.unit_price) && item.unit_price >= .01 && item.unit_price <= 1_000_000 ? item.unit_price : null;
    const proposal: QuoteChatProposal = { id, title: item.name.slice(0, 200), description: item.description.slice(0, 6000),
      unit: (item.unit_of_measure ?? '').slice(0, 24), quantity, quantityBasis: `Quantità inserita nell’editor ${editorLabel}.`, referenceId: null };
    const measuresChanged = !prior || prior.title !== proposal.title || prior.description !== proposal.description || prior.quantity !== quantity || prior.unit !== proposal.unit;
    const changed = measuresChanged || prior?.price !== price
      || !!previousItem && (previousItem.discount_percent !== item.discount_percent || previousItem.vat_rate !== item.vat_rate || previousItem.item_category !== item.item_category);
    const next: ChatLine = { ...proposal, ...prior, ...proposal, referenceId: prior?.referenceId ?? null,
      reference: prior?.reference ?? null, original: prior?.original ?? proposal, price,
      quantityBasis: changed ? proposal.quantityBasis : prior!.quantityBasis,
      manual: changed || prior?.manual === true, included: !item.is_optional };
    if (measuresChanged) { delete next.calculation; delete next.proposedCalculation; }
    if (measuresChanged || prior?.price !== price) delete next.estimate;
    if (prior && prior.price !== price) next.pricing = { origin: 'manual', basis: `Prezzo modificato nell’editor ${editorLabel}; non è una nuova verifica del prezzario.` };
    if (chatLineIssue(next)) next.included = false;
    return next;
  });
  const title = draft.title?.trim() || document.title;
  // Keep split history only while its replacement rows still exist. Deleting a
  // replacement must not leave dangling IDs that invalidate persistent memory.
  const activeIds = new Set(lines.map(line => line.id));
  const history = document.lines.filter(line => line.supersededBy?.length && !activeIds.has(line.id))
    .map(line => ({ ...line, supersededBy: line.supersededBy!.filter(id => activeIds.has(id)) }))
    .filter(line => line.supersededBy.length);
  const next = { title, lines: [...lines, ...history] };
  return JSON.stringify({ title: document.title, lines: document.lines }) === JSON.stringify(next)
    ? document : { ...next, revision: document.revision + 1 };
}
