import { useDroppable } from "@dnd-kit/core";
import { Package, ShoppingCart, Truck, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import WarehouseKanbanCard from "./WarehouseKanbanCard";
import type { OrderItemStatus, WarehouseItem } from "@/types/warehouse";

interface WarehouseKanbanColumnProps {
  status: OrderItemStatus;
  items: WarehouseItem[];
  getSupplierName: (supplierId: string | null) => string | null;
}

const STATUS_CONFIG: Record<OrderItemStatus, { 
  label: string; 
  color: string; 
  bgColor: string;
  icon: typeof Package;
}> = {
  da_ordinare: {
    label: "Da Ordinare",
    color: "text-amber-600",
    bgColor: "bg-amber-50/50 dark:bg-amber-950/20",
    icon: ShoppingCart,
  },
  ordinato: {
    label: "Ordinato",
    color: "text-blue-600",
    bgColor: "bg-blue-50/50 dark:bg-blue-950/20",
    icon: Truck,
  },
  in_magazzino: {
    label: "In Magazzino",
    color: "text-green-600",
    bgColor: "bg-green-50/50 dark:bg-green-950/20",
    icon: Package,
  },
  installato: {
    label: "Installato",
    color: "text-muted-foreground",
    bgColor: "bg-muted/30",
    icon: CheckCircle2,
  },
};

export default function WarehouseKanbanColumn({ 
  status, 
  items, 
  getSupplierName 
}: WarehouseKanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

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
      {/* Minimal header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-background/50">
        <div className="flex items-center gap-2">
          <Icon className={cn("h-4 w-4", config.color)} />
          <span className="text-sm font-medium">{config.label}</span>
        </div>
        <Badge variant="secondary" className="text-xs">
          {items.length}
        </Badge>
      </div>
      
      {/* Content */}
      <div 
        ref={setNodeRef}
        className="flex-1 p-3 overflow-hidden"
      >
        <ScrollArea className="h-full">
          <div className="space-y-3 pr-2">
            {items.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                Nessun articolo
              </div>
            ) : (
              items.map((item) => (
                <WarehouseKanbanCard
                  key={item.id}
                  item={item}
                  supplierName={getSupplierName(item.supplier_id)}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
