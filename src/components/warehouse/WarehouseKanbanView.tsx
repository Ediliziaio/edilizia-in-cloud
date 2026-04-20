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
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // Always resolve fresh item reference so workflow mutations propagate into
  // the dialog immediately without requiring a close/reopen.
  const selectedItem = useMemo<WarehouseItem | null>(
    () => (selectedItemId ? items.find((i) => i.id === selectedItemId) ?? null : null),
    [selectedItemId, items]
  );

  const itemsByStatus = useMemo(() => {
    const grouped: Record<OrderItemStatus, WarehouseItem[]> = {
      da_ordinare: [], ordinato: [], in_arrivo: [], in_magazzino: [], prenotato: [], installato: [],
    };
    items.forEach((item) => { if (grouped[item.status]) grouped[item.status].push(item); });
    return grouped;
  }, [items]);

  const handleSelectItem = (item: WarehouseItem) => setSelectedItemId(item.id);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {STATUSES.map((status) => (
          <WarehouseKanbanColumn
            key={status}
            status={status}
            items={itemsByStatus[status]}
            getSupplierName={getSupplierName}
            onSelectItem={handleSelectItem}
            selectedIds={selectedIds}
            onToggleSelection={onToggleSelection}
          />
        ))}
      </div>

      <WarehouseItemDetailDialog
        item={selectedItem}
        open={!!selectedItemId}
        onOpenChange={(open) => !open && setSelectedItemId(null)}
        onStatusChange={onStatusChange}
        onUpdateNotes={onUpdateNotes}
        getSupplierName={getSupplierName}
        isUpdating={isUpdating}
      />
    </>
  );
}
