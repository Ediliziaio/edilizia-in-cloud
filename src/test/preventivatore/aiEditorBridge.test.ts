import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { aiEditorDraft, applyAiEditorDraft, type AiEditorItem } from '@/lib/preventivi/quoteAiEditorBridge';
import { readQuoteDraft, serializeQuoteDraft } from '@/lib/preventivi/quoteDraft';
import { localDraftKey } from '@/lib/preventivi/localQuoteMemory';
import { type ChatDocument, type ChatLine } from '@/lib/preventivi/quoteChatDocument';

const line = (extra: Partial<ChatLine> = {}): ChatLine => {
  const proposal: ChatLine['original'] = { id: 'work-1', title: 'Posa pavimento', description: 'Supporto da verificare', quantity: null, unit: 'm²', quantityBasis: 'Da misurare', referenceId: null };
  return { ...proposal, original: proposal, price: null, included: false, manual: false, reference: null, ...extra };
};
const doc = (extra: Partial<ChatLine> = {}): ChatDocument => ({ revision: 3, title: 'Progetto locale', lines: [line(extra)] });
describe('Passaggio al vero editor classico, senza conferme implicite', () => {
  it('la cancellazione dei dettagli non lascia riferimenti storici mancanti nella memoria', () => {
    const child = { ...line(), id: 'child', original: { ...line().original, id: 'child' } };
    const original: ChatDocument = { title: 'Scomposizione', revision: 1, lines: [{ ...line(), supersededBy: ['child'] }, child] };
    const draft = aiEditorDraft(original);
    expect(applyAiEditorDraft(original, { ...draft, items: [] }).lines).toEqual([]);
  });
  it('mantiene i dati mancanti vuoti, non inclusi e leggibili nella memoria', () => {
    const draft = aiEditorDraft(doc());
    const item = draft.items![0] as AiEditorItem;
    expect(item).toMatchObject({ ai_missing_quantity: true, ai_missing_price: true, is_optional: true });
    const read = readQuoteDraft(serializeQuoteDraft(draft));
    const next = applyAiEditorDraft(doc(), read);
    expect(next.lines[0]).toMatchObject({ quantity: null, price: null, included: false });
  });
  it('porta titolo, descrizione, unità, quantità e prezzi cambiati di nuovo alla chat', () => {
    const original = doc({ quantity: 12, price: 40, included: true });
    const draft = aiEditorDraft(original);
    draft.title = 'Bagno aggiornato';
    Object.assign(draft.items![0], { name: 'Posa gres', description: 'Gres fornito dal cliente', quantity: 15, unit_price: 38, unit_of_measure: 'm²' });
    const next = applyAiEditorDraft(original, draft);
    expect(next).toMatchObject({ title: 'Bagno aggiornato', revision: 4 });
    expect(next.lines[0]).toMatchObject({ title: 'Posa gres', quantity: 15, price: 38, manual: true, included: true });
    expect(next.lines[0].original).toEqual(original.lines[0].original);
  });
  it('preserva sconti, IVA e metadati cliente dopo un altro turno della chat', () => {
    const original = doc({ quantity: 12, price: 40, included: true });
    const draft = aiEditorDraft(original, { clientName: 'Cliente test', discountPercent: 5, notes: 'Condizioni da confermare' });
    Object.assign(draft.items![0], { discount_percent: 10, vat_rate: 10 });
    const next = applyAiEditorDraft(original, draft);
    const restored = aiEditorDraft(next, readQuoteDraft(serializeQuoteDraft(draft)));
    expect(restored).toMatchObject({ clientName: 'Cliente test', discountPercent: 5 });
    expect(restored.items![0]).toMatchObject({ discount_percent: 10, vat_rate: 10, client_temp_id: 'work-1' });
  });
  it('non perde il riferimento originale quando cambia manualmente il prezzo', () => {
    const ref = { id: 'ref', sourceId: 'source', sourceName: 'Lombardia', code: 'ABC', unit: 'm²', price: 40, description: 'Voce originale' };
    const original = doc({ quantity: 12, price: 40, reference: ref, referenceId: 'ref' });
    const draft = aiEditorDraft(original);
    draft.items![0].unit_price = 42;
    const next = applyAiEditorDraft(original, draft);
    expect(next.lines[0]).toMatchObject({ price: 42, reference: ref, referenceId: 'ref', manual: true });
  });
  it('non cancella la formula della quantità quando si modifica soltanto il prezzo', () => {
    const calculation = { expression: '3 * 4', result: 12, unit: 'm²' };
    const original = doc({ quantity: 12, price: 40, manual: true, calculation });
    const draft = aiEditorDraft(original);
    draft.items![0].unit_price = 45;
    expect(applyAiEditorDraft(original, draft).lines[0].calculation).toEqual(calculation);
  });
  it('conserva esclusioni, consente cancellazioni e rifiuta identità duplicate', () => {
    const original = doc({ quantity: 12, price: 40, included: false });
    const draft = aiEditorDraft(original);
    expect(applyAiEditorDraft(original, draft).lines[0].included).toBe(false);
    expect(applyAiEditorDraft(original, { ...draft, items: [] }).lines).toEqual([]);
    expect(() => applyAiEditorDraft(original, { ...draft, items: [draft.items![0], draft.items![0]] })).toThrow('duplicate');
  });
  it('conserva note e sconti strutturali senza farli diventare lavorazioni AI', () => {
    const original = doc({ quantity: 12, price: 40, included: true });
    const draft = aiEditorDraft(original);
    draft.items!.push({ ...draft.items![0], client_temp_id: 'discount', item_category: 'sconto', name: 'Sconto concordato', quantity: 1, unit_price: -20 });
    const next = applyAiEditorDraft(original, draft);
    expect(next.lines).toHaveLength(1);
    const restored = aiEditorDraft(next, draft);
    expect(restored.items).toHaveLength(2);
    expect(restored.items![1]).toMatchObject({ item_category: 'sconto', unit_price: -20 });
  });
  it('protegge anche una riga modificata soltanto nello sconto o nell’IVA', () => {
    const original = doc({ quantity: 12, price: 40, included: true });
    const before = aiEditorDraft(original);
    const after = { ...before, items: before.items!.map(item => ({ ...item, discount_percent: 5, vat_rate: 10 })) };
    const next = applyAiEditorDraft(original, after, before);
    expect(next.lines[0].manual).toBe(true);
    expect(next.revision).toBe(4);
  });
  it('non trasforma prezzi negativi o non finiti in voci confermate', () => {
    const draft = aiEditorDraft(doc({ quantity: 12, price: 40 }));
    Object.assign(draft.items![0], { quantity: Infinity, unit_price: -2, is_optional: false });
    expect(applyAiEditorDraft(doc(), draft).lines[0]).toMatchObject({ quantity: null, price: null, included: false });
  });
  it('separa il flusso dai casi di simulazione e dal vecchio progetto principale', () => {
    const scope = { ownerId: '11111111-1111-4111-a111-111111111111', companyId: 'd2000000-0000-4000-a000-000000000002', mode: 'plan' as const };
    expect(localDraftKey({ ...scope, flow: 'classico' })).not.toBe(localDraftKey(scope));
    expect(() => localDraftKey({ ...scope, flow: 'classico', scenarioId: 'bagno12' })).toThrow();
  });
  it('il gestore reale blocca ogni salvataggio/PDF remoto quando è nel flusso locale', async () => {
    const source = ts.createSourceFile('QuoteBuilder.tsx', readFileSync('src/pages/azienda/marketing/QuoteBuilder.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let expression: ts.Expression | undefined;
    const visit = (node: ts.Node) => { if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleSave') expression = node.initializer; ts.forEachChild(node, visit); };
    visit(source);
    expect(expression).toBeDefined();
    const info = vi.fn(); const context = vm.createContext({ localEditor: { initial: {} }, toast: { info } });
    vm.runInContext(ts.transpileModule(`globalThis.save = ${expression!.getText(source)}`, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText, context);
    // No company/user/remote services in this sandbox: reaching them would throw.
    await context.save('bozza', { anteprima: true });
    await context.save('bozza', { autosave: true });
    await context.save('bozza', { complete: true });
    expect(info).toHaveBeenCalledTimes(3);
  });
});
