import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { ORDER_WORKFLOW_MODELS, orderWorkflowModel, resolveWorkflowStatuses } from "@/lib/orders/workflowModels";
import { saveOrderWorkflow } from "@/lib/orders/workflowPersistence";
import type { OrderStatus } from "@/lib/orderUtils";

interface Props { orderId: string; companyId: string; modelKey?: string | null; version?: number; statuses: OrderStatus[]; canEdit: boolean; canConfigure?: boolean; onRefresh: () => Promise<unknown> }

/** Uses the existing per-order work type. No new reads, no migration, no automatic status changes. */
export function OrderWorkflowControl({orderId, companyId, modelKey, version, statuses, canEdit, canConfigure = false, onRefresh}: Props) {
  const current = modelKey ?? "";
  const currentLabel = current.replace(/[_-]+/g, " ");
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<{base: string; selected: string} | null>(null);
  const [saving, setSaving] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const selected = draft?.selected ?? current;
  const stale = !!draft && draft.base !== current;
  const resolved = resolveWorkflowStatuses(statuses, current);
  const preview = orderWorkflowModel(selected);
  const unknown = current && !orderWorkflowModel(current);
  const save = async () => {
    if (!canEdit || inFlight.current || committed || stale || selected === current || !Number.isInteger(version) || !version || (selected !== "" && !preview)) return;
    inFlight.current = true; setSaving(true); setError(null);
    let saved = false;
    try {
      await saveOrderWorkflow(supabase, {orderId, companyId, version, modelKey: selected || null});
      saved = true; setCommitted(true);
      await onRefresh();
      setOpen(false); setDraft(null);
    } catch (err) { setError(saved ? "Percorso salvato, ma la schermata non si è aggiornata. Ricarica la commessa: non serve salvare di nuovo." : err instanceof Error ? err.message : "Percorso non salvato."); }
    finally { inFlight.current = false; setSaving(false); }
  };
  return <section aria-label="Percorso operativo della commessa" className="rounded-lg border bg-slate-50/50 px-3 py-2 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2"><p className="min-w-0 break-words">Percorso operativo: <strong>{resolved.model?.label ?? (unknown ? `Tipo esistente: ${currentLabel}` : "Stati dell'azienda")}</strong></p>{canEdit && <Button size="sm" variant="outline" onClick={() => {setDraft(null); setError(null); setCommitted(false); setOpen(true);}}>Cambia percorso</Button>}</div>
    {resolved.model && !resolved.complete && <p className="mt-1 text-xs text-amber-800">Mancano {resolved.missing.length} tappe del modello: mostro gli stati aziendali, senza inventare collegamenti. {canConfigure ? <Link className="underline" to="/azienda/impostazioni/stati-ordine">Configura gli stati</Link> : "Chiedi a chi configura gli stati aziendali."}</p>}
    <Dialog open={open} onOpenChange={value => {if (!saving) setOpen(value);}}><DialogContent className="flex max-h-[90dvh] flex-col overflow-hidden sm:max-w-xl">
      <DialogHeader className="shrink-0"><DialogTitle>Percorso di questa commessa</DialogTitle><DialogDescription>La scelta vale solo qui. Non cambia gli stati attuali, lo storico o le automazioni.</DialogDescription></DialogHeader>
      <div className="min-h-0 min-w-0 space-y-3 overflow-y-auto"><label className="block space-y-1 text-sm font-medium">Tipo di lavoro<select aria-label="Percorso operativo" className="h-10 w-full min-w-0 rounded-md border bg-background px-3" disabled={saving || committed || !canEdit} value={selected} onChange={e => {setDraft({base: current, selected: e.target.value}); setError(null);}}><option value="">Usa gli stati dell'azienda</option>{unknown && <option value={current}>Mantieni tipo esistente: {currentLabel}</option>}{ORDER_WORKFLOW_MODELS.map(model => <option key={model.key} value={model.key}>{model.label}</option>)}</select></label>
        {preview && <><p className="text-xs text-muted-foreground">{preview.hint}</p><ol className="space-y-1 rounded-lg border p-3 text-sm" aria-label="Tappe del percorso">{preview.statuses.map((step, i) => <li key={step.name}>{i + 1}. {step.name}</li>)}</ol></>}
        {unknown && selected !== current && <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-900">Confermando, il tipo di lavoro «{currentLabel}» diventa «{preview?.label ?? "non classificato"}» solo su questa commessa.</p>}
        <p className="text-xs text-muted-foreground">Le tappe usano gli stati già configurati in azienda. Pagamenti, materiali, pratiche e assistenza restano separati. I nomi personalizzati non vengono associati automaticamente.</p>
        {stale && <p role="alert" className="text-sm text-destructive">Il percorso è cambiato in un'altra sessione: chiudi e ricarica prima di confermare.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </div>
      <DialogFooter className="shrink-0 border-t pt-3"><Button variant="outline" disabled={saving} onClick={() => setOpen(false)}>{committed ? "Chiudi" : "Annulla"}</Button><Button disabled={!canEdit || saving || committed || stale || selected === current || !Number.isInteger(version) || !version || (!!selected && !preview)} onClick={() => void save()}>{saving ? "Salvataggio…" : "Salva percorso"}</Button></DialogFooter>
    </DialogContent></Dialog>
  </section>;
}
