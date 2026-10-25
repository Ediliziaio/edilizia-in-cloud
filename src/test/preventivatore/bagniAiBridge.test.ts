import { describe, expect, it } from 'vitest';
import { bagniEditorRows, applyBagniEditorRows, bagniConfirmedRows, readLocalBagniDraft, nativeBagniUnit, type LocalBagniDraft } from '@/lib/preventivi/quoteBagniBridge';
import { localDraftKey } from '@/lib/preventivi/localQuoteMemory';
import type { ChatDocument, ChatLine } from '@/lib/preventivi/quoteChatDocument';
const company = 'd2000000-0000-4000-a000-000000000002';
const metadata: LocalBagniDraft = { modelId: 'completo', clientName: '', iva: null, rows: [] };
const doc = (extra: Partial<ChatLine> = {}): ChatDocument => {
  const proposal = { id: 'floor', title: 'Posa gres', description: 'Sola posa', quantity: 12, unit: 'm²', quantityBasis: 'Misura utente', referenceId: null as string | null };
  return { title: 'Bagno 12 mq', revision: 1, lines: [{ ...proposal, price: null, included: false, manual: false, reference: null, original: proposal, ...extra }] };
};
describe('Adattatore locale computo Bagni ↔ documento canonico', () => {
  it('apre il nativo senza trasformare un prezzo mancante in zero confermato', () => {
    const source = doc(); const rows = bagniEditorRows(source, company, metadata);
    expect(rows[0]).toMatchObject({ unita_misura: 'mq', prezzo_unitario: 0, quantita: 12 });
    const result = applyBagniEditorRows(source, rows, company, metadata);
    expect(result.document.lines[0]).toMatchObject({ unit: 'm²', price: null, included: false });
    expect(bagniConfirmedRows(result.document, company, result.draft)).toEqual([]);
  });
  it('richiede una conferma separata dopo aver modificato prezzo o quantità', () => {
    const source = doc({ price: 40, included: true });
    const rows = bagniEditorRows(source, company, metadata).map(row => ({ ...row, prezzo_unitario: 38, quantita: 14 }));
    const changed = applyBagniEditorRows(source, rows, company, metadata);
    expect(changed.document.lines[0]).toMatchObject({ price: 38, quantity: 14, included: false, manual: true });
    const confirmed = applyBagniEditorRows(changed.document, bagniEditorRows(changed.document, company, changed.draft), company, changed.draft, { id: 'floor', included: true });
    expect(bagniConfirmedRows(confirmed.document, company, confirmed.draft)).toHaveLength(1);
    expect(confirmed.document.lines[0].original).toEqual(source.lines[0].original);
  });
  it('cambiando unità richiede nuovamente quantità e prezzo', () => {
    const source = doc({ price: 40, included: true });
    const rows = bagniEditorRows(source, company, metadata).map(row => ({ ...row, unita_misura: 'cad' as const }));
    expect(applyBagniEditorRows(source, rows, company, metadata).document.lines[0]).toMatchObject({ unit: 'cad', quantity: null, price: null, included: false });
  });
  it('non converte m³ o kWp in pezzi e non cancella le voci non rappresentabili', () => {
    const source = doc({ unit: 'm³', quantity: 2, price: 50, included: true });
    expect(bagniEditorRows(source, company, metadata)).toEqual([]);
    expect(applyBagniEditorRows(source, [], company, metadata).document.lines[0]).toMatchObject({ unit: 'm³', quantity: 2, price: 50 });
    expect(nativeBagniUnit('constructor')).toBeNull();
    expect(nativeBagniUnit('__proto__')).toBeNull();
  });
  it('preserva capitoli e sconti ma non usa prezzi o costi di esempio del modello', () => {
    const source = doc({ price: 40 });
    const rows = bagniEditorRows(source, company, metadata).map(row => ({ ...row, capitolo_nome: 'Finiture', sconto_pct: 5 }));
    const changed = applyBagniEditorRows(source, rows, company, metadata);
    const restored = bagniEditorRows(changed.document, company, readLocalBagniDraft(JSON.parse(JSON.stringify(changed.draft))));
    expect(restored[0]).toMatchObject({ capitolo_nome: 'Finiture', sconto_pct: 5, prezzo_unitario: 40 });
  });
  it('rifiuta righe di un’altra azienda, duplicati e metadati non validi', () => {
    const source = doc(); const rows = bagniEditorRows(source, company, metadata);
    expect(() => applyBagniEditorRows(source, [{ ...rows[0], company_id: 'other' }], company, metadata)).toThrow();
    expect(() => applyBagniEditorRows(source, [rows[0], rows[0]], company, metadata)).toThrow();
    expect(() => readLocalBagniDraft({ ...metadata, iva: -1 })).toThrow();
    expect(() => readLocalBagniDraft({ ...metadata, modelId: 'unknown' })).toThrow();
  });
  it('isola memoria per modello, classico e scenario', () => {
    const scope = { companyId: company, ownerId: '11111111-1111-4111-a111-111111111111', mode: 'plan' as const };
    const keys = [localDraftKey(scope), localDraftKey({ ...scope, flow: 'classico' }), localDraftKey({ ...scope, flow: 'bagni:completo' }), localDraftKey({ ...scope, flow: 'bagni:rinnovo' })];
    expect(new Set(keys).size).toBe(4);
    expect(() => localDraftKey({ ...scope, flow: 'bagni:completo', scenarioId: 'bagno12' })).toThrow();
  });
});
