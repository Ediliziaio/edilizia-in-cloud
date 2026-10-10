import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
const state = vi.hoisted(() => ({ loading: false, error: false, retry: vi.fn(), data: undefined as unknown }));
vi.mock('@/hooks/useSupplierPayments', () => ({
  useSupplierPayments: () => ({ data: state.data, isLoading: state.loading, isError: state.error, refetch: state.retry }),
  useSupplierPaymentNames: () => ({ data: { s1: 'Fornitore DEMO' }, isError: false, refetch: vi.fn() }),
}));
import { SupplierPaymentsCard } from '@/components/orders/SupplierPaymentsCard';
const show = () => render(<MemoryRouter><SupplierPaymentsCard companyId="c1" orderId="o1" items={[]} /></MemoryRouter>);
beforeEach(() => { Object.assign(state, { loading: false, error: false, data: undefined }); vi.clearAllMocks(); });
afterEach(cleanup);
describe('Scheda fornitori', () => {
  it('attende i documenti senza un falso nessun fornitore', () => {
    state.loading = true; show();
    expect(screen.getByRole('status')).toHaveTextContent('Leggo OdA');
    expect(screen.queryByText(/Nessun fornitore/)).not.toBeInTheDocument();
  });
  it('un errore non diventa saldo zero e permette di riprovare', () => {
    state.error = true; show();
    expect(screen.getByRole('alert')).toHaveTextContent('Non riesco a verificare');
    fireEvent.click(screen.getByRole('button', { name: 'Riprova' }));
    expect(state.retry).toHaveBeenCalledOnce();
    expect(screen.queryByText('Pagato')).not.toBeInTheDocument();
  });
  it('collega gli OdA reali senza articoli e non inventa un debito', () => {
    state.data = { orders: [{ id: 'po1', supplier_id: 's1', oda_number: 'DEMO-001', status: 'ricevuto', total: 122 }], invoices: [], entries: [], dues: [] };
    show();
    expect(screen.getByText('Fornitore DEMO')).toBeInTheDocument();
    expect(screen.getByText('In attesa di fattura')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /OdA #DEMO-001/ })).toHaveAttribute('href', '/azienda/ordini-acquisto/po1');
    expect(screen.queryByText('Da pagare')).not.toBeInTheDocument();
  });
  it('mostra fattura e pagamento parziale collegati anche senza budget', () => {
    state.data = { orders: [], invoices: [{ id: 'f1', purchase_order_id: null, company_cost_id: 'cost', prima_nota_id: null,
      cedente_ragione_sociale: 'Subappaltatore DEMO', cedente_piva: '123', numero_fattura: '1', totale_documento: 122, tipo_documento: 'TD01', stato: 'contabilizzata' }],
      entries: [{ id: 'p1', cost_id: 'cost', supplier_id: null, scadenza_id: null, amount: 61, direction: 'uscita' }], dues: [] };
    show();
    expect(screen.getByText('Subappaltatore DEMO')).toBeInTheDocument();
    expect(screen.getByText('Parziale')).toBeInTheDocument();
    expect(screen.getByText(/Residuo/)).toHaveTextContent('61,00');
  });
});
