import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QuoteSourcePicker } from '@/components/quotes/dev/QuoteSourcePicker';
import { filterQuoteSources, quoteSourcePresentation, type QuoteChatSource } from '@/lib/preventivi/quoteSourcePresentation';
import { isQuoteStartingPointRequest, quoteStartingPointDraft, quoteStartingPointUserFacts, QUOTE_STARTING_POINT_REQUEST } from '@/lib/preventivi/quoteStartingPoint';
import { readLocalQuoteSnapshot } from '@/lib/preventivi/localQuoteMemory';
import { localSnapshot } from './localPlanFixtures';
afterEach(cleanup);
const lombardia: QuoteChatSource = { id: 'a6000000-0000-4000-a000-000000000001', label: 'Lombardia · 2025', region: 'Lombardia', year: 2025, name: 'Prezzario Regione Lombardia 2025 (ed.2)', version: 'ed.1' };
const abruzzo: QuoteChatSource = { id: 'a6000000-0000-4000-a000-000000000002', label: 'Prezzario Regione Abruzzo 2025 · Abruzzo 2025 · ed.1' };
const props = () => ({ options: [abruzzo, lombardia], selectedId: null as string | null, onSelect: vi.fn(), onRetry: vi.fn() });
describe('Prezzario comprensibile e confermabile', () => {
  it('separa nome breve, edizione nel nome e versione importazione', () => {
    expect(quoteSourcePresentation(lombardia)).toMatchObject({ title: 'Lombardia · 2025', edition: '2' });
    expect(quoteSourcePresentation(abruzzo)).toMatchObject({ title: 'Abruzzo · 2025', edition: undefined });
    expect(filterQuoteSources([lombardia, abruzzo], 'LOMBARDIA 2025')).toEqual([lombardia]);
  });
  it('nomi legacy senza metadati non acquisiscono anni o edizioni inventati', () => { expect(quoteSourcePresentation({ id: 'test', label: 'Listino speciale' })).toMatchObject({ title: 'Listino speciale', year: undefined, edition: undefined }); });
  it('non sceglie la prima regione e richiede la conferma dopo il candidato', async () => {
    const p = props(); render(<QuoteSourcePicker {...p} />); expect(p.onSelect).not.toHaveBeenCalled(); expect(screen.queryByRole('button', { name: 'Usa questo prezzario' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lombardia · 2025' })); expect(p.onSelect).not.toHaveBeenCalled();
    expect(screen.queryByText(/Versione dei dati importati/)).not.toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Usa questo prezzario' })); await waitFor(() => expect(p.onSelect).toHaveBeenCalledWith(lombardia.id));
  });
  it('ricerca locale e cambio query annullano un candidato precedente, senza selezioni implicite', () => {
    const p = props(); render(<QuoteSourcePicker {...p} />); fireEvent.click(screen.getByRole('button', { name: 'Abruzzo · 2025' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Lombardia' } }); expect(screen.queryByRole('button', { name: 'Abruzzo · 2025' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Usa questo prezzario' })).not.toBeInTheDocument(); expect(p.onSelect).not.toHaveBeenCalled();
  });
  it('mostra il nome compatto selezionato, Cambia non modifica e Annulla conserva', () => {
    const p = { ...props(), selectedId: lombardia.id }; render(<QuoteSourcePicker {...p} />); expect(screen.getByText('Lombardia · 2025')).toBeVisible(); expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Cambia' })); expect(screen.getByRole('textbox')).toBeVisible(); fireEvent.click(screen.getByRole('button', { name: 'Annulla' })); expect(screen.queryByRole('textbox')).not.toBeInTheDocument(); expect(p.onSelect).not.toHaveBeenCalled();
  });
  it('non fonde due edizioni con stessa regione e anno', () => {
    const p = props(); p.options = [lombardia, { ...lombardia, id: abruzzo.id, name: 'Lombardia 2025 edizione 3' }]; render(<QuoteSourcePicker {...p} />);
    expect(screen.getByRole('button', { name: 'Lombardia · 2025 Prezzario Regione Lombardia 2025 (ed.2)' })).toBeVisible(); expect(screen.getByRole('button', { name: 'Lombardia · 2025 Lombardia 2025 edizione 3' })).toBeVisible();
  });
  it('nessun risultato o errore non diventano una fonte inventata', () => {
    const p = props(); const view = render(<QuoteSourcePicker {...p} />); fireEvent.change(screen.getByRole('textbox'), { target: { value: 'nessun-risultato' } }); expect(screen.getByRole('status')).toHaveTextContent('Nessun prezzario trovato'); expect(p.onSelect).not.toHaveBeenCalled();
    view.rerender(<QuoteSourcePicker {...p} error />); fireEvent.click(screen.getByRole('button', { name: 'Riprova' })); expect(p.onRetry).toHaveBeenCalledOnce(); expect(p.onSelect).not.toHaveBeenCalled();
  });
  it('durante caricamento o revisione superata non applica scelte', () => {
    const p = props(); const view = render(<QuoteSourcePicker {...p} loading />); expect(screen.getByRole('button', { name: 'Abruzzo · 2025' })).toBeDisabled();
    view.rerender(<QuoteSourcePicker {...p} disabled />); fireEvent.click(screen.getByRole('button', { name: 'Abruzzo · 2025' })); expect(p.onSelect).not.toHaveBeenCalled();
  });
  it('esito di selezione fallito conserva la fonte e mostra errore', async () => {
    const p = props(); p.onSelect.mockRejectedValue(new Error('offline')); render(<QuoteSourcePicker {...p} />); fireEvent.click(screen.getByRole('button', { name: 'Abruzzo · 2025' })); fireEvent.click(screen.getByRole('button', { name: 'Usa questo prezzario' })); expect(await screen.findByRole('alert')).toHaveTextContent('precedente resta invariato');
  });
  it('memoria compatibile con etichette vecchie e metadati nuovi', () => {
    const snapshot = localSnapshot(); snapshot.messages = [{ role: 'assistant', text: 'Prezzari', sources: [abruzzo, lombardia] }];
    expect(readLocalQuoteSnapshot(snapshot).messages[0].sources).toEqual([abruzzo, lombardia]);
    expect(() => readLocalQuoteSnapshot({ ...snapshot, messages: [{ ...snapshot.messages[0], sources: [{ ...lombardia, year: NaN }] }] })).toThrow('Anno');
  });
});
describe('Proposta iniziale prepara il messaggio, non il computo', () => {
  it('prepara ipotesi e budget separato, senza trasformarli in misure reali', () => { expect(quoteStartingPointDraft('')).toBe(QUOTE_STARTING_POINT_REQUEST); expect(QUOTE_STARTING_POINT_REQUEST).toContain('Non modificare il computo verificato'); });
  it('conserva la descrizione scritta e non duplica la richiesta', () => { const next = quoteStartingPointDraft('Bagno da12m², serramenti esclusi')!; expect(next.startsWith('Bagno da12m², serramenti esclusi\n\n')).toBe(true); expect(quoteStartingPointDraft(next)).toBe(next); });
  it('non tronca un testo che supera il limite', () => { expect(quoteStartingPointDraft('x'.repeat(2900))).toBeNull(); });
  it('riconosce la richiesta completa dopo una descrizione, non semplici menzioni di budget', () => { expect(isQuoteStartingPointRequest(quoteStartingPointDraft('Escludi il bagno')!)).toBe(true); expect(isQuoteStartingPointRequest('Budget preliminare e computo verificato devono restare separati.')).toBe(false); });
  it('la richiesta di ipotesi generica non rende ipotetiche le esclusioni scritte dall’utente', () => { expect(quoteStartingPointUserFacts(quoteStartingPointDraft('Il bagno resta escluso.')!)).toBe('Il bagno resta escluso.'); expect(quoteStartingPointUserFacts(QUOTE_STARTING_POINT_REQUEST)).toBe(''); expect(quoteStartingPointUserFacts('Ipotizziamo di escludere il bagno')).toBe('Ipotizziamo di escludere il bagno'); });
});
