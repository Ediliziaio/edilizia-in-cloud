import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { quoteBudgetOverlaps } from '@/lib/preventivi/quoteBudgetQuality';
import { indicativeBudgetProposal } from '@/lib/preventivi/quoteProposalReview';
import { QuotePreliminaryBudget } from '@/components/quotes/dev/QuotePreliminaryBudget';
import { emptyChatDocument } from '@/lib/preventivi/quoteChatDocument';
import type { PreliminaryQuoteBudget } from '../../../supabase/functions/_shared/quoteAdvanced';
afterEach(cleanup);
const budget = (first: string, second: string): PreliminaryQuoteBudget => ({ scope: 'Simulazione appartamento', currency: 'EUR', assumptions: ['Accesso ordinario ipotetico'], exclusions: ['Serramenti'], groups: [
  { label: 'Impianti interni', low: 1000, high: 2000, basis: first },
  { label: 'Opere murarie', low: 300, high: 500, basis: second },
] });
describe('Indizi locali di sovrapposizione nei budget indicativi', () => {
  it('mantiene visibili intervallo e natura indicativa, con dettaglio e provenienza apribili', () => {
    render(<QuotePreliminaryBudget budget={budget('Fornitura e posa', 'Rasature')} stale={false} model="modello-di-prova" />);
    expect(screen.getByText('1.300,00 €–2.500,00 € netti IVA esclusa')).toBeVisible();
    expect(screen.getByText('Impianti interni')).not.toBeVisible();
    expect(screen.getByText(/Modello: modello-di-prova/)).not.toBeVisible();
    fireEvent.click(screen.getByText('Vedi le 2 lavorazioni previste'));
    expect(screen.getByText('Impianti interni')).toBeVisible();
    fireEvent.click(screen.getByText('Come è stata calcolata la stima'));
    expect(screen.getByText(/Modello: modello-di-prova/)).toBeVisible();
  });
  it('non nasconde avvisi di stima superata e sovrapposizione neanche nel riepilogo compatto', () => {
    render(<QuotePreliminaryBudget budget={budget('Tracce e ripristini murari', 'Tracce e ripristini murari')} stale compact />);
    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.getByText(/Da aggiornare:/)).toBeVisible();
    expect(screen.getByText(/Stima indicativa separata dal computo/)).toBeVisible();
  });
  it('segnala il caso reale delle tracce incluse in due capitoli senza correggere importi', () => {
    const input = budget('Impianti incluse tracce, ripristini e certificazioni', 'Ripristino di tracce, massetti e rasature');
    const before = JSON.stringify(input);
    expect(quoteBudgetOverlaps(input).join(' ')).toContain('Possibile doppio conteggio di tracce impiantistiche');
    expect(JSON.stringify(input)).toBe(before);
    expect(() => indicativeBudgetProposal(emptyChatDocument(), input, 0)).toThrow('Budget da chiarire');
  });
  it.each(['Impianti; escluse tracce e ripristini.', 'Impianti senza tracce o opere murarie.', 'Impianti. Non include tracce e ripristini.', 'Impianti completi, collegamenti, prove e dichiarazioni. Tracce e ripristini edili esclusi.', 'Tracce e ripristini murari non compresi.'])('non tratta un’esclusione esplicita come costo incluso: %s', first => {
    expect(quoteBudgetOverlaps(budget(first, 'Tracce e ripristini murari, inclusi nel solo capitolo edile.'))).toEqual([]);
  });
  it('non confonde la normale presenza di impianti e opere murarie con un doppione certo', () => {
    expect(quoteBudgetOverlaps(budget('Fornitura e posa tubazioni e componenti', 'Massetti, tracce e ripristini murari'))).toEqual([]);
  });
  it('segnala capitoli con lo stesso titolo ignorando maiuscole e spazi', () => {
    const input = budget('Fornitura', 'Posa'); input.groups[1].label = ' IMPIANTI INTERNI ';
    expect(quoteBudgetOverlaps(input).join(' ')).toContain('Capitolo ripetuto');
  });
  it('mostra che la somma non è depurata e la conversione è sospesa', () => {
    render(<QuotePreliminaryBudget budget={budget('Tracce e ripristini murari', 'Tracce e ripristini murari')} stale={false} />);
    expect(screen.getByRole('status')).toHaveTextContent('il totale non è depurato');
    expect(screen.getByRole('status')).toHaveTextContent('conversione in proposta è sospesa');
  });
});
