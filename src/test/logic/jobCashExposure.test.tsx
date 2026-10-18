import { cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ data: undefined as unknown, error: false }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: state.data, isLoading: false, isError: state.error }) }));
vi.mock('@/hooks/useEffectiveCompanyId', () => ({ useEffectiveCompanyId: () => 'demo' }));
vi.mock('@/hooks/useSupplierPayments', () => ({ allPaymentRows: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));
import { useEsposizioneCommessa } from '@/hooks/useEsposizioneCommessa';
import { incassiDellaCommessa } from '@/lib/orders/incassiCommessa';
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
  it('la rata registrata in PN entra una volta sola, dalla PN', () => {
    const conId = { ...props, installments: props.installments.map((r, i) => ({ ...r, id: `r${i}` })) };
    state.data = { cc: [], emp: [], teams: [], sales: [], entries: [
      { id: 'p1', amount: 33000, direction: 'entrata', entry_date: '2025-02-01', cost_id: null, installment_id: 'r0' },
      { id: 'p2', amount: 20000, direction: 'uscita', entry_date: '2025-02-02', cost_id: 'c1' },
    ] };
    expect(renderHook(() => useEsposizioneCommessa(conId)).result.current.esposizione)
      .toMatchObject({ incassato: 110000, uscite: 20000, saldoOggi: 90000 });
  });
  it('una voce in PN non fa sparire le altre rate incassate', () => {
    const conId = { ...props, installments: props.installments.map((r, i) => ({ ...r, id: `r${i}` })) };
    state.data = { cc: [], emp: [], teams: [], sales: [], entries: [
      { id: 'p2', amount: 20000, direction: 'uscita', entry_date: '2025-02-02', cost_id: 'c1' },
    ] };
    expect(renderHook(() => useEsposizioneCommessa(conId)).result.current.esposizione)
      .toMatchObject({ incassato: 110000, uscite: 20000 });
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
  it('il costo pagato con la sua voce in PN conta una volta sola, dalla PN', () => {
    state.data = { cc: [{ id: 'c1', amount: 100, vat_rate: 22, is_paid: true, paid_date: '2025-02-01' }],
      emp: [], teams: [], sales: [],
      entries: [{ id: 'p1', amount: 122, direction: 'uscita', entry_date: '2025-02-01', cost_id: 'c1' }] };
    expect(renderHook(() => useEsposizioneCommessa(props)).result.current.esposizione).toMatchObject({ uscite: 122, daPagare: 0 });
  });
  it('manodopera e provvigioni pagate restano anche quando la Prima Nota ha delle voci', () => {
    state.data = { cc: [{ id: 'c1', amount: 100, vat_rate: 22, is_paid: true, paid_date: '2025-02-01' }],
      emp: [{ total_cost: 500, is_paid: true, paid_date: '2025-02-01' }], teams: [],
      sales: [{ commission_amount: 300, deduction_amount: 0, is_paid: true, paid_date: '2025-02-03' }],
      entries: [{ id: 'p1', amount: 122, direction: 'uscita', entry_date: '2025-02-01', cost_id: 'c1' }] };
    expect(renderHook(() => useEsposizioneCommessa(props)).result.current.esposizione).toMatchObject({ uscite: 922, daPagare: 0 });
  });
  it('con la Prima Nota le squadre esterne entrano solo dalle sue voci', () => {
    state.data = { cc: [], emp: [], sales: [], teams: [{ total_cost: 800, is_paid: true, paid_date: '2025-02-01' }],
      entries: [{ id: 'p1', amount: 800, direction: 'uscita', entry_date: '2025-02-01', cost_id: 'c9' }] };
    expect(renderHook(() => useEsposizioneCommessa(props)).result.current.esposizione.uscite).toBe(800);
  });
  it('la rata pagata dalla finanziaria è un incasso, come nel Riepilogo', () => {
    const installments = [
      { position: 0, type: 'deposit', amount: 10000, is_paid: true, paid_date: '2025-02-01' },
      { position: 1, type: 'financing', amount: 90000, is_paid: true, paid_date: '2025-03-01' },
      { position: 2, type: 'balance', amount: 0, is_paid: true, paid_date: '2025-04-01' },
    ];
    const finanziata = { ...props, financingCost: 2000, installments };
    const atteso = incassiDellaCommessa({ installments, totalAmount: 100000, vatRate: 10, paymentType: 'financing', financingCost: 2000 });
    const { incassato } = renderHook(() => useEsposizioneCommessa(finanziata)).result.current.esposizione;
    expect(incassato).toBe(atteso.incassatoLordo);
    expect(incassato).toBe(108000);
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
