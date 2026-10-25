import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { proposedQuantityFormula, QUOTE_FORMULA_REQUEST } from '@/lib/preventivi/quoteCalculations';
import { applyChatResult, chatQuoteItems, setChatQuantityFormula, patchChatLine, type ChatDocument } from '@/lib/preventivi/quoteChatDocument';
import { localSnapshot } from './localPlanFixtures';
import { readLocalQuoteSnapshot } from '@/lib/preventivi/localQuoteMemory';
import { QuoteFormulaSuggestions } from '@/components/quotes/dev/QuoteFormulaSuggestions';
import { quoteActionReceipt } from '@/lib/preventivi/quoteActionReceipt';
import { QuoteCatalogueMessage } from '@/components/quotes/dev/QuoteCatalogueMessage';
import { assessCatalogueMatch, catalogueQueries } from '../../../supabase/functions/_shared/quoteCatalogue';
import { quoteTurnIsReadOnly } from '../../../supabase/functions/_shared/quoteScopeMemory';
import type { QuoteChatResult, QuoteChatReference } from '../../../supabase/functions/_shared/quoteConversation';
afterEach(cleanup);
const uid = 'a2000000-0000-4000-a000-000000000001';
const doc = (): ChatDocument => { const d = localSnapshot().document; return { ...d, lines: [{ ...d.lines[0], price: 54.11, quantity: 10.92, manual: true, included: true }] }; };
function result(d: ChatDocument, basis = 'FORMULA: 3*4-1.2*0.9; DATI: nuovo piatto120×90, misure da controllare'): QuoteChatResult { return { version: 1, turnId: uid, revision: d.revision, references: [], model: 'offline', simulated: true, turn: { version: 1, title: '', message: 'Formule da confermare', questions: [], searches: [], warnings: [], proposals: [{ ...d.lines[0].original, id: d.lines[0].id, quantity: 999, referenceId: null, quantityBasis: basis }] } }; }
describe('Formula proposta non equivale ad approvazione della quantità', () => {
  it('il pulsante non viene classificato dal vecchio endpoint come sola spiegazione', () => { expect(quoteTurnIsReadOnly(QUOTE_FORMULA_REQUEST)).toBe(false); expect(quoteTurnIsReadOnly('Solo spiegazione: ipotesi di formula')).toBe(true); });
  it('mantiene prezzo, quantità e inclusione delle righe protette; salva soltanto la proposta', () => {
    const d = doc(), next = applyChatResult(d, result(d), uid, null).document;
    expect(next.lines[0]).toMatchObject({ price: 54.11, quantity: 10.92, included: true, proposedCalculation: { result: 10.92 } });
    expect(chatQuoteItems(next)).toHaveLength(1);
    const confirmed = setChatQuantityFormula(next, next.lines[0].id, next.lines[0].proposedCalculation!.expression, next.revision);
    expect(confirmed.lines[0]).toMatchObject({ quantity: 10.92, price: 54.11, included: false, calculation: { result: 10.92 } }); expect(confirmed.lines[0].proposedCalculation).toBeUndefined();
    expect(() => setChatQuantityFormula(next, next.lines[0].id, '2', d.revision)).toThrow();
  });
  it('ignora il risultato numerico inventato dal modello e blocca l’inclusione della formula nuova', () => {
    const d = doc(); d.lines[0].manual = false; d.lines[0].quantity = null; d.lines[0].included = false;
    const next = applyChatResult(d, result(d), uid, null).document; expect(next.lines[0].quantity).toBeNull(); expect(next.lines[0].proposedCalculation?.result).toBe(10.92);
    expect(patchChatLine(next, next.lines[0].id, { included: true }).lines[0].included).toBe(false);
  });
  it('proporre una formula non cambia inclusione o riferimenti neppure per righe non manuali', () => {
    const d = doc(); d.lines[0].manual = false;
    const applied = applyChatResult(d, result(d), uid, null).document;
    expect(applied.lines[0]).toMatchObject({ quantity: 10.92, price: 54.11, included: true, manual: false, proposedCalculation: { result: 10.92 } });
    expect(applied.lines[0].original).toEqual(d.lines[0].original);
    const wrongUnit = result(d); wrongUnit.turn.proposals[0].unit = 'm³';
    expect(applyChatResult(d, wrongUnit, uid, null).document.lines).toEqual(d.lines);
  });
  it('il riscontro distingue una formula proposta da una quantità modificata', () => {
    const d = doc(), r = result(d), next = applyChatResult(d, r, uid, null).document;
    const receipt = quoteActionReceipt(d, next, r.turn);
    expect(receipt).toContain('nessuna nuova quantità applicata');
    expect(receipt).not.toContain('Le proposte modificate sono da confermare prima di includerle');
  });
  it.each(['FORMULA: eval(1); DATI: inventati', 'FORMULA: 1/0', 'FORMULA: 2-4'])('non applica formule malformate %s', basis => {
    const d = doc(); expect(applyChatResult(d, result(d, basis), uid, null).document.lines[0]).toMatchObject({ quantity: 10.92, price: 54.11, included: true });
    expect(() => proposedQuantityFormula(basis, 'm²')).toThrow();
  });
  it('scarta l’intera proposta con formula invalida anche per voci non protette o nuove', () => {
    const d = doc(); d.lines[0].manual = false;
    const r = result(d, 'FORMULA: 1/0; DATI: errore'); r.turn.proposals[0].unit = 'cad';
    expect(applyChatResult(d, r, uid, null).document.lines).toEqual(d.lines);
    const fresh: ChatDocument = { ...d, lines: [] }; expect(applyChatResult(fresh, r, uid, null).document.lines).toEqual([]);
  });
  it('riconosce solo il formato esplicito, non comandi o prosa generica', () => { expect(proposedQuantityFormula('Esegui questo codice: 2*3', 'm²')).toBeNull(); expect(() => proposedQuantityFormula('FORMULA: 2*3', '')).toThrow(); });
  it('recupera la proposta senza promuoverla a formula confermata', () => {
    const s = localSnapshot(); s.document = applyChatResult(doc(), result(doc()), uid, null).document;
    expect(readLocalQuoteSnapshot(s).document.lines[0].proposedCalculation?.result).toBe(10.92);
    s.document.lines[0].proposedCalculation!.result = 999; expect(() => readLocalQuoteSnapshot(s)).toThrow();
  });
  it('conserva la provenienza sintetica e le detrazioni dopo conferma e salvataggio', () => {
    const s = localSnapshot(), d = doc();
    const pending = applyChatResult(d, result(d, 'FORMULA: 10.92; DATI: prova sintetica, non rilievo reale'), uid, null).document;
    s.document = setChatQuantityFormula(pending, pending.lines[0].id, '10.92', pending.revision);
    expect(readLocalQuoteSnapshot(s).document.lines[0].quantityBasis).toContain('prova sintetica, non rilievo reale');
  });
  it('presenta conferma e scarto distinti nella chat e passa la revisione corrente', () => {
    const d = applyChatResult(doc(), result(doc()), uid, null).document, confirm = vi.fn(), dismiss = vi.fn();
    render(<QuoteFormulaSuggestions document={d} disabled={false} onConfirm={confirm} onDismiss={dismiss} />);
    expect(screen.getByRole('region')).toHaveTextContent('nessuna quantità applicata'); fireEvent.click(screen.getByText('Conferma formula voce 1')); expect(confirm).toHaveBeenCalledWith(d.lines[0].id, d.revision);
    fireEvent.click(screen.getByText('Scarta formula voce 1')); expect(dismiss).toHaveBeenCalledWith(d.lines[0].id, d.revision);
  });
});
describe('Listino e inclusioni: nessuna doppia posa dei sanitari', () => {
  const ref: QuoteChatReference = { id: uid, sourceId: uid, sourceName: 'Fonte test', code: 'LOM252.OC.TEST', unit: 'cad', price: 300, description: 'OPERA: Apparecchio sanitario vaso WC a pavimento. — LAVORO: Posa. Incluso: fissaggio e collegamento.' };
  const p = { ...doc().lines[0].original, title: 'Fornitura WC a pavimento', description: 'Sola fornitura', unit: 'cad' };
  it('rifiuta opera compiuta con posa quando il montaggio è computato separatamente', () => { expect(assessCatalogueMatch(p, ref).join()).toContain('comprende anche posa'); expect(assessCatalogueMatch(p, { ...ref, code: 'LOM252.RM.TEST', description: 'Apparecchio sanitario vaso WC a pavimento, sola fornitura.' })).toEqual([]); });
  it('non trasforma un lavabo senza mobile o un sanitario sospeso nel prodotto richiesto', () => {
    expect(assessCatalogueMatch({ ...p, title: 'Fornitura lavabo su mobile', description: '' }, { ...ref, code: 'LOM252.RM.TEST', description: 'Apparecchio sanitario lavabo, sola fornitura.' }).join()).toContain('mobile lavabo');
    expect(assessCatalogueMatch(p, { ...ref, code: 'LOM252.RM.TEST', description: 'Vaso WC sospeso, sola fornitura.' }).join()).toContain('sospeso');
  });
  it('WC breve e rimozione sanitari generano query tecniche, non pavimenti nuovi', () => {
    expect(catalogueQueries(['WC'], []).map(q => q.text)).toContain('vaso sanitario'); expect(catalogueQueries(['rimozione apparecchi sanitari'], []).every(q => q.text.startsWith('rimozione'))).toBe(true);
  });
  it('non scambia la demolizione dei tramezzi per rimozione delle piastrelle', () => {
    expect(assessCatalogueMatch({ ...p, title: 'Rimozione rivestimenti vecchi', description: '', unit: 'm²' }, { ...ref, unit: 'm²', description: 'OPERA: Sistema di muratura, lastre di gesso, tramezzi. — LAVORO: Demolizione. Incluso: rivestimenti.' }).join()).toContain('non documentati nell’oggetto');
    expect(catalogueQueries(['rivestimenti gres satinato'], []).map(q => q.text)).toContain('rivestimento gres');
  });
  it('non prezza WC con caldaie, bidet con combinati, piatto rialzato con filo pavimento o lavabo con mobile escluso', () => {
    const rm = { ...ref, code: 'LOM252.RM.TEST' };
    expect(assessCatalogueMatch(p, { ...rm, description: 'Caldaia a gas; funzione: produzione acqua calda sanitaria. Incluso: vaso di espansione.' }).join()).toContain('WC/vaso sanitario non documentato');
    expect(assessCatalogueMatch({ ...p, title: 'Fornitura bidet a pavimento' }, { ...rm, description: 'Vaso-bidet monoblocco di ceramica.' }).join()).toContain('combinato');
    expect(assessCatalogueMatch({ ...p, title: 'Fornitura lavabo su mobile' }, { ...rm, description: 'Lavabo da semi-incasso; Escluso: mobile e rubinetteria.' }).join()).toContain('mobile lavabo non documentato');
    const shower = assessCatalogueMatch({ ...p, title: 'Fornitura piatto doccia con box', description: 'Piatto rialzato 120×90 cm' }, { ...rm, description: 'Piatto doccia a filo pavimento di resina, quadrato 80×80 cm.' }).join();
    expect(shower).toContain('rialzato'); expect(shower).toContain('box doccia non compreso');
    expect(catalogueQueries(['Impermeabilizzazione area doccia'], []).map(q => q.text)).toContain('impermeabilizzazione doccia');
  });
  it('non prezza preparazione, guaina e impianto composito con un materiale diverso o una sola componente', () => {
    const r = { ...ref, unit: 'm²', description: 'OPERA: Strato di pavimentazione in piastrelle. — LAVORO: Posa.' };
    expect(assessCatalogueMatch({ ...p, title: 'Preparazione supporti e formazione letto di posa', description: '', unit: 'm²' }, r).join()).toContain('voce composita');
    expect(assessCatalogueMatch({ ...p, title: 'Impermeabilizzazione piatto doccia', description: '', unit: 'm²' }, { ...r, description: 'OPERA: Strato di verniciatura poliuretanica; finitura semilucida.' }).join()).toContain('impermeabilizzazione non documentata');
    expect(assessCatalogueMatch({ ...p, title: 'Rifacimento impianto idrico e scarichi', description: '', unit: 'm' }, { ...r, unit: 'm', description: 'OPERA: Tubazione di scarico.' }).join()).toContain('voce composita');
  });
  it('mostra anche le esclusioni dopo il limite della vecchia anteprima troncata', () => {
    const description = `OPERA: Vaso sanitario. ${'Informazioni tecniche. '.repeat(80)} Escluso: mobile e rubinetteria.`;
    render(<QuoteCatalogueMessage content={`Ricerca\n\n**Risultato 1 · ${ref.code}**\nFonte · cad · 300EUR\nOPERA: Vaso…\nCandidato da verificare.`} references={[{ ...ref, description }]} disabled={false} onAction={vi.fn()} />);
    fireEvent.click(screen.getByText('Codice, fonte e descrizione originale')); expect(screen.getByText(/Escluso: mobile e rubinetteria/)).toBeVisible();
  });
});
