import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground lg:flex-nowrap">
        <OrdineStatusStrip statuses={statuses} currentStatusId={currentStatusId} statusHistory={statusHistory} onStatusChange={cambia} />
        <span className="whitespace-nowrap">
          {ultimo ? `Ultimo cambio: ${formatoData(ultimo.changed_at)}${ultimoAutore ? `, ${ultimoAutore}` : ""}` : "Nessun cambio registrato"}
        </span>
        {statusHistory.length > 1 && (
          <Popover>
            <PopoverTrigger className="whitespace-nowrap underline-offset-2 hover:underline">Tutti i cambi ({statusHistory.length})</PopoverTrigger>
            <PopoverContent align="end" className="max-h-72 w-72 overflow-y-auto p-2 text-xs">
              <ul className="space-y-1">
                {statusHistory.map((v) => <li key={v.id} className="tabular-nums">{formatoData(v.changed_at)} · {v.status?.name ?? "Stato eliminato"}</li>)}
              </ul>
            </PopoverContent>
          </Popover>
        )}
        <Link to={`/azienda/ordini/${orderId}/diario`} className="whitespace-nowrap font-medium text-primary underline-offset-2 hover:underline">Registro attività</Link>
        {tempi}
      </div>
      {proposto && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-blue-50 px-2.5 py-1 text-xs">
          <span>Le lavorazioni sono tutte finite.</span>
          <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => cambia?.(proposto.id)}>Passa a «{proposto.name}»</Button>
        </div>
      )}
    </div>
  );
}
