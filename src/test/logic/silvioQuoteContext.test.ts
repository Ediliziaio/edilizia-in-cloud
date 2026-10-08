import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DbMinimo, denoFinto } from '../helpers/edgeFinto';

const runtime = vi.hoisted(() => ({
  db: null as unknown as DbMinimo,
  handler: null as null | ((request: Request) => Promise<Response>),
  embed: vi.fn(),
}));
vi.mock('https://deno.land/std@0.190.0/http/server.ts', () => ({
  serve: (handler: (request: Request) => Promise<Response>) => { runtime.handler = handler; },
}));
vi.mock('https://esm.sh/@supabase/supabase-js@2', () => ({ createClient: () => runtime.db }));
vi.mock('../../../supabase/functions/_shared/auth.ts', () => ({
  requireAuth: async () => ({ userId: 'user', supabaseAdmin: runtime.db }),
  requireCompanyAccess: async () => ({ companyId: 'company', isSuperAdmin: false }),
}));
vi.mock('../../../supabase/functions/_shared/requirePaymentMethod.ts', () => ({ gateAiPayment: async () => null }));
vi.mock('../../../supabase/functions/_shared/brainEmbed.ts', () => ({ generateEmbeddingsBatch: (...args: unknown[]) => runtime.embed(...args) }));

beforeEach(async () => {
  vi.stubGlobal('Deno', denoFinto({}).finto);
  runtime.db = new DbMinimo();
  runtime.embed.mockReset().mockResolvedValue([[1, 2, 3]]);
  runtime.db.tabelle.profiles = [{ id: 'user', company_id: 'company' }];
  runtime.db.tabelle.staff_permissions = [{ company_id: 'company', user_id: 'user', can_view_preventivi: true }];
  runtime.db.tabelle.client_margin_history = [
    { company_id: 'other', customer_name: 'Cliente', avg_acceptance_margin_pct: 99, total_quotes: 999 },
    { company_id: 'company', customer_name: 'Cliente', avg_acceptance_margin_pct: 25, total_quotes: 5 },
  ];
  runtime.db.rpcs.silvio_context_actor_roles = () => ['company_admin'];
  runtime.db.rpcs.silvio_match_brain = () => [{ id: 'document', similarity: 0.8, content: 'Offerta precedente', metadata: {} }];
  if (!runtime.handler) await import('../../../supabase/functions/ai-quote-supreme/index.ts');
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function run(extra: Record<string, unknown> = {}) {
  const response = await runtime.handler!(new Request('http://local/quote', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode: 'advise', customer_name: 'Cliente', project_description: 'Un bagno nuovo', proposed_total: 12000, ...extra }),
  }));
  return { status: response.status, body: await response.json() };
}

describe('quote intelligence respects actor context', () => {
  it('administrator history stays in its company and RAG receives the verified actor', async () => {
    const { body } = await run();
    expect(body.customer_intelligence.total_quotes).toBe(5);
    const rag = runtime.db.rpcChiamate.find(c => c.nome === 'silvio_match_brain');
    expect(rag?.args).toMatchObject({ p_company_id: 'company', p_user_id: 'user', p_scope: 'company' });
  });
  it('authorized staff receive no customer history, margins or historical quote excerpts', async () => {
    runtime.db.rpcs.silvio_context_actor_roles = () => ['company_staff'];
    const { status, body } = await run();
    expect(status).toBe(200);
    expect(body.customer_intelligence).toBeNull();
    expect(body.similar_quotes).toEqual([]);
    expect(body.requires_human_review).toBe(true);
    expect(runtime.embed).not.toHaveBeenCalled();
    expect(runtime.db.rpcChiamate.some(c => c.nome === 'silvio_match_brain')).toBe(false);
    expect(JSON.stringify(runtime.db.tabelle.quote_generation_audit)).not.toContain('avg_acceptance_margin_pct');
  });
  it('staff without access to quotes are rejected before paid work', async () => {
    runtime.db.rpcs.silvio_context_actor_roles = () => ['company_staff'];
    runtime.db.tabelle.staff_permissions[0].can_view_preventivi = false;
    expect((await run()).status).toBe(403);
    expect(runtime.embed).not.toHaveBeenCalled();
  });
  it('a customer name containing filter syntax is treated as a literal value', async () => {
    const { body } = await run({ customer_name: 'Cliente,company_id.eq.other' });
    expect(body.customer_intelligence).toBeNull();
  });
  it('retrieval failure is disclosed and requires human review', async () => {
    const rpc = runtime.db.rpc.bind(runtime.db);
    vi.spyOn(runtime.db, 'rpc').mockImplementation((name, args) => name === 'silvio_match_brain'
      ? Promise.resolve({ data: null, error: { message: 'unavailable' } }) : rpc(name, args));
    const { body } = await run();
    expect(body.similar_quotes).toEqual([]);
    expect(body.warnings.join(' ')).toContain('storici non disponibile');
    expect(body.requires_human_review).toBe(true);
  });
});
