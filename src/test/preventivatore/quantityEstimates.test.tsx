import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { calculateQuoteQuantity, readIndicativeEstimate } from '@/lib/preventivi/quoteCalculations';
import { setChatQuantityFormula, setChatIndicativeEstimate, chatEstimateTotals, chatQuoteItems, patchChatLine, applyChatResult, canSelectChatSource, type ChatDocument } from '@/lib/preventivi/quoteChatDocument';
import { readLocalQuoteSnapshot } from '@/lib/preventivi/localQuoteMemory';
import { localSnapshot } from './localPlanFixtures';
import { catalogueIndicativeEstimate } from '@/lib/preventivi/quoteLocalCatalogue';
import { catalogueQueries, assessCatalogueMatch } from '../../../supabase/functions/_shared/quoteCatalogue';
import { QuoteCalculationTools } from '@/components/quotes/dev/QuoteCalculationTools';
import type { QuoteChatResult } from '../../../supabase/functions/_shared/quoteConversation';
import { buildQuoteChatContext } from '@/lib/preventivi/quoteChatContext';
afterEach(cleanup);
const document = (): ChatDocument => { const d = localSnapshot().document; return { ...d, lines: [{ ...d.lines[0], id: 'paint', title: 'Tinteggiatura fascia alta pareti', description: 'Pittura lavabile interna, preparazione separata', unit: 'm²', quantity: 7, price: null, referenceId: null, reference: null, manual: false, included: false, original: { ...d.lines[0].original, id: 'paint' } }] }; };
const estimate = () => readIndicativeEstimate({ low: 10, high: 15.2, unit: 'm²', basis: 'TEST SINTETICO: 0.25–0.35 ore/m² a28–32€/h e3–4€/m² materiali, non prezzi di mercato', assumptions: 'Sola finitura, dati dimostrativi non aziendali; preparazione esclusa', origin: 'user', codes: [] });
describe('Formule locali verificabili, non aritmetica LLM', () => {
  it.each([['3*4-1,2*0,8', 11.04], ['3×4−1,2×0,9', 10.92], ['2*(3+4)*2,2-0,8*2,1-1,2*1', 27.92], ['2*(3+4)*(2,7-2,2)', 7], ['3*4', 12], ['2+3*4', 14], ['(2+3)*4', 20], ['10/4', 2.5], ['-2+3', 1], ['(0.25*28+3)', 10], ['0.35*32+4', 15.2], ['0.1+0.2', .3]])('calcola %s = %s', (formula, result) => expect(calculateQuoteQuantity(formula as string)).toBe(result));
  it.each(['alert(1)', 'Math.random()', '1e4', '1/0', '0/0', '2-4', '', '1..5', '2**3', '2(3)', '(2+3', '2+3)', '12 m²', '4,000,000', '999999999*999999999', '('.repeat(20) + '1' + ')'.repeat(20)])('rifiuta formula non valida %s', value => expect(() => calculateQuoteQuantity(value)).toThrow());
  it('aggiorna una sola voce, conserva il prezzo e richiede conferma; una revisione vecchia non si applica', () => {
    const d = document(); d.lines[0].price = 54.11; d.lines[0].included = true;
    const next = setChatQuantityFormula(d, 'paint', '3*4-1.2*0.9', d.revision);
    expect(next.lines[0]).toMatchObject({ quantity: 10.92, price: 54.11, included: false, manual: true, calculation: { result: 10.92 } });
    expect(d.lines[0].quantity).toBe(7); expect(() => setChatQuantityFormula(next, 'paint', '2', d.revision)).toThrow('superata');
  });
  it('una formula confermata è protetta da proposte successive del modello; modifica manuale elimina la formula precedente', () => {
    const d = setChatQuantityFormula(document(), 'paint', '2*(3+4)*2.2-0.8*2.1-1.2', document().revision);
    const turnId = 'a2000000-0000-4000-a000-000000000001';
    const raw: QuoteChatResult = { version: 1, turnId, revision: d.revision, turn: { version: 1, title: '', message: 'Aggiorno', questions: [], proposals: [{ ...d.lines[0].original, id: 'paint', title: 'Pareti', quantity: 28.12 }], warnings: [], searches: [] }, references: [], model: 'offline', simulated: true };
    expect(applyChatResult(d, raw, turnId, null).document.lines[0].quantity).toBe(27.92);
    expect(patchChatLine(d, 'paint', { quantity: 22 }).lines[0].calculation).toBeUndefined();
  });
});
describe('Stime indicative separate dai prezzi confermati', () => {
  it('calcola intervalli per quantità nota senza creare prezzi, riferimenti o righe nel PDF', () => {
    const d = document(); const next = setChatIndicativeEstimate(d, 'paint', estimate(), d.revision);
    expect(next.lines[0]).toMatchObject({ price: null, included: false, referenceId: null, manual: true });
    expect(chatQuoteItems(next)).toHaveLength(0); expect(chatEstimateTotals(next)).toEqual({ count: 1, low: 70, high: 106.4, unquantified: 0 });
    const context = buildQuoteChatContext(next, '', null, [], null, null);
    expect(context.brief).toContain('solo STIMA, FUORI dal totale confermato'); expect(context.protectedLineIds).toContain('paint');
    expect(patchChatLine(next, 'paint', { included: true }).lines[0].included).toBe(false);
    const missing = patchChatLine(next, 'paint', { quantity: null }); expect(chatEstimateTotals(missing)).toMatchObject({ count: 0, low: 0, high: 0, unquantified: 1 });
    expect(patchChatLine(next, 'paint', { price: 15 }).lines[0].estimate).toBeUndefined();
    expect(patchChatLine(next, 'paint', { description: 'Specifica cambiata' }).lines[0].estimate).toBeUndefined();
  });
  it('rifiuta intervalli invertiti, privi di basi, non finiti o di altre unità', () => {
    for (const patch of [{ low: 16 }, { high: NaN }, { basis: '' }, { assumptions: '' }, { origin: 'model' }, { origin: 'catalogue' }]) expect(() => readIndicativeEstimate({ ...estimate(), ...patch })).toThrow();
    expect(() => setChatIndicativeEstimate(document(), 'paint', { ...estimate(), unit: 'h' }, document().revision)).toThrow();
    const priced = document(); priced.lines[0].price = 20; expect(() => setChatIndicativeEstimate(priced, 'paint', estimate(), priced.revision)).toThrow();
  });
  it('recupera formula e stima nella memoria e rifiuta risultati o inclusioni alterati', () => {
    const s = localSnapshot(); s.document = setChatQuantityFormula(document(), 'paint', '2*(3+4)*.5'.replace('*.5','*0.5'), document().revision); s.document = setChatIndicativeEstimate(s.document, 'paint', estimate(), s.document.revision);
    expect(readLocalQuoteSnapshot(s).document.lines[0]).toMatchObject({ calculation: { result: 7 }, estimate: { low: 10, high: 15.2 } });
    s.document.lines[0].calculation!.result = 99; expect(() => readLocalQuoteSnapshot(s)).toThrow(); s.document.lines[0].calculation!.result = 7;
    s.document.lines[0].included = true; expect(() => readLocalQuoteSnapshot(s)).toThrow();
  });
  it('migra la prima stima locale usando l’edizione fissata nella bozza senza mescolare fonti', () => {
    const s = localSnapshot(); s.sourceId = '9b9bb854-9317-43b0-bab1-d3b706bc4993'; s.document = document();
    s.document.lines[0].estimate = { ...estimate(), origin: 'catalogue', codes: ['TEST.1'] }; s.document.lines[0].manual = true;
    expect(readLocalQuoteSnapshot(s).document.lines[0].estimate?.sourceId).toBe(s.sourceId);
    s.sourceId = null; expect(() => readLocalQuoteSnapshot(s)).toThrow();
  });
  it('calcolo CPU limitato: mille formule non aggiungono chiamate AI o scansioni', () => {
    const started = performance.now(); for (let i = 0; i < 1000; i++) expect(calculateQuoteQuantity('2*(3+4)*2.2-0.8*2.1-1.2')).toBe(27.92);
    const ms = performance.now() - started; console.info('QUOTE_QUANTITY_BENCHMARK', JSON.stringify({ formulas: 1000, ms, scope: 'solo CPU, non misura della latenza globale app/provider' })); expect(ms).toBeLessThan(1500);
  });
  it('stima solo dai prezzi DB recuperati, senza coefficienti, riferimenti inventati o fonti mescolate', () => {
    const row = document().lines[0];
    const ref = { id: 'one', sourceId: '9b9bb854-9317-43b0-bab1-d3b706bc4993', sourceName: 'Fonte test', code: 'TEST.1', description: 'OPERA: Strato di pitturazione lavabile; impiego: interno. — LAVORO: Posa.', unit: 'm²', price: 8 };
    const range = catalogueIndicativeEstimate(row, [ref, { ...ref, id: 'two', code: 'TEST.2', price: 12 }])!;
    expect(range).toMatchObject({ low: 8, high: 12, origin: 'catalogue', sourceId: ref.sourceId, codes: ['TEST.1', 'TEST.2'] });
    const locked = setChatIndicativeEstimate(document(), 'paint', range, document().revision); expect(canSelectChatSource(locked, 'other')).toBe(false); expect(canSelectChatSource(locked, ref.sourceId)).toBe(true);
    expect(catalogueIndicativeEstimate(row, [{ ...ref, description: 'OPERA: Griglia a parete. — LAVORO: Posa.' }])).toBeNull();
    expect(catalogueIndicativeEstimate(row, [ref, { ...ref, id: 'other', sourceId: 'other' }])).toBeNull();
  });
  it('usa sinonimi tecnici delle pitture senza rendere fascia/ambiente termini obbligatori', () => {
    const row = document().lines[0]; const q = catalogueQueries([row.title], [row]); expect(q[0].text).toContain('pitturazione pareti'); expect(q[0].text).toContain('tinteggiatura pareti'); expect(q[0].text).toContain('-fotocatalitico'); expect(q.length).toBeLessThanOrEqual(6);
    expect(q.some(v => /fascia|alta|bagno/.test(v.text))).toBe(false);
    const floor = { ...row, title: 'Rimozione pavimento vecchio' }; expect(assessCatalogueMatch(floor, { id: '1', sourceId: 'x', sourceName: 'Test', code: 'TEST', description: 'OPERA: Strato di rivestimento in piastrelle. — LAVORO: Rimozione.', unit: 'm²', price: 5 }).join()).toContain('oggetto diverso');
  });
  it.each(['fotocatalitico biossido di titanio; funzione: lavabile', 'generico; funzione: semilavabile; lavabilità [n.colpi spazzola] > 4000', 'generico; funzione: non lavabile', 'epossisilossanica; finitura: trasparente; funzione: lavabile'])('non stima la pittura lavabile con alternativa tecnica non richiesta: %s', detail => {
    const ref = { id: 'one', sourceId: 'source', sourceName: 'Fonte test', code: 'TEST.1', description: `OPERA: Strato di pitturazione ${detail}. — LAVORO: Posa.`, unit: 'm²', price: 8 };
    expect(catalogueIndicativeEstimate(document().lines[0], [ref])).toBeNull();
  });
});
describe('Strumenti dentro la chat', () => {
  it('verifica prima, applica soltanto con conferma e blocca una preview diventata vecchia', () => {
    const onFormula = vi.fn(); const props = { mode: 'quantity' as const, document: document(), disabled: false, onFormula, onEstimate: vi.fn(), onSearchEstimate: vi.fn() };
    const view = render(<QuoteCalculationTools {...props} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Formula della quantità' }), { target: { value: '2*(3+4)*2.2-0.8*2.1-1.2' } }); fireEvent.click(screen.getByText('Verifica formula'));
    expect(screen.getByRole('status')).toHaveTextContent('27,92'); expect(onFormula).not.toHaveBeenCalled();
    view.rerender(<QuoteCalculationTools {...props} document={{ ...props.document, revision: props.document.revision + 1 }} />);
    expect(screen.getByText('Conferma quantità calcolata')).toBeDisabled();
  });
  it('analisi costi sintetica esplicita: software calcola l’intervallo, salvataggio ancora separato', () => {
    const onEstimate = vi.fn(); render(<QuoteCalculationTools mode="estimate" document={document()} disabled={false} onFormula={vi.fn()} onEstimate={onEstimate} onSearchEstimate={vi.fn()} />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Stima minimo unitario' }), { target: { value: '0.25*28+3' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Stima massimo unitario' }), { target: { value: '0.35*32+4' } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Origine della stima' }), { target: { value: estimate().basis } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Ipotesi della stima' }), { target: { value: estimate().assumptions } });
    fireEvent.click(screen.getByText('Salva solo come stima indicativa'));
    expect(onEstimate).toHaveBeenCalledWith('paint', expect.objectContaining({ low: 10, high: 15.2, origin: 'user' }), document().revision);
  });
});
