import { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatDocument } from '@/lib/preventivi/quoteChatDocument';
import { emptyChatDocument } from '@/lib/preventivi/quoteChatDocument';
import { emptyQuoteProject } from '@/lib/preventivi/quoteProject';
import QuoteWizardAiDialog from '@/components/quotes/QuoteWizardAiDialog';
import NativeComputoAiDialog, { type NativeComputoAiContext } from '@/components/quotes/NativeComputoAiDialog';
import type { NativeComputoModule } from '@/lib/preventivi/wizardAiDraft';
const state = vi.hoisted(() => ({ company: 'd2000000-0000-4000-a000-000000000002', owner: 'user', renders: vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ effectiveCompany: { id: state.company, name: 'Demo Azienda 2' }, user: { id: state.owner } }) }));
vi.mock('@/components/quotes/dev/QuoteAssistedWorkspace', () => ({ default: function Workspace({ embedded }: { embedded: { document: ChatDocument; onChange: (doc: ChatDocument, busy: boolean) => void; preview: (doc: ChatDocument) => React.ReactNode } }) {
  useEffect(() => { embedded.onChange(embedded.document, false); }, [embedded.onChange, embedded.document]);
  const document: ChatDocument = { ...embedded.document, revision: 1, lines: [...embedded.document.lines, { id: 'new', title: 'Demolizione pavimento', description: 'Rimozione controllata', quantity: 12, unit: 'mq', quantityBasis: 'Misura confermata', referenceId: null, price: 18, included: true, manual: true, reference: null,
    original: { id: 'new', title: 'Demolizione pavimento', description: '', quantity: 12, unit: 'mq', quantityBasis: 'Misura confermata', referenceId: null } }] };
  return <><button onClick={() => embedded.onChange(document, false)}>Proponi voce confermata</button><button onClick={() => embedded.onChange(document, true)}>Richiesta in corso</button>{embedded.preview(document)}</>;
} }));
vi.mock('@/components/shared/PdfBlobLivePreviewPanel', () => ({ PdfBlobLivePreviewPanel: function Preview({ renderBlobUrl, depsKey }: { renderBlobUrl: () => Promise<string>; depsKey: string }) {
  useEffect(() => { void renderBlobUrl(); }, [depsKey]); return <div>PDF nativo</div>;
} }));
vi.mock('@/hooks/useBagniPDF', () => ({ renderBgnPreviewBlobUrl: state.renders }));
vi.mock('@/hooks/useClimatizzazionePDF', () => ({ renderClmPreviewBlobUrl: state.renders }));
vi.mock('@/hooks/useElettricoPDF', () => ({ renderElePreviewBlobUrl: state.renders }));
vi.mock('@/hooks/useTermoidraulicoPDF', () => ({ renderIdrPreviewBlobUrl: state.renders }));
vi.mock('@/hooks/usePavimentiPDF', () => ({ renderPavPreviewBlobUrl: state.renders }));
vi.mock('@/hooks/usePiscinePDF', () => ({ renderPisPreviewBlobUrl: state.renders }));
vi.mock('@/hooks/useRistrutturazionePDF', () => ({ renderRstPreviewBlobUrl: state.renders }));
vi.mock('@/hooks/useTettiPDF', () => ({ renderTetPreviewBlobUrl: state.renders }));
afterEach(() => { cleanup(); state.company = 'd2000000-0000-4000-a000-000000000002'; state.owner = 'user'; vi.clearAllMocks(); });
const props = () => ({ companyId: state.company, open: true, onOpenChange: vi.fn(), title: 'Modello scelto', document: emptyChatDocument(), project: emptyQuoteProject(), fingerprint: 'original',
  preview: () => <div>Anteprima del modello selezionato</div>, review: (doc: ChatDocument) => ({ changes: doc.lines.map(row => ({ id: row.id, title: row.title, chapter: 'Demolizioni', kind: 'aggiunta' as const })), pending: 0 }), onApply: vi.fn() });

describe('wizard AI isolated modal', () => {
  it('has no write on opening, reviewing or cancel, even with generated lines', async () => {
    const p = props(); render(<QuoteWizardAiDialog {...p} />);
    await screen.findByRole('button', { name: 'Proponi voce confermata' }); fireEvent.click(screen.getByRole('button', { name: 'Proponi voce confermata' }));
    fireEvent.click(screen.getByRole('button', { name: 'Rivedi e applica' })); expect(screen.getByRole('region', { name: 'Riepilogo modifiche prima di applicare' })).toBeInTheDocument();
    expect(p.onApply).not.toHaveBeenCalled(); fireEvent.click(screen.getAllByRole('button', { name: 'Chiudi' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Scarta e chiudi' })); expect(p.onOpenChange).toHaveBeenCalledWith(false); expect(p.onApply).not.toHaveBeenCalled(); expect(p.document.lines).toHaveLength(0);
  });
  it('applies only after the second explicit confirmation and passes edited chapters', async () => {
    const p = props(); render(<QuoteWizardAiDialog {...p} chapters />);
    fireEvent.click(await screen.findByRole('button', { name: 'Proponi voce confermata' })); fireEvent.click(screen.getByRole('button', { name: 'Rivedi e applica' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Capitolo di Demolizione pavimento' }), { target: { value: 'Preparazione cantiere' } });
    expect(p.onApply).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Conferma e applica al preventivo' }));
    await waitFor(() => expect(p.onApply).toHaveBeenCalledTimes(1)); expect(p.onApply.mock.calls[0][1]).toEqual({ new: 'Preparazione cantiere' }); expect(p.document.lines).toHaveLength(0);
  });
  it('blocks apply if the parent quote changes while the modal is open', async () => {
    const p = props(), view = render(<QuoteWizardAiDialog {...p} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Proponi voce confermata' })); view.rerender(<QuoteWizardAiDialog {...p} fingerprint="new revision" />);
    expect(screen.getByRole('alert')).toHaveTextContent('preventivo è cambiato'); expect(screen.getByRole('button', { name: 'Rivedi e applica' })).toBeDisabled(); expect(p.onApply).not.toHaveBeenCalled();
  });
  it('unmounts the workspace and blocks cross-tenant application', async () => {
    const p = props(), view = render(<QuoteWizardAiDialog {...p} />); await screen.findByRole('button', { name: 'Proponi voce confermata' });
    state.company = 'other'; view.rerender(<QuoteWizardAiDialog {...p} />); expect(screen.getByRole('alert')).toHaveTextContent('azienda attiva è cambiata'); expect(screen.queryByRole('button', { name: 'Proponi voce confermata' })).not.toBeInTheDocument();
  });
  it('cannot confirm while an AI request is still running', async () => {
    const p = props(); render(<QuoteWizardAiDialog {...p} />); fireEvent.click(await screen.findByRole('button', { name: 'Richiesta in corso' })); expect(screen.getByRole('button', { name: 'Rivedi e applica' })).toBeDisabled();
  });
  it('unmounts chat and blocks apply when the account changes inside the same company', async () => {
    const p = props(), view = render(<QuoteWizardAiDialog {...p} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Proponi voce confermata' }));
    state.owner = 'another-user'; view.rerender(<QuoteWizardAiDialog {...p} />);
    expect(screen.getByRole('alert')).toHaveTextContent('account');
    expect(screen.queryByRole('button', { name: 'Proponi voce confermata' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Rivedi e applica' })).toBeDisabled(); expect(p.onApply).not.toHaveBeenCalled();
  });
  it('does not retarget an open draft when both the active company and props change', async () => {
    const p = props(), view = render(<QuoteWizardAiDialog {...p} />);
    await screen.findByRole('button', { name: 'Proponi voce confermata' });
    state.company = 'b2000000-0000-4000-a000-000000000002'; view.rerender(<QuoteWizardAiDialog {...p} companyId={state.company} />);
    expect(screen.getByRole('alert')).toHaveTextContent('azienda attiva');
    expect(screen.queryByRole('button', { name: 'Proponi voce confermata' })).not.toBeInTheDocument(); expect(p.onApply).not.toHaveBeenCalled();
  });
  it('keeps the modal and original data on apply failure', async () => {
    const p = props(); p.onApply.mockImplementation(() => { throw new Error('Revisione superata'); }); render(<QuoteWizardAiDialog {...p} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Proponi voce confermata' })); fireEvent.click(screen.getByRole('button', { name: 'Rivedi e applica' })); fireEvent.click(screen.getByRole('button', { name: 'Conferma e applica al preventivo' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Revisione superata'); expect(p.onOpenChange).not.toHaveBeenCalled();
  });
  it('blocks double submit even before the pending React update commits', async () => {
    const p = props(); let finish: () => void = () => {}; p.onApply.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; })); render(<QuoteWizardAiDialog {...p} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Proponi voce confermata' })); fireEvent.click(screen.getByRole('button', { name: 'Rivedi e applica' })); const button = screen.getByRole('button', { name: 'Conferma e applica al preventivo' });
    act(() => { button.click(); button.click(); }); expect(p.onApply).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Proponi voce confermata' })).toBeDisabled(); await act(async () => finish());
  });
  it('keeps an invalid chapter field available to correct instead of trapping the review', async () => {
    const p = props(), review = (doc: ChatDocument, chapters: Record<string, string>) => {
      if (chapters.new === '') throw new Error('Indica un capitolo valido');
      return p.review(doc);
    };
    render(<QuoteWizardAiDialog {...p} review={review} chapters />);
    fireEvent.click(await screen.findByRole('button', { name: 'Proponi voce confermata' })); fireEvent.click(screen.getByRole('button', { name: 'Rivedi e applica' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Capitolo di Demolizione pavimento' }), { target: { value: '' } });
    expect(screen.getByRole('alert')).toHaveTextContent('capitolo valido'); expect(screen.getByRole('button', { name: 'Conferma e applica al preventivo' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Capitolo di Demolizione pavimento' }), { target: { value: 'Preparazione' } });
    expect(screen.getByRole('button', { name: 'Conferma e applica al preventivo' })).toBeEnabled();
  });
});

describe('all eight computo engines keep their native preview payload', () => {
  it('blocks a foreign project before rendering its PDF or mounting chat', () => {
    const context: NativeComputoAiContext = { module: 'bagni', title: 'Wrong', project: { id: 'project', company_id: 'other' }, media: [] };
    render(<NativeComputoAiDialog context={context} rows={[]} companyId={state.company} projectId="project" open onOpenChange={vi.fn()} onApply={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('altra azienda'); expect(state.renders).not.toHaveBeenCalled();
  });
  it.each<NativeComputoModule>(['bagni', 'climatizzazione', 'elettrico', 'termoidraulico', 'pavimenti', 'piscine', 'ristrutturazione', 'tetti'])('%s uses its project snapshot, company, photos and model template', async module => {
    const context: NativeComputoAiContext = { module, title: `Selected ${module}`, project: { id: 'project', company_id: state.company, iva_pct: 10, cliente_nome: 'Cliente sintetico', modello_snapshot: { modelId: 'specific', template: { cover_image_url: '/selected.jpg' } } }, template: { company_id: state.company, cover_image_url: '/base.jpg' }, media: [{ id: 'original-media' }] };
    const apply = vi.fn(); render(<NativeComputoAiDialog context={context} rows={[]} companyId={state.company} projectId="project" open onOpenChange={vi.fn()} onApply={apply} />);
    await waitFor(() => expect(state.renders).toHaveBeenCalled()); const payload = state.renders.mock.calls[0][0];
    expect(payload.progetto).toEqual(context.project); expect(payload.template).toEqual(context.template); expect(payload.media).toEqual(context.media); expect(payload.computo[0]).toMatchObject({ company_id: state.company, progetto_id: 'project', unita_misura: 'mq', quantita: 12, prezzo_unitario: 18 });
    expect(apply).not.toHaveBeenCalled();
  });
});
