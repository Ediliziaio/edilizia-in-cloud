import { useDraggable } from "@dnd-kit/core";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { Building2, Calendar, FileText, GripVertical, Package, StickyNote, User } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { getDaysUntilPosa, isItemUrgent, isItemCritical, isItemOverdue, getUrgencyLabel, STATUS_CONFIG } from "@/types/warehouse";
import type { WarehouseItem } from "@/types/warehouse";

interface WarehouseKanbanCardProps {
  item: WarehouseItem;
  supplierName?: string | null;
  onSelect?: (item: WarehouseItem) => void;
  isSelected?: boolean;
  onToggleSelection?: (itemId: string) => void;
}

export default function WarehouseKanbanCard({ item, supplierName, onSelect, isSelected = false, onToggleSelection }: WarehouseKanbanCardProps) {
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

  const config = STATUS_CONFIG[item.status] ?? STATUS_CONFIG.da_ordinare;

  return (
    <Card
      ref={setNodeRef}
      onClick={() => onSelect?.(item)}
      className={cn(
        "cursor-pointer border-l-4 transition-all hover:border-primary/40 hover:bg-slate-50 hover:shadow-sm",
        isDragging && "opacity-50 shadow-lg rotate-1",
        isSelected && "ring-2 ring-primary bg-primary/5",
        isCritical && "border-l-destructive",
        isUrgent && !isCritical && "border-l-amber-500",
        !isUrgent && !isCritical && config.color === "text-amber-600" && "border-l-amber-400",
        !isUrgent && !isCritical && config.color === "text-blue-600" && "border-l-blue-400",
        !isUrgent && !isCritical && config.color === "text-indigo-600" && "border-l-indigo-400",
        !isUrgent && !isCritical && config.color === "text-green-600" && "border-l-green-400",
        !isUrgent && !isCritical && config.color === "text-purple-600" && "border-l-purple-400",
        !isUrgent && !isCritical && config.color === "text-muted-foreground" && "border-l-muted-foreground/40",
      )}
    >
      <CardContent className="space-y-2.5 p-3">
        <div className="flex items-start gap-2">
          {onToggleSelection && (
            <Checkbox
              checked={isSelected}
              onCheckedChange={() => onToggleSelection(item.id)}
              onClick={(e) => e.stopPropagation()}
              className="shrink-0"
            />
          )}
          <div
            {...attributes}
            {...listeners}
            className="mt-0.5 shrink-0 cursor-grab text-muted-foreground/40 hover:text-muted-foreground active:cursor-grabbing"
            onClick={(e) => e.stopPropagation()}
          >
            <GripVertical className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="line-clamp-2 text-sm font-semibold leading-snug">{item.name}</p>
              <Badge variant="outline" className="shrink-0 gap-1 text-[11px] tabular-nums">
                <Package className="h-3 w-3" aria-hidden="true" />
                {item.quantity || 1}x
              </Badge>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {(isUrgent || isCritical || overdue) && daysUntil !== null && (
                <Badge
                  variant={overdue || isCritical ? "destructive" : "default"}
                  className={cn(
                    "shrink-0 px-1.5 py-0 text-[10px]",
                    !isCritical && !overdue && "bg-amber-500 text-white hover:bg-amber-600"
                  )}
                >
                  {overdue ? `${Math.abs(daysUntil)}g ritardo` : getUrgencyLabel(daysUntil)}
                </Badge>
              )}
              {item.notes && (
                <Badge variant="outline" className="gap-1 px-1.5 py-0 text-[10px] text-amber-700">
                  <StickyNote className="h-3 w-3" aria-hidden="true" />
                  note
                </Badge>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-1.5 rounded-md bg-muted/35 p-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1 truncate">
            <User className="h-3 w-3 shrink-0" />
            <span className="truncate">{customerName}</span>
          </span>
          {item.order.order_code && (
            <span className="flex items-center gap-1 truncate">
              <FileText className="h-3 w-3" />
              <span className="truncate">{item.order.order_code}</span>
            </span>
          )}
          {supplierName && (
            <span className="flex items-center gap-1 truncate">
              <Building2 className="h-3 w-3 shrink-0" />
              <span className="truncate">{supplierName}</span>
            </span>
          )}
        </div>

        {formattedDate && (
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-muted-foreground">Lavori</span>
            <span className="flex items-center gap-1 font-medium">
              <Calendar className="h-3 w-3" />
              {formattedDate}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
