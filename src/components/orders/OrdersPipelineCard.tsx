import { memo } from "react";
import { useNavigate } from "react-router-dom";
import { Calendar as CalendarIcon, GripVertical, Eye, Pencil, AlertTriangle } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import { type OrderWithDetails, getAmountDue, getAmountCollected } from "@/lib/orderUtils";

interface OrdersPipelineCardProps {
  order: OrderWithDetails;
  isDraggable?: boolean;
}

function PaymentBar({ order }: { order: OrderWithDetails }) {
  const total = order.total_amount || 1;
  const collected = getAmountCollected(order);
  const pct = Math.min(100, Math.round((collected / total) * 100));
  const due = getAmountDue(order);
  const isPaid = due === 0 && collected > 0;

  return (
    <div className={cn(
      "h-1.5 rounded-full",
      isPaid ? "bg-emerald-200 dark:bg-emerald-900" :
      collected > 0 ? "bg-orange-200 dark:bg-orange-900" :
      "bg-gray-100 dark:bg-gray-800"
    )}>
      {(collected > 0 || isPaid) && (
        <div
          className={cn(
            "h-full rounded-full",
            isPaid ? "bg-emerald-500" : "bg-orange-500"
          )}
          style={{ width: `${isPaid ? 100 : pct}%` }}
        />
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
    data: { order },
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
        "touch-none w-full min-w-0",
        isDragging && "opacity-50 z-50"
      )}
    >
      <div className={cn(
        "rounded-lg border bg-card shadow-sm group relative transition-all",
        isDraggable && "hover:shadow-md",
        isDragging && "shadow-lg ring-2 ring-primary",
        overdue && "border-orange-300 dark:border-orange-600"
      )}>
        {/* Overdue top accent */}
        {overdue && (
          <div className="h-1 bg-gradient-to-r from-orange-400 to-orange-500 rounded-t-lg" />
        )}

        <div className="flex">
          {/* Drag handle — full height strip */}
          {isDraggable && (
            <div
              {...attributes}
              {...listeners}
              className="flex items-center px-1.5 cursor-grab active:cursor-grabbing text-muted-foreground/25 hover:text-muted-foreground/60 hover:bg-muted/40 rounded-l-lg transition-colors shrink-0"
            >
              <GripVertical className="h-4 w-4" />
            </div>
          )}

          {/* Card body */}
          <div
            className="flex-1 py-2.5 pr-3 pl-1 cursor-pointer min-w-0"
            onClick={() => { if (!isDragging) navigate(`/azienda/ordini/${order.id}`); }}
          >
            {/* Codice */}
            <p className="font-semibold text-sm leading-tight">{order.order_code || "—"}</p>

            {/* Cliente */}
            <p className="text-xs text-muted-foreground mt-1 truncate">
              {order.customer
                ? `${order.customer.first_name} ${order.customer.last_name}`
                : "—"
              }
            </p>

            {/* Descrizione */}
            {order.description && (
              <p className="text-[11px] text-muted-foreground/60 mt-0.5 truncate">
                {order.description}
              </p>
            )}

            {/* Importo + pagamenti */}
            <div className="mt-2 space-y-1.5">
              <p className="font-bold text-sm">{formatCurrency(order.total_amount)}</p>
              <PaymentBar order={order} />
            </div>

            {/* Data prevista */}
            {order.expected_date && (
              <div className="mt-1.5">
                <span className={cn(
                  "text-[11px] inline-flex items-center gap-1",
                  overdue
                    ? "text-orange-600 dark:text-orange-400 font-medium"
                    : "text-muted-foreground"
                )}>
                  {overdue ? <AlertTriangle className="h-3 w-3" /> : <CalendarIcon className="h-3 w-3" />}
                  {formatDateShort(order.expected_date)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Quick actions on hover */}
        <div className="absolute top-1.5 right-1.5 hidden group-hover:flex gap-0.5">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate(`/azienda/ordini/${order.id}`); }}
            className="p-1 rounded bg-background/95 shadow-sm border text-muted-foreground hover:text-foreground transition-colors"
            title="Visualizza"
          >
            <Eye className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); navigate(`/azienda/ordini/${order.id}/modifica`); }}
            className="p-1 rounded bg-background/95 shadow-sm border text-muted-foreground hover:text-foreground transition-colors"
            title="Modifica"
          >
            <Pencil className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
});
