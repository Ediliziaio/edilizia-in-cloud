import { useDroppable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import WarehouseKanbanCard from "./WarehouseKanbanCard";
import { isItemCritical, isItemOverdue, isItemUrgent, STATUS_CONFIG } from "@/types/warehouse";
import type { OrderItemStatus, WarehouseItem } from "@/types/warehouse";

interface WarehouseKanbanColumnProps {
  status: OrderItemStatus;
  items: WarehouseItem[];
  getSupplierName: (supplierId: string | null) => string | null;
  onSelectItem: (item: WarehouseItem) => void;
  selectedIds?: Set<string>;
  onToggleSelection?: (itemId: string) => void;
}

export default function WarehouseKanbanColumn({ 
  status, 
  items, 
  getSupplierName,
  onSelectItem,
  selectedIds = new Set(),
  onToggleSelection,
}: WarehouseKanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const attentionCount = items.filter((item) => isItemCritical(item) || isItemUrgent(item) || isItemOverdue(item)).length;

  return (
    <div 
      className={cn(
        "flex h-[calc(100vh-350px)] min-h-[520px] flex-col overflow-hidden rounded-md border bg-background shadow-sm",
        isOver && "ring-2 ring-primary",
      )}
    >
      <div className={cn("border-b px-3 py-3", config.bgColor)}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Icon className={cn("h-4 w-4 shrink-0", config.color)} />
              <span className="truncate text-sm font-semibold">{config.label}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {attentionCount > 0 ? `${attentionCount} da presidiare` : "flusso regolare"}
            </p>
          </div>
          <Badge variant="secondary" className="shrink-0 text-xs">{items.length}</Badge>
        </div>
      </div>
      
      <div ref={setNodeRef} className="flex-1 p-3 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="space-y-3 pr-2">
            {items.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center rounded-md border border-dashed bg-muted/20 px-4 text-center">
                <p className="text-sm font-medium text-muted-foreground">Nessun articolo</p>
                <p className="mt-1 text-xs text-muted-foreground">Trascina qui una riga quando cambia stato.</p>
              </div>
            ) : (
              items.map((item) => (
                <WarehouseKanbanCard
                  key={item.id}
                  item={item}
                  supplierName={getSupplierName(item.supplier_id)}
                  onSelect={onSelectItem}
                  isSelected={selectedIds.has(item.id)}
                  onToggleSelection={onToggleSelection}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
