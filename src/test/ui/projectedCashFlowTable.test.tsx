import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { DatiRendicontoCassa } from '@/hooks/controlloGestione/useRendicontoCassa';
import type { VoceCatalogo } from '@/lib/finance/cassaVoci';

const state = vi.hoisted(() => ({ query: vi.fn(), exported: vi.fn(), mobile: false, catalogo: undefined as unknown }));
// Senza catalogo la tabella resta il «Riassunto» (i test qui sotto); con il
// catalogo si legge per categorie (in fondo).
vi.mock('@/lib/finance/cassaVoci', () => ({ useCatalogoCassa: () => ({ data: state.catalogo }) }));
vi.mock('@/hooks/controlloGestione/useRendicontoCassa', () => ({ useRendicontoCassa: (anno: number) => state.query(anno) }));
vi.mock('@/hooks/useEffectiveCompanyId', () => ({ useEffectiveCompanyId: () => 'azienda-1' }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => state.mobile }));
vi.mock('@/hooks/usePermissions', () => ({ usePermissions: () => ({ canViewTesoreria: true, canReconcileBankTransactions: true }) }));
vi.mock('@/components/controllo-gestione/ClassificaMovimentiDialog', () => ({
  ClassificaMovimentiDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog" aria-label="Classifica i movimenti nelle categorie" /> : null),
}));
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
  daBanca: 0,
  bancaForseDoppi: { numero: 0, cents: 0 },
});

beforeEach(() => {
  vi.clearAllMocks();
  state.mobile = false;
  state.catalogo = undefined;
  try { localStorage.clear(); } catch { /* niente */ }
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
    for (const testo of ['Saldo di cassa a inizio mese', 'Incassi', 'Uscite della gestione', 'Flusso della gestione operativa', 'Investimenti', 'Finanziamenti', 'Flusso netto del mese', 'Saldo di cassa a fine mese', 'Imposte, contributi, ritenute e F24', 'Rimborsi di capitale (mutui, prestiti, anticipi)'])
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

  it('un clic su un importo apre i movimenti e la chiusura restituisce il focus', async () => {
    apri();
    const riga = screen.getByText('Da clienti (fatture e rate delle commesse)').closest('tr')!;
    const origin = within(riga).getByRole('button', { name: 'Apri il dettaglio di Da clienti (fatture e rate delle commesse) · novembre 2026: 5.000 €' });
    origin.focus();
    fireEvent.click(origin);
    const pannello = screen.getByRole('dialog');
    expect(within(pannello).getByText('Rata SAL 2')).toBeInTheDocument();
    expect(within(pannello).getByText('Previsto')).toBeInTheDocument();
    expect(within(pannello).getByRole('link', { name: 'Apri' })).toHaveAttribute('href', '/azienda/ordini/o1');
    fireEvent.click(within(pannello).getByRole('button', { name: /Chiudi|Close/ }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(origin).toHaveFocus());
  });

  it('l\'interruttore degli incassi scaduti cambia la previsione e il link al Previsionale', () => {
    apri();
    const link = screen.getByRole('link', { name: /Apri il previsionale completo/ });
    expect(link).toHaveAttribute('href', '/azienda/previsionale');
    fireEvent.click(screen.getByRole('switch', { name: 'Includi incassi scaduti' }));
    expect(link).toHaveAttribute('href', '/azienda/previsionale?incassi-scaduti=1');
    const riga = screen.getByText('Da clienti (fatture e rate delle commesse)').closest('tr')!;
    // L'incasso scaduto cade oggi (ottobre).
    expect(within(riga).getByRole('button', { name: 'Apri il dettaglio di Da clienti (fatture e rate delle commesse) · ottobre 2026: 1.000 €' })).toBeInTheDocument();
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
    expect(screen.getByRole('button', { name: 'Apri il dettaglio di Da clienti (fatture e rate delle commesse) · novembre 2026: 5.000 €' })).toBeInTheDocument();
  });

  it('i movimenti senza categoria stanno in «Da classificare», dentro i totali, e il pulsante apre la classificazione', () => {
    apri();
    const table = screen.getByRole('table');
    // «altro» con una spesa INPS: la spesa dice di più, quindi resta classificato.
    expect(within(table).queryByText(/Da classificare/)).toBeNull();
    state.query.mockReturnValue({
      data: { ...dati(), registrati: [...dati().registrati, { id: 'c', direction: 'uscita', amount: 250, entry_date: '2026-02-03', category: 'altro', description: 'Boh' }] },
      isLoading: false,
      isError: false,
    });
    cleanup();
    apri();
    const t2 = screen.getByRole('table');
    expect(within(t2).getAllByText(/Da classificare/).length).toBeGreaterThan(0);
    expect(within(t2).getAllByText('-250 €').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Classifica movimenti/ }));
    expect(screen.getByRole('dialog', { name: 'Classifica i movimenti nelle categorie' })).toBeInTheDocument();
  });
});

describe('cash flow per le categorie del catalogo', () => {
  const v = (p: Partial<VoceCatalogo> & { id: string; codice: string; nome: string }): VoceCatalogo => ({
    parent_id: null, livello: 'voce', descrizione: null, esempio: null, flusso: 'uscita', sezione: 'operativa',
    voce_cassa_in: null, voce_cassa_out: null, richiede_commessa: false, attiva: true, archiviata_il: null, ordine: 0, origine: 'catalogo', ...p,
  });
  const catalogo = [
    v({ id: 'op', codice: 'A.operativa', nome: 'Operativa', livello: 'area', ordine: 1 }),
    v({ id: 'c01', codice: '01', nome: 'Incassi clienti', livello: 'categoria', parent_id: 'op', ordine: 1 }),
    v({ id: 'v0104', codice: '01.04', nome: 'Lavori edili', parent_id: 'c01', flusso: 'entrata', voce_cassa_in: 'inc_clienti' }),
    v({ id: 'c06', codice: '06', nome: 'Personale', livello: 'categoria', parent_id: 'op', ordine: 6 }),
    v({ id: 'v0611', codice: '06.11', nome: 'Contributi a carico azienda', parent_id: 'c06', voce_cassa_out: 'usc_contributi' }),
  ];

  it('con il catalogo la tabella parte per categorie, e si torna al riassunto', () => {
    state.catalogo = catalogo;
    apri();
    const table = screen.getByRole('table');
    expect(within(table).getByText('Incassi clienti')).toBeInTheDocument();
    expect(within(table).getByText('Totale operativa')).toBeInTheDocument();
    expect(within(table).queryByText('Flusso della gestione operativa')).toBeNull();
    expect(within(table).getAllByText('60.626 €').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Riassunto' }));
    expect(within(screen.getByRole('table')).getByText('Flusso della gestione operativa')).toBeInTheDocument();
  });

  it('un importo di una categoria apre i suoi movimenti', async () => {
    state.catalogo = catalogo;
    apri();
    fireEvent.click(screen.getByRole('button', { name: /Apri il dettaglio di Incassi clienti · gennaio 2026/ }));
    expect(await screen.findByText('Fattura 1/2026')).toBeInTheDocument();
  });

  it("l'Excel segue la vista per categorie", async () => {
    state.catalogo = catalogo;
    apri();
    fireEvent.click(screen.getByRole('button', { name: 'Esporta' }));
    await waitFor(() => expect(state.exported).toHaveBeenCalled());
    const foglio = state.exported.mock.calls[0][0].sheets[0];
    expect(foglio.columns[0].header).toBe('Categoria');
    expect(foglio.rows.some((r: { voce: string }) => r.voce === '  01 Incassi clienti')).toBe(true);
  });

  it("accanto al totale c'è l'anno prima, con la variazione", () => {
    state.catalogo = catalogo;
    state.query.mockImplementation((anno: number) => anno === 2025
      ? { data: { ...dati(), registrati: [{ id: 'p', direction: 'entrata', amount: 50000, entry_date: '2025-05-10', category: 'Incassi fatture', invoiceId: 'f0' }], previsti: null }, isLoading: false, isError: false }
      : { data: dati(), isLoading: false, isError: false });
    apri();
    const table = screen.getByRole('table');
    expect(within(table).getByRole('columnheader', { name: 'Totale 2025' })).toBeInTheDocument();
    const riga = within(table).getByText('Incassi clienti').closest('tr')!;
    expect(within(riga).getByText('50.000 €')).toBeInTheDocument();
    // 60.626 € di consuntivo + 5.000 € di rata prevista = 65.626 €: +31% sull'anno prima.
    expect(within(riga).getByText('+31%')).toBeInTheDocument();
  });

  it('dice quanto del consuntivo è classificato con voce precisa', () => {
    state.catalogo = catalogo;
    apri();
    const barra = screen.getByRole('region', { name: 'Qualità della classificazione del consuntivo' });
    expect(within(barra).getByText(/stimato dalla prima nota/)).toBeInTheDocument();
    expect(within(barra).getByRole('button', { name: /Migliora la classificazione/ })).toBeInTheDocument();
  });
});
