import { describe, expect, it } from 'vitest';
import { assessQuoteRequest, asksQuoteCurrentValues, quoteCurrentStateEvidence, quoteCurrentValues, quoteRequestGuidance } from '@/lib/preventivi/quoteRequestContext';
import type { ChatDocument } from '@/lib/preventivi/quoteChatDocument';
import { readQuoteChatRequest } from '../../../supabase/functions/_shared/quoteConversation';
const proposal = { id: 'work', title: 'Lavorazione di prova', description: '', quantity: 12, unit: 'm²', referenceId: null as null, quantityBasis: '3 x 4 m' };
const doc: ChatDocument = { title: 'Progetto generico', revision: 8, lines: [{ ...proposal, original: { ...proposal, quantity: 14 }, price: 38, included: false, manual: true, reference: null }] };
describe('Richieste libere e stato corrente: tutti i settori restano conversazione', () => {
  it.each(['Rivedi il budget preliminare del bilocale', 'Correggi la stima indicativa', 'Rifai il budget indicativo senza cambiare il computo'])('mantiene la revisione delle stime nel percorso budget: %s', text => {
    expect(assessQuoteRequest(text).intent).toBe('budget');
    expect(assessQuoteRequest(`${text}. Niente stime, solo prezzi verificati`).intent).not.toBe('budget');
  });
  it.each([
    ['Come funziona un appalto pubblico?', 'information', 'public'],
    ['Prepara un computo per la costruzione di una villa', 'compose', 'construction'],
    ['Genera un preventivo per ristrutturazione completa appartamento', 'compose', 'renovation'],
    ['Quanto costa installare il fotovoltaico?', 'budget', 'specialist'],
    ['Spiegami le cause delle infiltrazioni nel tetto', 'information', 'maintenance'],
    ['Modifica le voci dei serramenti', 'revise', 'specialist'],
    ['Prepara un computo per la costruzione di un campo da tennis', 'compose', 'construction'],
    ['Quali documenti servono per una gara pubblica?', 'information', 'public'],
    ['Crea le fasi per manutenzione impianti e facciata', 'compose', 'maintenance'],
  ])('interpreta gli indizi senza imporre un modello: %s', (text, intent, topic) => {
    expect(assessQuoteRequest(text)).toMatchObject({ intent, topics: expect.arrayContaining([topic]) });
  });
  it('un lavoro non catalogato rimane aperto al modello, senza fallback al bagno', () => {
    expect(assessQuoteRequest('Vorrei sistemare una serra geodetica')).toEqual({ intent: 'open', topics: [] });
    expect(quoteRequestGuidance('Vorrei sistemare una serra geodetica')).toContain('NON sono fuori ambito');
  });
  it('copre ambiti misti senza scegliere un solo ramo e senza inventare quantità', () => {
    const guidance = quoteRequestGuidance('Prepara ristrutturazione scuola in appalto pubblico, rifacimento tetto e nuove fondazioni', 'classico');
    expect(assessQuoteRequest('Prepara ristrutturazione scuola in appalto pubblico, rifacimento tetto e nuove fondazioni').topics).toEqual(['public', 'construction', 'renovation', 'specialist']);
    expect(guidance).toContain('quantità null'); expect(guidance).toContain('senza ricondurle tutte al bagno');
    expect(guidance).toContain('Non applicare ribassi globali'); expect(guidance).toContain('richiedono progetto e verifica tecnica'); expect(guidance.length).toBeLessThanOrEqual(3000);
  });
  it('gli indizi di gara non diventano regole legali o numeri presunti', () => {
    const guidance = quoteRequestGuidance('Prepara una offerta economica di gara per lavori pubblici');
    expect(guidance).toContain('Senza documenti non affermare requisiti');
    expect(guidance).toContain('fonti ufficiali aggiornate'); expect(guidance).toContain('non firmare o inviare');
    expect(guidance).not.toMatch(/\d+%|\d+ giorni|D\.Lgs/);
  });
  it('i dati correnti prevalgono sull’originale e non portano costi interni nel prompt', () => {
    const evidence = quoteCurrentStateEvidence(doc);
    expect(evidence).toContain('revisione 8'); expect(evidence).toContain('work: 12 m²; prezzo 38'); expect(evidence).not.toContain('14 m²');
    expect(evidence).toContain('manuale protetta'); expect(evidence).not.toContain('original');
  });
  it('esclude lo storico e segnala un estratto invece di troncare righe o inventare zeri', () => {
    const many: ChatDocument = { ...doc, lines: Array.from({ length: 100 }, (_, n) => ({ ...doc.lines[0], id: `r${n}`, unit: 'unità_con_nome_lungo', quantity: null as null, price: null as null })) };
    many.lines[0].supersededBy = ['r1'];
    const evidence = quoteCurrentStateEvidence(many);
    expect(evidence).not.toContain('r0:'); expect(evidence).toContain('99 voci attive'); expect(evidence).toContain('Estratto:'); expect(evidence.length).toBeLessThanOrEqual(3000);
  });
  it('il riepilogo software non ripete 14 mq della vecchia risposta e non assume IVA zero', () => {
    const summary = quoteCurrentValues(doc, null, { work: 5 });
    expect(summary).toContain('12 m²'); expect(summary).not.toContain('14 m²'); expect(summary).toContain('38,00'); expect(summary).toContain('sconto 5%'); expect(summary).toContain('IVA: da definire'); expect(summary).not.toContain('IVA: 0%');
    expect(quoteCurrentValues({ ...doc, lines: [] }, null)).toContain('Nessuna lavorazione composta');
  });
  it.each(['Riepiloga la voce corrente', 'Mostrami i dati attuali', 'Qual è la quantità attuale?'])('riconosce le domande sui dati correnti: %s', text => expect(asksQuoteCurrentValues(text)).toBe(true));
  it('non sostituisce una spiegazione generale con un riepilogo numerico', () => expect(asksQuoteCurrentValues('Riepiloga le fasi della costruzione della casa')).toBe(false));
  it('gli indizi e lo stato restano compatibili con l’endpoint già esistente', () => {
    const texts = ['Prepara un computo per una scuola in appalto pubblico', 'Prepara una ristrutturazione con nuove fondazioni, impianti e facciata'];
    for (const text of texts) expect(() => readQuoteChatRequest({ version: 1, companyId: 'd2000000-0000-4000-a000-000000000002', sessionId: crypto.randomUUID(), turnId: crypto.randomUUID(), revision: 8, sourceId: null, context: { brief: '', protectedLineIds: ['work'], plan: null }, lines: [proposal], messages: [{ role: 'assistant', text: quoteRequestGuidance(text, 'classico') }, { role: 'assistant', text: quoteCurrentStateEvidence(doc) }, { role: 'user', text }] })).not.toThrow();
  });
});
