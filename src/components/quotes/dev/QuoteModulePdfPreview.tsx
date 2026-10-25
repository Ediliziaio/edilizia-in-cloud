import { useMemo, type ReactElement } from 'react';
import type { DocumentProps } from '@react-pdf/renderer';
import { PdfBlobLivePreviewPanel } from '@/components/shared/PdfBlobLivePreviewPanel';
import { createPdfPreviewUrl } from '@/lib/pdfPreviewSource';
import { emptyQuoteProject, type QuoteProject } from '@/lib/preventivi/quoteProject';
import type { ChatDocument } from '@/lib/preventivi/quoteChatDocument';
import { bagniConfirmedRows, type LocalBagniDraft } from '@/lib/preventivi/quoteBagniBridge';
import type { QuoteModuleTemplateState } from './QuoteModuleTemplateContext';

/** The download is the SAME Blob as the preview. PDF code is imported lazily,
 * debounced and protected against out-of-order generations by the shared panel. */
export function QuoteModulePdfPreview({ document, draft, companyName, project, state, scheduleScope }: {
  document: ChatDocument; draft: LocalBagniDraft; companyName: string; project?: QuoteProject; state: QuoteModuleTemplateState; scheduleScope?: string;
}) {
  const source = state.source;
  const valid = source?.module === 'bagni' && source.modelId === draft.modelId && source.template.company_id === state.companyId;
  const rows = bagniConfirmedRows(document, state.companyId, draft);
  const key = useMemo(() => JSON.stringify([document, draft, project?.address, project?.propertyType, project?.notes, project?.proposalNotes, project?.schedule, scheduleScope, source, state.company, companyName]), [document, draft, project?.address, project?.propertyType, project?.notes, project?.proposalNotes, project?.schedule, scheduleScope, source, state.company, companyName]);
  const render = async () => {
    if (!valid || source?.module !== 'bagni' || state.error) throw new Error('Modello aggiornato non disponibile. Nessun PDF generico generato.');
    const [{ buildLocalQuotePdfData, prepareLocalQuoteAppearance }, { DocumentoEdilePDF }, { pdf }, React] = await Promise.all([
      import('@/lib/preventivi/localQuotePdf'), import('@/components/preventivi/pdf/DocumentoEdilePDF'), import('@react-pdf/renderer'), import('react'),
    ]);
    const appearance = await prepareLocalQuoteAppearance({ template: source.template, company: state.company });
    const data = buildLocalQuotePdfData(document, draft, project ?? emptyQuoteProject(), state.companyId, companyName, { ...appearance, preview: true }, scheduleScope);
    // The shared component returns react-pdf's Document; its API only types the root props.
    const blob = await pdf(React.createElement(DocumentoEdilePDF, { dati: data }) as unknown as ReactElement<DocumentProps>).toBlob();
    return createPdfPreviewUrl(blob);
  };
  return <section className="quote-template-document" aria-label="Anteprima del modello Bagni sincronizzato">
    <header><div><h2>Anteprima preventivo</h2><p>Modello Bagni · immagini e impaginazione della libreria</p></div><button type="button" onClick={state.refresh}>Aggiorna modello</button></header>
    <p className="px-4 py-2 text-xs text-slate-500">Bozza locale · le modifiche al modello non cambiano quantità e prezzi. Le fotografie illustrative non identificano i prodotti forniti.</p>
    {state.loading ? <p role="status" className="p-4">Leggo il modello aggiornato…</p> : state.error || !valid ? <p role="alert" className="p-4 text-orange-800">Impossibile verificare il modello dell’intervento. La bozza è conservata; riprova con «Aggiorna modello». Nessun modello generico è stato sostituito.</p> : !rows.length ? <div className="p-4"><p role="status">Modello pronto. Il PDF si compone appena includi la prima voce completa. Nessun importo confermato.</p>{source?.module === 'bagni' && (source.template.pdf_cover_image_url || source.template.cover_image_url) && <img className="mt-4 max-h-96 w-full rounded-lg object-cover" src={source.template.pdf_cover_image_url || source.template.cover_image_url || undefined} alt="Immagine illustrativa di copertina del modello Bagni scelto" />}</div> : <div className="h-[76vh] min-h-[480px]"><PdfBlobLivePreviewPanel key={`${state.companyId}:${draft.modelId}`} renderBlobUrl={render} depsKey={key} debounceMs={1000} downloadFileName={`Bozza-locale-bagni-${draft.modelId}.pdf`} /></div>}
  </section>;
}
