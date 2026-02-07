import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "react-router-dom";
import { differenceInDays } from "date-fns";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { GripVertical, Calendar, ExternalLink } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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

export default function WarehouseKanbanCard({ item, supplierName }: WarehouseKanbanCardProps) {
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

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "dd MMM", { locale: it });
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "cursor-grab active:cursor-grabbing transition-all",
        isDragging && "opacity-50 shadow-lg rotate-2",
        isCritical && "border-destructive border-2",
        isUrgent && !isCritical && "border-amber-500 border-2"
      )}
    >
      <CardContent className="p-3">
        <div className="flex items-start gap-2">
          <div
            {...attributes}
            {...listeners}
            className="mt-1 cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground"
          >
            <GripVertical className="h-4 w-4" />
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2 mb-1">
              <Badge variant="secondary" className="font-mono text-xs">
                {item.quantity || 1}x
              </Badge>
              {(isUrgent || isCritical) && (
                <Badge 
                  variant="destructive" 
                  className={cn(
                    "text-xs",
                    !isCritical && "bg-amber-500 hover:bg-amber-600"
                  )}
                >
                  {daysUntil === 0 ? "OGGI" : `${daysUntil}g`}
                </Badge>
              )}
            </div>

            <p className="font-medium text-sm truncate">{item.name}</p>
            
            <div className="mt-2 space-y-1">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link 
                      to={`/azienda/ordini/${item.order.id}`}
                      className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 truncate"
                    >
                      <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      {item.order.order_code || "Ordine"}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Vai all'ordine</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              <p className="text-xs text-muted-foreground truncate">
                {item.order.customer.first_name} {item.order.customer.last_name}
              </p>

              {supplierName && (
                <p className="text-xs text-muted-foreground truncate">
                  📦 {supplierName}
                </p>
              )}

              {expectedDate && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDate(expectedDate)}
                </p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
