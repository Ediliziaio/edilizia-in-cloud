import { useMemo, useState } from "react";
import WarehouseKanbanColumn from "./WarehouseKanbanColumn";
import WarehouseItemDetailDialog from "./WarehouseItemDetailDialog";
import type { OrderItemStatus, WarehouseItem } from "@/types/warehouse";

interface WarehouseKanbanViewProps {
  items: WarehouseItem[];
  onStatusChange: (itemId: string, status: OrderItemStatus) => void;
  onUpdateNotes?: (itemId: string, notes: string | null) => void;
  getSupplierName: (supplierId: string | null) => string | null;
  isUpdating?: boolean;
  selectedIds?: Set<string>;
  onToggleSelection?: (itemId: string) => void;
}

const STATUSES: OrderItemStatus[] = ["da_ordinare", "ordinato", "in_arrivo", "in_magazzino", "prenotato", "installato"];

export default function WarehouseKanbanView({ 
  items, 
  onStatusChange,
  onUpdateNotes,
  getSupplierName,
  isUpdating = false,
  selectedIds = new Set(),
  onToggleSelection,
}: WarehouseKanbanViewProps) {
  const [selectedItem, setSelectedItem] = useState<WarehouseItem | null>(null);

  const itemsByStatus = useMemo(() => {
    const grouped: Record<OrderItemStatus, WarehouseItem[]> = {
      da_ordinare: [], ordinato: [], in_arrivo: [], in_magazzino: [], prenotato: [], installato: [],
    };
    items.forEach((item) => { if (grouped[item.status]) grouped[item.status].push(item); });
    return grouped;
  }, [items]);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {STATUSES.map((status) => (
          <WarehouseKanbanColumn
            key={status}
            status={status}
            items={itemsByStatus[status]}
            getSupplierName={getSupplierName}
            onSelectItem={setSelectedItem}
            selectedIds={selectedIds}
            onToggleSelection={onToggleSelection}
          />
        ))}
      </div>

      <WarehouseItemDetailDialog
        item={selectedItem}
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItem(null)}
        onStatusChange={onStatusChange}
        onUpdateNotes={onUpdateNotes}
        getSupplierName={getSupplierName}
        isUpdating={isUpdating}
      />
    </>
  );
}
