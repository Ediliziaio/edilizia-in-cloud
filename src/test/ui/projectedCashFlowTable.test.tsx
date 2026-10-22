import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DatiRendicontoCassa } from '@/hooks/controlloGestione/useRendicontoCassa';

const state = vi.hoisted(() => ({ query: vi.fn(), exported: vi.fn(), mobile: false }));
vi.mock('@/hooks/controlloGestione/useRendicontoCassa', () => ({ useRendicontoCassa: () => state.query() }));
vi.mock('@/hooks/useEffectiveCompanyId', () => ({ useEffectiveCompanyId: () => 'azienda-1' }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => state.mobile }));
vi.mock('@/components/controllo-gestione/CashFlowManualiEditor', () => ({ CashFlowManualiEditor: (): null => null }));
vi.mock('@/components/controllo-gestione/ui/ExportButton', () => ({ ExportButton: ({ onExport }: { onExport: () => void }) => <button onClick={onExport}>Esporta</button> }));
vi.mock('@/lib/controlloGestione/exportXlsx', () => ({ exportXlsx: state.exported }));
import { TabCashFlow } from '@/components/controllo-gestione/tabs/TabCashFlow';

const dati = (): DatiRendicontoCassa => ({
  today: '2026-10-22',
  saldoOggiCents: 123456700,
  saldoFonte: 'banca',
  saldoAggiornatoAl: '2026-10-22T04:00:00Z',
  registrati: [
    { id: 'a', direction: 'entrata', amount: 60625.5, entry_date: '2026-01-15', category: 'Incassi fatture', description: 'Fattura 1/2026', invoiceId: 'f1' },
    { id: 'b', direction: 'uscita', amount: 1000, entry_date: '2026-01-20', category: 'altro', costCategory: 'INPS', description: 'Contributi gennaio' },
  ],
  flussoDopoAnnoCents: null,
  previsti: [
    { id: 'rata', description: 'Rata SAL 2', counterparty: 'Rossi', category: 'clienti', direction: 'in', cents: 500000, date: '2026-11-10', source: 'Rata commessa', href: '/azienda/ordini/o1', estimated: false },
    { id: 'scaduto', description: 'Fattura scaduta', counterparty: '', category: 'clienti', direction: 'in', cents: 100000, date: '2026-09-01', source: 'Fattura', href: '/x', estimated: false },
  ],
  manuali: [],
  mutui: [],
  fontiNonLette: [],
});

beforeEach(() => {
  vi.clearAllMocks();
  state.mobile = false;
  state.query.mockReturnValue({ data: dati(), isLoading: false, isError: false });
});
afterEach(cleanup);
const apri = (anno = 2026) => render(<MemoryRouter><TabCashFlow anno={anno} /></MemoryRouter>);

describe('rendiconto di cassa', () => {
  it('una sola tabella: 12 mesi con Consuntivo / In corso / Previsione e il totale anno', () => {
    apri();
    const table = screen.getByRole('table');
    const intestazioni = within(table).getAllByRole('columnheader').map((th) => th.textContent);
    expect(intestazioni).toHaveLength(14);
    expect(intestazioni[1]).toBe('GenConsuntivo');
    expect(intestazioni[10]).toBe('OttIn corso');
    expect(intestazioni[11]).toBe('NovPrevisione');
    expect(intestazioni[13]).toBe('Totale 2026');
    // Niente più doppia vista Registrato/Previsionale.
    expect(screen.queryByRole('button', { name: 'Registrato' })).toBeNull();
  });

  it('mostra tutti i gruppi e le voci, con saldi e flussi', () => {
    apri();
    const table = screen.getByRole('table');
    for (const testo of ['Saldo di cassa a inizio mese', 'Incassi', 'Uscite della gestione', 'Flusso della gestione operativa', 'Investimenti', 'Finanziamenti', 'Flusso netto del mese', 'Saldo di cassa a fine mese', 'Contributi, ritenute e F24', 'Rate mutui · quota capitale'])
      expect(within(table).getAllByText(testo).length).toBeGreaterThan(0);
  });

  it('importi interi all\'italiana, uscite in negativo', () => {
    apri();
    const table = screen.getByRole('table');
    expect(within(table).getAllByText('60.626 €').length).toBeGreaterThan(0);
    expect(within(table).getAllByText('-1.000 €').length).toBeGreaterThan(0);
    expect(table.textContent).not.toMatch(/M €|k €/);
    expect(screen.getAllByText('1.234.567 €').length).toBeGreaterThan(0);
  });

  it('i gruppi si chiudono e si riaprono', () => {
    apri();
    const bottone = screen.getByRole('button', { name: 'Incassi' });
    expect(bottone).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Acconti dai clienti')).toBeInTheDocument();
    fireEvent.click(bottone);
    expect(bottone).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Acconti dai clienti')).toBeNull();
    expect(screen.getAllByText('Totale incassi').length).toBeGreaterThan(0);
  });

  it('un clic su un importo apre i movimenti che lo compongono', () => {
    apri();
    const riga = screen.getByText('Da clienti (fatture e rate delle commesse)').closest('tr')!;
    fireEvent.click(within(riga).getAllByRole('button', { name: '5.000 €' })[0]);
    const pannello = screen.getByRole('dialog');
    expect(within(pannello).getByText('Rata SAL 2')).toBeInTheDocument();
    expect(within(pannello).getByText('Previsto')).toBeInTheDocument();
    expect(within(pannello).getByRole('link', { name: 'Apri' })).toHaveAttribute('href', '/azienda/ordini/o1');
  });

  it('l\'interruttore degli incassi scaduti cambia la previsione e il link al Previsionale', () => {
    apri();
    const link = screen.getByRole('link', { name: /Apri il previsionale completo/ });
    expect(link).toHaveAttribute('href', '/azienda/previsionale');
    fireEvent.click(screen.getByRole('switch', { name: 'Includi incassi scaduti' }));
    expect(link).toHaveAttribute('href', '/azienda/previsionale?incassi-scaduti=1');
    const riga = screen.getByText('Da clienti (fatture e rate delle commesse)').closest('tr')!;
    // L'incasso scaduto cade oggi (ottobre).
    expect(within(riga).getAllByRole('button', { name: '1.000 €' }).length).toBeGreaterThan(0);
  });

  it('esporta la tabella completa', () => {
    apri();
    fireEvent.click(screen.getByRole('button', { name: 'Esporta' }));
    const sheet = state.exported.mock.calls[0][0].sheets[0];
    expect(sheet.columns).toHaveLength(14);
    const voci = sheet.rows.map((r: { voce: string }) => r.voce.trim());
    expect(voci).toContain('FLUSSO NETTO DEL MESE');
    expect(sheet.rows.find((r: { voce: string }) => r.voce === 'Totale incassi')).toMatchObject({ m1: 60626, m11: 5000 });
  });

  it('un anno passato è tutto consuntivo, senza interruttori', () => {
    state.query.mockReturnValue({ data: { ...dati(), previsti: null, flussoDopoAnnoCents: 0 }, isLoading: false, isError: false });
    apri(2025);
    expect(screen.getByText(/tutti i mesi sono a consuntivo/)).toBeInTheDocument();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('sul telefono una vista per mese con selettore', () => {
    state.mobile = true;
    apri();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Mese' })).toHaveTextContent('ottobre · In corso');
    fireEvent.click(screen.getByRole('button', { name: 'Mese successivo' }));
    expect(screen.getByRole('combobox', { name: 'Mese' })).toHaveTextContent('novembre · Previsione');
    expect(screen.getAllByText('5.000 €').length).toBeGreaterThan(0);
  });
});
