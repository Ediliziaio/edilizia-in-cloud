import { describe, expect, it } from 'vitest';
import { assertConfirmedWizardChanges, computoChatDocument, reconcileComputoDraft, type NativeComputoRow } from '@/lib/preventivi/wizardAiDraft';
import { classicChatDocument, reconcileClassicWizardDraft } from '@/lib/preventivi/classicWizardAiDraft';
import { applyProtectedQuoteEdits } from '@/lib/preventivi/quoteProposalReview';
import { patchChatLine } from '@/lib/preventivi/quoteChatDocument';
import type { QuoteDraft } from '@/lib/preventivi/quoteDraft';

const identity = { companyId: 'demo', projectId: 'test-project' };
const row = { id: 'floor', company_id: identity.companyId, progetto_id: identity.projectId,
  descrizione: 'Pavimento 80×80', descrizione_estesa: 'Fornitura e posa', capitolo_nome: 'Finiture',
  quantita: 64, unita_misura: 'mq', prezzo_unitario: 88, costo_materiali: 0, costo_manodopera: 0,
  sconto_pct: 0, importo: 5632, ordine: 0, fonte: null, listino_voce_id: null,
} as NativeComputoRow;
const classic: QuoteDraft = { items: [{ client_temp_id: 'floor', name: row.descrizione, description: row.descrizione_estesa!,
  item_type: 'service', item_category: 'posa', quantity: 64, unit_of_measure: 'mq', unit_price: 88,
  discount_percent: 0, vat_rate: 10, prezzo_acquisto: 0, is_optional: false, mostra_nel_pdf: true, sort_order: 0 }] };
describe('Il wizard non scambia la revisione di una voce per una eliminazione', () => {
  it.each(['computo', 'classico'])('blocca una modifica AI approvata ma non reinclusa: %s', mode => {
    const seed = mode === 'computo' ? computoChatDocument([row], 'Test') : classicChatDocument(classic);
    const changed = applyProtectedQuoteEdits(seed, [{ ...seed.lines[0].original, title: 'Pavimento 60×60', quantity: 60 }], seed.revision);
    const reconcile = () => mode === 'computo'
      ? reconcileComputoDraft([row], seed, changed, identity)
      : reconcileClassicWizardDraft(classic, seed, changed, 10);
    expect(changed.lines[0].included).toBe(false);
    expect(() => reconcile()).toThrow('modificata ma non inclusa');
    changed.lines[0].included = true;
    expect(() => reconcile()).not.toThrow();
    expect(row.quantita).toBe(64);
  });
  it('continua a consentire una esclusione deliberata senza modifiche', () => {
    const seed = computoChatDocument([row], 'Test');
    expect(() => assertConfirmedWizardChanges(seed, patchChatLine(seed, row.id, { included: false }))).not.toThrow();
  });
  it.each(['missing', 'unpriced', 'excluded', 'superseded'])('non toglie la voce originale con un sostituto %s', mode => {
    const seed = computoChatDocument([row], 'Test');
    const next = structuredClone(seed);
    next.lines[0] = { ...next.lines[0], included: false, supersededBy: ['new-floor'] };
    if (mode !== 'missing') next.lines.push({ ...structuredClone(seed.lines[0]), id: 'new-floor', title: 'Pavimento alternativo',
      price: mode === 'unpriced' ? null : 50, included: mode !== 'excluded', ...(mode === 'superseded' ? { supersededBy: ['other'] } : {}) });
    expect(() => reconcileComputoDraft([row], seed, next, identity)).toThrow('voci sostitutive');
  });
  it('consente la sostituzione atomica quando tutti i dettagli sono completi e inclusi', () => {
    const seed = computoChatDocument([row], 'Test');
    const next = structuredClone(seed);
    next.lines[0] = { ...next.lines[0], included: false, supersededBy: ['new-floor'] };
    next.lines.push({ ...structuredClone(seed.lines[0]), id: 'new-floor', title: 'Pavimento alternativo', price: 50, included: true });
    const result = reconcileComputoDraft([row], seed, next, identity);
    expect(result.rows.map(r => r.id)).toEqual(['new-floor']);
    expect(result.changes.map(r => r.kind)).toEqual(['esclusione', 'aggiunta']);
  });
});
