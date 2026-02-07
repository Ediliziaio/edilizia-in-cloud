import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { differenceInDays, format } from "date-fns";
import { it } from "date-fns/locale";
import { GripVertical, FileText, User, Calendar, Building2 } from "lucide-react";
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

  const getUrgencyLabel = () => {
    if (daysUntil === 0) return "OGGI";
    if (daysUntil === 1) return "Domani";
    return `${daysUntil}g`;
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={cn(
        "cursor-grab active:cursor-grabbing transition-all",
        isDragging && "opacity-50 shadow-lg rotate-1",
        isCritical && "border-destructive border-2",
        isUrgent && !isCritical && "border-amber-500 border-2"
      )}
    >
      <CardContent className="p-3">
        {/* Header: Grip + Quantità + Urgenza */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div
              {...attributes}
              {...listeners}
              className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground"
            >
              <GripVertical className="h-4 w-4" />
            </div>
            <Badge variant="secondary" className="text-xs">
              {item.quantity || 1}x
            </Badge>
          </div>
          {(isUrgent || isCritical) && (
            <Badge 
              variant={isCritical ? "destructive" : "default"}
              className={cn(
                "text-xs",
                !isCritical && "bg-amber-500 hover:bg-amber-600 text-white"
              )}
            >
              {getUrgencyLabel()}
            </Badge>
          )}
        </div>
        
        {/* Nome Articolo - più prominente */}
        <h4 className="font-medium text-sm leading-snug mb-3">
          {item.name}
        </h4>
        
        {/* Dettagli - icone + testo */}
        <div className="space-y-1.5 text-xs text-muted-foreground">
          {supplierName && (
            <div className="flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{supplierName}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <FileText className="h-3.5 w-3.5 shrink-0" />
            <span>{item.order.order_code}</span>
          </div>
          <div className="flex items-center gap-2">
            <User className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {item.order.customer.first_name} {item.order.customer.last_name}
            </span>
          </div>
          {expectedDate && (
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>{format(new Date(expectedDate), "d MMM yyyy", { locale: it })}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
