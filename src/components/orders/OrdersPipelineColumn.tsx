import { useDroppable } from "@dnd-kit/core";
import { cn } from "@/lib/utils";
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

  return (
    <div 
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 w-[280px] bg-muted/30 rounded-lg p-3 transition-all duration-200",
        isOver && "bg-primary/10 ring-2 ring-primary/50"
      )}
    >
      {/* Header colonna */}
      <div className="flex items-center gap-2 mb-3 pb-2 border-b">
        <div 
          className="w-3 h-3 rounded-full" 
          style={{ backgroundColor: status.color }}
        />
        <h3 className="font-medium text-sm">{status.name}</h3>
        <span className="ml-auto text-xs text-muted-foreground bg-muted rounded-full px-2 py-0.5">
          {orders.length}
        </span>
      </div>
      
      {/* Cards */}
      <ScrollArea className="h-[calc(100vh-350px)] pr-2">
        <div className="space-y-2">
          {orders.map(order => (
            <OrdersPipelineCard 
              key={order.id} 
              order={order} 
              isDraggable={isDragEnabled}
            />
          ))}
          
          {orders.length === 0 && (
            <p className={cn(
              "text-xs text-muted-foreground text-center py-4 border-2 border-dashed rounded-lg",
              isOver && "border-primary bg-primary/5"
            )}>
              {isOver ? "Rilascia qui" : "Nessun ordine"}
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
