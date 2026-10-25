import { useMemo } from 'react';
import ComputoEditor from '@/components/bagni/ComputoEditor/ComputoEditor';
import { ComputoReviewContext } from '@/components/bagni/ComputoEditor/ComputoReviewContext';
import type { ChatDocument } from '@/lib/preventivi/quoteChatDocument';
import { BAGNI_AI_MODELS, applyBagniEditorRows, bagniEditorRows, nativeBagniUnit, type LocalBagniDraft } from '@/lib/preventivi/quoteBagniBridge';
import { QuoteBagniPreview } from './QuoteBagniPreview';
import type { QuoteProject } from '@/lib/preventivi/quoteProject';
import QuoteWizardProjectPanel, { type QuoteWizardProjectContext } from './QuoteWizardProjectPanel';

/** Controlled production computo only: deliberately no wizard/useSaveComputo. */
export default function QuoteBagniEditor({ document, draft, companyId, companyName, project, projectContext, onChange, onBack }: {
  document: ChatDocument; draft: LocalBagniDraft; companyId: string; companyName: string;
  project?: QuoteProject;
  projectContext?: QuoteWizardProjectContext;
  onChange: (next: ReturnType<typeof applyBagniEditorRows>) => void; onBack: () => void;
}) {
  const rows = bagniEditorRows(document, companyId, draft);
  const review = useMemo(() => ({ included: new Set(document.lines.filter(line => line.included).map(line => line.id)),
    toggle: (id: string, included: boolean) => onChange(applyBagniEditorRows(document, rows, companyId, draft, { id, included })),
  }), [document, rows, companyId, draft, onChange]);
  const unsupported = document.lines.filter(line => !line.supersededBy?.length && !nativeBagniUnit(line.unit));
  return <main className="simulation-shell chat-only-workspace">
    <nav className="quote-flow-bar"><strong>Bagni · {BAGNI_AI_MODELS[draft.modelId]}</strong><button onClick={onBack}>Torna a Silvio AI</button></nav>
    <p className="mb-4 text-sm text-slate-500">Salvataggio solo nel browser. Il prezzo aggiorna subito il totale; cambiare specifiche, quantità o unità richiede di rivedere l’inclusione. Includere una voce non ne certifica il prezzo.</p>
    <div className="simulation-columns regional-layout">
      <section className="space-y-4 rounded-xl border bg-white p-4" aria-label="Editor nativo Bagni locale">
        {projectContext && <QuoteWizardProjectPanel context={projectContext} documentFields />}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">Cliente<input className="mt-1 w-full rounded-md border p-2" value={draft.clientName}
            onChange={e => onChange({ document, draft: { ...draft, clientName: e.target.value.slice(0, 200) } })} /></label>
          <label className="text-sm">IVA da confermare (%)<input type="number" min="0" max="100" className="mt-1 w-full rounded-md border p-2" placeholder="Da definire" value={draft.iva ?? ''}
            onChange={e => onChange({ document, draft: { ...draft, iva: e.target.value === '' ? null : Math.min(100, Math.max(0, Number(e.target.value))) } })} /></label>
        </div>
        {!!unsupported.length && <p role="note" className="rounded-lg bg-orange-50 p-3 text-sm">{unsupported.length} voci con unità non supportate restano nella chat: non le converto in pezzi e non le cancello.</p>}
        <ComputoReviewContext.Provider value={review}>
          <ComputoEditor value={rows} companyId={companyId} progettoId="local-ai-bagni"
            onChange={next => onChange(applyBagniEditorRows(document, next, companyId, draft))} />
        </ComputoReviewContext.Provider>
      </section>
      <QuoteBagniPreview document={document} draft={draft} project={project} companyId={companyId} companyName={companyName} scheduleScope={projectContext?.scope} />
    </div>
  </main>;
}
