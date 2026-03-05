import { useDraggable } from "@dnd-kit/core";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { GripVertical, FileText, User, Calendar, Building2, MoreVertical, StickyNote } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { getDaysUntilPosa, isItemUrgent, isItemCritical, getUrgencyLabel } from "@/types/warehouse";
import type { WarehouseItem } from "@/types/warehouse";

interface WarehouseKanbanCardProps {
  item: WarehouseItem;
  supplierName?: string | null;
}

export default function WarehouseKanbanCard({ item, supplierName }: WarehouseKanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useDraggable({ id: item.id });

  const daysUntil = getDaysUntilPosa(item);
  const isUrgent = isItemUrgent(item);
  const isCritical = isItemCritical(item);

  const customerName = `${item.order.customer.first_name} ${item.order.customer.last_name}`;
  const expectedDate = item.order.expected_date || item.order.work_start_date;
  const formattedDate = expectedDate 
    ? format(new Date(expectedDate), "d MMM yyyy", { locale: it })
    : null;

  return (
    <Card
      ref={setNodeRef}
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
              {daysUntil !== null && getUrgencyLabel(daysUntil)}
            </Badge>
          )}

          {/* Notes indicator */}
          {item.notes && (
            <Tooltip>
              <TooltipTrigger asChild>
                <StickyNote className="h-3.5 w-3.5 text-amber-500 shrink-0" />
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-[200px]">
                <p className="text-xs">{item.notes}</p>
              </TooltipContent>
            </Tooltip>
          )}
          
          {/* Menu dettagli - isolato dal drag context */}
          <div 
            onClick={(e) => e.stopPropagation()} 
            onPointerDown={(e) => e.stopPropagation()}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 shrink-0"
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
        </div>
      </CardContent>
    </Card>
  );
}
