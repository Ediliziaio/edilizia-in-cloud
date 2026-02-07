import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { differenceInDays, format } from "date-fns";
import { it } from "date-fns/locale";
import { GripVertical, FileText, User, Calendar, Building2, MoreVertical } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

  const customerName = `${item.order.customer.first_name} ${item.order.customer.last_name}`;
  const formattedDate = expectedDate 
    ? format(new Date(expectedDate), "d MMM yyyy", { locale: it })
    : null;

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
      <CardContent className="p-2">
        <div className="flex items-center gap-2">
          {/* Grip per drag */}
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground shrink-0"
          >
            <GripVertical className="h-4 w-4" />
          </div>
          
          {/* Quantità */}
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            {item.quantity || 1}x
          </span>
          
          {/* Nome articolo - occupa tutto lo spazio */}
          <span className="flex-1 font-medium text-sm truncate">
            {item.name}
          </span>
          
          {/* Badge urgenza (solo se urgente) */}
          {(isUrgent || isCritical) && (
            <Badge 
              variant={isCritical ? "destructive" : "default"}
              className={cn(
                "text-xs shrink-0",
                !isCritical && "bg-amber-500 hover:bg-amber-600 text-white"
              )}
            >
              {getUrgencyLabel()}
            </Badge>
          )}
          
          {/* Menu dettagli */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreVertical className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Dettagli Articolo</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {supplierName && (
                <DropdownMenuItem className="cursor-default">
                  <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                  {supplierName}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem className="cursor-default">
                <FileText className="h-4 w-4 mr-2 text-muted-foreground" />
                {item.order.order_code || "N/A"}
              </DropdownMenuItem>
              <DropdownMenuItem className="cursor-default">
                <User className="h-4 w-4 mr-2 text-muted-foreground" />
                {customerName}
              </DropdownMenuItem>
              {formattedDate && (
                <DropdownMenuItem className="cursor-default">
                  <Calendar className="h-4 w-4 mr-2 text-muted-foreground" />
                  {formattedDate}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardContent>
    </Card>
  );
}
