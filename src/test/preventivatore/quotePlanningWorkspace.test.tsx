import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { QuoteChatTransport } from '@/lib/preventivi/quoteChatDocument';
import { readQuoteChatRequest } from '../../../supabase/functions/_shared/quoteConversation';
vi.mock('@/lib/prezzario/queries', () => ({ usePrezzarioFonti: () => ({ data: [] as never[], isFetching: false, error: null as null, refetch: vi.fn() }) }));
import Workspace from '@/components/quotes/dev/QuoteAssistedWorkspace';
const companyId = 'd2000000-0000-4000-a000-000000000002';
afterEach(cleanup);
function send(text: string) {
  fireEvent.mouseDown(screen.getByRole('tab', { name: 'Silvio AI' }), { button: 0 });
  fireEvent.change(screen.getByRole('textbox', { name: 'Messaggio all’assistente preventivi' }), { target: { value: text } });
  fireEvent.click(screen.getByRole('button', { name: 'Invia messaggio' }));
}
describe('Prima struttura e memoria componenti nel dialogo', () => {
  it.each(['Genera un preventivo bagno completo', 'Prepara un computo completo per la nuova costruzione di una casa', 'Genera un preventivo completo appartamento'])('non lascia vuota la prima bozza se il provider ha solo fatto domande: %s', async request => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => {
      expect(() => readQuoteChatRequest(r)).not.toThrow();
      return { version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: 'stub', references: [], turn: { version: 1, title: request, message: 'Quale finitura vuoi?', questions: ['Quale finitura vuoi?'], warnings: [], searches: [], proposals: [] } };
    });
    render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send(request);
    await screen.findByText(/Struttura preliminare delle fasi proposta dal software/);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Voci del preventivo' }), { button: 0 });
    expect(screen.getByRole('spinbutton', { name: 'Quantità voce 1' })).toHaveValue(null);
    expect(screen.getByRole('spinbutton', { name: 'Prezzo voce 1' })).toHaveValue(null);
    expect(call).toHaveBeenCalledOnce();
  });
  it('mantiene il termico ma blocca la ricomparsa dello scaldasalviette anche al turno seguente', async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: 'stub', references: [] as never[], turn: { version: 1, title: 'Bagno', message: 'Proposte per il progetto', questions: [] as never[], warnings: [] as never[], searches: [] as never[], proposals: ['Impianto termico', 'Scaldasalviette'].map((title, i) => ({ id: `r${i}`, title, description: 'Da verificare', unit: 'cad', quantity: null as null, quantityBasis: 'Da rilevare', referenceId: null as null })) } }));
    render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send('Impianto termico incluso, scaldasalviette escluso');
    await screen.findByText('Proposte per il progetto');
    send('Aggiungi le lavorazioni rimanenti');
    await screen.findAllByText('Proposte per il progetto');
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[1][0].messages.some(m => m.text.includes('scaldasalviette: escluso'))).toBe(true);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Voci del preventivo' }), { button: 0 });
    expect(screen.getByRole('textbox', { name: 'Titolo voce 1' })).toHaveValue('Impianto termico');
    expect(screen.queryByRole('textbox', { name: 'Titolo voce 2' })).not.toBeInTheDocument();
  });
  it('una nuova esclusione non cambia un totale manuale senza conferma, anche se il provider omette excludeIds', async () => {
    const call = vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: 'stub', references: [], turn: { version: 1, title: 'Bagno', message: 'Risposta di prova', questions: [], warnings: [], searches: [], proposals: call.mock.calls.length === 1 ? [{ id: 'term', title: 'Scaldasalviette', description: 'Fornitura', unit: 'cad', quantity: 1, quantityBasis: 'Un apparecchio dichiarato', referenceId: null }] : [] } }));
    render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={call} />);
    send('Prepara una voce scaldasalviette'); await screen.findByText('Risposta di prova');
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Voci del preventivo' }), { button: 0 });
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Prezzo voce 1' }), { target: { value: '100' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Includi voce 1' }));
    send('Scaldasalviette escluso'); await screen.findByRole('button', { name: 'Escludi voce 1' });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Voci del preventivo' }), { button: 0 });
    expect(screen.getByRole('checkbox', { name: 'Includi voce 1' })).toBeChecked();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Silvio AI' }), { button: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Escludi voce 1' }));
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Voci del preventivo' }), { button: 0 });
    expect(screen.getByRole('checkbox', { name: 'Includi voce 1' })).not.toBeChecked();
    expect(screen.getByRole('spinbutton', { name: 'Prezzo voce 1' })).toHaveValue(100);
    expect(call).toHaveBeenCalledTimes(2);
  });
});
