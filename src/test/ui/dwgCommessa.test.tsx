import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { DisegnoCad } from '@/lib/distinta/cad/leggiDxf';
import type { RisultatoConversioneDwg } from '@/lib/distinta/cad/convertiDwg';
import DisegnoCadPannello from '@/components/orders/materiali/DisegnoCadPannello';
const state = vi.hoisted(() => ({ converti: vi.fn<(...args: [File, string, AbortSignal]) => Promise<RisultatoConversioneDwg>>(),
  leggi: vi.fn(), carica: vi.fn(), inserisci: vi.fn(), from: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: state.from, rpc: (_name: string, args: {p_righe: unknown[]}) => state.inserisci(args.p_righe) } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'synthetic-user' } }) }));
vi.mock('@tanstack/react-query', () => ({ useQuery: () => ({ data: [] as unknown[], refetch: vi.fn() }) }));
vi.mock('@/lib/commesse/caricaDocumentoCommessa', () => ({ AVVISO_MB_DOCUMENTO: 20, caricaDocumentoCommessa: state.carica }));
vi.mock('@/lib/distinta/cad/convertiDwg', () => ({ conversioneDwgLocaleDisponibile: () => true, convertiDwgLocale: state.converti }));
vi.mock('@/lib/distinta/cad/leggiDisegnoCad', () => ({ ISTRUZIONI_DWG: 'Esporta DXF', leggiDisegnoCad: state.leggi }));
const drawing: DisegnoCad = { versione: 'AC1032', insunits: 1, layer: ['CAVI'], testi: [], blocchi: [], contorni: [], cerchi: [], entita: {}, tratti: [{ layer: 'CAVI', x: 0, y: 0, lunghezza: 1000 }] };
const provenienza = { formato_originale: 'dwg', formato_lettura: 'dxf', sha256_originale: 'a'.repeat(64), motore: 'LibreDWG', segnalazioni: true } as const;
const fakeFile = (name = 'originale.dwg') => {
  const data = name.endsWith('.dwg') ? 'AC1021example' : '0\nSECTION\n';
  const f = new File([data], name);
  Object.defineProperty(f, 'slice', { value: () => ({ arrayBuffer: async () => new TextEncoder().encode(data).buffer }) });
  return f;
};
beforeEach(() => {
  vi.clearAllMocks(); state.converti.mockResolvedValue({ file: fakeFile('derivato.dxf'), provenienza });
  state.leggi.mockImplementation(() => ({ promessa: Promise.resolve(drawing), annulla: vi.fn() }));
  state.carica.mockResolvedValue({ id: 'doc-originale' }); state.inserisci.mockResolvedValue({ error: null });
  state.from.mockReturnValue({ insert: state.inserisci });
});
afterEach(cleanup);
function open(f = fakeFile()) {
  const view = render(<DisegnoCadPannello orderId="ordine" companyId="d2000000-0000-4000-a000-000000000002" fasi={[]} puoScrivere onSalvati={vi.fn()} />);
  fireEvent.change(view.container.querySelector('input[type=file]')!, { target: { files: [f] } }); return view;
}
it('salva il DWG originale con il suo formato, mentre il worker legge il DXF derivato', async () => {
  const originale = fakeFile(); open(originale);
  await screen.findByRole('heading', { name: 'Elementi grafici da classificare' });
  expect(state.leggi.mock.calls[0][0].name).toBe('derivato.dxf');
  fireEvent.click(screen.getByRole('button', { name: /Salva tra i documenti/ }));
  await waitFor(() => expect(state.carica).toHaveBeenCalled());
  expect(state.carica.mock.calls[0][0]).toMatchObject({ file: originale, tipo: 'application/octet-stream', orderId: 'ordine' });
});
it('non genera metri finché non si calibra e salva la provenienza nei conteggi di bozza', async () => {
  open(); await screen.findByRole('heading', { name: 'Elementi grafici da classificare' });
  const salva = screen.getByRole('button', { name: 'Salva i conteggi come bozza' });
  expect(salva).toBeDisabled(); expect(within(screen.getByRole('region', { name: 'Lunghezze' })).getByText('Da verificare')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Conferma calibrazione CAD' })); expect(salva).toBeEnabled();
  fireEvent.click(salva); await waitFor(() => expect(state.inserisci).toHaveBeenCalled());
  expect(state.inserisci.mock.calls[0][0][0]).toMatchObject({ documento_nome: 'originale.dwg', metodo: 'dwg', unita: 'm',
    dettaglio: { file: 'originale.dwg', conversione: { ...provenienza, misure_calibrate: true } } });
});
it('chiudere il pannello annulla la conversione e impedisce l’avvio tardivo del worker', async () => {
  let completa!: (result: RisultatoConversioneDwg) => void;
  state.converti.mockImplementation(() => new Promise(resolve => { completa = resolve; }));
  const view = open(); await screen.findByText('Converto il DWG sul tuo computer…');
  const signal = state.converti.mock.calls[0][2]; view.unmount(); expect(signal.aborted).toBe(true);
  completa({ file: fakeFile('derivato.dxf'), provenienza });
  await new Promise(resolve => setTimeout(resolve, 0)); expect(state.leggi).not.toHaveBeenCalled();
});
it('mantiene il percorso DXF diretto, senza conversione', async () => {
  open(fakeFile('diretto.dxf')); await screen.findByRole('heading', { name: 'Elementi grafici da classificare' });
  expect(state.converti).not.toHaveBeenCalled(); expect(state.leggi.mock.calls[0][0].name).toBe('diretto.dxf');
  expect(screen.queryByLabelText('Conversione DWG')).not.toBeInTheDocument();
});
