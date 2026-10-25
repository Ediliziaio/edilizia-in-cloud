import { afterEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { emptyQuoteTax, readQuoteTax, quoteTaxItems, quoteTaxTotals, quoteTaxCommand, quoteTaxFromEditor } from '@/lib/preventivi/quoteTax';
import { quoteBudgetIntent, quoteProjectEconomy, emptyQuoteProject, readQuoteProject } from '@/lib/preventivi/quoteProject';
import { readQuoteSchedule, type QuoteScheduleProposal } from '../../../supabase/functions/_shared/quoteSchedule';
import { quoteScheduleTimeline, quoteScheduleScope, quoteScheduleIntent, quoteScheduleReply, quoteScheduleEvidence, type LocalQuoteSchedule } from '@/lib/preventivi/quoteSchedule';
import { quoteChatResponseFormat, runQuoteChat, type QuoteChatRequest } from '../../../supabase/functions/_shared/quoteConversation';
import { chatQuoteItems } from '@/lib/preventivi/quoteChatDocument';
import { quoteDocumentNotes } from '@/lib/preventivi/quoteDocumentNotes';
import { QuoteTaxPanel } from '@/components/quotes/dev/QuoteTaxPanel';
import { QuoteSchedulePanel } from '@/components/quotes/dev/QuoteSchedulePanel';
import { QuoteTemplatePreview } from '@/components/quotes/QuoteTemplatePreview';
import { DEFAULT_TEMPLATE } from '@/types/quoteTemplate';
import { localSnapshot } from './localPlanFixtures';
afterEach(cleanup);
const schedule: QuoteScheduleProposal = { title: 'Bagno, programma ipotetico', assumptions: ['Una squadra, nessuna prenotazione'], tasks: [
  { id: 'a', title: 'Lavorazione', kind: 'work', minDays: 1, maxDays: 1, after: [], basis: 'Durata ipotizzata, da verificare' },
  { id: 'b', title: 'Asciugatura', kind: 'wait', minDays: 2, maxDays: 2, after: ['a'], basis: 'Attesa da scheda tecnica del prodotto' },
  { id: 'c', title: 'Posa', kind: 'work', minDays: 1, maxDays: 1, after: ['b'], basis: 'Disponibilità da verificare' },
] };
const item = (id: string, price: number, vat: number | null) => ({ ...chatQuoteItems({ revision: 0, title: 'Test', lines: [{ ...localSnapshot().document.lines[0], id, title: id, quantity: 1, price, included: true }] })[0], vat_rate: vat });
describe('IVA dichiarata, non aliquote presunte dal modello', () => {
  it.each([['Bagno budget 12000 € IVA compresa', 'gross'], ['Preventivo 12000 € compresa IVA', 'gross'], ['Ristrutturazione 12000 € più IVA', 'net'], ['Preventivo 12000 € + IVA', 'net'], ['Bagno 12000 € IVA non compresa', 'net'], ['Bagno 12000 €', 'unspecified']])('legge la base di %s', (text, basis) => expect(quoteBudgetIntent(text)?.basis).toBe(basis));
  it('non scambia l’aliquota mancante per 0 o 22 e non riscrive i prezzi netti', () => {
    const items = [item('a', 1000, null)]; const source = JSON.stringify(items);
    const unknown = quoteTaxTotals(quoteTaxItems(items, emptyQuoteTax(), false));
    expect(unknown).toMatchObject({ net: 1000, tax: null, gross: null, pending: ['a'] });
    expect(quoteTaxTotals(quoteTaxItems(items, { ...emptyQuoteTax(), defaultRate: 10 }, false))).toMatchObject({ net: 1000, tax: 100, gross: 1100 });
    expect(JSON.stringify(items)).toBe(source);
  });
  it('rispetta aliquote miste, sconto globale e aliquote del classico', () => {
    const items = [item('a', 1000, 10), item('b', 2000, 22)];
    expect(quoteTaxTotals(quoteTaxItems(items, { ...emptyQuoteTax(), defaultRate: 4 }, true), 10)).toMatchObject({ net: 2700, tax: 486, gross: 3186, breakdown: { '10': 90, '22': 396 } });
    expect(quoteTaxTotals(quoteTaxItems(items, { ...emptyQuoteTax(), defaultRate: 4, lineRates: [{ id: 'b', rate: null }] }, true)).gross).toBeNull();
  });
  it('una modifica successiva nell’editor prevale sulla vecchia impostazione della chat', () => {
    const settings = { ...emptyQuoteTax(), defaultRate: 10, lineRates: [{ id: 'a', rate: 22 }] };
    const next = quoteTaxFromEditor(settings, [item('a', 1000, 22)], [item('a', 1000, null)]);
    expect(next.lineRates).toEqual([{ id: 'a', rate: null }]); expect(quoteTaxTotals(quoteTaxItems([item('a', 1000, null)], next, true)).gross).toBeNull();
  });
  it('accetta zero solo se esplicito e blocca impostazioni non finite o duplicate', () => {
    expect(readQuoteTax({ ...emptyQuoteTax(), defaultRate: 10.12 }).defaultRate).toBe(10.12);
    expect(quoteTaxTotals([item('a', 1000, 0)])).toMatchObject({ tax: 0, gross: 1000 });
    expect(() => readQuoteTax({ ...emptyQuoteTax(), defaultRate: NaN })).toThrow();
    expect(() => readQuoteTax({ ...emptyQuoteTax(), lineRates: [{ id: 'a', rate: 10 }, { id: 'a', rate: 22 }] })).toThrow();
    expect(quoteTaxCommand('Imposta IVA al 10% per voce 2')).toEqual({ rate: 10, line: 2 });
    expect(quoteTaxCommand('Si applica IVA al 10%?')).toBeNull();
  });
  it('confronta il budget coi totali reali misti, non con una finta aliquota unica', () => {
    const p = { ...emptyQuoteProject(), target: { amount: 3000, basis: 'gross' as const, evidence: 'Test' } };
    const doc = localSnapshot().document; doc.lines = [{ ...doc.lines[0], included: true, quantity: 1, price: 3000 }];
    expect(quoteProjectEconomy(doc, p, 22, {}, { net: 2700, gross: 3186 })).toMatchObject({ net: 2700, gross: 3186, targetDelta: 186 });
    expect(quoteProjectEconomy(doc, p, 22, {}, { net: 2700, gross: null }).targetDelta).toBeNull();
  });
  it('mostra netto e totale separati senza scegliere un’aliquota', () => {
    const onChange = vi.fn(); render(<QuoteTaxPanel total={quoteTaxTotals([item('a', 1000, null)])} rows={[]} onChange={onChange} />);
    expect(screen.getByText('Non ancora calcolabile')).toBeVisible(); expect(onChange).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Aliquota IVA predefinita'), { target: { value: '10' } }); expect(onChange).toHaveBeenCalledWith({ ...emptyQuoteTax(), defaultRate: 10 });
  });
  it('riporta il vero totale e le aliquote nell’anteprima del template', () => {
    render(<QuoteTemplatePreview template={DEFAULT_TEMPLATE} page="detail" documentData={{ title: 'Test', clientName: 'Demo', date: '22/10/2026', rows: [{ id: 'a', name: 'Lavoro', description: 'Dettaglio', quantity: 1, unit: 'a corpo', price: 1000, amount: 1000 }], net: 1000, taxPending: false, tax: 100, gross: 1100, taxBreakdown: { '10': 100 }, commonNotes: 'Ipotesi uniche del documento' }} />);
    expect(screen.getByTestId('live-quote-total')).toHaveTextContent('Totale IVA compresa: 1.100,00'); expect(screen.getByText('IVA 10%: 100,00 €')).toBeVisible();
  });
});
describe('Cronoprogramma indicativo con dipendenze, non calendario prenotato', () => {
  it('fa proseguire l’attesa nel weekend e riprende il lavoro lunedì', () => {
    expect(quoteScheduleTimeline(schedule, '2026-10-23')).toMatchObject({ minDays: 4, maxDays: 4, finishMin: '2026-10-26' });
  });
  it('calcola le dipendenze indipendentemente dall’ordine e non somma fasi parallele', () => {
    const input = { ...schedule, tasks: [schedule.tasks[2], { ...schedule.tasks[1], after: [] }, schedule.tasks[0]] };
    const result = quoteScheduleTimeline(input, '2026-10-19'); expect(result.maxDays).toBe(3);
  });
  it.each(['cycle', 'unknown', 'duplicate', 'negative', 'swapped'])('rifiuta %s', mode => {
    const input = structuredClone(schedule);
    if (mode === 'cycle') input.tasks[0].after = ['c']; if (mode === 'unknown') input.tasks[0].after = ['missing']; if (mode === 'duplicate') input.tasks[1].id = 'a'; if (mode === 'negative') input.tasks[0].minDays = -1; if (mode === 'swapped') input.tasks[0].maxDays = 0;
    expect(() => readQuoteSchedule(input)).toThrow();
  });
  it('rifiuta date impossibili e persiste il programma con il progetto', () => {
    expect(() => quoteScheduleTimeline(schedule, '2026-02-30')).toThrow();
    const plan: LocalQuoteSchedule = { proposal: schedule, sourceRevision: 0, sourceScope: 'test', confirmed: false, startDate: null };
    expect(readQuoteProject({ ...emptyQuoteProject(), schedule: plan }).schedule).toEqual(plan);
  });
  it('un cambio di prezzo non invalida il piano ma una quantità o un’esclusione sì', () => {
    const doc = localSnapshot().document; const key = quoteScheduleScope(doc.lines, 'Bagno incluso');
    expect(quoteScheduleScope(doc.lines.map(r => ({ ...r, price: 999 })), 'Bagno incluso')).toBe(key);
    expect(quoteScheduleScope(doc.lines.map(r => ({ ...r, quantity: 999 })), 'Bagno incluso')).not.toBe(key);
    expect(quoteScheduleScope(doc.lines, 'Bagno escluso')).not.toBe(key);
    expect(quoteScheduleScope(doc.lines.map(r => ({ ...r, included: !r.included })), 'Bagno incluso')).not.toBe(key);
    expect(quoteScheduleIntent('Fammi un cronoprogramma del bagno')).toBe(true); expect(quoteScheduleIntent('Che cos’è un cronoprogramma?')).toBe(false);
  });
  it('mantiene risposte e scelte nella conversazione tempi senza catturare richieste di prezzo', () => {
    expect(quoteScheduleReply('Una squadra di due persone', true)).toBe(true);
    expect(quoteScheduleReply('Confermo una squadra', false)).toBe(false);
    expect(quoteScheduleReply('Cambia il prezzo a 3000 euro', true)).toBe(false);
    const evidence = quoteScheduleEvidence({ proposal: { ...schedule, tasks: Array.from({ length: 16 }, (_, i) => ({ ...schedule.tasks[0], id: `fase_${i}`, title: 'Lavorazione '.repeat(12) })) }, sourceRevision: 0, sourceScope: '', startDate: null, confirmed: false });
    expect(evidence.every(text => text.length <= 3000)).toBe(true); expect(evidence.join('\n')).toContain('fase_15');
  });
  it('blocca una dipendenza ciclica mostrando l’errore senza perdere il piano', () => {
    const onChange = vi.fn(); render(<QuoteSchedulePanel schedule={{ proposal: schedule, sourceRevision: 0, sourceScope: '', confirmed: true, startDate: null }} stale={false} onChange={onChange} onRegenerate={vi.fn()} />);
    fireEvent.click(screen.getAllByText('Predecessori (0)')[0]);
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Posa' })[0]);
    expect(screen.getByRole('alert')).toHaveTextContent('cicliche'); expect(onChange).not.toHaveBeenCalled();
  });
  it('lo schema e il server impediscono ricerche e modifiche alle voci nel turno calendario', async () => {
    const id = 'd2000000-0000-4000-a000-000000000002';
    const request: QuoteChatRequest = { version: 1, companyId: id, turnId: id, sessionId: id, revision: 0, sourceId: id, lines: [], messages: [{ role: 'user', text: 'Prepara un cronoprogramma' }], advanced: { model: 'anthropic/claude-sonnet-5.5', mode: 'schedule' } };
    expect(quoteChatResponseFormat(request).json_schema.schema.properties.proposals.maxItems).toBe(0);
    const search = vi.fn(); const result = await runQuoteChat(request, { decode: JSON.parse, search, complete: async () => ({ model: 'test', content: JSON.stringify({ version: 1, title: '', message: 'Proposta da verificare', questions: [], warnings: [], searches: ['non eseguire'], proposals: [], scheduleProposal: schedule }) }) });
    expect(search).not.toHaveBeenCalled(); expect(result.turn.scheduleProposal).toEqual(schedule); expect(result.turn.proposals).toEqual([]);
  });
  it('la conferma resta esplicita e viene sospesa se l’ambito è superato', () => {
    const onChange = vi.fn(); render(<QuoteSchedulePanel schedule={{ proposal: schedule, sourceRevision: 0, sourceScope: '', confirmed: false, startDate: null }} stale onChange={onChange} onRegenerate={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Conferma ipotesi del cronoprogramma' })).toBeDisabled(); expect(onChange).not.toHaveBeenCalled();
  });
  it('una data inserita via input nativo aggiorna il calendario e annulla la conferma precedente', () => {
    const onChange = vi.fn(); render(<QuoteSchedulePanel schedule={{ proposal: schedule, sourceRevision: 0, sourceScope: '', confirmed: true, startDate: null }} stale={false} onChange={onChange} onRegenerate={vi.fn()} />);
    fireEvent.input(screen.getByLabelText('Avvio ipotetico lavori'), { target: { value: '2026-11-02' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ startDate: '2026-11-02', confirmed: false }));
  });
  it('raccoglie una sola volta le vecchie ipotesi globali senza alterare le voci originali', () => {
    const doc = localSnapshot().document; doc.lines = [1, 2].map((n) => ({ ...doc.lines[0], id: `a${n}`, included: true, description: `Dettaglio ${n}\nIpotesi: una squadra\nEsclusioni: strutture`, pricing: { origin: 'ai-estimate', basis: 'test' } }));
    const output = quoteDocumentNotes(doc); expect(output.notes.match(/una squadra/g)).toHaveLength(1); expect(output.descriptions.get('a1')).toBe('Dettaglio 1'); expect(doc.lines[0].description).toContain('Ipotesi:');
  });
});
