import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/ddt/documentiPersistenti', () => ({ documentiDb: { rpc: m.rpc } }));
vi.mock('@/components/orders/ExpensePaymentDialog', async () => {
  const { createPortal } = await import('react-dom');
  return { ExpensePaymentDialog: ({ costId }: { costId: string }) => createPortal(<div role="dialog" aria-label={`Dettaglio ${costId}`} />, document.body) };
});
import { OdaPaymentsDialog } from '@/components/orders/OdaPaymentsDialog';
const clients: QueryClient[] = [];
afterEach(() => { cleanup(); clients.forEach(c => c.clear()); clients.length = 0; vi.clearAllMocks(); });
function mount() {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } }); clients.push(c);
  render(<QueryClientProvider client={c}><OdaPaymentsDialog odaId="oda" spese={[{ id: 'f1' }, { id: 'f2' }]} onClose={() => {}} /></QueryClientProvider>);
}
it('apre l’intera fornitura da 168,36 €, poi solo il documento scelto', async () => {
  m.rpc.mockImplementation((_rpc: string, { p_costo }: { p_costo: string }) => Promise.resolve({ data: { id: p_costo, nome: p_costo === 'f1' ? 'Fattura 001' : 'Fattura 002', totale: p_costo === 'f1' ? 58.56 : 109.8, pagato: 0, residuo: p_costo === 'f1' ? 58.56 : 109.8, da_verificare: false, movimenti: [] }, error: null }));
  mount();
  const table = await screen.findByRole('table', { name: 'Spese e residui della fornitura' });
  expect(screen.getAllByText('168,36 €', { selector: 'dd' })).toHaveLength(2);
  expect(within(table).getByRole('rowheader', { name: 'Fattura 001' })).toBeInTheDocument();
  expect(within(table).getByRole('rowheader', { name: 'Fattura 002' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Apri pagamenti Fattura 002' }));
  expect(screen.getByRole('dialog', { name: 'Dettaglio f2' })).toBeInTheDocument();
  expect(m.rpc.mock.calls.every(([name]) => name === 'dettaglio_pagamento_costo')).toBe(true);
});
it('non mostra un totale parziale come completo quando manca un pagamento', async () => {
  m.rpc.mockResolvedValue({ data: null, error: new Error('Offline') }); mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('Non riesco a verificare tutti i pagamenti');
  expect(screen.queryByText('0,00 €')).not.toBeInTheDocument();
});
