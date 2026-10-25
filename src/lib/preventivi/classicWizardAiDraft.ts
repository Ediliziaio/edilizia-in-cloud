import { applyAiEditorDraft } from './quoteAiEditorBridge';
import { chatLineIssue, emptyChatDocument, type ChatDocument } from './quoteChatDocument';
import type { QuoteDraft } from './quoteDraft';
import type { QuoteItemPro } from '@/types/quoteItem';
import { assertConfirmedWizardChanges, assertNoNewWizardOverlaps, cloneWizardDraft, type WizardAiChange } from './wizardAiDraft';
const structural = (item: QuoteItemPro) => ['nota', 'subtotale', 'sconto'].includes(item.item_category);
export function classicChatDocument(draft: QuoteDraft) {
  return applyAiEditorDraft(emptyChatDocument(), draft, draft);
}
export function reconcileClassicWizardDraft(base: QuoteDraft, seed: ChatDocument, draft: ChatDocument, vat: number) {
  if (draft.lines.length > 100 || new Set(draft.lines.map(row => row.id)).size !== draft.lines.length) throw new Error('Identità duplicate o troppe voci.');
  const originals = new Map((base.items ?? []).filter(item => !structural(item)).map(item => [item.client_temp_id, item]));
  if (originals.size !== (base.items ?? []).filter(item => !structural(item)).length || originals.has(undefined) || originals.has(null)) throw new Error('Le righe del wizard non hanno ancora identità stabili. Chiudi e riprova.');
  if (seed.lines.some(line => !draft.lines.some(row => row.id === line.id))) throw new Error('Manca una riga originale: nessuna modifica applicata.');
  assertNoNewWizardOverlaps(seed, draft);
  assertConfirmedWizardChanges(seed, draft);
  const changes: WizardAiChange[] = [];
  const edited = new Map<string, QuoteItemPro>(); const added: QuoteItemPro[] = [];
  for (const line of draft.lines) {
    const old = originals.get(line.id), prior = seed.lines.find(row => row.id === line.id);
    if (old && JSON.stringify(prior) === JSON.stringify(line)) { edited.set(line.id, cloneWizardDraft(old)); continue; }
    if (!line.included || line.supersededBy?.length) {
      if (old && !line.supersededBy?.length && chatLineIssue(line)) throw new Error(`La voce esistente «${line.title}» è incompleta. Completala o ripristinala prima di applicare, senza trasformarla in un’esclusione.`);
      if (old) { edited.set(line.id, { ...cloneWizardDraft(old), is_optional: true }); changes.push({ id: line.id, title: old.name, chapter: 'Riga mantenuta come opzionale', kind: 'esclusione', before: { quantity: old.quantity, unit: old.unit_of_measure, price: old.unit_price } }); }
      continue;
    }
    if (chatLineIssue(line) || !Number.isFinite(line.quantity) || !Number.isFinite(line.price) || line.quantity! <= 0 || line.price! <= 0) throw new Error(`Completa «${line.title}» prima di includerla.`);
    if (old && line.unit !== prior?.unit && (old.prezzo_acquisto || old.family_id || old.article_template_id)) throw new Error('Verifica il cambio di unità del prodotto nell’editor nativo prima di applicarlo.');
    const row: QuoteItemPro = { ...(old ?? { item_type: 'service', item_category: 'posa', prezzo_acquisto: 0, mostra_nel_pdf: true, discount_percent: 0, vat_rate: vat }),
      client_temp_id: line.id, name: old && prior?.title === line.title ? old.name : line.title,
      description: old && prior?.description === line.description ? old.description : line.description,
      unit_of_measure: line.unit, quantity: line.quantity!, unit_price: line.price!, is_optional: false, sort_order: 0 };
    if (old) edited.set(line.id, row); else added.push(row);
    changes.push({ id: line.id, title: line.title, kind: old ? 'modifica' : 'aggiunta', chapter: old?.item_category ?? 'Lavorazione',
      ...(old ? { before: { quantity: old.quantity, unit: old.unit_of_measure, price: old.unit_price } } : {}), after: { quantity: row.quantity, unit: row.unit_of_measure, price: row.unit_price } });
  }
  const items = [...(base.items ?? []).map(item => structural(item) ? cloneWizardDraft(item) : edited.get(item.client_temp_id!)!), ...added].map((item, i) => ({ ...item, sort_order: i }));
  // A configured product and its linked installation remain one native chain.
  // Do not accept a parent-only edit with stale installation quantities/prices.
  for (const old of base.items ?? []) {
    if (!old.client_temp_id || structural(old)) continue;
    const current = items.find(item => item.client_temp_id === old.client_temp_id);
    if (!current || current.quantity === old.quantity && current.is_optional === old.is_optional) continue;
    const children = items.filter(item => item.parent_temp_id === old.client_temp_id || old.id && item.parent_item_id === old.id);
    for (const child of children) {
      const originalChild = (base.items ?? []).find(item => item.client_temp_id === child.client_temp_id);
      if (!originalChild || !child.client_temp_id) throw new Error('Legame di posa non verificabile: completa questa modifica nel wizard.');
      if (current.is_optional && !child.is_optional) throw new Error('Il prodotto è escluso ma la posa collegata è ancora inclusa: escludila o rivedi il legame nel wizard.');
      if (current.quantity !== old.quantity && old.quantity > 0) {
        const expected = originalChild.quantity * current.quantity / old.quantity;
        if (Math.abs(child.quantity - expected) > .00001) throw new Error('La quantità del prodotto e quella della posa collegata non sono coerenti: verifica entrambe prima di applicare.');
      }
    }
  }
  return { items, changes, pending: draft.lines.filter(row => !originals.has(row.id) && (!row.included || !!chatLineIssue(row))).length };
}
