import type { ComponentProps } from "react";
import { OrdineStatusStrip } from "./OrdineStatusStrip";
import { OrderWorkflowControl } from "./OrderWorkflowControl";
import { resolveWorkflowStatuses, suggestWorkflowStatus, type WorkflowProgress } from "@/lib/orders/workflowModels";
import { Button } from "@/components/ui/button";

type Props = ComponentProps<typeof OrdineStatusStrip> & {orderId: string; companyId: string; modelKey?: string | null; version?: number; canEdit: boolean; canConfigure?: boolean; workProgress?: WorkflowProgress; onRefresh: () => Promise<unknown>};
export function OrderStatusWorkflow({orderId, companyId, modelKey, version, canEdit, canConfigure, workProgress, onRefresh, ...strip}: Props) {
  const resolved = resolveWorkflowStatuses(strip.statuses, modelKey);
  const suggestion = suggestWorkflowStatus(resolved, strip.currentStatusId, workProgress);
  const guardedStrip = {...strip, onStatusChange: canEdit ? strip.onStatusChange : undefined};
  return <div className="space-y-3">
    <OrderWorkflowControl orderId={orderId} companyId={companyId} modelKey={modelKey} version={version} statuses={strip.statuses} canEdit={canEdit} canConfigure={canConfigure} onRefresh={onRefresh} />
    <p className="text-xs text-muted-foreground">Le spunte indicano passaggi registrati nello storico, non lavori completati o pagamenti incassati.</p>
    <OrdineStatusStrip {...guardedStrip} statuses={resolved.complete ? resolved.path : strip.statuses} />
    {suggestion && canEdit && strip.onStatusChange && <div className="flex flex-wrap items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs"><p>{suggestion.reason}</p><Button variant="outline" size="sm" onClick={() => strip.onStatusChange?.(suggestion.status.id)}>Valuta «{suggestion.status.name}»</Button><span className="text-muted-foreground">Richiede conferma. Non registra consegna, firma o incassi.</span></div>}
    {resolved.complete && strip.currentStatusId && !resolved.path.some(s => s.id === strip.currentStatusId) && <p className="text-xs text-amber-800">Lo stato attuale è negli stati aggiuntivi: scegliere il percorso non lo cambia.</p>}
    {resolved.complete && resolved.additional.length > 0 && <details className="rounded-lg border px-3 py-2 text-sm"><summary className="cursor-pointer">Altri stati aziendali e assistenza ({resolved.additional.length})</summary><div className="mt-2"><p className="text-xs text-muted-foreground">Restano disponibili con i loro collegamenti. Non appartengono al percorso selezionato.</p><OrdineStatusStrip {...guardedStrip} statuses={resolved.additional} /></div></details>}
  </div>;
}
