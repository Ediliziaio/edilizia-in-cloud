import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest';
import { type GuardDb } from '../../../supabase/functions/_shared/aiRequestGuard';
const state = vi.hoisted(() => ({ credit: true, rateOk: true, production:false, billingCompany:'d2000000-0000-4000-a000-000000000002', flag: true, configured: true, handler: undefined as undefined | ((r: Request) => Promise<Response>), guardState: 'claimed', cached: null as unknown, events: [] as string[], finishes: [] as Record<string, unknown>[], auth: true, member: true, edit: true, payment: true, charged: true }));
const company = 'd2000000-0000-4000-a000-000000000002';
const id = '11111111-1111-4111-a111-111111111111';
const db: GuardDb = { rpc: vi.fn(async (name, args) => {
  state.events.push(name);
  if (name === 'ai_provider_request_claim') return { data: { state: state.guardState, result: state.cached } };
  if (name === 'ai_provider_request_finish') { state.finishes.push(args); if (args.p_result) { state.cached = args.p_result; state.guardState = 'completed'; } else state.guardState = 'reconciliation_required'; }
  if (name === 'check_ai_router_rate_limit') return { data: { allowed: state.rateOk, retry_after_seconds: 9 } };
  if (name === 'precheck_ai_credit') return { data: { ok: state.credit, reason: 'balance_too_low' } };
  return { data: true };
}) };
vi.mock('../../../supabase/functions/_shared/headers.ts', () => ({ getCorsHeaders: () => ({}), jsonResponse: (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }), errorResponse: (error: string, status: number) => new Response(JSON.stringify({ error }), { status }) }));
vi.mock('../../../supabase/functions/_shared/auth.ts', () => ({ requireAuth: vi.fn(async () => { state.events.push('auth'); if (!state.auth) throw new Response('', { status: 401 }); return { userId: id, supabaseAdmin: db }; }), requireCompanyAccess: vi.fn(async () => { state.events.push('company'); if (!state.member) throw new Response('', { status: 403 }); }) }));
vi.mock('../../../supabase/functions/_shared/permessoAzienda.ts', () => ({ verificaPermessoAzienda: vi.fn(async () => { state.events.push('edit'); if (!state.edit) throw Error('no permission'); }) }));
vi.mock('../../../supabase/functions/_shared/requirePaymentMethod.ts', () => ({ gateAiPayment: vi.fn(async () => { state.events.push('payment'); return state.payment ? null : new Response('', { status: 402 }); }) }));
vi.mock('../../../supabase/functions/_shared/aiRouter.ts', () => ({ aiRouterComplete: vi.fn(() => { throw Error('No chat inference during audio'); }) }));
vi.mock('../../../supabase/functions/_shared/ai-provider/directApi.ts', () => ({ estimateWhisperCostUsd: (seconds: number) => seconds / 60 * .006, chargeAndLogDirect: vi.fn(async (args: Record<string, unknown>) => { state.events.push('charge'); expect(args.company_id).toBe(state.billingCompany); expect(args).toMatchObject({ cost_is_estimated: true, task_kind: 'audio_transcription', metadata: { scope: 'quote_chat_audio' } }); expect(JSON.stringify(args)).not.toContain('Rifare il bagno'); return { charged: state.charged, usage_log_id: state.charged ? 'ledger-demo' : undefined }; }) }));
const provider = vi.fn<typeof fetch>();
describe('Endpoint audio Demo2: accessi, consumi e idempotenza durevole', () => {
  beforeAll(async () => { vi.stubGlobal('Deno', { env: { get: (key: string) => key === 'QUOTE_CHAT_ENABLED' ? String(state.production) : key === 'QUOTE_CHAT_DEMO_ENABLED' ? String(state.flag) : key === 'OPENAI_API_KEY' && state.configured ? 'server-only-test-key' : undefined }, serve: (fn: (r: Request) => Promise<Response>) => { state.handler = fn; } }); await import('../../../supabase/functions/ai-preventivo-conversazione/index'); });
  beforeEach(() => { Object.assign(state, { credit: true, rateOk: true, production:false, billingCompany:company, flag: true, configured: true, guardState: 'claimed', cached: null, events: [], finishes: [], auth: true, member: true, edit: true, payment: true, charged: true }); provider.mockReset(); provider.mockImplementation(async () => { state.events.push('provider'); return new Response(JSON.stringify({ text: 'Rifare il bagno', duration: 5 }), { status: 200 }); }); vi.stubGlobal('fetch', provider); });
  afterAll(() => vi.unstubAllGlobals());
  const body = () => ({ version: 1, companyId: company, sessionId: id, turnId: id, audio: { mime: 'audio/wav', base64: btoa('RIFFxxxxWAVE' + 'x'.repeat(40)) } });
  const post = (value: unknown = body()) => state.handler!(new Request('https://test/functions/v1/ai-preventivo-conversazione/audio', { method: 'POST', body: JSON.stringify(value) }));
  it('esegue auth → azienda → permesso → pagamento prima di una sola trascrizione', async () => { const response = await post(); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ text: 'Rifare il bagno', receipt: { ledgerId: 'ledger-demo', estimated: true } }); expect(state.events.slice(0, 4)).toEqual(['auth', 'company', 'edit', 'payment']); expect(provider).toHaveBeenCalledOnce(); expect(provider.mock.calls[0][0]).toBe('https://api.openai.com/v1/audio/transcriptions'); expect(state.events.indexOf('charge')).toBeGreaterThan(state.events.indexOf('provider')); });
  it('production bills the selected authorized company, never Demo2',async()=>{
    state.production=true;state.billingCompany=id;
    expect((await post({...body(),companyId:id})).status).toBe(200);
    expect(state.events.slice(0,4)).toEqual(['auth','company','edit','payment']);expect(state.events.filter(e=>e==='charge')).toHaveLength(1);
  });
  it('production still rejects a foreign tenant before provider or debit',async()=>{
    state.production=true;state.member=false;
    expect((await post({...body(),companyId:id})).status).toBe(403);expect(provider).not.toHaveBeenCalled();expect(state.events).not.toContain('charge');
  });
  it('non memorizza audio, trascrizione o chiavi nel risultato durevole', async () => { await post(); const cached = JSON.stringify(state.cached); expect(cached).not.toContain('Rifare il bagno'); expect(cached).not.toContain('base64'); expect(cached).not.toContain('server-only'); expect(cached).toContain('ledger-demo'); });
  it('un replay non ritrascrive né riaddebita', async () => { await post(); const second = await post(); expect(second.status).toBe(409); expect(provider).toHaveBeenCalledOnce(); expect(state.events.filter(x => x === 'charge')).toHaveLength(1); });
  it.each([['auth', 401], ['member', 403], ['edit', 403], ['payment', 402], ['flag', 503]] as const)('blocca il provider se manca %s', async (key, code) => { state[key] = false; expect((await post()).status).toBe(code); expect(provider).not.toHaveBeenCalled(); });
  it('saldo insufficiente: 402 prima del provider, nessun audio inviato e nessun addebito', async () => {
    state.credit = false;
    const r = await post();
    expect(r.status).toBe(402);
    expect(await r.json()).toMatchObject({ code: 'AI_COMPANY_CREDIT', wallet: 'ai' });
    expect(provider).not.toHaveBeenCalled(); expect(state.events).not.toContain('charge');
    expect(state.events.indexOf('precheck_ai_credit')).toBeGreaterThan(state.events.indexOf('check_ai_router_rate_limit'));
  });
  it('troppe richieste ravvicinate: 429 con attesa, prima del saldo e del provider', async () => {
    state.rateOk = false;
    const r = await post();
    expect(r.status).toBe(429);
    expect(await r.json()).toMatchObject({ code: 'AI_RATE_LIMIT', retryAfterSeconds: 9 });
    expect(provider).not.toHaveBeenCalled(); expect(state.events).not.toContain('precheck_ai_credit');
  });
  it('rifiuta un altro tenant e contenuti malformati', async () => { expect((await post({ ...body(), companyId: id })).status).toBe(403); expect((await post({ ...body(), audio: { mime: 'audio/wav', base64: btoa('not audio') } })).status).toBe(400); expect(provider).not.toHaveBeenCalled(); });
  it('rifiuta il corpo oltre il limite reale senza fidarsi di Content-Length', async () => { expect((await post({ ...body(), padding: 'x'.repeat(2_850_000) })).status).toBe(413); expect(provider).not.toHaveBeenCalled(); });
  it('nessun fallback ad altri servizi se manca la configurazione', async () => { state.configured = false; expect((await post()).status).toBe(503); expect(provider).not.toHaveBeenCalled(); });
  it('non restituisce una trascrizione se il consumo non è confermato', async () => { state.charged = false; expect((await post()).status).toBe(502); expect(state.guardState).toBe('reconciliation_required'); await post(); expect(provider).toHaveBeenCalledOnce(); });
  it('non ritenta un errore del provider', async () => { provider.mockResolvedValue(new Response('', { status: 500 })); expect((await post()).status).toBe(502); await post(); expect(provider).toHaveBeenCalledOnce(); expect(state.events).not.toContain('charge'); });
  it('nessuna risposta a costo non verificabile o testo vuoto', async () => { provider.mockResolvedValue(new Response(JSON.stringify({ text: '', duration: 5 }), { status: 200 })); expect((await post()).status).toBe(502); expect(state.guardState).toBe('reconciliation_required'); });
  it('blocca richieste già in corso senza spendere di nuovo', async () => { state.guardState = 'running'; expect((await post()).status).toBe(502); expect(provider).not.toHaveBeenCalled(); });
  it('il timeout provider non scatena fallback o un secondo addebito', async () => {
    vi.useFakeTimers();
    try {
      provider.mockImplementation(async (_url, options) => new Promise((_resolve, reject) => options?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))));
      const response = post();
      // Hashes use real WebCrypto, so wait for the request to start before advancing its clock.
      await vi.waitFor(() => expect(provider).toHaveBeenCalledOnce()); await vi.advanceTimersByTimeAsync(60_001);
      expect((await response).status).toBe(502); expect(state.guardState).toBe('reconciliation_required'); await post(); expect(provider).toHaveBeenCalledOnce(); expect(state.events).not.toContain('charge');
    } finally { vi.useRealTimers(); }
  });
});
