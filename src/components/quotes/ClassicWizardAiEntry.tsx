import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { QuoteLivePreviewPanel, type QuoteLivePreviewProps } from './QuoteLivePreviewPanel';
import QuoteWizardAiDialog, { QuoteWizardAiIssue } from './QuoteWizardAiDialog';
import { classicChatDocument, reconcileClassicWizardDraft } from '@/lib/preventivi/classicWizardAiDraft';
import { cloneWizardDraft, wizardDraftFingerprint } from '@/lib/preventivi/wizardAiDraft';
import { emptyQuoteProject, type QuoteProject } from '@/lib/preventivi/quoteProject';
import { wizardAiCommercial } from '@/lib/preventivi/wizardAiCommercial';
import type { QuoteDraft } from '@/lib/preventivi/quoteDraft';
import type { QuoteItemPro } from '@/types/quoteItem';

type Props = { companyId: string; draft: QuoteDraft; preview: QuoteLivePreviewProps; defaultVat: number; onApply: (items: QuoteItemPro[], richiestaId?: string) => void; autoOpen?: boolean; onAutoOpened?: () => void };
export default function ClassicWizardAiEntry(props: Props) {
  const t = useT();
  const { autoOpen, onAutoOpened } = props;
  const [open, setOpen] = useState(!!autoOpen);
  useEffect(() => { if (autoOpen) onAutoOpened?.(); }, [autoOpen, onAutoOpened]);
  return <><Button variant="outline" className="w-full justify-start gap-2 rounded-xl border-blue-200 bg-blue-50/50 py-6 text-blue-950" onClick={() => setOpen(true)}><Sparkles className="h-4 w-4 text-orange-500" />{t("Lavora al preventivo con Silvio AI")}</Button>
    {open && <ClassicWizardAiSession {...props} open={open} onOpenChange={setOpen} />}</>;
}
function ClassicWizardAiSession(props: Props & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  // Manual rows can still lack a temp ID in the native builder. Assign only
  // inside this draft; cancelling must not dirty or persist the parent quote.
  const [base] = useState(() => {
    const ids = new Set(props.draft.items?.flatMap(item => [item.client_temp_id, item.id].filter(Boolean)));
    return cloneWizardDraft({ ...props.draft, items: props.draft.items?.map((item, index) => {
      let id = `wizard-ai-original-${index}`;
      while (ids.has(id)) id += '-local';
      ids.add(id);
      return { ...item, client_temp_id: item.client_temp_id || item.id || id };
    }) });
  });
  const [prepared] = useState(() => { try { return { document: classicChatDocument(base), error: '' }; } catch (e) { return { document: { revision: 0, title: '', lines: [] } as ReturnType<typeof classicChatDocument>, error: (e as Error).message }; } });
  const seed = prepared.document;
  const [preview] = useState(() => ({ ...props.preview, template: cloneWizardDraft(props.preview.template) }));
  if (prepared.error) return <QuoteWizardAiIssue open={props.open} onOpenChange={props.onOpenChange} message={prepared.error} />;
  const project: QuoteProject = { ...emptyQuoteProject(), notes: base.notes ?? '', address: base.indirizzoLavori ?? '', tax: { defaultRate: props.defaultVat, lineRates: [], display: 'net' as const } };
  const reconcile = (doc: typeof seed) => reconcileClassicWizardDraft(base, seed, doc, props.defaultVat);
  return <QuoteWizardAiDialog title={base.title || t("Preventivo classico")} companyId={props.companyId} open={props.open} onOpenChange={props.onOpenChange}
    document={seed} project={project} commercial={{ draft: base, defaultVat: props.defaultVat }} fingerprint={wizardDraftFingerprint([props.draft, props.preview.template, props.defaultVat])} review={doc => reconcile(doc)}
    onApply={(doc, _capitoli, richiestaId) => {
      const { items } = reconcile(doc);
      if (richiestaId) props.onApply(items, richiestaId);
      else props.onApply(items);
    }} preview={doc => {
      try {
        const { items } = reconcile(doc); const commercial = wizardAiCommercial(doc, base, props.defaultVat), totals = commercial.totals;
        return <QuoteLivePreviewPanel {...preview} items={items} subtotal={totals.subtotale} net={totals.subtotale_netto} total={totals.totale} vatBreakdown={totals.iva_breakdown} manualPrice={totals.prezzo_manuale}
          totalPending={!totals.prezzo_manuale && !items.some(item => !item.is_optional && !['nota', 'subtotale', 'sconto'].includes(item.item_category))}
          taxPending={commercial.taxPending}
          previewNotice={t("Bozza di lavoro separata. Modello e impostazioni del wizard, nessun salvataggio o invio.")} />;
      } catch (e) { return <p role="alert" className="rounded-xl border bg-white p-6 text-sm text-orange-800">{(e as Error).message}</p>; }
    }} />;
}
