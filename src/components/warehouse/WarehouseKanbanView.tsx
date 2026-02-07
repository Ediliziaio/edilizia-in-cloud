import { useMemo } from "react";
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
import { useState } from "react";
import WarehouseKanbanColumn from "./WarehouseKanbanColumn";
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

interface WarehouseKanbanViewProps {
  items: WarehouseItem[];
  onStatusChange: (itemId: string, status: OrderItemStatus) => void;
  getSupplierName: (supplierId: string | null) => string | null;
}

const STATUSES: OrderItemStatus[] = ["da_ordinare", "ordinato", "in_magazzino", "installato"];

export default function WarehouseKanbanView({ 
  items, 
  onStatusChange,
  getSupplierName 
}: WarehouseKanbanViewProps) {
  const [activeItem, setActiveItem] = useState<WarehouseItem | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const itemsByStatus = useMemo(() => {
    const grouped: Record<OrderItemStatus, WarehouseItem[]> = {
      da_ordinare: [],
      ordinato: [],
      in_magazzino: [],
      installato: [],
    };

    items.forEach((item) => {
      if (grouped[item.status]) {
        grouped[item.status].push(item);
      }
    });

    return grouped;
  }, [items]);

  const handleDragStart = (event: DragStartEvent) => {
    const item = items.find((i) => i.id === event.active.id);
    if (item) {
      setActiveItem(item);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveItem(null);

    if (!over) return;

    const itemId = active.id as string;
    const newStatus = over.id as OrderItemStatus;

    // Check if dropped on a column
    if (STATUSES.includes(newStatus)) {
      const item = items.find((i) => i.id === itemId);
      if (item && item.status !== newStatus) {
        onStatusChange(itemId, newStatus);
      }
    }
  };

  return (
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
  );
}
