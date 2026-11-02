import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { statoProposto, type AvanzamentoLavorazioni } from "@/lib/orders/statoCommessa";
import type { OrderStatus } from "@/lib/orderUtils";
import { OrdineStatusStrip } from "./OrdineStatusStrip";

interface VoceStorico { id: string; status_id: string; changed_at: string; status?: { name?: string | null } | null }

interface Props {
  orderId: string;
  statuses: OrderStatus[];
  currentStatusId: string | null;
  statusHistory?: VoceStorico[];
  canEdit: boolean;
  onStatusChange?: (statusId: string) => void;
  workProgress?: AvanzamentoLavorazioni;
  /** Chi ha fatto l'ultimo cambio, se si è potuto leggere. */
  ultimoAutore?: string | null;
  formatoData: (iso: string) => string;
  /** Il semaforo dei tempi, quando ha ancora senso mostrarlo. */
  tempi?: React.ReactNode;
}

/** Lo stato della commessa: si vede e si cambia da qui, tutto il resto sta nel Registro. */
export function OrderStatusWorkflow({ orderId, statuses, currentStatusId, statusHistory = [], canEdit, onStatusChange, workProgress, ultimoAutore, formatoData, tempi }: Props) {
  const cambia = canEdit ? onStatusChange : undefined;
  const proposto = cambia ? statoProposto(statuses, currentStatusId, workProgress) : null;
  const ultimo = statusHistory[0];
  return (
    <div className="space-y-2">
      <OrdineStatusStrip statuses={statuses} currentStatusId={currentStatusId} statusHistory={statusHistory} onStatusChange={cambia} />
      {proposto && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-blue-50 px-2.5 py-1.5 text-xs">
          <span>Le lavorazioni sono tutte finite.</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => cambia?.(proposto.id)}>Passa a «{proposto.name}»</Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span>
          {ultimo ? `Ultimo cambio: ${formatoData(ultimo.changed_at)}${ultimoAutore ? `, ${ultimoAutore}` : ""}` : "Nessun cambio di stato registrato"}
        </span>
        {statusHistory.length > 1 && (
          <details className="group/storico">
            <summary className="cursor-pointer list-none underline-offset-2 hover:underline">Tutti i cambi ({statusHistory.length})</summary>
            <ul className="mt-1 space-y-0.5">
              {statusHistory.map((v) => <li key={v.id} className="tabular-nums">{formatoData(v.changed_at)} · {v.status?.name ?? "Stato eliminato"}</li>)}
            </ul>
          </details>
        )}
        <Link to={`/azienda/ordini/${orderId}/diario`} className="font-medium text-primary underline-offset-2 hover:underline">Registro attività</Link>
        {tempi}
      </div>
    </div>
  );
}
