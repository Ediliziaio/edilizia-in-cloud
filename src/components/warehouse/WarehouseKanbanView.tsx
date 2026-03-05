import { useMemo, useState } from "react";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core";
import WarehouseKanbanColumn from "./WarehouseKanbanColumn";
import WarehouseKanbanCard from "./WarehouseKanbanCard";
import WarehouseItemDetailDialog from "./WarehouseItemDetailDialog";
import type { OrderItemStatus, WarehouseItem } from "@/types/warehouse";

interface WarehouseKanbanViewProps {
  items: WarehouseItem[];
  onStatusChange: (itemId: string, status: OrderItemStatus) => void;
  onUpdateNotes?: (itemId: string, notes: string | null) => void;
  getSupplierName: (supplierId: string | null) => string | null;
  isUpdating?: boolean;
}

const STATUSES: OrderItemStatus[] = ["da_ordinare", "ordinato", "in_magazzino", "installato"];

export default function WarehouseKanbanView({ 
  items, 
  onStatusChange,
  onUpdateNotes,
  getSupplierName,
  isUpdating = false,
}: WarehouseKanbanViewProps) {
  const [activeItem, setActiveItem] = useState<WarehouseItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<WarehouseItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const itemsByStatus = useMemo(() => {
    const grouped: Record<OrderItemStatus, WarehouseItem[]> = {
      da_ordinare: [], ordinato: [], in_magazzino: [], installato: [],
    };
    items.forEach((item) => { if (grouped[item.status]) grouped[item.status].push(item); });
    return grouped;
  }, [items]);

  const handleDragStart = (event: DragStartEvent) => {
    const item = items.find((i) => i.id === event.active.id);
    if (item) setActiveItem(item);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);
    if (!over) return;
    const itemId = active.id as string;
    const newStatus = over.id as OrderItemStatus;
    if (STATUSES.includes(newStatus)) {
      const item = items.find((i) => i.id === itemId);
      if (item && item.status !== newStatus) onStatusChange(itemId, newStatus);
    }
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {STATUSES.map((status) => (
            <WarehouseKanbanColumn
              key={status}
              status={status}
              items={itemsByStatus[status]}
              getSupplierName={getSupplierName}
              onSelectItem={setSelectedItem}
            />
          ))}
        </div>

        <DragOverlay>
          {activeItem ? (
            <div className="opacity-80">
              <WarehouseKanbanCard
                item={activeItem}
                supplierName={getSupplierName(activeItem.supplier_id)}
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

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
