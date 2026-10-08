/** Execute the real Edge handler against in-memory tables; no provider or network. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbMinimo, denoFinto } from '../helpers/edgeFinto';

const runtime = vi.hoisted(() => ({
  db: null as unknown as DbMinimo,
  handler: null as null | ((request: Request) => Promise<Response>),
  embed: vi.fn(), complete: vi.fn(),
}));
vi.mock('https://deno.land/x/xhr@0.1.0/mod.ts', () => ({}));
vi.mock('https://deno.land/std@0.190.0/http/server.ts', () => ({
  serve: (handler: (request: Request) => Promise<Response>) => { runtime.handler = handler; },
}));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient: () => runtime.db }));
vi.mock('../../../supabase/functions/_shared/auth.ts', () => ({
  isInternalRequest: () => true, requireInternalSecret: (): void => undefined,
  requireAuth: async () => ({ userId: 'user' }),
  requireCompanyAccess: async () => ({ companyId: 'company', isSuperAdmin: false }),
}));
vi.mock('../../../supabase/functions/_shared/aiRouter.ts', () => ({ aiRouterComplete: (...args: unknown[]) => runtime.complete(...args) }));
vi.mock('../../../supabase/functions/_shared/brainEmbed.ts', () => ({
  generateEmbedding: (...args: unknown[]) => runtime.embed(...args), contentHash: async (text: string) => text,
}));
vi.mock('../../../supabase/functions/_shared/directAiLedger.ts', () => ({
  chargeDirectAiCall: async (): Promise<void> => undefined, estimateEmbeddingUsage: () => ({ tokens: 10, costUsd: 0.001 }),
}));

beforeEach(async () => {
  vi.stubGlobal('Deno', denoFinto({ SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVICE_ROLE_KEY: 'test-only' }).finto);
  runtime.db = new DbMinimo();
  runtime.embed.mockReset().mockResolvedValue([1, 2, 3]);
  runtime.complete.mockReset().mockResolvedValue({ content: JSON.stringify({ facts: [], summary: 'Sintesi verificabile', topics: [], key_decisions: [] }) });
  runtime.db.tabelle.internal_chat_messages = [{
    id: 'message', company_id: 'company', channel_id: 'channel', sender_id: 'user',
    content: 'Conversazione fittizia per test.', created_at: '2026-10-07T10:00:00Z', message_type: 'text',
  }];
  runtime.db.tabelle.silvio_memory_checkpoints = [{
    company_id: 'company', channel_id: 'channel', user_id: 'user',
    processed_through: null, processed_message_id: null, processed_offset: 0, lease_id: null,
  }];
  runtime.db.rpcs.silvio_users_needing_memory_extract = () => [{ company_id: 'company', channel_id: 'channel', user_id: 'user' }];
  runtime.db.rpcs.silvio_claim_memory_batch = () => {
    const state = runtime.db.tabelle.silvio_memory_checkpoints[0];
    if (state.processed_message_id && state.processed_offset === 0) return null;
    state.lease_id = 'lease';
    return { ...state };
  };
  runtime.db.rpcs.silvio_record_memory_batch = () => 'summary';
  runtime.db.rpcs.brain_upsert_document = () => 'document';
  // Cursor predicates themselves are exercised by the isolated SQL suite.
  // Worker fixtures use a single message; retain the fluent OR call here.
  const original = runtime.db.from.bind(runtime.db);
  runtime.db.from = ((table: string) => Object.assign(original(table), { or: function () { return this; } })) as typeof runtime.db.from;
  if (!runtime.handler) await import('../../../supabase/functions/silvio-memory-extract/index.ts');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function run() {
  const response = await runtime.handler!(new Request('http://local/memory', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mode: 'all' }),
  }));
  return response.json();
}
const cursor = () => runtime.db.tabelle.silvio_memory_checkpoints[0];

describe('memory worker: failure-safe checkpoints', () => {
  it('embedding failure releases its lease without consuming the batch; retry succeeds', async () => {
    runtime.embed.mockRejectedValueOnce(new Error('provider temporarily unavailable'));
    expect(await run()).toMatchObject({ ok: false, processed: 0 });
    expect(cursor()).toMatchObject({ processed_message_id: null, processed_offset: 0, lease_id: null });
    expect(runtime.db.rpcChiamate.some(c => c.nome === 'silvio_record_memory_batch')).toBe(false);
    expect(await run()).toMatchObject({ ok: true, processed: 1 });
    expect(cursor()).toMatchObject({ processed_message_id: 'message', processed_offset: 0, lease_id: null });
  });
  it('publishes a valid summary even when there are no persistent facts', async () => {
    expect(await run()).toMatchObject({ ok: true });
    const published = runtime.db.rpcChiamate.find(c => c.nome === 'brain_upsert_document');
    expect(published?.args).toMatchObject({ p_source_id: 'summary', p_company_id: 'company', p_scope: 'company' });
    expect(published?.args.p_metadata).toMatchObject({ user_id: 'user' });
  });
  it('persists the first slice then resumes the tail with a different batch key', async () => {
    runtime.db.tabelle.internal_chat_messages[0].content = 'a'.repeat(14000);
    expect(await run()).toMatchObject({ ok: true, processed: 1 });
    expect(cursor().processed_offset).toBe(12000);
    expect(await run()).toMatchObject({ ok: true, processed: 1 });
    expect(cursor().processed_offset).toBe(0);
    const keys = runtime.db.rpcChiamate.filter(c => c.nome === 'silvio_record_memory_batch').map(c => c.args.p_batch_key);
    expect(keys).toEqual(['message:0:12000', 'message:12000:14000']);
    expect(await run()).toMatchObject({ ok: true, processed: 0 });
  });
  it('a database-reported promotion error prevents checkpoint advancement', async () => {
    const rpc = runtime.db.rpc.bind(runtime.db);
    vi.spyOn(runtime.db, 'rpc').mockImplementation((name, args) => name === 'brain_upsert_document'
      ? Promise.resolve({ data: null, error: { message: 'database busy' } }) : rpc(name, args));
    expect(await run()).toMatchObject({ ok: false, processed: 0 });
    expect(cursor()).toMatchObject({ processed_message_id: null, lease_id: null });
  });
  it('malformed LLM output is not silently recorded as an empty successful extraction', async () => {
    runtime.complete.mockResolvedValueOnce({ content: '{}' });
    expect(await run()).toMatchObject({ ok: false, processed: 0 });
    expect(runtime.embed).not.toHaveBeenCalled();
    expect(cursor().processed_message_id).toBeNull();
  });
});
