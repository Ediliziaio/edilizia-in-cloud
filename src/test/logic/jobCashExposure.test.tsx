import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ data: undefined as unknown, error: false }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: state.data, isLoading: false, isError: state.error }) }));
vi.mock('@/hooks/useEffectiveCompanyId', () => ({ useEffectiveCompanyId: () => 'demo' }));
vi.mock('@/hooks/useSupplierPayments', () => ({ allPaymentRows: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { useEsposizioneCommessa } from '@/hooks/useEsposizioneCommessa';
const props = { orderId: 'job', totalAmount: 100000, vatRate: 10, financingCost: 0, installments: [
  { position: 0, type: 'deposit', amount: 33000, is_paid: true, paid_date: '2025-02-01' },
  { position: 1, type: 'balance', amount: 44000, is_paid: true, paid_date: '2025-03-01' },
  { position: 2, type: 'balance', amount: 33000, is_paid: true, paid_date: '2025-04-01' },
] };
beforeEach(() => { state.data = { cc: [], emp: [], teams: [], sales: [], entries: [] }; state.error = false; });
afterEach(cleanup);
describe('Cassa consuntiva commessa', () => {
  it('i SAL non diventano più volte il saldo finale', () => {
    expect(renderHook(() => useEsposizioneCommessa(props)).result.current.esposizione.incassato).toBe(110000);
  });
  it('PN e piano rate sono alternative, non incassi da sommare', () => {
    state.data = { cc: [], emp: [], teams: [], sales: [], entries: [
      { id: 'p1', amount: 33000, direction: 'entrata', entry_date: '2025-02-01', cost_id: null },
      { id: 'p2', amount: 20000, direction: 'uscita', entry_date: '2025-02-02', cost_id: 'c1' },
    ] };
    expect(renderHook(() => useEsposizioneCommessa(props)).result.current.esposizione)
      .toMatchObject({ incassato: 33000, uscite: 20000, saldoOggi: 13000 });
  });
  it('il costo interno allocato non è automaticamente un debito non pagato', () => {
    state.data = { cc: [], teams: [], sales: [], entries: [], emp: [{ total_cost: 25000, is_paid: false }] };
    expect(renderHook(() => useEsposizioneCommessa(props)).result.current.esposizione.daPagare).toBe(0);
  });
  it('una fattura costo pagata parzialmente resta da pagare solo per il residuo', () => {
    state.data = { cc: [{ id: 'c1', amount: 100, vat_rate: 22, is_paid: false }], emp: [], teams: [], sales: [],
      entries: [{ id: 'p1', amount: 61, direction: 'uscita', entry_date: '2025-02-01', cost_id: 'c1' }] };
    expect(renderHook(() => useEsposizioneCommessa(props)).result.current.esposizione).toMatchObject({ uscite: 61, daPagare: 61 });
  });
  it('i costi/flags pagati non si sommano alla PN dello stesso pagamento', () => {
    state.data = { cc: [{ id: 'c1', amount: 100, vat_rate: 22, is_paid: true, paid_date: '2025-02-01' }],
      emp: [{ total_cost: 500, is_paid: true, paid_date: '2025-02-01' }], teams: [], sales: [],
      entries: [{ id: 'p1', amount: 122, direction: 'uscita', entry_date: '2025-02-01', cost_id: 'c1' }] };
    expect(renderHook(() => useEsposizioneCommessa(props)).result.current.esposizione).toMatchObject({ uscite: 122, daPagare: 0 });
  });
  it('una data attesa non prova un pagamento avvenuto', () => {
    const installments = [{ type: 'deposit', amount: 100, is_paid: true, expected_date: '2025-02-01' }];
    expect(renderHook(() => useEsposizioneCommessa({ ...props, installments })).result.current.esposizione.hasMovimenti).toBe(false);
  });
  it('un errore di lettura resta esplicito', () => {
    state.error = true;
    expect(renderHook(() => useEsposizioneCommessa(props)).result.current.isError).toBe(true);
  });
  it('un costo allocato parzialmente porta solo la quota della commessa tra i residui', () => {
    state.data = { cc: [{ id: 'c1', amount: 100, vat_rate: 22, is_paid: false,
      allocations: [{ order_id: 'job', pct: 50 }, { order_id: 'other', pct: 50 }] }], emp: [], teams: [], sales: [], entries: [] };
    expect(renderHook(() => useEsposizioneCommessa(props)).result.current.esposizione.daPagare).toBe(61);
  });
});
