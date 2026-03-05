import { useDroppable } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import WarehouseKanbanCard from "./WarehouseKanbanCard";
import { STATUS_CONFIG } from "@/types/warehouse";
import type { OrderItemStatus, WarehouseItem } from "@/types/warehouse";

interface WarehouseKanbanColumnProps {
  status: OrderItemStatus;
  items: WarehouseItem[];
  getSupplierName: (supplierId: string | null) => string | null;
  onSelectItem: (item: WarehouseItem) => void;
}

export default function WarehouseKanbanColumn({ 
  status, 
  items, 
  getSupplierName,
  onSelectItem,
}: WarehouseKanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  return (
    <div 
      className={cn(
        "flex flex-col h-[calc(100vh-400px)] min-h-[400px] rounded-lg border",
        isOver && "ring-2 ring-primary",
        config.bgColor
      )}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b bg-background/50">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", config.color)} />
          <span className="text-sm font-medium">{config.label}</span>
        </div>
        <Badge variant="secondary" className="text-xs">{items.length}</Badge>
      </div>
      
      <div ref={setNodeRef} className="flex-1 p-3 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="space-y-3 pr-2">
            {items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">Nessun articolo</div>
            ) : (
              items.map((item) => (
                <WarehouseKanbanCard
                  key={item.id}
                  item={item}
                  supplierName={getSupplierName(item.supplier_id)}
                  onSelect={onSelectItem}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
