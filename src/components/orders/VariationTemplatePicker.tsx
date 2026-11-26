import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useVariationTemplates } from "@/hooks/useVariationTemplates";
import { applyVariationTemplate, VARIATION_TEMPLATE_EXAMPLES } from "@/lib/orders/variationTemplates";
import type { VariationDraft } from "@/lib/orders/variationDraft";
import type { VariationContext } from "@/lib/orders/variationDocumentContext";
import { Button } from "@/components/ui/button";
import { OfficeSelect } from "./OfficeSelect";
import { isVariationUuid } from "@/lib/orders/variationWorkspace";
import { listVariationFiles } from "@/lib/orders/variationTemplateFiles";
import { VARIATION_KINDS } from "@/lib/orders/variationDraft";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export function VariationTemplatePicker({ companyId, draft, context, onApply, disabled }: { companyId: string; draft: VariationDraft; context: VariationContext; onApply: (draft: VariationDraft) => void; disabled: boolean }) {
  const t = useT();
  const models = useVariationTemplates(companyId);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [excluded, setExcluded] = useState<string[]>([]);
  const files = useQuery({ queryKey: ["variation-template-files", companyId, selected], queryFn: () => listVariationFiles(companyId, selected), enabled: isVariationUuid(selected), staleTime: 60_000, retry: false });
  const choices = [...(models.data ?? []).map(row => ({ key: row.id, value: row })), ...VARIATION_TEMPLATE_EXAMPLES.map((value, i) => ({ key: `example-${i}`, value }))];
  // 26/11/2026: era un riquadro aperto in cima al modulo con tre nomi per la stessa cosa
  // («Parti da un modello», «Modello di variante», «Scegli un modello»), un paragrafo di tre
  // righe e un bottone spento finché non sceglievi — sembrava rotto. Adesso è una riga sola:
  // scegli e il modello si applica (la domanda di conferma c'era già e resta).
  const applica = (chiave: string, esclusi: string[]) => {

        try {
          const choice = choices.find(c => c.key === chiave); if (!choice) throw new Error(t("Il modello non è più disponibile."));
          const next = applyVariationTemplate(draft, choice.value, context);
          const changesKind = next.kind !== draft.kind;
          if ((changesKind || draft.paymentTerms?.trim() || draft.additionalTerms?.trim() || draft.documentIntro?.trim()) && !window.confirm(`${changesKind ? `${t("Il modello imposta «{tipo}»: controlla il segno della variazione economica.", { tipo: t(VARIATION_KINDS[next.kind]) })} ` : ""}${t("Sostituire testi, condizioni e allegati della bozza? L'importo digitato resta invariato.")}`)) return;
          const row = models.data?.find(item => item.id === chiave);
          onApply({ ...next, templateId: row?.id, templateRevision: row?.revision, attachmentIds: row ? (files.data ?? []).filter(file => !esclusi.includes(file.id)).map(file => file.id) : [] }); setError("");
        } catch (e) { setError(e instanceof Error ? e.message : t("Modello non applicabile.")); }
        };
  return <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-muted/20 px-3 py-2">
      <label className="text-sm font-medium" htmlFor="variation-template">{t("Parti da un modello")}</label>
      <span className="text-xs text-muted-foreground">{t("facoltativo")}</span>
      <OfficeSelect id="variation-template" label={t("Modello")} disabled={disabled} value={selected} className="h-8 w-full text-xs sm:ml-auto sm:w-64"
        // Scegliere non tocca la bozza: si applica col pulsante accanto. È una garanzia
        // del modulo (variationTemplatesPanel), non un dettaglio.
        onValueChange={v => { setSelected(v); setExcluded([]); setError(""); }}
        options={[
          { value: "", label: t("Scegli un modello") },
          ...choices.filter(c => !c.key.startsWith("example-")).map(c => ({ value: c.key, label: c.value.name, group: t("Modelli dell'azienda") })),
          ...choices.filter(c => c.key.startsWith("example-")).map(c => ({ value: c.key, label: c.value.name, group: t("Esempi da adattare") })),
        ]} />
      {models.isError && <p className="text-xs text-muted-foreground">{t("Modelli aziendali non disponibili. Gli esempi restano utilizzabili.")} <button type="button" className="underline" onClick={() => void models.refetch()}>{t("Riprova")}</button></p>}
      {!selected && <p className="basis-full text-xs text-muted-foreground">{t("Porta tipo, testi e condizioni già scritti. Lavori e importo restano da compilare.")}</p>}
      {isVariationUuid(selected) && files.isLoading && <p role="status" className="text-sm">{t("Caricamento allegati…")}</p>}
      {isVariationUuid(selected) && files.isError && <p role="alert" className="text-sm text-destructive">{t("Allegati del modello non disponibili.")} <button type="button" className="underline" onClick={() => void files.refetch()}>{t("Riprova")}</button></p>}
      {isVariationUuid(selected) && !!files.data?.length && <fieldset className="basis-full space-y-2 rounded border p-2" disabled={disabled}><legend className="px-1 text-sm">{t("Allegati da includere")}</legend>{files.data.map(file => <label key={file.id} className="flex items-start gap-2 text-sm"><input type="checkbox" checked={!excluded.includes(file.id)} onChange={e => setExcluded(current => e.target.checked ? current.filter(id => id !== file.id) : [...current, file.id])} /><span className="break-words">{file.file_name}</span></label>)}</fieldset>}
      {!!selected && <Button type="button" size="sm" className="h-8 text-xs" disabled={disabled || (isVariationUuid(selected) && (files.isLoading || files.isError))} onClick={() => applica(selected, excluded)}>{t("Usa questo modello")}</Button>}
      {error && <p role="alert" className="basis-full text-sm text-destructive">{error}</p>}
  </div>;
}
