import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrdineRapportiniCampo } from '@/components/orders/OrdineRapportiniCampo';
import { OrdineCliente } from '@/components/orders/OrdineCliente';

const reports = vi.hoisted(() => Array.from({length: 23}, (_,i) => ({
  id: `report-${i}`, data_lavoro: '2026-09-30', stato: 'approvato', autore: null as { first_name: string; last_name: string } | null,
  ore_lavorate: 8, ore_straordinario: 0, foto_urls: [] as string[], presenze: [] as unknown[], source: null as string | null,
  descrizione_lavori: `Lavoro ${i}`, costo_manodopera: 240,
})));
vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({data: reports, isLoading: false, isError: false}),
  useQueryClient: () => ({}), useMutation: () => ({mutate: vi.fn(),isPending:false}),
}));
vi.mock('@/contexts/AuthContext', () => ({useAuth: () => ({role:'company_admin',effectiveCompany:{id:'demo'}})}));
vi.mock('@/hooks/usePermissions', () => ({usePermissions: () => ({canEditOrders:true,canViewCosts:true})}));
vi.mock('@/hooks/use-mobile', () => ({useIsMobile: () => false}));
vi.mock('@/integrations/supabase/client', () => ({supabase:{}}));
vi.mock('@/lib/campo/loadLaborReview', () => ({recheckLaborApproval:vi.fn()}));
vi.mock('@/lib/campo/rapportinoPdf', () => ({notifyRapportinoPdf:vi.fn(),openRapportinoPdf:vi.fn()}));
vi.mock('@/components/orders/LaborApprovalDialog', () => ({LaborApprovalDialog: (): null => null}));
afterEach(cleanup);

describe('Usabilità del collaudo commesse', () => {
  it('mostra dieci rapportini per volta senza perderne alcuno', () => {
    const view=render(<OrdineRapportiniCampo orderId="one"/>);
    expect(screen.getAllByRole('button',{name:/Registrazione manuale/})).toHaveLength(10);
    fireEvent.click(screen.getByRole('button',{name:'Mostra altri 10'}));
    expect(screen.getAllByRole('button',{name:/Registrazione manuale/})).toHaveLength(20);
    fireEvent.click(screen.getByRole('button',{name:'Mostra altri 10'}));
    expect(screen.getAllByRole('button',{name:/Registrazione manuale/})).toHaveLength(23);
    expect(screen.queryByRole('button',{name:'Mostra altri 10'})).toBeNull();
    view.rerender(<OrdineRapportiniCampo orderId="two"/>);
    expect(screen.getAllByRole('button',{name:/Registrazione manuale/})).toHaveLength(10);
  });
  it('apre il dettaglio con un controllo accessibile senza inventare un autore', () => {
    render(<OrdineRapportiniCampo orderId="one"/>);
    const button=screen.getAllByRole('button',{name:/Registrazione manuale/})[0];
    expect(button).toHaveAttribute('aria-expanded','false');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded','true');
    expect(screen.getByText('Lavoro 0')).toBeVisible();
    expect(screen.getByText(/Costo manodopera registrato/)).toHaveTextContent('240,00');
  });
  it('usa lo snapshot cliente senza creare un collegamento anagrafico fittizio', () => {
    render(<OrdineCliente customer={null} snapshot={{name:'Famiglia Demo',email:'demo@example.invalid'}}/>);
    expect(screen.getByText('Famiglia Demo')).toBeVisible();
    expect(screen.getByText(/anagrafica non collegata/)).toBeVisible();
    expect(screen.queryByText('Cliente non disponibile')).toBeNull();
  });
});
