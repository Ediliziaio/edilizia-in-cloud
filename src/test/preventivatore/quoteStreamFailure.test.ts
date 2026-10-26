import { afterEach, describe, expect, it, vi } from 'vitest';
import { AiTurnLimitError } from '../../../supabase/functions/_shared/aiTurnControl';
import { AiProviderCreditError, AiRequestGuardError } from '../../../supabase/functions/_shared/aiRequestGuard';
import { classifyQuoteFailure, publicQuoteFailure } from '../../../supabase/functions/_shared/quoteFailure';
import { quoteEventResponse } from '../../../supabase/functions/_shared/quoteStream';
import { readQuoteStream } from '@/lib/preventivi/quoteStream';
import { usePaymentGateStore } from '@/store/paymentGateStore';

const identity = { turnId: 'test-turn', revision: 1 };
afterEach(() => vi.restoreAllMocks());
describe('Interruzioni AI: categorie sicure e nessun risultato parziale', () => {
  it.each([
    [new AiTurnLimitError('time'), 'AI_TIMEOUT'],
    [new AiTurnLimitError('tokens'), 'AI_TURN_LIMIT'],
    [new AiTurnLimitError('attempts'), 'AI_TURN_LIMIT'],
    [new AiTurnLimitError('cost'), 'AI_TURN_LIMIT'],
    [new AiProviderCreditError(), 'AI_PROVIDER_CREDIT'],
    [Object.assign(new Error('ledger unavailable: dati del fornitore'), { name: 'AiRouterBillingError' }), 'AI_BILLING_UNAVAILABLE'],
    [new AiRequestGuardError('provider_outcome_unknown'), 'AI_REQUEST_UNCERTAIN'],
    [new AiRequestGuardError('completion_unavailable'), 'AI_REQUEST_UNCERTAIN'],
    [new AiRequestGuardError('checkpoint_unavailable'), 'AI_REQUEST_UNCERTAIN'],
    [new DOMException('private-provider-payload', 'TimeoutError'), 'AI_TIMEOUT'],
    [new Error('private-provider-payload'), 'AI_RESPONSE_INVALID'],
  ])('classifica %s senza esporre il payload', async (error, code) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const run = vi.fn(async (_emit, draft) => { draft('Anteprima da non applicare', 0); throw error; });
    const response = quoteEventResponse(run, identity, new AbortController().signal, {});
    await expect(readQuoteStream(response, identity, new AbortController().signal)).rejects.toMatchObject({ code });
    expect(run).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('[quote-chat-stream]', { code });
    expect(JSON.stringify(log.mock.calls)).not.toContain('private-provider-payload');
    expect(JSON.stringify(classifyQuoteFailure(error))).not.toContain('private-provider-payload');
  });
  it.each(['__proto__', 'constructor', 'private-provider-payload', null, {}, 1])('ignora codici o messaggi non autorizzati: %s', async code => {
    const result = publicQuoteFailure(code);
    expect(result.code).toBe('AI_RESPONSE_INVALID');
    const response = new Response(`data: ${JSON.stringify({ type: 'error', ...identity, code, message: 'private-provider-payload' })}\n\n`);
    await expect(readQuoteStream(response, identity, new AbortController().signal)).rejects.toThrow('Bozza intatta');
  });
  it('un errore senza codice dal backend precedente resta compatibile', async () => {
    await expect(readQuoteStream(new Response(`data: ${JSON.stringify({ type: 'error', ...identity })}\n\n`), identity, new AbortController().signal))
      .rejects.toMatchObject({ code: 'AI_RESPONSE_INVALID' });
  });
  it('l’annullamento non viene registrato come errore del servizio', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const controller = new AbortController();
    let finish!: () => void;
    const response = quoteEventResponse(async () => { await new Promise<void>(r => { finish = r; }); throw new Error('cancelled'); }, identity, controller.signal, {});
    controller.abort(); finish();
    await response.text();
    expect(log).not.toHaveBeenCalled();
  });
});

describe('Crediti AI finiti nel flusso: si apre la finestra di ricarica', () => {
  const nelFlusso = async (error: Error) => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    usePaymentGateStore.getState().hide();
    const run = vi.fn(async (): Promise<never> => { throw error; });
    const response = quoteEventResponse(run, identity, new AbortController().signal, {});
    await readQuoteStream(response, identity, new AbortController().signal).catch((): undefined => undefined);
    return usePaymentGateStore.getState();
  };

  it('crediti dell’azienda finiti: finestra aperta sul portafoglio AI, con la frase pubblica', async () => {
    const s = await nelFlusso(Object.assign(new Error('Credito insufficiente: chiave sk-or-segreta'), { name: 'AiCompanyCreditError' }));
    expect(s.open).toBe(true); expect(s.kind).toBe('credits');
    expect(s.dettaglio?.portafoglio).toBe('ai');
    expect(JSON.stringify(s.dettaglio)).not.toContain('sk-or');
  });

  it('crediti della piattaforma finiti (OpenRouter): NESSUNA richiesta di ricarica all’azienda', async () => {
    const s = await nelFlusso(new AiProviderCreditError());
    expect(s.open).toBe(false);
  });

  it('un errore qualunque non apre niente', async () => {
    expect((await nelFlusso(new Error('x'))).open).toBe(false);
  });
});

describe('Diagnosi di una risposta scartata: dettaglio solo per la demo, mai nei log', () => {
  const eventi = async (error: Error) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const run = vi.fn(async (): Promise<never> => { throw error; });
    const response = quoteEventResponse(run, identity, new AbortController().signal, {});
    const testo = await response.text();
    return { testo, log };
  };

  it('cliente reale: né il motivo né un dettaglio, né nell’evento né nei log', async () => {
    const { testo, log } = await eventi(new Error('Proposta 2: unità «xx» non ammessa'));
    expect(JSON.stringify(log.mock.calls)).not.toContain('unità');
    expect(testo).not.toContain('unità «xx»'); expect(testo).not.toContain('"detail"');
  });

  it('azienda demo: il dettaglio è nell’evento, ma non nei log', async () => {
    const errore = Object.assign(new Error('x'), { demoDetail: 'Error: Proposta 2 non valida' });
    const { testo, log } = await eventi(errore);
    expect(testo).toContain('"detail":"Error: Proposta 2 non valida"');
    expect(JSON.stringify(log.mock.calls)).not.toContain('Proposta 2');
  });
});

describe('Eventi del flusso: solo turno e revisione, mai la richiesta intera', () => {
  const richiestaPesante = { ...identity, companyId: 'azienda', advanced: { vision: { dataUrl: 'data:image/jpeg;base64,' + 'A'.repeat(200_000) } }, messages: [{ role: 'user', text: 'x'.repeat(5000) }] };

  it('con una planimetria in base64 nella richiesta, il flusso resta piccolo e il client lo legge', async () => {
    const run = vi.fn(async (emit: (s: 'analysis') => void, draft: (t: string, st: 0 | 1) => void) => { emit('analysis'); draft('Anteprima', 0); return { ok: true }; });
    const response = quoteEventResponse(run, richiestaPesante, new AbortController().signal, {});
    const testo = await response.clone().text();
    expect(testo.length).toBeLessThan(2000);
    expect(testo).not.toContain('AAAA'); expect(testo).not.toContain('azienda');
    await expect(readQuoteStream(response, identity, new AbortController().signal)).resolves.toEqual({ ok: true });
  });

  it('anche l’evento di errore non porta con sé la richiesta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const run = vi.fn(async (): Promise<never> => { throw new Error('x'); });
    const testo = await quoteEventResponse(run, richiestaPesante, new AbortController().signal, {}).text();
    expect(testo.length).toBeLessThan(1500); expect(testo).toContain('"code":"AI_RESPONSE_INVALID"'); expect(testo).not.toContain('AAAA');
  });
});

describe('Addebito non riuscito dopo la risposta del modello', () => {
  it('l’utente legge un messaggio chiaro e SENZA richiesta di ricarica (è un guasto nostro)', () => {
    const f = publicQuoteFailure('AI_BILLING_UNAVAILABLE');
    expect(f.message).toMatch(/addebito dei crediti AI non è riuscito/); expect(f.message).toMatch(/bozza intatta/i);
    expect(f.message).not.toMatch(/ricarica|insufficienti/i);
  });

  it('nel flusso arriva come codice dedicato e non apre la finestra di ricarica', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    usePaymentGateStore.getState().hide();
    const run = vi.fn(async (): Promise<never> => { throw Object.assign(new Error('x'), { name: 'AiRouterBillingError' }); });
    const response = quoteEventResponse(run, identity, new AbortController().signal, {});
    await expect(readQuoteStream(response, identity, new AbortController().signal)).rejects.toMatchObject({ code: 'AI_BILLING_UNAVAILABLE' });
    expect(usePaymentGateStore.getState().open).toBe(false);
  });
});
