import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
const mocks = vi.hoisted(() => ({
  canEdit: true,
  mobile: true,
  rpc: vi.fn(async (_fn: string, args: { p_anteprima: boolean }) => ({ data: args.p_anteprima
    ? { numero: 'RST-001', materiali: 0, voci: 2, fasi: 2, sottofasi: 2, impronta: 'v1', totale: 5286.87 }
    : { id: 'copia-rst' }, error: null })),
  nulla: (): null => null,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => {
    const rows = table === 'rst_progetti' ? [{ id: 'p1', code: 'RST-001', stato: 'bozza', cliente_nome: 'Cliente prova', totale: 5286.87, created_by: 'u1', created_at: '2026-10-16T05:00:00Z', updated_at: '2026-10-16T05:00:00Z' }] : [];
    const b: Record<string, unknown> = {};
    for (const m of ['select','eq','neq','or','in','is','not','gte','gt','lte','lt','ilike','order','range','limit','filter','returns','maybeSingle','single']) b[m] = () => b;
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null, count: rows.length }).then(ok);
    return b;
  }, rpc: mocks.rpc,
} }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ role: 'company_admin', user: { id: 'u1' }, effectiveCompany: { id: 'c1' } }) }));
vi.mock('@/hooks/useEffectiveCompanyId', () => ({ useEffectiveCompanyId: () => 'c1' }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => mocks.mobile }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canEditPreventivi: mocks.canEdit, canExportClients: true, onlyAssigned: false }) }));
vi.mock('@/lib/moduli-vendita', () => ({ useModuliVendita: () => ({ moduli: [{ modulo: { slug: 'ristrutturazione' }, isEnabled: true }] }) }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('@/components/marketing/preventivi/UnifiedFiltersSheet', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/components/marketing/preventivi/UnifiedFiltersSheet')>()), UnifiedFiltersSheet: mocks.nulla }));
vi.mock('@/components/marketing/preventivi/UnifiedBulkToolbar', () => ({ UnifiedBulkToolbar: mocks.nulla, spostaNelCestino: vi.fn() }));
vi.mock('@/components/marketing/preventivi/PreventiviCestinoDialog', () => ({ PreventiviCestinoDialog: mocks.nulla }));
vi.mock('recharts', () => {
  const wrapper = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { BarChart: wrapper, Bar: mocks.nulla, XAxis: mocks.nulla, YAxis: mocks.nulla, CartesianGrid: mocks.nulla, Tooltip: mocks.nulla, ResponsiveContainer: wrapper, PieChart: wrapper, Pie: wrapper, Cell: mocks.nulla, Legend: mocks.nulla };
});
import { UnifiedPreventiviList } from '@/components/marketing/preventivi/UnifiedPreventiviList';
const Path = () => <output data-testid="path">{useLocation().pathname}</output>;
function setup() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter><TooltipProvider><UnifiedPreventiviList /><Path /></TooltipProvider></MemoryRouter></QueryClientProvider>); }
beforeEach(() => { mocks.canEdit = true; mocks.mobile = true; mocks.rpc.mockClear(); });
afterEach(cleanup);
describe('duplicazione Ristrutturazioni dall’elenco unico realmente usato', () => {
  it('mobile: richiede anteprima e conferma, poi apre la nuova bozza', async () => {
    setup(); fireEvent.click(await screen.findByRole('button', { name: 'Duplica preventivo RST-001' }, { timeout: 8000 }));
    await screen.findByText('Da RST-001'); expect(mocks.rpc.mock.calls[0][0]).toBe('duplica_lavoro_atomic');
    expect(mocks.rpc.mock.calls.every(c => c[1].p_anteprima)).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Crea copia e apri' }));
    await waitFor(() => expect(screen.getByTestId('path')).toHaveTextContent('/azienda/ristrutturazione/copia-rst/modifica'));
    expect(mocks.rpc.mock.calls.filter(c => !c[1].p_anteprima)).toHaveLength(1);
  });
  it('senza modifica preventivi non propone la duplicazione', async () => {
    mocks.canEdit = false; setup(); await screen.findAllByText('RST-001', {}, { timeout: 8000 });
    expect(screen.queryByRole('button', { name: 'Duplica preventivo RST-001' })).not.toBeInTheDocument();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('annullare il riepilogo non scrive una copia', async () => {
    setup(); fireEvent.click(await screen.findByRole('button', { name: 'Duplica preventivo RST-001' }, { timeout: 8000 }));
    await screen.findByText('Da RST-001'); fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Duplica preventivo' })).not.toBeInTheDocument());
    expect(mocks.rpc.mock.calls.every(c => c[1].p_anteprima)).toBe(true);
  });
});
