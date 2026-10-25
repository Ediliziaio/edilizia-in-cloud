import { describe, expect, it, vi } from 'vitest';
import { createQuoteChatTransport } from '@/lib/preventivi/quoteChatTransport';
import { configuredQuoteEndpoint, quoteResponseText } from '@/lib/preventivi/quoteTransportEndpoint';
import type { QuoteChatRequest, QuoteChatResult } from '../../../supabase/functions/_shared/quoteConversation';

const companyId = 'b2000000-0000-4000-a000-000000000002';
const otherCompany = 'c2000000-0000-4000-a000-000000000002';
const request: QuoteChatRequest = { version: 1, companyId, sessionId: companyId, turnId: companyId, revision: 3, sourceId: null,
  lines: [], messages: [{ role: 'user', text: 'Prepara un preventivo di prova' }] };
const result: QuoteChatResult = { version: 1, turnId: request.turnId, revision: request.revision, model: 'test', simulated: false, references: [],
  turn: { version: 1, message: 'Quali lavorazioni?', title: '', questions: [], proposals: [], warnings: [], searches: [] } };
const options = { backendUrl: 'https://configured-backend.example', companyId, getToken: async () => 'synthetic-user-jwt', publishableKey: 'synthetic-publishable' };
const signal = () => new AbortController().signal;

describe('Trasporto di produzione vincolato a backend e azienda', () => {
  it.each(['https://configured-backend.example', 'https://preview-backend.example/', 'http://127.0.0.1:54321', 'http://localhost:54321', 'http://[::1]:54321'])('deriva soltanto il percorso previsto da %s', backend => {
    expect(configuredQuoteEndpoint(backend).pathname).toBe('/functions/v1/ai-preventivo-conversazione');
  });
  it.each(['http://remote.example', 'http://localhost.attacker.example', 'file:///tmp/backend', 'https://user:password@remote.example', 'https://backend.example/?key=private', 'https://backend.example/#secret', 'https://backend.example/other', 'not-a-url'])('rifiuta configurazioni non sicure senza credenziali o rete: %s', backendUrl => {
    const fetch = vi.fn(); const getToken = vi.fn();
    expect(() => createQuoteChatTransport({ ...options, backendUrl, fetch, getToken })).toThrow('Configurazione backend AI non valida');
    expect(fetch).not.toHaveBeenCalled(); expect(getToken).not.toHaveBeenCalled();
  });
  it('accetta un tenant reale soltanto nella propria istanza e non aggiunge credenziali a URL o redirect', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify(result)));
    expect(await createQuoteChatTransport({ ...options, fetch })(request, signal())).toEqual(result);
    expect(fetch).toHaveBeenCalledOnce();
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe('https://configured-backend.example/functions/v1/ai-preventivo-conversazione');
    expect(init).toMatchObject({ redirect: 'error', credentials: 'omit', method: 'POST', headers: { Authorization: 'Bearer synthetic-user-jwt', apikey: 'synthetic-publishable' } });
  });
  it('rifiuta un’altra azienda prima di recuperare il token', async () => {
    const fetch = vi.fn(); const getToken = vi.fn();
    await expect(createQuoteChatTransport({ ...options, fetch, getToken })({ ...request, companyId: otherCompany }, signal())).rejects.toThrow('Azienda');
    expect(fetch).not.toHaveBeenCalled(); expect(getToken).not.toHaveBeenCalled();
  });
  it('non invia richieste anonime né una richiesta annullata durante il recupero sessione', async () => {
    const fetch = vi.fn();
    await expect(createQuoteChatTransport({ ...options, fetch, getToken: async () => null })(request, signal())).rejects.toThrow('Accedi');
    const ctrl = new AbortController();
    await expect(createQuoteChatTransport({ ...options, fetch, getToken: async () => { ctrl.abort(); return 'jwt'; } })(request, ctrl.signal)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    [503, 'AI_PROVIDER_CREDIT', 'credito disponibile'],
    [504, 'AI_REQUEST_UNCERTAIN', 'esito incerto'],
    [504, 'AI_TIMEOUT', 'tempo disponibile'],
    [429, 'AI_TURN_LIMIT', 'limite di elaborazione'],
    [402, 'payment_method_required', 'aziendale'],
    [403, 'forbidden', 'permesso'],
  ])('classifica %s %s senza mostrare il messaggio remoto o riprovare', async (status, code, message) => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ code, error: 'private-provider-secret' }), { status: Number(status) }));
    const run = createQuoteChatTransport({ ...options, fetch });
    const error = await run(request, signal()).catch((error: unknown) => error);
    expect(error).toBeInstanceOf(Error); expect((error as Error).message).toContain(String(message));
    expect((error as Error).message).not.toContain('private-provider-secret'); expect(fetch).toHaveBeenCalledOnce();
  });
  it('non espone neppure l’antico messaggio diagnostico locale OpenRouter', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ error: 'OpenRouter è configurato sul server: private-secret' }), { status: 503 }));
    await expect(createQuoteChatTransport({ ...options, fetch })(request, signal())).rejects.toThrow('Servizio AI non disponibile');
  });
  it('non attribuisce un 402 sconosciuto al portafoglio aziendale', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response('private-provider-secret', { status: 402 }));
    const error = await createQuoteChatTransport({ ...options, fetch })(request, signal()).catch((error: unknown) => error);
    expect((error as Error).message).toContain('crediti da verificare');
    expect((error as Error).message).not.toContain('aziendale');
    expect((error as Error).message).not.toContain('private-provider-secret');
    expect(fetch).toHaveBeenCalledOnce();
  });
  it.each([{ revision: 2 }, { turnId: otherCompany }, { simulated: true }])('rifiuta esiti estranei o simulati %o', async patch => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ ...result, ...patch })));
    await expect(createQuoteChatTransport({ ...options, fetch })(request, signal())).rejects.toThrow('turno corrente');
  });
  it('non accetta automaticamente un messaggio SSE come risultato finale', async () => {
    const response = new Response('data: ' + JSON.stringify({ type: 'draft', turnId: request.turnId, revision: request.revision, stage: 0, text: 'Sto preparando' }) + '\n\n', { headers: { 'content-type': 'text/event-stream' } });
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(response);
    await expect(createQuoteChatTransport({ ...options, fetch })(request, signal())).rejects.toThrow('incompleta');
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('non accetta un modello o un riscontro visivo diverso dal richiesto', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(new Response(JSON.stringify({ ...result, model: 'different-model' })));
    await expect(createQuoteChatTransport({ ...options, fetch })({ ...request, advanced: { model: 'anthropic/claude-sonnet-5.5', mode: 'conversation' } }, signal())).rejects.toThrow('Modello');
    expect(fetch).toHaveBeenCalledOnce();
  });
  it('scade entro il limite senza avviare tentativi sostitutivi', async () => {
    vi.useFakeTimers();
    try {
      const fetch = vi.fn<typeof globalThis.fetch>().mockImplementation(async (_url, init) => new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
      }));
      const attempt = createQuoteChatTransport({ ...options, fetch })(request, signal());
      const assertion = expect(attempt).rejects.toThrow('tempo massimo');
      await vi.advanceTimersByTimeAsync(90_001);
      await assertion; expect(fetch).toHaveBeenCalledOnce();
    } finally { vi.useRealTimers(); }
  });
});

describe('Lettura HTTP con memoria e annullamento limitati', () => {
  it('interrompe il body oltre il limite senza chiamare response.text', async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(101)); }, cancel }));
    const text = vi.spyOn(response, 'text');
    await expect(quoteResponseText(response, 100, signal())).rejects.toThrow('troppo grande');
    expect(cancel).toHaveBeenCalledOnce(); expect(text).not.toHaveBeenCalled();
  });
  it('conta i byte e non soltanto il numero di caratteri', async () => {
    await expect(quoteResponseText(new Response('€€'), 5, signal())).rejects.toThrow('troppo grande');
  });
  it('annulla anche un body che resta in attesa', async () => {
    const cancel = vi.fn(); const ctrl = new AbortController();
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }));
    const read = quoteResponseText(response, 100, ctrl.signal);
    ctrl.abort();
    await expect(read).rejects.toThrow(); expect(cancel).toHaveBeenCalledOnce();
  });
});
