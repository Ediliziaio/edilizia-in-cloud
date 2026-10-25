import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QuoteTurnDetails } from '@/components/quotes/dev/QuoteTurnDetails';
import { QuoteChatChoices } from '@/components/quotes/dev/QuoteChatChoices';
import { isQuoteProviderNotice } from '@/lib/preventivi/quoteChatPresentation';
afterEach(cleanup);
const noop = 'Nessuna modifica alle voci o al parziale applicata in questo turno.\nNessuna voce inclusa adesso nel parziale.';
describe('Conversazione essenziale, dettagli disponibili', () => {
  it('nasconde solo i vecchi riscontri automatici, mai messaggi utente o errori', () => {
    expect(isQuoteProviderNotice({ role: 'assistant', diagnostic: true, text: '**Riscontro OpenRouter** · model\n123token' })).toBe(true);
    expect(isQuoteProviderNotice({ role: 'user', diagnostic: true, text: '**Riscontro OpenRouter**' })).toBe(false);
    expect(isQuoteProviderNotice({ role: 'assistant', text: '**Riscontro OpenRouter**' })).toBe(false);
    expect(isQuoteProviderNotice({ role: 'assistant', diagnostic: true, text: 'Richiesta interrotta. Bozza intatta.' })).toBe(false);
  });
  it('ricevuta nulla non crea un blocco inutile', () => { const view = render(<QuoteTurnDetails onReview={vi.fn()} />); expect(view.container).toBeEmptyDOMElement(); });
  it('raccoglie ricevuta no-op e verifiche in un solo dettaglio inizialmente chiuso', () => {
    render(<QuoteTurnDetails warnings={['La superficie delle pareti va rilevata.']} receipt={noop} onReview={vi.fn()} />);
    const summary = screen.getByText('Dettagli del turno'); expect(summary.closest('details')).not.toHaveAttribute('open'); expect(screen.getByText('1 da verificare')).toBeVisible();
    expect(screen.getByText(/Nessuna modifica alle voci/)).not.toBeVisible();
    fireEvent.click(summary); expect(screen.getByText('La superficie delle pareti va rilevata.')).toBeVisible(); expect(screen.getByText(/Nessuna modifica alle voci/)).toBeVisible();
  });
  it('riepiloga solo le variazioni effettive, senza confonderle con importi approvati', () => {
    const review = vi.fn(); render(<QuoteTurnDetails receipt="Applicato alla bozza locale: 2 nuove voci, 1 voci aggiornate. Le proposte sono da confermare." revision={4} onReview={review} />);
    fireEvent.click(screen.getByText('3 voci aggiornate · Vedi modifiche')); fireEvent.click(screen.getByRole('button', { name: 'Rivedi le voci' })); expect(review).toHaveBeenCalledOnce(); expect(screen.getByText(/revisione 4/)).toBeVisible();
  });
  it('mantiene formule proposte distinte dalle quantità applicate', () => { render(<QuoteTurnDetails receipt="Salvate 2 proposte di formula da confermare. Quantità precedenti conservate." onReview={vi.fn()} />); expect(screen.getByText('2 formule da confermare')).toBeVisible(); });
  it('non ripete titolo e spiegazione generica sotto le scelte', () => {
    render(<QuoteChatChoices hideCaption choices={[{ id: 'full', label: 'Completa', reply: 'Ristrutturazione completa' }]} active busy={false} onChoose={vi.fn()} onCustomize={vi.fn()} />);
    expect(screen.queryByText('Scegli come proseguire')).not.toBeInTheDocument(); expect(screen.queryByText(/Gli importi richiedono/)).not.toBeInTheDocument(); expect(screen.getByRole('button', { name: 'Un’altra soluzione? Scrivila tu' })).toHaveTextContent('Altra risposta');
  });
  it('non nasconde l’avviso sul testo ancora da inviare e conserva le scelte superate', () => {
    const p = { choices: [{ id: 'full', label: 'Completa', reply: 'Completa' }], busy: false, onChoose: vi.fn(), onCustomize: vi.fn(), hideCaption: true };
    const view = render(<QuoteChatChoices {...p} active draftText="Bozza in corso" />); expect(screen.getByText(/senza inviarlo/)).toBeVisible();
    view.rerender(<QuoteChatChoices {...p} active={false} />); expect(screen.getByText('Alternative di un passaggio precedente')).toBeVisible(); expect(screen.getByRole('button', { name: 'Completa' })).toBeDisabled();
  });
});
