import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import type { FatturaPerRata } from '@/lib/orders/rataFattura';
import { impedimentoFatturaRata } from '@/lib/orders/rataFattura';
import type { Installment } from '@/lib/orderUtils';
const m = vi.hoisted(() => ({
  invoices: [] as Array<FatturaPerRata & { numero: string; data_emissione: string; importo_pagato?: number }>,
  links: [] as Array<{ id: string; documento_fiscale_id: string }>,
  rpc: vi.fn(), confirm: vi.fn(), close: vi.fn(), readOnly: false,
}));
vi.mock('@/hooks/useEffectiveCompanyId', () => ({ useEffectiveCompanyId: () => 'company' }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canViewBilling: true, solaLettura: m.readOnly }) }));
vi.mock('@/components/ui/confirm-dialog', () => ({ useConfirm: () => m.confirm }));
vi.mock('@/hooks/billing/useFatturaOrdineLink', () => ({ useFattureByOrdine: () => ({ data: m.invoices, isSuccess: true, isPending: false, isFetching: false, isError: false, refetch: async () => ({ data: m.invoices, error: null as null }) }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: (...args: unknown[]) => m.rpc(...args), from: () => { const q: Record<string, unknown> = { then: (ok: (x: unknown) => unknown) => Promise.resolve({ data: m.links, error: null }).then(ok) }; for (const key of ['select', 'eq', 'in']) q[key] = () => q; return q; } } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));
import RataFatturaDialog from '@/components/orders/RataFatturaDialog';
const invoice = (changes: Partial<(typeof m.invoices)[number]> = {}): (typeof m.invoices)[number] => ({ id: 'f1', numero: 'FT-1', tipo: 'fattura', stato: 'emessa', totale_documento: 110, totale_da_pagare: 110, importo_associato: null, data_emissione: '2026-11-17', ...changes });
const rata: Installment = { id: 'r1', label: 'Acconto', type: 'deposit', position: 0, amount: 110, is_paid: false };
function show(changes: Partial<Installment> = {}) {
  return render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RataFatturaDialog orderId="o1" installment={{ ...rata, ...changes }} amount={110} onClose={m.close} /></QueryClientProvider></MemoryRouter>);
}
beforeEach(() => { vi.clearAllMocks(); m.invoices = [invoice()]; m.links = []; m.readOnly = false; m.rpc.mockResolvedValue({ error: null }); m.confirm.mockResolvedValue(true); });
afterEach(cleanup);
describe('Associazione fattura dagli incassi', () => {
  it('non preseleziona: collega la fattura intera solo dopo la scelta esplicita', async () => {
    show(); const candidate = await screen.findByRole('radio', { name: /FT-1/ });
    await waitFor(() => expect(candidate).toBeEnabled());
    expect(screen.getByRole('button', { name: 'Collega fattura' })).toBeDisabled();
    fireEvent.click(candidate); fireEvent.click(screen.getByRole('button', { name: 'Collega fattura' }));
    await waitFor(() => expect(m.rpc).toHaveBeenCalledWith('collega_rata_fattura', { p_rata_id: 'r1', p_documento_id: 'f1' }));
    await waitFor(() => expect(m.close).toHaveBeenCalledTimes(1));
  });
  it('rifiuta fatture occupate, importate e con importo diverso', async () => {
    m.links = [{ id: 'altra-rata', documento_fiscale_id: 'f1' }];
    m.invoices.push(invoice({ id: 'f2', numero: 'FT-2', totale_documento: 200 }), invoice({ id: 'f3', numero: 'FT-3', origine: 'importata' })); show();
    await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(3));
    for (const el of screen.getAllByRole('radio')) expect(el).toBeDisabled();
    expect(m.rpc).not.toHaveBeenCalled();
  });
  it('un errore del servizio conserva scelta e popup, senza dichiarare successo', async () => {
    m.rpc.mockResolvedValue({ error: { message: 'La rata è già collegata' } }); show();
    const choice = await screen.findByRole('radio', { name: /FT-1/ }); fireEvent.click(choice);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Collega fattura' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Collega fattura' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('La rata è già collegata');
    expect(choice).toHaveAttribute('aria-checked', 'true'); expect(m.close).not.toHaveBeenCalled();
  });
  it('ricontrolla la disponibilità prima della scrittura', async () => {
    show(); fireEvent.click(await screen.findByRole('radio', { name: /FT-1/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Collega fattura' })).toBeEnabled());
    m.links = [{ id: 'r2', documento_fiscale_id: 'f1' }];
    fireEvent.click(screen.getByRole('button', { name: 'Collega fattura' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Già collegata'); expect(m.rpc).not.toHaveBeenCalled();
  });
  it('il doppio clic non crea due richieste di collegamento', async () => {
    m.rpc.mockImplementation(() => new Promise(() => {})); show();
    fireEvent.click(await screen.findByRole('radio', { name: /FT-1/ }));
    const button = screen.getByRole('button', { name: 'Collega fattura' }); await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button); fireEvent.click(button);
    await waitFor(() => expect(m.rpc).toHaveBeenCalledTimes(1));
  });
  it('scollega solo con conferma, senza cancellare registrazioni', async () => {
    show({ documento_fiscale_id: 'f1', is_paid: true });
    fireEvent.click(screen.getByRole('button', { name: 'Scollega fattura' }));
    await waitFor(() => expect(m.rpc).toHaveBeenCalledWith('scollega_rata_fattura', { p_rata_id: 'r1' }));
    expect(m.confirm).toHaveBeenCalledTimes(1); expect(m.rpc).toHaveBeenCalledTimes(1);
  });
  it('rispetta la sola lettura anche in caso di apertura diretta', async () => {
    m.readOnly = true; show({ documento_fiscale_id: 'f1' });
    expect(screen.getByRole('button', { name: 'Scollega fattura' })).toBeDisabled(); expect(m.rpc).not.toHaveBeenCalled();
  });
});
describe('Compatibilità importi/documenti', () => {
  it('non usa il residuo al posto del totale e conserva i centesimi', () => {
    expect(impedimentoFatturaRata(invoice({ totale_da_pagare: 50 }), 110, false)).toBeNull();
    expect(impedimentoFatturaRata(invoice(), 110.01, false)).toMatch(/Importo diverso/);
    expect(impedimentoFatturaRata(invoice({ importo_associato: 50 }), 110, false)).toMatch(/quota/);
  });
  it('non associa preventivi, note di credito, annullate o stornate', () => {
    for (const f of [invoice({ tipo: 'nota_credito' }), invoice({ tipo: 'preventivo' }), invoice({ stato: 'annullata' }), invoice({ stato: 'stornata' }), invoice({ stornato: 10 })]) expect(impedimentoFatturaRata(f, 110, false)).not.toBeNull();
  });
});
