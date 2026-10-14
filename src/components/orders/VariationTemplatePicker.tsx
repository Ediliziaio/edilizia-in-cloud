import { useState } from "react";
import { useVariationTemplates } from "@/hooks/useVariationTemplates";
import { applyVariationTemplate, VARIATION_TEMPLATE_EXAMPLES } from "@/lib/orders/variationTemplates";
import type { VariationDraft } from "@/lib/orders/variationDraft";
import type { VariationContext } from "@/lib/orders/variationDocumentContext";
import { Button } from "@/components/ui/button";

export function VariationTemplatePicker({ companyId, draft, context, onApply, disabled }: { companyId: string; draft: VariationDraft; context: VariationContext; onApply: (draft: VariationDraft) => void; disabled: boolean }) {
  const models = useVariationTemplates(companyId);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const choices = [...(models.data ?? []).map(row => ({ key: row.id, value: row })), ...VARIATION_TEMPLATE_EXAMPLES.map((value, i) => ({ key: `example-${i}`, value }))];
  return <details className="mb-4 rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">Parti da un modello · facoltativo</summary>
    <div className="mt-3 space-y-2">
      <label className="text-sm" htmlFor="variation-template">Modello di variante</label>
      <select id="variation-template" disabled={disabled} value={selected} onChange={e => { setSelected(e.target.value); setError(""); }} className="h-11 w-full rounded-md border bg-background px-3 text-sm">
        <option value="">Scegli un modello</option>
        <optgroup label="Modelli dell'azienda">{choices.filter(c => !c.key.startsWith("example-")).map(c => <option key={c.key} value={c.key}>{c.value.name}</option>)}</optgroup>
        <optgroup label="Esempi da adattare">{choices.filter(c => c.key.startsWith("example-")).map(c => <option key={c.key} value={c.key}>{c.value.name}</option>)}</optgroup>
      </select>
      {models.isError && <p className="text-xs text-muted-foreground">Modelli aziendali non disponibili. Gli esempi restano utilizzabili. <button type="button" className="underline" onClick={() => void models.refetch()}>Riprova</button></p>}
      <p className="text-xs text-muted-foreground">Applica testi, condizioni e stile. Non cambia lavori, prezzo o giorni già inseriti. I modelli si gestiscono in Impostazioni → Modelli preventivi e contratti → Varianti e lavori extra.</p>
      <Button type="button" size="sm" disabled={disabled || !selected} onClick={() => {
        try {
          const choice = choices.find(c => c.key === selected); if (!choice) throw new Error("Il modello non è più disponibile.");
          const next = applyVariationTemplate(draft, choice.value, context);
          if ((draft.paymentTerms?.trim() || draft.additionalTerms?.trim() || draft.documentIntro?.trim()) && !window.confirm("Sostituire i testi e le condizioni del documento con quelli del modello? I lavori e il prezzo restano invariati.")) return;
          onApply(next); setError("");
        } catch (e) { setError(e instanceof Error ? e.message : "Modello non applicabile."); }
      }}>Usa questo modello</Button>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  </details>;
}
