import { useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { ScrollArea } from "@/components/ui/scroll-area";
import { OrdersPipelineCard } from "./OrdersPipelineCard";
import { type OrderWithDetails, type OrderStatus } from "@/lib/orderUtils";

interface OrdersPipelineColumnProps {
  status: OrderStatus;
  orders: OrderWithDetails[];
  isDragEnabled?: boolean;
}

export function OrdersPipelineColumn({ status, orders, isDragEnabled = true }: OrdersPipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status.id,
  });

  const totalAmount = useMemo(
    () => orders.reduce((sum, o) => sum + (o.total_amount || 0), 0),
    [orders]
  );
  const urgentCount = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return orders.filter((order) => {
      if (!order.expected_date) return false;
      const expectedDate = new Date(order.expected_date);
      expectedDate.setHours(0, 0, 0, 0);
      return expectedDate < today;
    }).length;
  }, [orders]);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 w-[280px] rounded-lg transition-all duration-200 flex flex-col",
        orders.length > 0 ? "bg-muted/30" : "bg-muted/15",
        isOver && "bg-primary/10 ring-2 ring-primary/50"
      )}
    >
      {/* Header colonna */}
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: status.color }}
          />
          <h3 className="font-medium text-sm truncate">{status.name}</h3>
          <span className="ml-auto text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5 shrink-0">
            {orders.length}
          </span>
        </div>
        {orders.length > 0 && (
          <div className="mt-1 flex items-center gap-2 pl-[18px]">
            <p className="text-[11px] text-muted-foreground">
              {formatCurrency(totalAmount)}
            </p>
            {urgentCount > 0 && (
              <span className="rounded-full bg-orange-50 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 ring-1 ring-orange-200">
                {urgentCount} urgenti
              </span>
            )}
          </div>
        )}
      </div>

      {/* Cards */}
      <div className="flex-1 px-2 pb-2 min-w-0 overflow-hidden">
        {orders.length > 0 ? (
          <ScrollArea className="h-[calc(100vh-380px)]">
            <div className="space-y-2 pr-1 w-full">
              {orders.map(order => (
                <OrdersPipelineCard
                  key={order.id}
                  order={order}
                  isDraggable={isDragEnabled}
                />
              ))}
            </div>
          </ScrollArea>
        ) : (
          <div className={cn(
            "flex items-center justify-center py-6 text-xs text-muted-foreground/50 transition-colors",
            isOver && "text-primary font-medium"
          )}>
            {isOver ? "Rilascia qui" : "—"}
          </div>
        )}
      </div>
    </div>
  );
}
