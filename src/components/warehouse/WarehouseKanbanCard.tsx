import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { differenceInDays } from "date-fns";
import { GripVertical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type OrderItemStatus = "da_ordinare" | "ordinato" | "in_magazzino" | "installato";

interface WarehouseItem {
  id: string;
  name: string;
  description: string | null;
  quantity: number | null;
  status: OrderItemStatus;
  supplier_id: string | null;
  purchase_price: number | null;
  order: {
    id: string;
    order_code: string | null;
    expected_date: string | null;
    work_start_date: string | null;
    company_id: string;
    customer: {
      first_name: string;
      last_name: string;
    };
  };
}

interface WarehouseKanbanCardProps {
  item: WarehouseItem;
  supplierName?: string | null;
}

export default function WarehouseKanbanCard({ item }: WarehouseKanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const expectedDate = item.order.expected_date || item.order.work_start_date;
  const today = new Date();
  const daysUntil = expectedDate 
    ? differenceInDays(new Date(expectedDate), today)
    : null;

  const isUrgent = daysUntil !== null && daysUntil <= 7 && daysUntil >= 0 && 
    (item.status === "da_ordinare" || item.status === "ordinato");
  const isCritical = daysUntil !== null && daysUntil <= 3 && daysUntil >= 0 &&
    (item.status === "da_ordinare" || item.status === "ordinato");

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "cursor-grab active:cursor-grabbing transition-all",
        isDragging && "opacity-50 shadow-lg rotate-1",
        isCritical && "border-destructive",
        isUrgent && !isCritical && "border-amber-500"
      )}
    >
      <CardContent className="p-2">
        <div className="flex items-start gap-1.5">
          <div
            {...attributes}
            {...listeners}
            className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground"
          >
            <GripVertical className="h-3.5 w-3.5" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-xs font-mono text-muted-foreground">
                  {item.quantity || 1}x
                </span>
                <span className="font-medium text-sm truncate">{item.name}</span>
              </div>
              {(isUrgent || isCritical) && (
                <Badge 
                  variant="destructive" 
                  className={cn(
                    "text-[10px] px-1.5 py-0 h-4 shrink-0",
                    !isCritical && "bg-amber-500 hover:bg-amber-600"
                  )}
                >
                  {daysUntil === 0 ? "!" : `${daysUntil}g`}
                </Badge>
              )}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              {item.order.order_code} • {item.order.customer.first_name.charAt(0)}. {item.order.customer.last_name}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
