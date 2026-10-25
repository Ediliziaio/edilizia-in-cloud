import { createRef } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { quoteMessagePreview } from '../../../supabase/functions/_shared/quoteMessagePreview';
import { quoteEventResponse } from '../../../supabase/functions/_shared/quoteStream';
import { readQuoteStream } from '@/lib/preventivi/quoteStream';
import { QuoteStreamingReply, type QuoteStreamingReplyHandle } from '@/components/quotes/dev/QuoteStreamingReply';
import { assessQuoteRequest } from '@/lib/preventivi/quoteRequestContext';
afterEach(cleanup);
describe('Testo progressivo reale, solo message e nessuna azione parziale', () => {
  it.each([
    ['{"version":1,"message":"Ciao', 'Ciao'],
    ['{"message":"Quota \\"da confermare\\"\\nBagno', 'Quota "da confermare"\nBagno'],
    ['{"message":"Bagno\\u00e8', 'Bagnoè'],
    ['{"message":"A\\uD83D', 'A'],
    ['{"message":"A\\uD83D\\uDE00', 'A😀'],
    ['{"message":"A\\u00', 'A'],
    ['{"message":"A\\', 'A'],
    ['{"x":{"message":"non mostrare"},"message":"Risposta', 'Risposta'],
    ['{"x":[{"message":"non mostrare"}],"message":"Risposta', 'Risposta'],
    ['{"message":"Fatto","proposals":[{"title":"Segreto', 'Fatto'],
    ['{"message":null', null],
    ['{"reasoning":"pensieri privati', null],
    ['{"proposals":[{"message":"non mostrare"}]}', null],
    ['```json\n{"message":"no', null],
    ['{"message":"\\q', null],
  ])('estrae prudentemente %s', (raw, expected) => expect(quoteMessagePreview(raw)).toBe(expected));
  it('non restituisce JSON grezzo né testi senza limite', () => {
    expect(quoteMessagePreview('{"message":"' + 'a'.repeat(3001))).toBeNull();
    expect(quoteMessagePreview('a'.repeat(120001))).toBeNull();
  });
  it('consegna l’anteprima prima del risultato e non la scambia per il risultato finale', async () => {
    const id = { turnId: 'd2000000-0000-4000-a000-000000000002', revision: 1 };
    let finish!: () => void;
    const response = quoteEventResponse(async (emit, draft) => { emit('analysis'); draft('Sto componendo il bagno', 0); await new Promise<void>(r => { finish = r; }); return { complete: true }; }, id, new AbortController().signal, {});
    const observer = vi.fn(); let settled = false;
    const pending = readQuoteStream(response, id, new AbortController().signal, observer).then(r => { settled = true; return r; });
    await vi.waitFor(() => expect(observer).toHaveBeenCalledWith({ type: 'draft', ...id, stage: 0, text: 'Sto componendo il bagno' }));
    expect(settled).toBe(false); finish(); await expect(pending).resolves.toEqual({ complete: true });
  });
  it('un’anteprima seguita da errore non produce un risultato applicabile', async () => {
    const id = { turnId: 'test', revision: 2 };
    const response = quoteEventResponse(async (_, draft) => { draft('Ipotesi da verificare', 0); throw new Error('secret'); }, id, new AbortController().signal, {});
    await expect(readQuoteStream(response, id, new AbortController().signal)).rejects.toThrow('Bozza intatta');
  });
  it('aggiorna solo il componente del testo, senza ridisegnare editor o salvare frammenti', () => {
    const api = createRef<QuoteStreamingReplyHandle>(); const log = createRef<HTMLDivElement>(); let parentRenders = 0;
    function Parent() { parentRenders++; return <div ref={log}><p>Editor invariato</p><QuoteStreamingReply ref={api} log={log} /></div>; }
    render(<Parent />); act(() => api.current!.update('<script>non eseguire</script>'));
    expect(screen.getByLabelText('Risposta in elaborazione')).toHaveTextContent('<script>non eseguire</script>');
    expect(parentRenders).toBe(1); expect(document.querySelector('script')).toBeNull();
    act(() => api.current!.clear()); expect(screen.queryByLabelText('Risposta in elaborazione')).not.toBeInTheDocument();
  });
  it.each(['Fammi un preventivo indicativo per un bagno completo', 'Prepara un preventivo di massima per quattro finestre', 'Vorrei un preventivo orientativo per un trilocale', 'SIMULAZIONE senza cliente reale. Preventivo indicativo per ristrutturazione completa di 80 m²', 'Prova locale.\nStima preliminare per un appartamento'])('riconosce il budget senza cambiare modello o inventare quantità: %s', text => {
    expect(assessQuoteRequest(text).intent).toBe('budget');
  });
  it('un computo verificato resta un computo e una domanda non diventa una stima', () => {
    expect(assessQuoteRequest('Genera un computo metrico verificato dal prezzario').intent).toBe('compose');
    expect(assessQuoteRequest('Cosa comprende un bagno completo?').intent).toBe('information');
    expect(assessQuoteRequest('Non voglio un preventivo indicativo, genera solo prezzi verificati').intent).not.toBe('budget');
    expect(assessQuoteRequest('SIMULAZIONE: prepara le lavorazioni dell’appartamento; budget preliminare e computo verificato devono restare separati.').intent).not.toBe('budget');
  });
});
