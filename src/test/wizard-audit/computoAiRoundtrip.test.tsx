import { useEffect, type ComponentType } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { patchChatLine, type ChatDocument } from '@/lib/preventivi/quoteChatDocument';
import type { NativeComputoAiContext } from '@/components/quotes/NativeComputoAiDialog';
import type { NativeComputoRow } from '@/lib/preventivi/wizardAiDraft';

const state = vi.hoisted(() => ({ company: 'd2000000-0000-4000-a000-000000000002', save: vi.fn(async (_rows: NativeComputoRow[]): Promise<void> => {}) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ effectiveCompany: { id: state.company, name: 'Demo Azienda 2' } }) }));
vi.mock('@/components/computo/VoiceComputoDialog', () => ({ VoiceComputoDialog: (): null => null }));
vi.mock('@/components/computo/ComputoUploadModal', () => ({ ComputoUploadModal: (): null => null }));
vi.mock('@/hooks/useListinoLavorazioni', () => ({ useListinoVociSearch: () => ({ data: [] as never[], isLoading: false }) }));
vi.mock('@/components/shared/PdfBlobLivePreviewPanel', () => ({ PdfBlobLivePreviewPanel: () => <p>Anteprima nativa simulata</p> }));
vi.mock('@/components/quotes/dev/QuoteAssistedWorkspace', () => ({ default: function Workspace({ embedded }: { embedded: { document: ChatDocument; onChange: (d: ChatDocument, busy: boolean) => void } }) {
  useEffect(() => embedded.onChange(embedded.document, false), [embedded.onChange, embedded.document]);
  return <button onClick={() => embedded.onChange(patchChatLine(embedded.document, 'existing', { price: 175 }), false)}>Cambia prezzo nella chat di prova</button>;
} }));
const families = [['bagni', 'Bagni'], ['climatizzazione', 'Climatizzazione'], ['elettrico', 'Elettrico'], ['termoidraulico', 'Termoidraulico'], ['pavimenti', 'Pavimenti'], ['piscine', 'Piscine'], ['ristrutturazione', 'Ristrutturazione'], ['tetti', 'Tetti']] as const;
type Props = { progettoId: string; initialComputo: NativeComputoRow[]; aiContext: NativeComputoAiContext; onVociChange: (rows: NativeComputoRow[]) => void; onStato: (status: string | null) => void };
const steps = new Map<string, ComponentType<Props>>();
beforeAll(async () => {
  for (const [module, name] of families) {
    vi.doMock(`/src/hooks/use${name}Progetto`, () => ({ useEffectiveCompanyId: () => state.company, useSaveComputo: () => ({ mutateAsync: state.save, isPending: false }) }));
    vi.doMock(`/src/hooks/use${name}Listino`, () => ({ useListinoVociSearch: () => ({ data: [] as never[], isLoading: false }) }));
    vi.doMock(`/src/components/${module}/ComputoEditor/ComputoEditor`, () => ({ default: () => <p>Editor nativo simulato</p> }));
    steps.set(module, (await import(/* @vite-ignore */ `/src/pages/azienda/${module}/${name}Wizard/StepComputo.tsx`)).default);
  }
});
beforeEach(() => state.save.mockReset().mockResolvedValue(undefined));
afterEach(cleanup);
const row = (): NativeComputoRow => ({ id: 'existing', progetto_id: 'project', company_id: state.company, capitolo_nome: 'Impianti', descrizione: 'Collettore bagno', descrizione_estesa: 'Descrizione completa',
  unita_misura: 'cad', quantita: 2, prezzo_unitario: 150, costo_materiali: 31, costo_manodopera: 25, sconto_pct: 10, importo: 270, margine_eur: 158, margine_pct: 58, listino_voce_id: 'catalogue', famiglia_id: 'family', immagine_url: '/photo.jpg', fonte: 'Fonte verificata', ordine: 0 });
function mount(module: typeof families[number][0]) {
  const Step = steps.get(module)!, changed = vi.fn(), status = vi.fn(), original = row();
  const view = render(<MemoryRouter><Step progettoId="project" initialComputo={[original]} onVociChange={changed} onStato={status}
    aiContext={{ module, title: 'Modello scelto', project: { id: 'project', company_id: state.company, iva_pct: 10 }, media: [] }} /></MemoryRouter>);
  return { ...view, changed, status, original };
}
describe.each(families)('%s: actual computo step → actual AI dialog → native save boundary', module => {
  it('opening, editing inside chat and cancelling never invoke native persistence', async () => {
    mount(module); fireEvent.click(screen.getByRole('button', { name: /Apri Silvio AI/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cambia prezzo nella chat di prova' }, { timeout: 5000 }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Chiudi' })[0]); fireEvent.click(screen.getByRole('button', { name: 'Scarta e chiudi' }));
    expect(state.save).not.toHaveBeenCalled();
  });
  it('only explicit confirmation reaches the native autosave, keeping all existing metadata', async () => {
    const view = mount(module); fireEvent.click(screen.getByRole('button', { name: /Apri Silvio AI/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Cambia prezzo nella chat di prova' }, { timeout: 5000 }));
    fireEvent.click(screen.getByRole('button', { name: 'Rivedi e applica' })); expect(state.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Conferma e applica al preventivo' }));
    await waitFor(() => expect(state.save).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(state.save.mock.calls[0][0][0]).toMatchObject({ capitolo_nome: 'Impianti', descrizione: 'Collettore bagno', descrizione_estesa: 'Descrizione completa', unita_misura: 'cad', quantita: 2, prezzo_unitario: 175,
      costo_materiali: 31, costo_manodopera: 25, sconto_pct: 10, listino_voce_id: 'catalogue', famiglia_id: 'family', immagine_url: '/photo.jpg', fonte: 'Fonte verificata' });
    expect(view.changed).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'existing', prezzo_unitario: 175 })]);
    expect(view.original.prezzo_unitario).toBe(150);
  });
});
