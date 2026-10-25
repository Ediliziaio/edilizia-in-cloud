import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import QuoteLineEditor, { type EditableQuoteLine } from '@/components/quotes/dev/QuoteLineEditor';
const rows: EditableQuoteLine[] = ['a', 'b'].map(id => ({ id, title: `Voce ${id}`, description: 'Descrizione', quantity: 1, price: 20, unit: 'cad', included: false, issue: null as null, reference: 'Manuale' }));
let cancel: ReturnType<typeof vi.fn>;
let animate: ReturnType<typeof vi.fn>;
beforeEach(() => {
  cancel = vi.fn(); animate = vi.fn().mockImplementation(() => ({ cancel, onfinish: null }));
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: animate });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); delete HTMLElement.prototype.animate; });
describe('Feedback leggero solo sui cambi reali delle voci', () => {
  it('nessun lampeggio iniziale o quando cambiano soltanto riferimenti degli oggetti', () => {
    const view = render(<QuoteLineEditor rows={rows} onPatch={vi.fn()} onReset={vi.fn()} />);
    view.rerender(<QuoteLineEditor rows={rows.map(r => ({ ...r }))} onPatch={vi.fn()} onReset={vi.fn()} />);
    expect(animate).not.toHaveBeenCalled();
  });
  it('anima solo la riga modificata senza ricreare il campo e perdere il focus', () => {
    const view = render(<QuoteLineEditor rows={rows} onPatch={vi.fn()} onReset={vi.fn()} />);
    const input = screen.getByRole('spinbutton', { name: 'Prezzo voce 1' }); input.focus();
    view.rerender(<QuoteLineEditor rows={[{ ...rows[0], price: 25 }, rows[1]]} onPatch={vi.fn()} onReset={vi.fn()} />);
    expect(animate).toHaveBeenCalledOnce(); expect(input).toBe(screen.getByRole('spinbutton', { name: 'Prezzo voce 1' })); expect(input).toHaveFocus();
    expect(animate.mock.contexts[0]).toBe(input.closest('tr'));
    view.unmount(); expect(cancel).toHaveBeenCalledOnce();
  });
  it('la preferenza riduci movimento impedisce il feedback animato', () => {
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true } as MediaQueryList);
    const view = render(<QuoteLineEditor rows={rows} onPatch={vi.fn()} onReset={vi.fn()} />);
    view.rerender(<QuoteLineEditor rows={[{ ...rows[0], quantity: 3 }, rows[1]]} onPatch={vi.fn()} onReset={vi.fn()} />);
    expect(animate).not.toHaveBeenCalled();
  });
  it('una modifica più recente annulla il vecchio effetto, senza code o timer', () => {
    const view = render(<QuoteLineEditor rows={rows} onPatch={vi.fn()} onReset={vi.fn()} />);
    view.rerender(<QuoteLineEditor rows={[{ ...rows[0], price: 21 }, rows[1]]} onPatch={vi.fn()} onReset={vi.fn()} />);
    view.rerender(<QuoteLineEditor rows={[{ ...rows[0], price: 22 }, rows[1]]} onPatch={vi.fn()} onReset={vi.fn()} />);
    expect(animate).toHaveBeenCalledTimes(2); expect(cancel).toHaveBeenCalledOnce();
  });
  it('non richiede Web Animations per consentire modifiche e invii del valore', () => {
    delete HTMLElement.prototype.animate;
    const onPatch = vi.fn(); const view = render(<QuoteLineEditor rows={rows} onPatch={onPatch} onReset={vi.fn()} />);
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Prezzo voce 1' }), { target: { value: '25' } });
    expect(onPatch).toHaveBeenCalledWith('a', { price: 25 });
    expect(() => view.rerender(<QuoteLineEditor rows={[{ ...rows[0], price: 25 }, rows[1]]} onPatch={onPatch} onReset={vi.fn()} />)).not.toThrow();
  });
});
