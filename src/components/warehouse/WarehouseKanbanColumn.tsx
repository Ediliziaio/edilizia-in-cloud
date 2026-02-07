import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Package, ShoppingCart, Truck, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import WarehouseKanbanCard from "./WarehouseKanbanCard";

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

interface WarehouseKanbanColumnProps {
  status: OrderItemStatus;
  items: WarehouseItem[];
  getSupplierName: (supplierId: string | null) => string | null;
}

const STATUS_CONFIG: Record<OrderItemStatus, { 
  label: string; 
  color: string; 
  bgColor: string;
  headerColor: string;
  icon: typeof Package;
}> = {
  da_ordinare: {
    label: "Da Ordinare",
    color: "text-amber-700",
    bgColor: "bg-amber-50/50",
    headerColor: "bg-amber-100 border-amber-200",
    icon: ShoppingCart,
  },
  ordinato: {
    label: "Ordinato",
    color: "text-blue-700",
    bgColor: "bg-blue-50/50",
    headerColor: "bg-blue-100 border-blue-200",
    icon: Truck,
  },
  in_magazzino: {
    label: "In Magazzino",
    color: "text-green-700",
    bgColor: "bg-green-50/50",
    headerColor: "bg-green-100 border-green-200",
    icon: Package,
  },
  installato: {
    label: "Installato",
    color: "text-slate-700",
    bgColor: "bg-slate-50/50",
    headerColor: "bg-slate-100 border-slate-200",
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
    <Card 
      className={cn(
        "flex flex-col h-[calc(100vh-400px)] min-h-[400px]",
        isOver && "ring-2 ring-primary"
      )}
    >
      <CardHeader className={cn("pb-3 border-b", config.headerColor)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={cn("h-4 w-4", config.color)} />
            <CardTitle className="text-sm font-medium">{config.label}</CardTitle>
          </div>
          <Badge variant="secondary" className={config.color}>
            {items.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent 
        ref={setNodeRef}
        className={cn("flex-1 p-2 overflow-hidden", config.bgColor)}
      >
        <ScrollArea className="h-full pr-2">
          <SortableContext 
            items={items.map(i => i.id)} 
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
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
          </SortableContext>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
