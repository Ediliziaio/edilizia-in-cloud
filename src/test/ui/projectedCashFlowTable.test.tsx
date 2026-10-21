import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
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
const vuoto = { importo: 0, numero: 0 };
beforeEach(() => {
  vi.clearAllMocks();
  state.forecast.mockReturnValue({ data: {
    meta: { saldo_apertura: 100, saldo_chiusura: 1234567, saldo_oggi: 100, saldo_fonte: 'banca', saldi_aggiornati_al: null, manuali_netto: 0, fonti_non_lette: [] },
    esclusi: { incassi_scaduti: { importo: 1200000, numero: 3 }, uscite_scadute: vuoto, senza_data: vuoto, forse_doppi: vuoto },
    mesi: [10, 11, 12].map(mese => ({ mese, saldo_inizio: 100, saldo_fine: 1234567, sotto_zero: false,
      entrate: { clienti: 10 }, entrate_totali: 10,
      uscite: { fornitori: 3 }, uscite_totali: 3, flusso_netto: 7 })),
  } });
});
afterEach(cleanup);
const apri = (anno = new Date().getFullYear()) => {
  render(<MemoryRouter><TabCashFlow anno={anno} /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Previsionale' }));
};
describe('projected cash-flow presentation', () => {
  it('aligns headers and spans to the actual remaining months, not January', () => {
    apri();
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('columnheader').map(th => th.textContent)).toEqual(['Voce', 'Ott', 'Nov', 'Dic', 'Totale']);
    expect(within(table).getByText('Entrate')).toHaveAttribute('colspan', '5');
    expect(within(table).getByText('Uscite')).toHaveAttribute('colspan', '5');
  });
  it('shows whole euros with Italian grouping, never «1.2M €»', () => {
    apri();
    const table = screen.getByRole('table');
    expect(within(table).getAllByText('1.234.567 €').length).toBeGreaterThan(0);
    expect(table.textContent).not.toMatch(/M €|k €/);
  });
  it('exports the same rows included in totals', () => {
    apri();
    fireEvent.click(screen.getByRole('button', { name: 'Esporta' }));
    const sheet = state.exported.mock.calls[0][0].sheets[0];
    expect(sheet.columns.map((c: { key: string }) => c.key)).toEqual(expect.arrayContaining(['e_clienti', 'u_fornitori']));
    expect(sheet.rows[0]).toMatchObject({ mese: 'Ott', e_clienti: 10, u_fornitori: 3, flusso_netto: 7 });
  });
  it('explains overdue receipts left out of the balance and links to the Previsionale', () => {
    apri();
    expect(screen.getByText(/3 incassi già scaduti/)).toBeInTheDocument();
    expect(screen.getAllByText('Apri nel Previsionale')[0]).toHaveAttribute('href', '/azienda/previsionale?incassi-scaduti=1');
    expect(screen.getByRole('link', { name: /Apri il previsionale completo/ })).toHaveAttribute('href', '/azienda/previsionale');
  });
  it('does not query the forecast when a historical year is selected', () => {
    apri(new Date().getFullYear() - 1);
    expect(screen.getByRole('note')).toHaveTextContent('è uno storico');
    expect(state.forecast).not.toHaveBeenCalled();
  });
});
