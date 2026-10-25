import type { BgnComputoVoce, BgnUnitaMisura } from '@/types/bagni';
import { aiEditorDraft, applyAiEditorDraft } from './quoteAiEditorBridge';
import { chatLineIssue, type ChatDocument } from './quoteChatDocument';
import { formatCurrency } from '@/lib/formatters';

// No template factory/mock preview imports: choosing a model must not load PDF
// renderers or sample prices into the conversation bundle.
export const BAGNI_AI_MODELS = {
  completo: 'Rifacimento completo del bagno', 'vasca-doccia': 'Da vasca a doccia',
  doccia: 'Rifacimento zona doccia', sanitari: 'Sanitari e rubinetteria',
  accessibilita: 'Bagno accessibile', rinnovo: 'Rinnovo estetico',
} as const;
export type BagniAiModel = keyof typeof BAGNI_AI_MODELS;
export type QuoteAiFlow = 'classico' | `bagni:${BagniAiModel}`;
export const isBagniAiModel = (id: string): id is BagniAiModel => Object.hasOwn(BAGNI_AI_MODELS, id);
export function bagniFlowModel(flow?: QuoteAiFlow): BagniAiModel | undefined {
  const id = flow?.startsWith('bagni:') ? flow.slice(6) : '';
  return isBagniAiModel(id) ? id : undefined;
}
export type LocalBagniDraft = {
  modelId: BagniAiModel; clientName: string; iva: number | null;
  rows: Array<{ id: string; chapter: string; discount: number }>;
};
export function readLocalBagniDraft(raw: unknown): LocalBagniDraft {
  const r = raw as LocalBagniDraft;
  if (!r || !isBagniAiModel(r.modelId) || typeof r.clientName !== 'string' || r.clientName.length > 200
    || r.iva !== null && (!Number.isFinite(r.iva) || r.iva < 0 || r.iva > 100)
    || !Array.isArray(r.rows) || r.rows.length > 100) throw new Error('Bozza Bagni locale non valida.');
  const ids = new Set<string>();
  const rows = r.rows.map(row => {
    if (!row || typeof row.id !== 'string' || !/^[a-z\d_-]{1,80}$/i.test(row.id) || ids.has(row.id)
      || typeof row.chapter !== 'string' || row.chapter.length > 200 || !Number.isFinite(row.discount) || row.discount < 0 || row.discount > 100) throw new Error('Capitoli Bagni locali non validi.');
    ids.add(row.id); return { id: row.id, chapter: row.chapter, discount: row.discount };
  });
  return { modelId: r.modelId, clientName: r.clientName, iva: r.iva, rows };
}
export function nativeBagniUnit(unit: string): BgnUnitaMisura | null {
  const key = unit.trim().toLowerCase();
  const units: Record<string, BgnUnitaMisura> = { 'm²': 'mq', m2: 'mq', mq: 'mq', m: 'ml', ml: 'ml', cad: 'cad', pz: 'cad',
    corpo: 'corpo', 'a corpo': 'a corpo', kg: 'kg', h: 'h', ore: 'h' };
  return Object.hasOwn(units, key) ? units[key] : null;
}
export function bagniEditorRows(document: ChatDocument, companyId: string, draft?: LocalBagniDraft): BgnComputoVoce[] {
  const metadata = new Map(draft?.rows.map(row => [row.id, row]));
  return document.lines.filter(line => !line.supersededBy?.length && nativeBagniUnit(line.unit)).map((line, index): BgnComputoVoce => ({
    id: line.id, progetto_id: 'local-ai-bagni', company_id: companyId,
    capitolo_nome: metadata.get(line.id)?.chapter || 'Lavorazioni', descrizione: line.title,
    descrizione_estesa: line.description, unita_misura: nativeBagniUnit(line.unit)!,
    quantita: line.quantity ?? 0, prezzo_unitario: line.price ?? 0,
    sconto_pct: metadata.get(line.id)?.discount ?? 0, costo_materiali: 0, costo_manodopera: 0,
    importo: 0, margine_eur: 0, margine_pct: 0, listino_voce_id: null, ordine: index,
  }));
}
export function applyBagniEditorRows(document: ChatDocument, rows: BgnComputoVoce[], companyId: string, draft: LocalBagniDraft, inclusion?: { id: string; included: boolean }) {
  if (rows.length > 100 || new Set(rows.map(row => row.id)).size !== rows.length
    || rows.some(row => row.company_id !== companyId || row.progetto_id !== 'local-ai-bagni' || !nativeBagniUnit(row.unita_misura))) throw new Error('Identità o unità del computo Bagni non valide.');
  const previous = aiEditorDraft(document);
  const items = rows.map((row, index) => {
    const old = document.lines.find(line => line.id === row.id && !line.supersededBy?.length);
    const unitChanged = !!old && nativeBagniUnit(old.unit) !== row.unita_misura;
    const changed = !old || old.title !== row.descrizione || old.description !== (row.descrizione_estesa ?? '')
      || old.quantity !== (row.quantita || null) || unitChanged;
    return { item_type: 'service' as const, item_category: 'posa' as const, client_temp_id: row.id,
      name: row.descrizione, description: row.descrizione_estesa ?? '',
      quantity: !old || unitChanged ? 0 : row.quantita, unit_price: unitChanged ? 0 : row.prezzo_unitario,
      unit_of_measure: old && !unitChanged ? old.unit : row.unita_misura,
      discount_percent: row.sconto_pct, vat_rate: draft.iva,
      sort_order: index, prezzo_acquisto: 0, mostra_nel_pdf: true,
      // Physical scope and price review are separate. Editing only price or
      // discount updates the live amount without silently removing the work.
      is_optional: inclusion?.id === row.id ? !inclusion.included : changed || !old?.included,
      ai_missing_quantity: !old || unitChanged || row.quantita <= 0, ai_missing_price: unitChanged || row.prezzo_unitario <= 0 };
  });
  // Unsupported units remain in chat, not coerced into pieces or silently deleted.
  const unsupported = previous.items?.filter(item => !nativeBagniUnit(item.unit_of_measure ?? '')) ?? [];
  const next = applyAiEditorDraft(document, { items: [...items, ...unsupported] }, previous, 'Bagni');
  const metadata = readLocalBagniDraft({ ...draft, rows: rows.map(row => ({ id: row.id, chapter: row.capitolo_nome, discount: row.sconto_pct })) });
  return { document: next, draft: metadata };
}
export function bagniConfirmedRows(document: ChatDocument, companyId: string, draft?: LocalBagniDraft) {
  return bagniEditorRows(document, companyId, draft).filter(row => {
    const line = document.lines.find(line => line.id === row.id)!;
    return line.included && !chatLineIssue(line);
  });
}
/** Authoritative values shown separately from LLM prose/action claims. */
export function bagniCurrentValues(document: ChatDocument, draft: LocalBagniDraft): string {
  const lines = document.lines.filter(line => !line.supersededBy?.length);
  return `**Dati del computo al momento della risposta**${lines.length > 6 ? '\n\nPrime 6 voci; le altre restano nell’editor.' : ''}\n\n${lines.slice(0, 6).map(line =>
    `- **${line.title}**: ${line.quantity == null ? 'quantità da definire' : `${line.quantity} ${line.unit}`} · ${line.price == null ? 'prezzo da definire' : `${formatCurrency(line.price)} / ${line.unit}`} · ${line.included ? 'inclusa nel parziale' : 'non inclusa'} · sconto ${draft.rows.find(row => row.id === line.id)?.discount ?? 0}%.`
  ).join('\n')}\n\nIVA: ${draft.iva == null ? 'da definire' : `${draft.iva}% inserita nell’editor`}. Valori della bozza, non prezzi regionali certificati.`;
}
