import { useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/campo/lingua/LinguaCampo";
import { formatCurrency } from "@/lib/formatters";
import { inizioOggi, ritardoLavori } from "@/lib/orders/etichettePipeline";
import { OrdersPipelineCard } from "./OrdersPipelineCard";
import type { PipelineTarget } from "./PipelineDrag";
import { type OrderWithDetails, type OrderStatus, getGrossOrderAmount } from "@/lib/orderUtils";

interface OrdersPipelineColumnProps {
  onMove?: (order: OrderWithDetails) => void;
  status: OrderStatus;
  orders: OrderWithDetails[];
  canDrop: boolean;
  canEdit: boolean;
  showAmounts: boolean;
  destinazioni: PipelineTarget[];
  onPhaseChange?: (id: string, fase: string) => void;
  /** Colonna ridotta a una barra sottile (resta una zona dove rilasciare). */
  collapsed?: boolean;
  onToggleCollapse?: (statusId: string) => void;
}

export function OrdersPipelineColumn({
  status,
  orders,
  canDrop, canEdit, showAmounts, destinazioni, onPhaseChange,
  collapsed = false,
  onToggleCollapse, onMove,
}: OrdersPipelineColumnProps) {
  const t = useT();
  const { setNodeRef, isOver } = useDroppable({
    id: status.id,
    disabled: !canDrop,
  });

  const colore = status.color || "#6b7280";

  const totalAmount = useMemo(
    // Contratto più varianti, IVA inclusa: lo stesso importo delle schede qui sotto.
    () => showAmounts ? orders.reduce((sum, o) => sum + getGrossOrderAmount(o), 0) : 0,
    [orders, showAmounts]
  );
  const mediaAmount = orders.length > 0 ? totalAmount / orders.length : 0;
  const urgentCount = useMemo(() => {
    const oggi = inizioOggi();
    return orders.filter((order) => ritardoLavori(order, oggi) > 0).length;
  }, [orders]);

  // Colonna compressa: barra verticale sottile. Resta droppabile, così si può
  // spostare una commessa anche in una fase che si è scelto di non guardare.
  if (collapsed) {
    return (
      <section
        ref={setNodeRef}
        aria-label={t("Colonna {fase}", { fase: status.name })}
        onClick={() => onToggleCollapse?.(status.id)}
        title={t("Espandi \"{fase}\"", { fase: status.name })}
        className={cn(
          "flex w-11 shrink-0 cursor-pointer flex-col items-center self-stretch rounded-lg border bg-muted/40 transition-colors hover:bg-muted/70",
          isOver && "border-dashed border-primary bg-primary/10"
        )}
        style={{ borderTopWidth: 3, borderTopColor: colore }}
      >
        <button
          type="button"
          aria-label={t("Espandi {fase}", { fase: status.name })}
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
      </section>
    );
  }

  return (
    <section ref={setNodeRef} aria-label={t("Colonna {fase}", { fase: status.name })} className="flex min-w-[280px] flex-1 flex-col">
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
              title={t(orders.length === 1 ? "{n} commessa in \"{fase}\"" : "{n} commesse in \"{fase}\"", { n: orders.length, fase: status.name })}
            >
              {orders.length}
            </span>
            {onToggleCollapse && (
              <button
                type="button"
                title={t("Comprimi \"{fase}\"", { fase: status.name })}
                aria-label={t("Comprimi {fase}", { fase: status.name })}
                onClick={() => onToggleCollapse(status.id)}
                className="flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        {/* Totali e «N in ritardo» sulla stessa riga (25/11/2026): la riga a parte per il ritardo restava vuota
            quasi sempre, 24px bianchi sotto ogni nome di fase. L'altezza resta uguale in tutte le colonne. */}
        <div className="mt-0.5 flex h-4 items-center gap-1.5">
          <p className="min-w-0 flex-1 truncate text-[11px] leading-4 text-muted-foreground">
            {orders.length > 0
              ? showAmounts ? t("{totale} tot · {media} media · IVA incl.", { totale: formatCurrency(totalAmount), media: formatCurrency(mediaAmount) }) : null
              : t("Nessuna commessa")}
          </p>
          {urgentCount > 0 && (
            <span
              className="shrink-0 rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-orange-700 ring-1 ring-orange-200"
              title={t("Commesse oltre la scadenza prevista")}
            >
              {t("{n} in ritardo", { n: urgentCount })}
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
          <div className="max-h-[max(16rem,calc(100dvh-380px))] overflow-y-auto">
            <div className="w-full space-y-1.5">
              {orders.map((order) => (
                <OrdersPipelineCard key={order.id} order={order} stage={status.id}
                  canEdit={canEdit} showAmounts={showAmounts} destinazioni={destinazioni}
                  isDraggable={!!onPhaseChange} onMove={onMove} onPhaseChange={onPhaseChange} />
              ))}
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "flex items-center justify-center py-3 text-xs text-muted-foreground/60 transition-colors",
              isOver && "font-medium text-primary"
            )}
          >
            {isOver ? t("Rilascia qui") : "—"}
          </div>
        )}
      </div>
    </section>
  );
}
