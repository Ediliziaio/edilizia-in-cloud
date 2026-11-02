import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { OrderStatus } from "@/lib/orderUtils";
import type { StatusHistoryItem } from "./OrderProgressTracker";
import { statusVisits } from "@/lib/orders/statusHistory";

interface OrdineStatusStripProps {
  statuses: OrderStatus[];
  currentStatusId: string | null;
  statusHistory?: StatusHistoryItem[];
  onStatusChange?: (statusId: string) => void;
}

/**
 * Una riga sola, anche con dodici stati: la barra dice a che punto è la commessa, il
 * menu ha i nomi interi. Il tratto chiaro segue l'ordine degli stati e non afferma che
 * un passaggio è avvenuto: quello lo dice la spunta nel menu, che viene dallo storico.
 */
export function OrdineStatusStrip({ statuses, currentStatusId, statusHistory = [], onStatusChange }: OrdineStatusStripProps) {
  const sorted = [...statuses].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const visits = statusVisits(statusHistory);
  const percorso = sorted.filter((s) => !s.is_support_phase);
  const posizione = percorso.findIndex((s) => s.id === currentStatusId);
  const dataVisita = (id: string) => visits.get(id)?.toLocaleDateString("it-IT");
  // Un colore solo sulla barra: dieci colori diversi non dicono a che punto siamo.
  const coloreAttuale = sorted.find((s) => s.id === currentStatusId)?.color || "#64748b";

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <ol className="flex min-w-[120px] flex-1 items-center gap-0.5" aria-label="Stati della commessa">
        {sorted.map((status) => {
          const isCurrent = status.id === currentStatusId;
          const passato = !status.is_support_phase && posizione >= 0 && percorso.indexOf(status) < posizione;
          const label = isCurrent ? `Stato attuale: ${status.name}` : `Imposta stato "${status.name}"`;
          const data = dataVisita(status.id);
          return (
            <li key={status.id} className={status.is_support_phase ? "ml-1.5 w-5 shrink-0" : "min-w-0 flex-1"}>
              <button
                type="button"
                disabled={!onStatusChange || isCurrent}
                aria-current={isCurrent ? "step" : undefined}
                data-status-visited={data ? "true" : "false"}
                aria-label={label}
                title={data ? `${status.name} · ultimo passaggio ${data}` : status.name}
                onClick={() => onStatusChange?.(status.id)}
                className="group flex h-6 w-full items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default"
              >
                <span
                  className="h-2 w-full rounded-sm transition-all group-enabled:group-hover:h-3"
                  style={{ backgroundColor: isCurrent ? coloreAttuale : passato ? `${coloreAttuale}55` : "#e2e8f0" }}
                />
              </button>
            </li>
          );
        })}
      </ol>
      {onStatusChange && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1 px-2 text-xs">
              Cambia stato
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-[min(60vh,26rem)] w-64 overflow-y-auto">
            {sorted.map((status) => {
              const data = dataVisita(status.id);
              const isCurrent = status.id === currentStatusId;
              return (
                <DropdownMenuItem key={status.id} disabled={isCurrent} onSelect={() => onStatusChange(status.id)} className="gap-2 text-xs">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: status.color || "#64748b" }} aria-hidden="true" />
                  <span className={isCurrent ? "min-w-0 flex-1 font-semibold" : "min-w-0 flex-1"}>{status.name}{isCurrent ? " (attuale)" : ""}</span>
                  {data && <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-muted-foreground"><Check className="h-3 w-3 text-emerald-600" aria-hidden="true" />{data}</span>}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
