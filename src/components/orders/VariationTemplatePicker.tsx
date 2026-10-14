import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVariationTemplates } from "@/hooks/useVariationTemplates";
import { applyVariationTemplate, VARIATION_TEMPLATE_EXAMPLES } from "@/lib/orders/variationTemplates";
import type { VariationDraft } from "@/lib/orders/variationDraft";
import type { VariationContext } from "@/lib/orders/variationDocumentContext";
import { Button } from "@/components/ui/button";
import { isVariationUuid } from "@/lib/orders/variationWorkspace";
import { listVariationFiles } from "@/lib/orders/variationTemplateFiles";
import { VARIATION_KINDS } from "@/lib/orders/variationDraft";

export function VariationTemplatePicker({ companyId, draft, context, onApply, disabled }: { companyId: string; draft: VariationDraft; context: VariationContext; onApply: (draft: VariationDraft) => void; disabled: boolean }) {
  const models = useVariationTemplates(companyId);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [excluded, setExcluded] = useState<string[]>([]);
  const files = useQuery({ queryKey: ["variation-template-files", companyId, selected], queryFn: () => listVariationFiles(companyId, selected), enabled: isVariationUuid(selected), staleTime: 60_000, retry: false });
  const choices = [...(models.data ?? []).map(row => ({ key: row.id, value: row })), ...VARIATION_TEMPLATE_EXAMPLES.map((value, i) => ({ key: `example-${i}`, value }))];
  return <details className="mb-4 rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Parti da un modello · facoltativo</summary>
    <div className="mt-3 space-y-2">
      <label className="text-sm" htmlFor="variation-template">Modello di variante</label>
      <select id="variation-template" disabled={disabled} value={selected} onChange={e => { setSelected(e.target.value); setExcluded([]); setError(""); }} className="h-11 w-full rounded-md border bg-background px-3 text-sm">
        <option value="">Scegli un modello</option>
        <optgroup label="Modelli dell'azienda">{choices.filter(c => !c.key.startsWith("example-")).map(c => <option key={c.key} value={c.key}>{c.value.name}</option>)}</optgroup>
        <optgroup label="Esempi da adattare">{choices.filter(c => c.key.startsWith("example-")).map(c => <option key={c.key} value={c.key}>{c.value.name}</option>)}</optgroup>
      </select>
      {models.isError && <p className="text-xs text-muted-foreground">Modelli aziendali non disponibili. Gli esempi restano utilizzabili. <button type="button" className="underline" onClick={() => void models.refetch()}>Riprova</button></p>}
      <p className="text-xs text-muted-foreground">Applica tipo, testi e stile; lavori e importo da compilare restano tuoi. Gli allegati selezionati saranno conservati con la proposta. Modelli in Impostazioni → Modelli preventivi e contratti.</p>
      {isVariationUuid(selected) && files.isLoading && <p role="status" className="text-sm">Caricamento allegati…</p>}
      {isVariationUuid(selected) && files.isError && <p role="alert" className="text-sm text-destructive">Allegati del modello non disponibili. <button type="button" className="underline" onClick={() => void files.refetch()}>Riprova</button></p>}
      {isVariationUuid(selected) && !!files.data?.length && <fieldset className="space-y-2 rounded border p-2" disabled={disabled}><legend className="px-1 text-sm">Allegati da includere</legend>{files.data.map(file => <label key={file.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={!excluded.includes(file.id)} onChange={e => setExcluded(current => e.target.checked ? current.filter(id => id !== file.id) : [...current, file.id])} /><span className="break-words">{file.file_name}</span></label>)}</fieldset>}
      <Button type="button" size="sm" disabled={disabled || !selected || (isVariationUuid(selected) && (files.isLoading || files.isError))} onClick={() => {
        try {
          const choice = choices.find(c => c.key === selected); if (!choice) throw new Error("Il modello non è più disponibile.");
          const next = applyVariationTemplate(draft, choice.value, context);
          const changesKind = next.kind !== draft.kind;
          if ((changesKind || draft.paymentTerms?.trim() || draft.additionalTerms?.trim() || draft.documentIntro?.trim()) && !window.confirm(`${changesKind ? `Il modello imposta «${VARIATION_KINDS[next.kind]}»: controlla il segno della variazione economica. ` : ""}Sostituire testi, condizioni e allegati della bozza? L'importo digitato resta invariato.`)) return;
          const row = models.data?.find(item => item.id === selected);
          onApply({ ...next, templateId: row?.id, templateRevision: row?.revision, attachmentIds: row ? (files.data ?? []).filter(file => !excluded.includes(file.id)).map(file => file.id) : [] }); setError("");
        } catch (e) { setError(e instanceof Error ? e.message : "Modello non applicabile."); }
      }}>Usa questo modello</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  </details>;
}
