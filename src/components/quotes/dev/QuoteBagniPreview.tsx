import { AnteprimaVeloce } from '@/components/preventivatore/AnteprimaVeloce';
import { anteprimaComputo } from '@/lib/preventivatore/anteprimaComputo';
import * as calcoli from '@/lib/bagni/calcoli';
import { BAGNI_AI_MODELS, bagniConfirmedRows, type LocalBagniDraft } from '@/lib/preventivi/quoteBagniBridge';
import type { ChatDocument } from '@/lib/preventivi/quoteChatDocument';
import { hasBathroomBudgetExample, BATHROOM_BUDGET_NOTE } from '@/lib/preventivi/quoteBathroomBudgetExample';
import { formatCurrency } from '@/lib/formatters';
import { quoteHasIndicativePrices } from '@/lib/preventivi/quoteProposalReview';
import { useQuoteModuleTemplate } from './QuoteModuleTemplateContext';
import { QuoteModulePdfPreview } from './QuoteModulePdfPreview';
import type { QuoteProject } from '@/lib/preventivi/quoteProject';
import { quoteDocumentNotes } from '@/lib/preventivi/quoteDocumentNotes';
import { quoteScheduleDocumentText } from '@/lib/preventivi/quoteSchedule';

export function QuoteBagniPreview({ document, draft, companyId, companyName, project, scheduleScope }: { document: ChatDocument; draft: LocalBagniDraft; companyId: string; companyName: string; project?: QuoteProject; scheduleScope?: string }) {
  const live = useQuoteModuleTemplate();
  if (live) return <QuoteModulePdfPreview document={document} draft={draft} project={project} companyName={companyName} state={live} scheduleScope={scheduleScope} />;
  const rows = bagniConfirmedRows(document, companyId, draft);
  const budgetExample = hasBathroomBudgetExample(document);
  const indicative = quoteHasIndicativePrices(document);
  const data = anteprimaComputo(rows, { cliente_nome: draft.clientName, iva_pct: draft.iva }, calcoli,
    { emittente: companyName, titolo: document.title, ivaDefault: 0, conImpresa: false, senzaDetrazione: true });
  const pending = document.lines.filter(line => !line.supersededBy?.length).length - rows.length;
  const net = calcoli.calcTotaliComputo(rows, { sconto_pct: 0, iva_pct: 0 }).imponibile;
  // Unknown VAT is not a zero rate, and a partial draft is never a final total.
  if (draft.iva == null) {
    data.totali = rows.length ? [{ id: 'partial', etichetta: budgetExample ? 'Proposta netta indicativa · IVA da definire' : 'Parziale netto · IVA da definire', importo: net, forte: true }] : [];
    data.totaleDocumento = null;
  }
  data.note = [...data.note, `${pending} ${pending === 1 ? 'voce non inclusa o da completare' : 'voci non incluse o da completare'}. Bozza locale, non PDF definitivo.`];
  const sharedNotes = quoteDocumentNotes(document, project?.notes ?? '', project?.proposalNotes).notes;
  const phaseNotes = project?.schedule && scheduleScope ? quoteScheduleDocumentText(project.schedule, scheduleScope) : undefined;
  if (sharedNotes) data.note.push(sharedNotes);
  if (phaseNotes) data.note.push(phaseNotes);
  if (budgetExample) data.note.unshift(BATHROOM_BUDGET_NOTE);
  return <section className="space-y-3 rounded-xl border bg-blue-50/30 p-4" aria-label="Anteprima nativa Bagni">
    <header><strong>Bagni · {BAGNI_AI_MODELS[draft.modelId]}</strong><p className="text-xs text-slate-500">{budgetExample ? 'Proposta economica dimostrativa · importi modificabili' : indicative ? 'Proposta indicativa AI · importi da verificare' : 'Anteprima del computo originale · solo voci incluse'}</p></header>
    {rows.length > 0 && <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-orange-950" aria-label="Totale proposta a budget">
      <span className="text-sm">{budgetExample ? 'Esempio precompilato · proposta netta indicativa' : indicative ? 'Proposta indicativa AI · netto incluso' : 'Parziale netto delle lavorazioni incluse'}</span><p className="my-1 text-3xl font-semibold tracking-tight">{formatCurrency(net)}</p>
      <p className="text-xs">{rows.length} pacchetti inclusi · {draft.iva == null ? 'IVA da definire' : `IVA ${draft.iva}% inserita nell’editor, separata dal netto`}</p>
      {pending > 0 && <p className="mt-2 text-xs">{pending} lavorazioni non comprese in questo parziale: non è il prezzo completo del progetto.</p>}
      <details className="mt-2 text-xs"><summary>Ipotesi e natura dei prezzi</summary><p className="mt-2">{budgetExample ? BATHROOM_BUDGET_NOTE : 'Inclusione nel documento e verifica del prezzo sono distinte. Provenienza e motivazioni si trovano nelle voci; i costi interni incompleti non permettono di dichiarare un margine.'}</p></details>
    </div>}
    <AnteprimaVeloce dati={data} decimali={2} />
    <p className="text-xs text-slate-500">Dati immobile e PDF locale: Strumenti → Budget, costi, misure e versioni. Esportazione con impaginazione condivisa, nessuna emissione, firma o invio.</p>
  </section>;
}
