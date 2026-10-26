import { useState } from 'react';
import QuoteWizardAiDialog, { QuoteWizardAiIssue } from './QuoteWizardAiDialog';
import { PdfBlobLivePreviewPanel } from '@/components/shared/PdfBlobLivePreviewPanel';
import { emptyQuoteProject, type QuoteProject } from '@/lib/preventivi/quoteProject';
import { cloneWizardDraft, computoChatDocument, reconcileComputoDraft, wizardDraftFingerprint, type NativeComputoModule, type NativeComputoRow } from '@/lib/preventivi/wizardAiDraft';
import type { ChatDocument } from '@/lib/preventivi/quoteChatDocument';
import { enrichComputoRowsFromListino } from '@/lib/preventivi/wizardAiListino';
import { QUOTE_LISTINO_SOURCES } from '../../../supabase/functions/_shared/quoteListinoSource';
import type { WizardAiCommercialDraft } from '@/lib/preventivi/wizardAiCommercial';
import type { QuoteItemPro } from '@/types/quoteItem';

export type NativeComputoAiContext = {
  module: NativeComputoModule; title: string; project: object; template?: object | null; media: object[];
};
type NativePayload = { progetto: object; computo: NativeComputoRow[]; template?: object | null; media: object[] };
/** Dispatch to the existing module's renderer, with its model snapshot resolver.
 * No generic template, PDF upload, signature or save operation is introduced here. */
async function nativeComputoPreview(module: NativeComputoModule, payload: NativePayload): Promise<string> {
  switch (module) {
    case 'bagni': { const m = await import('@/hooks/useBagniPDF'); return m.renderBgnPreviewBlobUrl(payload as Parameters<typeof m.renderBgnPreviewBlobUrl>[0]); }
    case 'climatizzazione': { const m = await import('@/hooks/useClimatizzazionePDF'); return m.renderClmPreviewBlobUrl(payload as Parameters<typeof m.renderClmPreviewBlobUrl>[0]); }
    case 'elettrico': { const m = await import('@/hooks/useElettricoPDF'); return m.renderElePreviewBlobUrl(payload as Parameters<typeof m.renderElePreviewBlobUrl>[0]); }
    case 'termoidraulico': { const m = await import('@/hooks/useTermoidraulicoPDF'); return m.renderIdrPreviewBlobUrl(payload as Parameters<typeof m.renderIdrPreviewBlobUrl>[0]); }
    case 'pavimenti': { const m = await import('@/hooks/usePavimentiPDF'); return m.renderPavPreviewBlobUrl(payload as Parameters<typeof m.renderPavPreviewBlobUrl>[0]); }
    case 'piscine': { const m = await import('@/hooks/usePiscinePDF'); return m.renderPisPreviewBlobUrl(payload as Parameters<typeof m.renderPisPreviewBlobUrl>[0]); }
    case 'ristrutturazione': { const m = await import('@/hooks/useRistrutturazionePDF'); return m.renderRstPreviewBlobUrl(payload as Parameters<typeof m.renderRstPreviewBlobUrl>[0]); }
    case 'tetti': { const m = await import('@/hooks/useTettiPDF'); return m.renderTetPreviewBlobUrl(payload as Parameters<typeof m.renderTetPreviewBlobUrl>[0]); }
  }
}

function NativeDraftPreview({ context, document, rows, error }: { context: NativeComputoAiContext; document: ChatDocument; rows: NativeComputoRow[]; error?: string }) {
  return <section className="rounded-2xl border bg-white p-4" aria-label={`Anteprima modello ${context.module}`}><h2 className="font-semibold text-blue-950">{context.title}</h2><p className="mb-3 mt-1 text-xs text-slate-500">PDF del modello già selezionato · anteprima della bozza, nessun salvataggio</p>
    {error ? <p role="alert" className="text-sm text-orange-800">{error}</p> : <div className="h-[65dvh] min-h-[320px]"><PdfBlobLivePreviewPanel
      renderBlobUrl={() => nativeComputoPreview(context.module, { progetto: context.project, computo: rows, template: context.template, media: context.media })}
      depsKey={JSON.stringify([context, rows])} debounceMs={1000} downloadFileName={`Bozza-${context.module}.pdf`} /></div>}
    <p className="mt-3 text-xs text-slate-500">{document.lines.filter(row => !row.included).length} proposte fuori dal documento. Cliente, IVA e condizioni restano quelli del wizard.</p>
  </section>;
}

export default function NativeComputoAiDialog({ context, rows, companyId, projectId, open, onOpenChange, onApply }: {
  context: NativeComputoAiContext; rows: NativeComputoRow[]; companyId: string; projectId: string; open: boolean;
  onOpenChange: (open: boolean) => void; onApply: (rows: NativeComputoRow[]) => void;
}) {
  const [seed] = useState<{ base: NativeComputoRow[]; document: ChatDocument; context: NativeComputoAiContext; error: string | null }>(() => {
    try {
      const project = context.project as Record<string, unknown>;
      const template = context.template as Record<string, unknown> | null | undefined;
      if (project.id !== projectId || project.company_id !== companyId || template?.company_id && template.company_id !== companyId)
        throw new Error('Progetto o modello di un’altra azienda: riapri il preventivo corretto.');
      const base = cloneWizardDraft(rows); return { base, document: computoChatDocument(base, context.title), context: cloneWizardDraft(context), error: null };
    }
    catch (error) { return { base: [], document: { revision: 0, title: context.title, lines: [] }, context, error: (error as Error).message }; }
  });
  if (seed.error) return <QuoteWizardAiIssue open={open} onOpenChange={onOpenChange} message={seed.error} />;
  const nativeProject = seed.context.project as Record<string, unknown>;
  const project: QuoteProject = { ...emptyQuoteProject(), address: [nativeProject.cantiere_indirizzo, nativeProject.cantiere_citta].filter(Boolean).join(', '), notes: String(nativeProject.note ?? ''),
    tax: { defaultRate: typeof nativeProject.iva_pct === 'number' ? nativeProject.iva_pct : null, lineRates: [], display: 'net' as const } };
  const commercial: WizardAiCommercialDraft = {
    clientName: [nativeProject.cliente_nome, nativeProject.cliente_cognome].filter(Boolean).join(' '),
    discountPercent: typeof nativeProject.sconto_pct === 'number' ? nativeProject.sconto_pct : 0,
    prezzoManuale: typeof nativeProject.prezzo_manuale === 'number' ? nativeProject.prezzo_manuale : null,
    prezzoManualeIvaPct: project.tax!.defaultRate,
    nativeTax: { significantGoods: nativeProject.iva_beni_significativi === true,
      significantLineIds: seed.base.filter(row => row.bene_significativo === true).map(row => row.id) },
    items: seed.base.map((row): QuoteItemPro => ({ client_temp_id: row.id, item_type: 'service', item_category: 'posa', name: row.descrizione,
      description: row.descrizione_estesa || row.descrizione, quantity: row.quantita, unit_of_measure: row.unita_misura,
      unit_price: row.prezzo_unitario, discount_percent: row.sconto_pct, vat_rate: project.tax!.defaultRate,
      prezzo_acquisto: row.costo_materiali + row.costo_manodopera, mostra_nel_pdf: true, is_optional: false, sort_order: row.ordine })),
  };
  const reconcile = (draft: ChatDocument, chapters: Record<string, string> = {}) => reconcileComputoDraft(seed.base, seed.document, draft, { companyId, projectId }, chapters);
  return <QuoteWizardAiDialog open={open} onOpenChange={onOpenChange} companyId={companyId} title={seed.context.title} document={seed.document} project={project}
    fingerprint={wizardDraftFingerprint([rows, context, companyId, projectId])} commercial={{ draft: commercial, defaultVat: project.tax!.defaultRate, module: context.module }} chapters
    preview={(draft, chapters) => { try { return <NativeDraftPreview context={seed.context} document={draft} rows={reconcile(draft, chapters).rows} />; } catch (e) { return <NativeDraftPreview context={seed.context} document={draft} rows={[]} error={(e as Error).message} />; } }}
    review={(draft, chapters) => reconcile(draft, chapters)} listinoSourceId={QUOTE_LISTINO_SOURCES[context.module].id}
    onApply={async (draft, chapters) => onApply(await enrichComputoRowsFromListino(context.module, reconcile(draft, chapters).rows))} />;
}
