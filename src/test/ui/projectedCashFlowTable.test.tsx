import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { CashFlowManuale } from '@/hooks/controlloGestione/useCashFlow';
const state = vi.hoisted(() => ({ forecast: vi.fn(), exported: vi.fn() }));
vi.mock('@/hooks/controlloGestione/useCashFlow', () => ({
  useCashFlow: () => state.forecast(),
  useCashFlowManuali: (): { data: CashFlowManuale[] } => ({ data: [] }),
  useUpsertCashFlowManuale: () => ({}),
  useDeleteCashFlowManuale: () => ({}),
}));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/controllo-gestione/tabs/RecordedCashFlow', () => ({ RecordedCashFlow: () => <p>Registrato</p> }));
vi.mock('@/components/controllo-gestione/ui/ExportButton', () => ({ ExportButton: ({ onExport }: { onExport: () => void }) => <button onClick={onExport}>Esporta</button> }));
vi.mock('@/lib/controlloGestione/exportXlsx', () => ({ exportXlsx: state.exported }));
import { TabCashFlow } from '@/components/controllo-gestione/tabs/TabCashFlow';
beforeEach(() => {
  vi.clearAllMocks();
  state.forecast.mockReturnValue({ data: {
    meta: { saldo_apertura: 100, saldo_chiusura: 121, da_verificare: 0 },
    mesi: [10, 11, 12].map(mese => ({ mese, saldo_inizio: 100, saldo_fine: 107, sotto_zero: false,
      entrate: { scadenze: 0, fatture: 0, manuali: 0, commesse: 10 }, entrate_totali: 10,
      uscite: { scadenze: 0, personale: 0, mutui: 0, manuali: 0, costi: 3 }, uscite_totali: 3, flusso_netto: 7 })),
  } });
});
afterEach(cleanup);
describe('projected cash-flow presentation', () => {
  it('aligns headers and spans to the actual remaining months, not January', () => {
    render(<TabCashFlow anno={new Date().getFullYear()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previsionale' }));
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map(th => th.textContent)).toEqual(['Voce', 'Ott', 'Nov', 'Dic', 'Totale']);
    expect(within(table).getByText('Entrate')).toHaveAttribute('colspan', '5');
    expect(within(table).getByText('Uscite')).toHaveAttribute('colspan', '5');
  });
  it('exports the same job receipts and other costs included in totals', () => {
    render(<TabCashFlow anno={new Date().getFullYear()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previsionale' }));
    fireEvent.click(screen.getByRole('button', { name: 'Esporta' }));
    const sheet = state.exported.mock.calls[0][0].sheets[0];
    expect(sheet.columns.map((c: { key: string }) => c.key)).toContain('ent_commesse');
    expect(sheet.columns.map((c: { key: string }) => c.key)).toContain('usc_costi');
    expect(sheet.rows[0]).toMatchObject({ mese: 'Ott', ent_commesse: 10, usc_costi: 3, flusso_netto: 7 });
  });
  it('does not query the forecast when a historical year is selected', () => {
    render(<TabCashFlow anno={new Date().getFullYear() - 1} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previsionale' }));
    expect(screen.getByRole('note')).toHaveTextContent('è uno storico');
    expect(state.forecast).not.toHaveBeenCalled();
  });
  it('shows actionable source links for excluded installments instead of just a count', () => {
    const result = state.forecast();
    result.data.meta.da_verificare = 1;
    result.data.verifiche = [{ id: 'r', origine: 'rata', order_id: 'job', etichetta: 'Saldo cliente', motivo: 'Data mancante' }];
    render(<TabCashFlow anno={new Date().getFullYear()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Previsionale' }));
    expect(screen.getByRole('status')).toHaveTextContent('1 voci escluse');
    expect(screen.getByText('Data mancante')).toBeInTheDocument();
    expect(screen.getByText('Apri pagamenti commessa')).toHaveAttribute('href', '/azienda/ordini/job?tab=finanza&vista_economia=pagamenti');
  });
});
