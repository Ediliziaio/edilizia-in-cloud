import { describe, expect, it } from 'vitest';
import { applyBathroomBudgetExample, BATHROOM_BUDGET_PACKAGES, hasBathroomBudgetExample, isBathroomBudgetRequest } from '@/lib/preventivi/quoteBathroomBudgetExample';
import { emptyChatDocument, patchChatLine, chatQuoteItems, applyChatResult, type ChatDocument } from '@/lib/preventivi/quoteChatDocument';
import { bagniConfirmedRows, bagniEditorRows, applyBagniEditorRows, type LocalBagniDraft } from '@/lib/preventivi/quoteBagniBridge';
import { calcTotaliComputo } from '@/lib/bagni/calcoli';
import { readLocalQuoteSnapshot } from '@/lib/preventivi/localQuoteMemory';
const company = 'd2000000-0000-4000-a000-000000000002';
const draft: LocalBagniDraft = { modelId: 'completo', clientName: '', iva: null, rows: [] };
const proposal = { id: 'old_floor', title: 'Pavimento', description: 'Descrizione originale', unit: 'm²', quantity: 12, quantityBasis: 'Misura dichiarata', referenceId: null as null };
const previous: ChatDocument = { title: 'Bagno originale', revision: 4, lines: [{ ...proposal, price: 51.24, included: true, manual: true, reference: null, original: proposal }] };
describe('Esempio bagno a prezzo obiettivo, distinto dal prezzario', () => {
  it('riconosce soltanto il comando esplicito di esempio precompilato', () => expect(isBathroomBudgetRequest('Esempio bagno da 12.000 € netti')).toBe(true));
  it.each(['Fammi un bagno da 12000€', 'Genera un bagno da 12.000 euro', 'Prepara bagno con budget 12000'])('non sostituisce la conversazione libera con il caso fisso: %s', text => expect(isBathroomBudgetRequest(text)).toBe(false));
  it.each(['Non farmi un bagno da 12000€', 'Genera un bagno da 12000€ IVA inclusa', 'Genera un bagno da 12000€ lordi', 'Se preparo un bagno da 12000€?', 'Genera un tetto da 12000€', 'Genera bagno da 22000€', 'Genera bagno da 112000€', 'Genera bagno da 12.000,50€'])('non converte importi o intenti diversi: %s', text => expect(isBathroomBudgetRequest(text)).toBe(false));
  it('produce un totale nativo di 12000 netti senza IVA né costi interni inventati', () => {
    const doc = applyBathroomBudgetExample(emptyChatDocument(), 0);
    expect(BATHROOM_BUDGET_PACKAGES.reduce((sum, row) => sum + row[2], 0)).toBe(12000);
    expect(doc.lines).toHaveLength(12); expect(hasBathroomBudgetExample(doc)).toBe(true);
    expect(chatQuoteItems(doc)).toHaveLength(12);
    expect(doc.lines.every(line => line.reference === null && line.referenceId === null && line.manual && line.quantityBasis.includes('non prezzi di prezzario'))).toBe(true);
    const rows = bagniConfirmedRows(doc, company, draft);
    expect(calcTotaliComputo(rows, { iva_pct: 0, sconto_pct: 0 }).imponibile).toBe(12000);
    expect(rows.every(row => row.costo_manodopera === 0 && row.costo_materiali === 0)).toBe(true);
  });
  it('conserva le voci precedenti senza sommarle né perdere lo storico dopo la ricarica', () => {
    const child = { ...previous.lines[0], id: 'old_detail', original: { ...proposal, id: 'old_detail' } };
    const withHistory = { ...previous, lines: [{ ...previous.lines[0], included: false, supersededBy: ['old_detail'] }, child] };
    const doc = applyBathroomBudgetExample(withHistory, 4);
    const raw = { version: 1, document: doc, messages: [] as never[], input: '', sessionId: company, sourceId: null as null, model: null as null, interrupted: false, plan: null as null, rooms: [] as never[], selectedRoom: null as null, rectangle: null as null, bagniDraft: draft };
    const restored = readLocalQuoteSnapshot(JSON.parse(JSON.stringify(raw))).document;
    expect(restored).toEqual(doc);
    expect(restored.lines[0]).toMatchObject({ price: 51.24, original: proposal, included: false });
    expect(chatQuoteItems(restored)).toHaveLength(12);
    expect(calcTotaliComputo(bagniConfirmedRows(restored, company, draft), { iva_pct: 0, sconto_pct: 0 }).imponibile).toBe(12000);
  });
  it('non forza il totale dopo una modifica manuale né sovrascrive una proposta esistente', () => {
    const doc = applyBathroomBudgetExample(previous, 4);
    const line = doc.lines.find(line => !line.supersededBy?.length)!;
    const changed = patchChatLine(doc, line.id, { price: 500 });
    expect(calcTotaliComputo(bagniConfirmedRows(changed, company, draft), { iva_pct: 0, sconto_pct: 0 }).imponibile).toBe(12050);
    expect(() => applyBathroomBudgetExample(changed, changed.revision)).toThrow('già nel computo');
    expect(() => applyBathroomBudgetExample(previous, 3)).toThrow('bozza è cambiata');
  });
  it('resta modificabile nel computo Bagni senza azzerare provenienza e senza IVA presunta', () => {
    const doc = applyBathroomBudgetExample(emptyChatDocument(), 0);
    const rows = bagniEditorRows(doc, company, draft);
    rows[0].prezzo_unitario = 500;
    const changed = applyBagniEditorRows(doc, rows, company, draft);
    expect(hasBathroomBudgetExample(changed.document)).toBe(true);
    expect(changed.document.lines[0]).toMatchObject({ price: 500, included: true, pricing: { origin: 'manual' } });
    expect(changed.draft.iva).toBeNull();
  });
  it('un turno AI non sovrascrive le quote commerciali manuali', () => {
    const doc = applyBathroomBudgetExample(emptyChatDocument(), 0);
    const result = { version: 1, revision: doc.revision, turnId: company, simulated: true, model: 'test', references: [] as never[], turn: { version: 1, message: 'Aggiorno', title: '', questions: [] as never[], searches: [] as never[], warnings: [] as never[], proposals: [{ ...doc.lines[0].original, quantity: 99 }] } };
    expect(applyChatResult(doc, result, company, null).document.lines[0]).toEqual(doc.lines[0]);
  });
});
