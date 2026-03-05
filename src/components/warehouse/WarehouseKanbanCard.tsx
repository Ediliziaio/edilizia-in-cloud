import { useDraggable } from "@dnd-kit/core";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { GripVertical, User, FileText, Building2, Calendar, StickyNote } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getDaysUntilPosa, isItemUrgent, isItemCritical, isItemOverdue, getUrgencyLabel, STATUS_CONFIG } from "@/types/warehouse";
import type { WarehouseItem } from "@/types/warehouse";

interface WarehouseKanbanCardProps {
  item: WarehouseItem;
  supplierName?: string | null;
  onSelect?: (item: WarehouseItem) => void;
}

export default function WarehouseKanbanCard({ item, supplierName, onSelect }: WarehouseKanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({ id: item.id });

  const daysUntil = getDaysUntilPosa(item);
  const isUrgent = isItemUrgent(item);
  const isCritical = isItemCritical(item);
  const overdue = isItemOverdue(item);

  const customerName = `${item.order.customer.first_name} ${item.order.customer.last_name}`;
  const expectedDate = item.order.expected_date || item.order.work_start_date;
  const formattedDate = expectedDate
    ? format(new Date(expectedDate), "d MMM", { locale: it })
    : null;

  const config = STATUS_CONFIG[item.status];

  return (
    <Card
      ref={setNodeRef}
      onClick={() => onSelect?.(item)}
      className={cn(
        "cursor-pointer transition-all hover:shadow-md border-l-4",
        isDragging && "opacity-50 shadow-lg rotate-1",
        isCritical && "border-l-destructive",
        isUrgent && !isCritical && "border-l-amber-500",
        !isUrgent && !isCritical && config.color === "text-amber-600" && "border-l-amber-400",
        !isUrgent && !isCritical && config.color === "text-blue-600" && "border-l-blue-400",
        !isUrgent && !isCritical && config.color === "text-green-600" && "border-l-green-400",
        !isUrgent && !isCritical && config.color === "text-muted-foreground" && "border-l-muted-foreground/40",
      )}
    >
      <CardContent className="p-2.5 space-y-1.5">
        {/* Row 1: Grip + Name + Urgency */}
        <div className="flex items-center gap-1.5">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </div>
          <span className="flex-1 font-medium text-sm truncate">{item.name}</span>
          {(isUrgent || isCritical || overdue) && daysUntil !== null && (
            <Badge
              variant={overdue || isCritical ? "destructive" : "default"}
              className={cn(
                "text-[10px] px-1.5 py-0 shrink-0",
                !isCritical && !overdue && "bg-amber-500 hover:bg-amber-600 text-white"
              )}
            >
              {overdue ? `${Math.abs(daysUntil)}g ritardo` : getUrgencyLabel(daysUntil)}
            </Badge>
          )}
          {item.notes && (
            <StickyNote className="h-3 w-3 text-amber-500 shrink-0" />
          )}
        </div>

        {/* Row 2: Quantity + Customer + Order code */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground pl-5">
          <span className="font-mono shrink-0">{item.quantity || 1}x</span>
          <span className="flex items-center gap-1 truncate">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{customerName}</span>
          </span>
          {item.order.order_code && (
            <span className="flex items-center gap-1 shrink-0">
              <FileText className="h-3 w-3" />
              {item.order.order_code}
            </span>
          )}
        </div>

        {/* Row 3: Supplier + Date (optional) */}
        {(supplierName || formattedDate) && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground pl-5">
            {supplierName && (
              <span className="flex items-center gap-1 truncate">
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{supplierName}</span>
              </span>
            )}
            {formattedDate && (
              <span className="flex items-center gap-1 shrink-0 ml-auto">
                <Calendar className="h-3 w-3" />
                {formattedDate}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
