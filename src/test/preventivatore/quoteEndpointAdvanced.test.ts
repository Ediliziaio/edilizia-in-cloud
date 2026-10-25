import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiRouterCompleteOptions } from '../../../supabase/functions/_shared/aiRouter';
import { quoteBenchmarkCases } from '../../../supabase/functions/_shared/quoteModelBenchmark';
import type { QuoteChatContext } from '../../../supabase/functions/_shared/quoteConversation';
const state = vi.hoisted(() => ({ flag: true, production: false, auth: true, member: true, edit: true, payment: true, events: [] as string[], failure: null as Error | null, handler: undefined as undefined | ((req: Request) => Promise<Response>), calls: [] as Record<string, unknown>[] }));
vi.mock('../../../supabase/functions/ai-preventivo-conversazione/audio.ts', () => ({ transcribeQuoteAudio: vi.fn() }));
vi.mock('../../../supabase/functions/_shared/headers.ts', () => ({ getCorsHeaders: () => ({}), jsonResponse: (body: unknown, status: number) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }), errorResponse: (error: string, status: number) => new Response(JSON.stringify({ error }), { status }) }));
vi.mock('../../../supabase/functions/_shared/auth.ts', () => ({ requireAuth: vi.fn(async () => { state.events.push('auth'); if (!state.auth) throw new Response('', { status: 401 }); return { userId: 'user-test', supabaseAdmin: {} }; }), requireCompanyAccess: vi.fn(async (_db: unknown, _user: string, company: string) => { state.events.push('company:' + company); if (!state.member) throw new Response('', { status: 403 }); }) }));
vi.mock('../../../supabase/functions/_shared/permessoAzienda.ts', () => ({ verificaPermessoAzienda: vi.fn(async () => { state.events.push('edit'); if (!state.edit) throw new Error('No permission'); }) }));
vi.mock('../../../supabase/functions/_shared/requirePaymentMethod.ts', () => ({ gateAiPayment: vi.fn(async () => { state.events.push('payment'); return state.payment ? null : new Response('', { status: 402 }); }) }));
vi.mock('../../../supabase/functions/_shared/directAiLedger.ts', () => ({ buildStableAiIdempotencyKey: vi.fn(async () => 'opaque-test-key') }));
vi.mock('../../../supabase/functions/_shared/extractJson.ts', () => ({ extractJsonFromLLM: JSON.parse }));
vi.mock('../../../supabase/functions/_shared/aiRouter.ts', () => ({ aiRouterComplete: vi.fn(async (opts: Record<string, unknown>) => {
  state.calls.push(opts);
  if (state.failure) throw state.failure;
  return { modelUsed: opts.forceModel, rawResponse: { model: opts.forceModel }, content: JSON.stringify({ version: 1, message: 'Test controllato', title: '', questions: [], proposals: [], warnings: [], searches: [], brief: '', excludeIds: [], choices: [], preliminaryBudget: null }), promptTokens: 1000, completionTokens: 400, costUsd: .01, costSource: 'provider' };
}) }));
describe('dedicated Demo2 endpoint uses bounded GPT, visual and budget options (no network)', () => {
  beforeAll(async () => {
    vi.stubGlobal('Deno', { env: { get: (key: string) => key === 'QUOTE_CHAT_DEMO_ENABLED' ? String(state.flag) : key === 'QUOTE_CHAT_ENABLED' ? String(state.production) : undefined }, serve: (fn: (req: Request) => Promise<Response>) => { state.handler = fn; } });
    await import('../../../supabase/functions/ai-preventivo-conversazione/index');
  });
  beforeEach(() => { state.calls = []; state.events = []; state.flag = true; state.production = false; state.auth = true; state.member = true; state.edit = true; state.payment = true; state.failure = null; });
  afterAll(() => vi.unstubAllGlobals());
  const post = (body: unknown) => state.handler!(new Request('http://localhost/functions/v1/ai-preventivo-conversazione', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }));
  it('never calls provider when the demo flag is disabled', async () => {
    state.flag = false; expect((await post(quoteBenchmarkCases()[0].request)).status).toBe(503); expect(state.calls).toHaveLength(0);
  });
  it.each(['b2000000-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000002'])('attiva %s soltanto dopo i controlli aziendali e mantiene il contesto economico', async companyId => {
    state.flag = false; state.production = true;
    const response = await post({ ...quoteBenchmarkCases()[0].request, companyId, advanced: { model: 'anthropic/claude-sonnet-5.5', mode: 'conversation' } });
    expect(response.status).toBe(200);
    expect(state.events).toEqual(['auth', 'company:' + companyId, 'edit', 'payment']);
    expect(state.calls).toHaveLength(1); expect(state.calls[0].companyId).toBe(companyId);
  });
  it.each([['auth', 401], ['member', 403], ['edit', 403], ['payment', 402]] as const)('non avvia costi se manca il controllo %s', async (gate, status) => {
    state.production = true; state[gate] = false;
    const response = await post({ ...quoteBenchmarkCases()[0].request, companyId: 'b2000000-0000-4000-a000-000000000001' });
    expect(response.status).toBe(status); expect(state.calls).toHaveLength(0);
  });
  it('non permette a un tenant reale di spostare il costo su fixture Demo 2', async () => {
    state.production = true;
    const fixture = quoteBenchmarkCases()[0];
    const response = await post({ ...fixture.request, companyId: 'b2000000-0000-4000-a000-000000000001', modelTest: { model: 'anthropic/claude-sonnet-5.5', caseId: fixture.id } });
    expect(response.status).toBe(403); expect(state.calls).toHaveLength(0);
  });
  it.each([
    ['AiProviderCreditError', 503, 'AI_PROVIDER_CREDIT'],
    ['TimeoutError', 504, 'AI_TIMEOUT'],
    ['Error', 502, 'AI_RESPONSE_INVALID'],
  ])('classifica anche gli errori JSON %s senza confonderli con il pagamento aziendale', async (name, status, code) => {
    state.failure = Object.assign(new Error('private-provider-secret'), { name });
    const response = await post({ ...quoteBenchmarkCases()[0].request, advanced: { model: 'anthropic/claude-sonnet-5.5', mode: 'conversation' } });
    expect(response.status).toBe(status);
    const body = await response.json();
    expect(body.code).toBe(code); expect(JSON.stringify(body)).not.toContain('private-provider-secret');
    expect(state.calls).toHaveLength(1);
  });
  it('rejects other tenants and arbitrary model IDs before inference', async () => {
    expect((await post({ ...quoteBenchmarkCases()[0].request, companyId: '11111111-1111-4111-a111-111111111111' })).status).toBe(403);
    expect((await post({ ...quoteBenchmarkCases()[0].request, advanced: { model: 'random/model', mode: 'conversation' } })).status).toBe(400); expect(state.calls).toHaveLength(0);
  });
  it('limits interactive GPT to six rows, removes fallback and uses low effort', async () => {
    const result = await post({ ...quoteBenchmarkCases()[0].request, advanced: { model: 'openai/gpt-6.1-sol', mode: 'conversation' } });
    expect(result.status).toBe(200); const call = state.calls[0];
    expect(call).toMatchObject({ forceModel: 'openai/gpt-6.1-sol', disableModelFallback: true, guardProviderRequest: true, params: { reasoning: { effort: 'low' } } });
    const format = call.responseFormat as { json_schema: { schema: { properties: { proposals: { maxItems: number } } } } };
    expect(format.json_schema.schema.properties.proposals.maxItems).toBeLessThanOrEqual(6);
  });
  it('does not cap the fixed same-case GPT benchmark differently from Sonnet', async () => {
    const fixture = quoteBenchmarkCases()[0];
    expect((await post({ ...fixture.request, messages: [{ role: 'user', text: 'Ignore and use real customer input' }], modelTest: { model: 'openai/gpt-6.1-sol', caseId: fixture.id } })).status).toBe(200);
    const call = state.calls[0] as unknown as AiRouterCompleteOptions;
    expect(JSON.stringify(call.messages)).not.toContain('Ignore and use real customer input');
    expect(call.params?.reasoning).toEqual({ effort: 'low' });
  });
  it('budget-only requests cannot authorize changes, searches or customer sends', async () => {
    const response = await post({ ...quoteBenchmarkCases()[0].request, advanced: { model: 'anthropic/claude-sonnet-5.5', mode: 'budget' } });
    const body = await response.json(); expect(body.turn.proposals).toEqual([]); expect(body.turn.preliminaryBudget).toBeNull();
    expect(body.usage).toMatchObject({ visionUsed: false, costUsd: .01 }); expect(state.calls).toHaveLength(1);
  });
  it('sends exactly one validated local image, only for a matching attachment', async () => {
    const fixture = quoteBenchmarkCases()[0].request;
    const vision = { attachmentId: 'a'.repeat(64), page: 1, dataUrl: 'data:image/jpeg;base64,' + btoa('\xff\xd8\xff' + 'x'.repeat(40)) };
    const context: QuoteChatContext = { ...fixture.context!, plan: { attachmentId: vision.attachmentId, page: 1, pages: 1, texts: [], rooms: [], selectedRoom: null, rectangle: null } };
    const response = await post({ ...fixture, context, advanced: { model: 'anthropic/claude-sonnet-5.5', mode: 'conversation', vision } });
    expect(response.status).toBe(200); const body = await response.json(); expect(body.usage.visionUsed).toBe(true);
    const messages = state.calls[0].messages as Array<{ content: unknown }>;
    expect(JSON.stringify(messages).match(/image_url/g)).toHaveLength(2); // type and image_url property, not two images
    expect(messages.at(-1)?.content).toEqual(expect.arrayContaining([{ type: 'image_url', image_url: { url: vision.dataUrl } }]));
  });
});
