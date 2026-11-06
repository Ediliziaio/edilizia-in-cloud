import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { OrderSelectCombobox } from '@/components/warehouse/OrderSelectCombobox';
const m = vi.hoisted(() => ({ select: vi.fn(), eq: vi.fn(), error: null as Error | null }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => {
  const q = { select: (s: string) => { m.select(s); return q; }, eq: (k: string,v: string) => { m.eq(k,v); return q; }, is: () => q,
    maybeSingle: async () => ({ error: m.error, data: m.error ? null : { id: 'commessa', order_code: 'DEMO', client_name: null as null, client_company: null as null, customer: { first_name: 'Cliente', last_name: 'Demo' }, order_items: [] as never[] } }) };
  return q;
} } }));
afterEach(() => { cleanup(); vi.clearAllMocks(); m.error = null; });
it('recupera il nome cliente dal profilo collegato e limita il lookup all’azienda', async () => {
  render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><OrderSelectCombobox companyId="azienda" value="commessa" onChange={vi.fn()} /></QueryClientProvider>);
  expect(await screen.findByText(/Cliente Demo/)).toBeInTheDocument();
  expect(m.select).toHaveBeenCalledWith(expect.stringContaining('profiles!orders_customer_id_fkey'));
  expect(m.eq).toHaveBeenCalledWith('company_id', 'azienda');
});
it('non esegue il lookup senza contesto aziendale', () => {
  render(<QueryClientProvider client={new QueryClient()}><OrderSelectCombobox companyId={undefined} value="commessa" onChange={vi.fn()} /></QueryClientProvider>);
  expect(m.select).not.toHaveBeenCalled();
});
