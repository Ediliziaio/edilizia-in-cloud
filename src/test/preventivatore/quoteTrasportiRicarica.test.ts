/**
 * Chat e audio dei preventivi non passano dal client Supabase: la finestra di ricarica
 * (aperta da quel client per ogni altra funzione) la devono aprire i due trasporti.
 * Prima l'utente vedeva solo una frase nella chat, senza il pulsante per ricaricare.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createQuoteChatTransport } from '@/lib/preventivi/quoteChatTransport';
import { createQuoteAudioTransport } from '@/lib/preventivi/localQuoteAudioTransport';
import { usePaymentGateStore } from '@/store/paymentGateStore';
import type { QuoteChatRequest } from '../../../supabase/functions/_shared/quoteConversation';

const companyId = 'b2000000-0000-4000-a000-000000000002';
const request: QuoteChatRequest = { version: 1, companyId, sessionId: companyId, turnId: companyId, revision: 1, sourceId: null,
  lines: [], messages: [{ role: 'user', text: 'Prepara un preventivo di prova' }] };
const options = { backendUrl: 'https://configured-backend.example', companyId, getToken: async () => 'jwt', publishableKey: 'pk' };
const signal = () => new AbortController().signal;
const credito = { code: 'AI_COMPANY_CREDIT', error: 'I crediti AI dell’azienda sono insufficienti.', wallet: 'ai' };
const risposta = (status: number, corpo: unknown) => new Response(JSON.stringify(corpo), { status });
const wav = () => new Blob(['RIFFxxxxWAVE' + 'x'.repeat(40)], { type: 'audio/wav' });

beforeEach(() => usePaymentGateStore.getState().hide());
afterEach(() => vi.restoreAllMocks());

describe('402 dei crediti AI: si apre la finestra di ricarica', () => {
  it('chat: il messaggio resta in chat E si apre la finestra, sul portafoglio AI', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(risposta(402, credito));
    await expect(createQuoteChatTransport({ ...options, fetch })(request, signal())).rejects.toThrow(/crediti AI/);
    const s = usePaymentGateStore.getState();
    expect(s.open).toBe(true); expect(s.kind).toBe('credits'); expect(s.dettaglio?.portafoglio).toBe('ai');
  });

  it('audio: stessa cosa, e la registrazione resta disponibile', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(risposta(402, credito));
    await expect(createQuoteAudioTransport({ ...options, fetch })(wav(), signal())).rejects.toThrow(/crediti AI|registrazione resta disponibile/i);
    const s = usePaymentGateStore.getState();
    expect(s.open).toBe(true); expect(s.kind).toBe('credits');
  });

  it('carta mancante (402 payment_method_required): si apre la finestra della carta, non quella dei crediti', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(risposta(402, { code: 'payment_method_required' }));
    await expect(createQuoteChatTransport({ ...options, fetch })(request, signal())).rejects.toThrow();
    expect(usePaymentGateStore.getState().kind).toBe('payment');
  });

  it.each([429, 503, 502, 401, 403])('un %i NON apre nessuna finestra di ricarica', async (status) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => risposta(status, { code: 'AI_RATE_LIMIT', error: 'x' }));
    await expect(createQuoteChatTransport({ ...options, fetch })(request, signal())).rejects.toThrow();
    await expect(createQuoteAudioTransport({ ...options, fetch })(wav(), signal())).rejects.toThrow();
    expect(usePaymentGateStore.getState().open).toBe(false);
  });

  it('un 402 con corpo illeggibile non rompe il trasporto: errore chiaro, nessuna finestra', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async () => new Response('<html>gateway</html>', { status: 402 }));
    await expect(createQuoteChatTransport({ ...options, fetch })(request, signal())).rejects.toThrow(/crediti|Disponibilità/);
    await expect(createQuoteAudioTransport({ ...options, fetch })(wav(), signal())).rejects.toThrow();
    expect(usePaymentGateStore.getState().open).toBe(false);
  });
});
