import { useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OrdersPipelineCard } from "./OrdersPipelineCard";
import { type OrderWithDetails, type OrderStatus } from "@/lib/orderUtils";

/** Inizio di oggi: con la data di posa si confronta il giorno, non l'ora. */
export function inizioOggi(): Date {
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  return oggi;
}

/** La commessa ha la data di posa prevista già passata. */
export function haPosaScaduta(order: OrderWithDetails, oggi: Date): boolean {
  if (!order.expected_date) return false;
  const data = new Date(order.expected_date);
  data.setHours(0, 0, 0, 0);
  return data < oggi;
}

interface OrdersPipelineColumnProps {
  status: OrderStatus;
  orders: OrderWithDetails[];
  isDragEnabled?: boolean;
  /** Colonna ridotta a una barra sottile (resta una zona dove rilasciare). */
  collapsed?: boolean;
  onToggleCollapse?: (statusId: string) => void;
}

export function OrdersPipelineColumn({
  status,
  orders,
  isDragEnabled = true,
  collapsed = false,
  onToggleCollapse,
}: OrdersPipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status.id,
  });

  const colore = status.color || "#6b7280";

  const totalAmount = useMemo(
    () => orders.reduce((sum, o) => sum + (o.total_amount || 0), 0),
    [orders]
  );
  const mediaAmount = orders.length > 0 ? totalAmount / orders.length : 0;
  const urgentCount = useMemo(() => {
    const oggi = inizioOggi();
    return orders.filter((order) => haPosaScaduta(order, oggi)).length;
  }, [orders]);

  // Colonna compressa: barra verticale sottile. Resta droppabile, così si può
  // spostare una commessa anche in una fase che si è scelto di non guardare.
  if (collapsed) {
    return (
      <div
        ref={setNodeRef}
        onClick={() => onToggleCollapse?.(status.id)}
        title={`Espandi "${status.name}"`}
        className={cn(
          "flex w-11 shrink-0 cursor-pointer flex-col items-center self-stretch rounded-lg border bg-muted/40 transition-colors hover:bg-muted/70",
          isOver && "border-dashed border-primary bg-primary/10"
        )}
        style={{ borderTopWidth: 3, borderTopColor: colore }}
      >
        <button
          type="button"
          aria-label={`Espandi ${status.name}`}
          className="mt-1.5 flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-primary"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="mt-1 rounded-full bg-background px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {orders.length}
        </span>
        <span className="mt-2 text-xs font-bold text-foreground" style={{ writingMode: "vertical-rl" }}>
          {status.name}
        </span>
      </div>
    );
  }

  return (
    <div ref={setNodeRef} className="flex w-[280px] shrink-0 flex-col">
      {/* Intestazione: riga colorata in alto, conteggio, totale e media */}
      <div
        className="shrink-0 rounded-t-lg border-b bg-muted/60 px-3 py-2.5"
        style={{ borderTopWidth: 3, borderTopColor: colore }}
      >
        <div className="flex items-center justify-between gap-1">
          <h3 className="min-w-0 truncate text-sm font-bold leading-snug text-foreground">{status.name}</h3>
          <div className="flex shrink-0 items-center gap-1">
            <span
              className="rounded-full px-2 py-0.5 text-xs font-bold tabular-nums text-white shadow-sm"
              style={{ backgroundColor: colore }}
              title={`${orders.length} ${orders.length === 1 ? "commessa" : "commesse"} in "${status.name}"`}
            >
              {orders.length}
            </span>
            {onToggleCollapse && (
              <button
                type="button"
                title={`Comprimi "${status.name}"`}
                aria-label={`Comprimi ${status.name}`}
                onClick={() => onToggleCollapse(status.id)}
                className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        <p className="mt-0.5 h-4 truncate text-[11px] leading-4 text-muted-foreground">
          {orders.length > 0
            ? `${formatCurrency(totalAmount)} tot · ${formatCurrency(mediaAmount)} media`
            : "Nessuna commessa"}
        </p>
        {/* Riga sempre presente, anche vuota: così tutte le intestazioni hanno la
            stessa altezza e le commesse partono alla stessa quota in ogni colonna. */}
        <div className="mt-1 flex h-5 items-center">
          {urgentCount > 0 && (
            <span
              className="rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-orange-700 ring-1 ring-orange-200"
              title="Commesse con la data di posa prevista già passata"
            >
              {urgentCount} in ritardo
            </span>
          )}
        </div>
      </div>

      {/* Commesse della fase */}
      <div
        className={cn(
          "min-w-0 flex-1 overflow-hidden rounded-b-lg border-2 border-t-0 p-2 transition-all",
          isOver ? "border-dashed border-primary bg-primary/10 shadow-inner" : "border-transparent bg-muted/10"
        )}
      >
        {orders.length > 0 ? (
          <ScrollArea className="h-[calc(100vh-380px)]">
            <div className="w-full space-y-2 pr-1">
              {orders.map((order) => (
                <OrdersPipelineCard key={order.id} order={order} isDraggable={isDragEnabled} />
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div
            className={cn(
              "flex items-center justify-center py-6 text-xs text-muted-foreground/60 transition-colors",
              isOver && "font-medium text-primary"
            )}
          >
            {isOver ? "Rilascia qui" : "—"}
          </div>
        )}
      </div>
    </div>
  );
}
