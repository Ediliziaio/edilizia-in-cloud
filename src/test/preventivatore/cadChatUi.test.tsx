import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { QuoteCadReading } from '@/lib/preventivi/quoteCad';
import type { QuoteChatTransport } from '@/lib/preventivi/quoteChatDocument';
vi.mock('@/lib/prezzario/queries', () => ({ usePrezzarioFonti: () => ({ data: [] as never[], isFetching: false, error: null as Error | null }) }));
vi.mock('@/lib/preventivi/quoteCad', async original => ({ ...await original<typeof import('@/lib/preventivi/quoteCad')>(), readCadLocally: vi.fn() }));
import { readCadLocally } from '@/lib/preventivi/quoteCad';
import Workspace from '@/components/quotes/dev/QuoteAssistedWorkspace';
const companyId = 'd2000000-0000-4000-a000-000000000002';
const reading = (): QuoteCadReading => ({ version: 1, id: 'c'.repeat(64), name: 'test.dwg', size: 6, engine: 'LibreDWG', units: 4, entities: 100, inserts: 0, dimensions: 0, layers: ['PDF_Text'], texts: [{ text: 'Sostituzione infissi', handle: '42', layer: 'PDF_Text', xy: [1, 2] }], totalTexts: 10, omittedTexts: 9, partial: false, mixedStates: true, pdfImported: true, externalReferences: 1 });
const call = () => vi.fn<QuoteChatTransport>().mockImplementation(async r => ({ version: 1, revision: r.revision, turnId: r.turnId, simulated: false, model: 'test', references: [], turn: { version: 1, title: '', message: 'Quali infissi vuoi sostituire?', questions: [], warnings: [], searches: [], proposals: [] } }));
function attach() { fireEvent.change(screen.getByLabelText('File planimetria'), { target: { files: [new File(['AC1032'], 'test.dwg')] } }); }
afterEach(() => { cleanup(); vi.mocked(readCadLocally).mockReset(); });
describe('Chat DWG nel preventivo nativo', () => {
  it('carica senza AI, fa scegliere lo stato e invia solo evidenza limitata al turno richiesto', async () => {
    vi.mocked(readCadLocally).mockResolvedValue(reading()); const transport = call();
    render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={transport} />);
    attach(); await screen.findByRole('region', { name: 'Disegno DWG del progetto' }); expect(transport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Progetto' })); expect(transport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Guidami negli interventi' })); await waitFor(() => expect(transport).toHaveBeenCalledOnce());
    const evidence = transport.mock.calls[0][0].messages.find(m => m.text.startsWith('FONTE CAD'))!.text;
    expect(evidence).toContain('H42'); expect(evidence).toContain('desiderato dall’utente=project'); expect(evidence.length).toBeLessThan(3000);
    expect(JSON.stringify(transport.mock.calls[0][0])).not.toContain('AC1032');
    expect(screen.getByTestId('live-quote-total')).toHaveTextContent('Importo da determinare');
  });
  it('ignora il convertitore tardivo dopo Stop', async () => {
    let resolve!: (r: QuoteCadReading) => void;
    vi.mocked(readCadLocally).mockImplementation(() => new Promise(r => { resolve = r; })); const transport = call();
    render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={transport} />);
    attach(); await waitFor(() => expect(readCadLocally).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: /Interrompi/ }));
    await act(async () => resolve(reading()));
    expect(screen.queryByRole('region', { name: 'Disegno DWG del progetto' })).not.toBeInTheDocument(); expect(transport).not.toHaveBeenCalled();
  });
  it('non trasferisce il CAD al cambio di azienda mentre legge', async () => {
    let resolve!: (r: QuoteCadReading) => void;
    vi.mocked(readCadLocally).mockImplementation(() => new Promise(r => { resolve = r; })); const transport = call();
    const view = render(<Workspace companyId={companyId} onBack={vi.fn()} simulated={false} transport={transport} />); attach(); await waitFor(() => expect(readCadLocally).toHaveBeenCalledOnce());
    view.rerender(<Workspace companyId="a0000000-0000-4000-a000-000000000001" onBack={vi.fn()} simulated={false} transport={transport} />);
    await act(async () => resolve(reading())); expect(screen.queryByRole('region', { name: 'Disegno DWG del progetto' })).not.toBeInTheDocument(); expect(transport).not.toHaveBeenCalled();
  });
});
