import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '@supabase/supabase-js';
const state = vi.hoisted(() => ({ tables: {} as Record<string, Record<string, unknown>[]>,
  requests: [] as { table: string; filters: [string, string, unknown][]; from: number; to: number }[], errorTable: '' }));
vi.mock('@tanstack/react-query', () => ({ useQuery: (options: unknown) => options }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: (table: string) => {
  const request = { table, filters: [] as [string, string, unknown][], from: 0, to: 0 };
  const builder = { select: () => builder, order: () => builder,
    eq: (column: string, value: unknown) => { request.filters.push(['eq', column, value]); return builder; },
    in: (column: string, value: unknown[]) => { request.filters.push(['in', column, value]); return builder; },
    contains: (column: string, value: string) => { request.filters.push(['contains', column, value]); return builder; },
    range: async (from: number, to: number) => {
      request.from = from; request.to = to; state.requests.push(request);
      const rows = (state.tables[table] ?? []).filter(row => request.filters.every(([mode, column, value]) =>
        mode === 'eq' ? row[column] === value : mode === 'contains'
          ? Array.isArray(row[column]) && (JSON.parse(value as string) as Record<string, unknown>[]).every(needle => (row[column] as Record<string, unknown>[])
            .some(item => Object.entries(needle).every(([key, val]) => item[key] === val)))
          : (value as unknown[]).includes(row[column]))).sort((a, b) => String(a.id).localeCompare(String(b.id)));
      return { data: rows.slice(from, to + 1), error: table === state.errorTable ? new Error('Accesso negato') : null };
    } };
  return builder;
} } }));
import { allPaymentRows, useSupplierPayments, useSupplierPaymentNames } from '@/hooks/useSupplierPayments';
type Options = { queryKey: unknown[]; enabled: boolean; queryFn: () => Promise<{ invoices: unknown[]; entries: unknown[]; orders: unknown[]; ambiguousCostIds: string[] }> };
beforeEach(() => {
  state.requests = []; state.errorTable = '';
  state.tables = {
    purchase_orders: [{ id: 'po', company_id: 'demo', order_id: 'job', supplier_id: 'supplier' },
      { id: 'foreign', company_id: 'other', order_id: 'job', supplier_id: 'foreign' }],
    company_costs: [{ id: 'cost', company_id: 'demo', order_id: 'job' }],
    fatture_ricevute: [{ id: 'invoice', company_id: 'demo', purchase_order_id: 'po', company_cost_id: 'cost', prima_nota_id: 'pn' },
      { id: 'suggested', company_id: 'demo', order_id_suggerito: 'job' }],
    prima_nota_entries: [{ id: 'pn', company_id: 'demo', cost_id: 'cost' }],
    scadenze: [], suppliers: [{ id: 'supplier', company_id: 'demo', name: 'Fornitore' }],
  };
});
describe('Lettura pagamenti per commessa e azienda', () => {
  it('il client reale serializza il filtro JSONB senza convertirlo in un array PostgreSQL', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const client = createClient('https://demo.invalid', 'demo-only-key', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch },
    });
    await client.from('company_costs').select('id').eq('company_id', 'demo')
      .contains('allocations', JSON.stringify([{ order_id: 'job' }]));
    const sentUrl = new URL(String(fetch.mock.calls[0]?.[0]));
    expect(sentUrl.searchParams.get('allocations')).toBe('cs.[{"order_id":"job"}]');
    expect(sentUrl.searchParams.get('company_id')).toBe('eq.demo');
  });
  it('tutte le query hanno il filtro azienda, le cache cambiano al cambio tenant', async () => {
    const config = useSupplierPayments('demo', 'job') as unknown as Options;
    expect(config.queryKey).toEqual(['order-supplier-payments', 'job', 'demo']);
    const result = await config.queryFn();
    expect(result.orders).toHaveLength(1);
    expect(result.invoices).toHaveLength(1); // AI suggestion alone is not evidence.
    expect(result.entries).toHaveLength(1); // cost and explicit ID reads deduplicated.
    for (const request of state.requests) expect(request.filters).toContainEqual(['eq', 'company_id', 'demo']);
    const names = useSupplierPaymentNames('demo', ['supplier']) as unknown as Options;
    expect(await names.queryFn()).toEqual({ supplier: 'Fornitore' });
    expect(state.requests.at(-1)?.filters).toContainEqual(['eq', 'company_id', 'demo']);
  });
  it('costi condivisi non attribuiscono tutta la PN a una sola commessa', async () => {
    state.tables.fatture_ricevute.push({ id: 'outside', company_id: 'demo', company_cost_id: 'cost', purchase_order_id: 'other-po' });
    const config = useSupplierPayments('demo', 'job') as unknown as Options;
    const result = await config.queryFn();
    expect(result.invoices).toHaveLength(1);
    expect(result.ambiguousCostIds).toEqual(['cost']);
  });
  it('un costo di un’altra commessa viene segnalato anche se la fattura indica questo OdA', async () => {
    state.tables.company_costs[0].order_id = 'different-job';
    const config = useSupplierPayments('demo', 'job') as unknown as Options;
    expect((await config.queryFn()).ambiguousCostIds).toEqual(['cost']);
  });
  it('legge il subappalto senza OdA tramite allocazione esplicita al 100%', async () => {
    state.tables.company_costs.push({ id: 'sub-cost', company_id: 'demo', order_id: null, allocations: [{ order_id: 'job', pct: 100 }] });
    state.tables.fatture_ricevute.push({ id: 'sub-invoice', company_id: 'demo', company_cost_id: 'sub-cost', purchase_order_id: null });
    const config = useSupplierPayments('demo', 'job') as unknown as Options;
    const result = await config.queryFn();
    expect(result.invoices).toHaveLength(2);
    expect(result.ambiguousCostIds).toEqual([]);
    expect(state.requests.find(r => r.filters.some(f => f[0] === 'contains'))?.filters)
      .toContainEqual(['contains', 'allocations', JSON.stringify([{ order_id: 'job' }])]);
  });
  it('un costo ripartito su più cantieri non attribuisce tutto il pagamento qui', async () => {
    state.tables.company_costs[0].allocations = [{ order_id: 'job', pct: 50 }, { order_id: 'other-job', pct: 50 }];
    const config = useSupplierPayments('demo', 'job') as unknown as Options;
    expect((await config.queryFn()).ambiguousCostIds).toEqual(['cost']);
  });
  it('errori di accesso non vengono trasformati in array vuoti', async () => {
    state.errorTable = 'prima_nota_entries';
    const config = useSupplierPayments('demo', 'job') as unknown as Options;
    await expect(config.queryFn()).rejects.toThrow('Accesso negato');
  });
  it('senza tenant o commessa la lettura è disabilitata', () => {
    expect((useSupplierPayments('', 'job') as unknown as Options).enabled).toBe(false);
    expect((useSupplierPayments('demo') as unknown as Options).enabled).toBe(false);
  });
  it('non tronca a 500/1000 righe e usa intervalli inclusivi non sovrapposti', async () => {
    const rows = Array.from({ length: 1201 }, (_, id) => ({ id }));
    const ranges: number[][] = [];
    const result = await allPaymentRows(async (from, to) => { ranges.push([from, to]); return { data: rows.slice(from, to + 1), error: null }; });
    expect(result).toHaveLength(1201);
    expect(ranges).toEqual([[0, 499], [500, 999], [1000, 1499]]);
  });
});
