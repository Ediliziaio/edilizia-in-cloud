import { memo } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar as CalendarIcon, GripVertical, Eye, Pencil, AlertTriangle, Check } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { type OrderWithDetails, getAmountDue, getAmountCollected } from "@/lib/orderUtils";

interface OrdersPipelineCardProps {
  order: OrderWithDetails;
  isDraggable?: boolean;
}

function PaymentProgress({ order }: { order: OrderWithDetails }) {
  const total = order.total_amount || 1;
  const collected = getAmountCollected(order);
  const pct = Math.min(100, Math.round((collected / total) * 100));
  const due = getAmountDue(order);
  const isPaid = due === 0 && collected > 0;

  return (
    <div className="flex items-center gap-2">
      <div className={cn(
        "flex-1 h-2 rounded-full",
        isPaid ? "bg-emerald-200 dark:bg-emerald-900" :
        collected > 0 ? "bg-orange-200 dark:bg-orange-900" :
        "bg-gray-200 dark:bg-gray-700"
      )}>
        {(collected > 0 || isPaid) && (
          <div
            className={cn(
              "h-full rounded-full transition-all",
              isPaid ? "bg-emerald-500" : "bg-orange-500"
            )}
            style={{ width: `${isPaid ? 100 : pct}%` }}
          />
        )}
      </div>
      {isPaid ? (
        <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
      ) : (
        <span className={cn(
          "text-[10px] font-medium shrink-0 w-6 text-right",
          collected > 0 ? "text-orange-600 dark:text-orange-400" : "text-muted-foreground"
        )}>
          {pct}%
        </span>
      )}
    </div>
  );
}

function isOverdue(order: OrderWithDetails): boolean {
  if (!order.expected_date) return false;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(order.expected_date);
  exp.setHours(0, 0, 0, 0);
  return exp < now;
}

export const OrdersPipelineCard = memo(function OrdersPipelineCard({ order, isDraggable = true }: OrdersPipelineCardProps) {
  const navigate = useNavigate();
  const overdue = isOverdue(order);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging
  } = useDraggable({
    id: order.id,
    data: {
      order,
    },
    disabled: !isDraggable,
  });

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "touch-none",
        isDragging && "opacity-50 z-50"
      )}
    >
      <Card className={cn(
        "p-0 transition-all bg-card group relative overflow-hidden",
        isDraggable && "hover:shadow-md",
        isDragging && "shadow-lg ring-2 ring-primary",
        overdue && "ring-1 ring-orange-400 dark:ring-orange-500"
      )}>
        {/* Overdue indicator bar */}
        {overdue && (
          <div className="h-0.5 bg-orange-500 w-full" />
        )}

        <div className="p-3 flex gap-2">
          {/* Drag handle */}
          {isDraggable && (
            <div
              {...attributes}
              {...listeners}
              className="flex-shrink-0 flex items-center self-stretch -ml-1 px-0.5 rounded cursor-grab active:cursor-grabbing text-muted-foreground/30 hover:text-muted-foreground/70 hover:bg-muted/50 transition-colors"
            >
              <GripVertical className="h-4 w-4" />
            </div>
          )}

          {/* Card Content */}
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => { if (!isDragging) navigate(`/azienda/ordini/${order.id}`); }}
          >
            <div className="space-y-1.5">
              {/* Row 1: Codice + Importo */}
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-sm truncate">{order.order_code || "—"}</p>
                <p className="font-bold text-sm shrink-0">{formatCurrency(order.total_amount)}</p>
              </div>

              {/* Row 2: Cliente */}
              <p className="text-xs text-muted-foreground truncate">
                {order.customer
                  ? `${order.customer.first_name} ${order.customer.last_name}`
                  : "—"
                }
              </p>

              {/* Row 3: Descrizione troncata */}
              {order.description && (
                <p className="text-xs text-muted-foreground/70 truncate">
                  {order.description}
                </p>
              )}

              {/* Row 4: Payment progress bar */}
              <PaymentProgress order={order} />

              {/* Row 5: Footer - Data + Overdue */}
              <div className="flex items-center justify-between pt-0.5">
                {order.expected_date ? (
                  <span className={cn(
                    "text-[11px] flex items-center gap-1",
                    overdue
                      ? "text-orange-600 dark:text-orange-400 font-medium"
                      : "text-muted-foreground"
                  )}>
                    {overdue ? (
                      <AlertTriangle className="h-3 w-3" />
                    ) : (
                      <CalendarIcon className="h-3 w-3" />
                    )}
                    {formatDateShort(order.expected_date)}
                  </span>
                ) : (
                  <span />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Quick actions overlay on hover */}
        <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity flex gap-0.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate(`/azienda/ordini/${order.id}`); }}
            className="p-1.5 rounded-md bg-background/90 shadow-sm border border-border/50 text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
            title="Visualizza"
          >
            <Eye className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate(`/azienda/ordini/${order.id}/modifica`); }}
            className="p-1.5 rounded-md bg-background/90 shadow-sm border border-border/50 text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
            title="Modifica"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </Card>
    </div>
  );
});
