import { useNavigate } from "react-router-dom";
import { Calendar as CalendarIcon, GripVertical } from "lucide-react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { formatCurrency, formatDateShort } from "@/lib/formatters";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { type OrderWithDetails, getPendingPayments } from "@/lib/orderUtils";

interface OrdersPipelineCardProps {
  order: OrderWithDetails;
  isDraggable?: boolean;
}

export function OrdersPipelineCard({ order, isDraggable = true }: OrdersPipelineCardProps) {
  const pendingPayments = getPendingPayments(order);
  const navigate = useNavigate();
  
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
      {...(isDraggable ? attributes : {})}
      {...(isDraggable ? listeners : {})}
      onClick={() => {
        if (!isDragging) navigate(`/azienda/ordini/${order.id}`);
      }}
      className={cn(
        "touch-none",
        isDraggable && "cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50 z-50"
      )}
    >
      <Card className={cn(
        "p-3 transition-shadow bg-card group",
        isDraggable && "hover:shadow-md",
        isDragging && "shadow-lg ring-2 ring-primary"
      )}>
        <div className="flex gap-2">
          {/* Grip icon (visual only) */}
          {isDraggable && (
            <div className="flex-shrink-0 flex items-start pt-0.5 text-muted-foreground/50 hover:text-muted-foreground">
              <GripVertical className="h-4 w-4" />
            </div>
          )}
          
          {/* Card Content */}
          <div className="flex-1 min-w-0">
            <div className="space-y-2">
              {/* Codice */}
              <p className="font-medium text-sm">{order.order_code || "—"}</p>
              
              {/* Cliente */}
              <p className="text-sm text-muted-foreground truncate">
                {order.customer 
                  ? `${order.customer.first_name} ${order.customer.last_name}`
                  : "—"
                }
              </p>
              
              {/* Totale */}
              <p className="font-semibold">{formatCurrency(order.total_amount)}</p>
              
              {/* Footer: Data Posa + Badge Pagamenti */}
              <div className="flex items-center justify-between pt-1">
                {order.expected_date ? (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <CalendarIcon className="h-3 w-3" />
                    {formatDateShort(order.expected_date)}
                  </span>
                ) : (
                  <span />
                )}
                
                {pendingPayments.length > 0 ? (
                  <Badge className="text-xs bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-0">
                    {pendingPayments.join(", ")}
                  </Badge>
                ) : (
                  <Badge className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0">
                    OK
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
