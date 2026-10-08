import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbMinimo } from '../helpers/edgeFinto';

const runtime = vi.hoisted(() => ({
  db: null as unknown as DbMinimo,
  handler: null as null | ((request: Request) => Promise<Response>),
  embed: vi.fn(),
}));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient: () => runtime.db }));
vi.mock('../../../supabase/functions/_shared/brainEmbed.ts', () => ({
  generateEmbedding: (...args: unknown[]) => runtime.embed(...args), contentHash: async () => 'test-hash',
}));

beforeEach(async () => {
  const env: Record<string, string> = { SUPABASE_URL: 'http://127.0.0.1:54321', SUPABASE_SERVICE_ROLE_KEY: 'test', INTERNAL_CRON_SECRET: 'local-test-secret' };
  vi.stubGlobal('Deno', {
    env: { get: (key: string) => env[key] },
    serve: (handler: (request: Request) => Promise<Response>) => { runtime.handler = handler; },
  });
  runtime.db = new DbMinimo();
  runtime.embed.mockReset().mockResolvedValue([1, 2, 3]);
  runtime.db.rpcs.silvio_self_improvement_aggregate = () => ({
    top_rated: [{ run_id: 'run', response_excerpt: 'Esempio fittizio abbastanza lungo da essere analizzato come risposta di test.', prompt_excerpt: 'Richiesta fittizia', persona_key: 'silvio' }],
    bottom_rated: [], total_rated_runs: 1, period_start: '2026-10-01', period_end: '2026-10-07',
  });
  runtime.db.rpcs.silvio_promote_reviewed_learning = () => 0;
  if (!runtime.handler) await import('../../../supabase/functions/silvio-self-improvement/index.ts');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function run(method = 'POST') {
  const response = await runtime.handler!(new Request('http://local/learn', {
    method, headers: { 'x-cron-secret': 'local-test-secret', 'Content-Type': 'application/json' },
    ...(method === 'POST' ? { body: '{}' } : {}),
  }));
  return { status: response.status, body: await response.json() };
}

describe('administrative learning: honest results and private writes', () => {
  it('saves required fields only in private admin scope', async () => {
    expect((await run()).body).toMatchObject({ ok: true, gold_added: 1 });
    expect(runtime.db.tabelle.ai_brain_documents[0]).toMatchObject({
      scope: 'silvio_admin', company_id: null, source_type: 'admin_feedback', source_id: 'run',
      content_hash: 'test-hash', source_hash: 'test-hash',
    });
  });
  it('an embedding failure is returned as a failed run, not as success with zero changes', async () => {
    runtime.embed.mockRejectedValueOnce(new Error('provider unavailable'));
    expect((await run()).body).toMatchObject({ ok: false, gold_added: 0, errors_count: 1 });
    expect(runtime.db.tabelle.silvio_self_improvement_log[0].ok).toBe(false);
  });
  it('log persistence failures are reported', async () => {
    const from = runtime.db.from.bind(runtime.db);
    runtime.db.from = ((table: string) => {
      const query = from(table);
      if (table === 'silvio_self_improvement_log') Object.assign(query, {
        then: (resolve: (result: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'log unavailable' } }).then(resolve),
      });
      return query;
    }) as typeof runtime.db.from;
    const { body } = await run();
    expect(body).toMatchObject({ ok: false, errors_count: 1 });
    expect(body.errors[0].run_id).toBe('_log');
  });
  it('GET cannot run learning writes', async () => {
    expect((await run('GET')).status).toBe(405);
    expect(runtime.db.scritture).toHaveLength(0);
    expect(runtime.embed).not.toHaveBeenCalled();
  });
  it('never falls back to the unsafe legacy promoter when the review migration is unavailable', async () => {
    const legacy = vi.fn(() => 10);
    runtime.db.rpcs.silvio_self_improvement_promote = legacy;
    runtime.db.rpcs.silvio_promote_reviewed_learning = () => { throw new Error('review migration missing'); };
    const { body } = await run();
    expect(body).toMatchObject({ ok: false, promoted_to_memory: 0, errors_count: 1 });
    expect(body.errors[0].run_id).toBe('_promote');
    expect(legacy).not.toHaveBeenCalled();
  });
});
