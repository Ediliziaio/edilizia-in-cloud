import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLiveQuoteModuleTemplate } from '@/components/quotes/dev/useLiveQuoteModuleTemplate';
import { QuoteModulePdfPreview } from '@/components/quotes/dev/QuoteModulePdfPreview';
import { QuoteModuleTemplateContext } from '@/components/quotes/dev/QuoteModuleTemplateContext';
import { QuoteBagniPreview } from '@/components/quotes/dev/QuoteBagniPreview';
import { MODELLO_AGGIORNATO } from '@/lib/moduli-vendita/archivioModelli';
import { createFullBgnTemplate } from '@/lib/moduli-vendita/fullBgnModules';
import { emptyChatDocument } from '@/lib/preventivi/quoteChatDocument';
import { applyBathroomBudgetExample } from '@/lib/preventivi/quoteBathroomBudgetExample';
import type { BgnTemplatePdf } from '@/types/bagni';
import type { LocalBagniDraft } from '@/lib/preventivi/quoteBagniBridge';
const ports = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('@/lib/preventivi/liveQuoteModuleTemplate', () => ({ loadLiveQuoteModuleTemplate: ports.load }));
vi.mock('@/components/shared/PdfBlobLivePreviewPanel', () => ({ PdfBlobLivePreviewPanel: ({ depsKey, downloadFileName }: { depsKey: string; downloadFileName: string }) => <output data-testid="native-pdf" data-signature={depsKey}>{downloadFileName}</output> }));
const company = 'demo-2';
const template = createFullBgnTemplate({ company_id: company } as BgnTemplatePdf, 'completo');
const draft: LocalBagniDraft = { modelId: 'completo', clientName: 'Cliente demo', iva: null, rows: [] };
beforeEach(() => { ports.load.mockReset(); ports.load.mockResolvedValue({ module: 'bagni', modelId: 'completo', template }); });
afterEach(cleanup);
function Status({ companyId }: { companyId: string }) { const q = useLiveQuoteModuleTemplate(companyId, 'bagni', 'completo'); return <output>{q.data?.template.pdf_cover_hero || q.status}</output>; }
describe('Aggiornamento modelli senza cambiare le voci', () => {
  it('rilegge il modello salvato nella stessa scheda, ignorando altre aziende', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { unmount } = render(<QueryClientProvider client={client}><Status companyId={company} /></QueryClientProvider>);
    await waitFor(() => expect(ports.load).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new CustomEvent(MODELLO_AGGIORNATO, { detail: { companyId: 'altra' } }));
    await new Promise(r => setTimeout(r, 250)); expect(ports.load).toHaveBeenCalledTimes(1);
    ports.load.mockResolvedValue({ module: 'bagni', modelId: 'completo', template: { ...template, pdf_cover_hero: 'Modello nuovo' } });
    window.dispatchEvent(new CustomEvent(MODELLO_AGGIORNATO, { detail: { companyId: company } }));
    await waitFor(() => expect(screen.getByText('Modello nuovo')).toBeInTheDocument());
    unmount(); client.clear();
  });
  it('si aggiorna quando un’altra scheda salva e rimuove gli ascoltatori allo smontaggio', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { unmount } = render(<QueryClientProvider client={client}><Status companyId={company} /></QueryClientProvider>);
    await waitFor(() => expect(ports.load).toHaveBeenCalledTimes(1));
    ports.load.mockResolvedValue({ module: 'bagni', modelId: 'completo', template: { ...template, pdf_cover_hero: 'Da altra scheda' } });
    window.dispatchEvent(new StorageEvent('storage', { key: `eic:full-bgn-module:v1:${company}:completo` }));
    await waitFor(() => expect(screen.getByText('Da altra scheda')).toBeInTheDocument());
    unmount(); client.clear();
    window.dispatchEvent(new CustomEvent(MODELLO_AGGIORNATO, { detail: { companyId: company } }));
    await new Promise(r => setTimeout(r, 250)); expect(ports.load).toHaveBeenCalledTimes(2);
  });
  it('collega la chat al PDF originale e cambia firma grafica senza toccare il computo', () => {
    const doc = applyBathroomBudgetExample(emptyChatDocument(), 0); const original = JSON.stringify(doc);
    const state = { companyId: company, source: { module: 'bagni' as const, modelId: 'completo', template }, loading: false, error: false, refresh: vi.fn() };
    const { rerender } = render(<QuoteModuleTemplateContext.Provider value={state}><QuoteBagniPreview document={doc} draft={draft} companyId={company} companyName="Demo 2" /></QuoteModuleTemplateContext.Provider>);
    const signature = screen.getByTestId('native-pdf').getAttribute('data-signature');
    rerender(<QuoteModuleTemplateContext.Provider value={{ ...state, source: { ...state.source, template: { ...template, pdf_cover_image_url: '/nuova-immagine.jpg' } } }}><QuoteBagniPreview document={doc} draft={draft} companyId={company} companyName="Demo 2" /></QuoteModuleTemplateContext.Provider>);
    expect(screen.getByTestId('native-pdf').getAttribute('data-signature')).not.toBe(signature); expect(JSON.stringify(doc)).toBe(original);
    fireEvent.click(screen.getByRole('button', { name: 'Aggiorna modello' })); expect(state.refresh).toHaveBeenCalledOnce();
  });
  it('non espone un PDF vecchio o generico quando il modello non è verificato', () => {
    const doc = applyBathroomBudgetExample(emptyChatDocument(), 0);
    render(<QuoteModulePdfPreview document={doc} draft={draft} companyName="Demo 2" state={{ companyId: company, source: { module: 'bagni', modelId: 'completo', template }, loading: false, error: true, refresh: vi.fn() }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Impossibile verificare'); expect(screen.queryByTestId('native-pdf')).not.toBeInTheDocument();
  });
  it('su bozza vuota mostra il modello scelto, non un totale zero o prezzi di esempio', () => {
    render(<QuoteModulePdfPreview document={emptyChatDocument()} draft={draft} companyName="Demo 2" state={{ companyId: company, source: { module: 'bagni', modelId: 'completo', template }, loading: false, error: false, refresh: vi.fn() }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Nessun importo confermato'); expect(screen.getByRole('img')).toHaveAttribute('src', template.pdf_cover_image_url);
    expect(screen.queryByTestId('native-pdf')).not.toBeInTheDocument();
  });
});
