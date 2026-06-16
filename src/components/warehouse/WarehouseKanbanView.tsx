import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, Flame, PackageCheck } from "lucide-react";
import WarehouseKanbanColumn from "./WarehouseKanbanColumn";
import WarehouseItemDetailDialog from "./WarehouseItemDetailDialog";
import { OperationalKpiCard } from "@/components/orders/OperationalKpiCard";
import { isItemOverdue, isItemUrgent } from "@/types/warehouse";
import type { OrderItemStatus, WarehouseItem } from "@/types/warehouse";

interface WarehouseKanbanViewProps {
  items: WarehouseItem[];
  onStatusChange: (itemId: string, status: OrderItemStatus) => void;
  onUpdateNotes?: (itemId: string, notes: string | null) => void;
  getSupplierName: (supplierId: string | null) => string | null;
  isUpdating?: boolean;
  selectedIds?: Set<string>;
  onToggleSelection?: (itemId: string) => void;
  readOnly?: boolean;
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
  readOnly = false,
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

  const summary = useMemo(() => {
    // Urgenti = posa entro 7 giorni MA non ancora scaduta (0..7).
    // In ritardo = posa già superata (giorni negativi): è il segnale più critico
    // e prima era erroneamente conteggiato dentro "Urgenti" (days <= 7 senza floor 0).
    return {
      total: items.length,
      active: items.filter((item) => item.status !== "installato").length,
      overdue: items.filter(isItemOverdue).length,
      urgent: items.filter(isItemUrgent).length,
      installed: itemsByStatus.installato.length,
    };
  }, [items, itemsByStatus.installato.length]);

  const handleSelectItem = (item: WarehouseItem) => setSelectedItemId(item.id);

  return (
    <>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <OperationalKpiCard icon={PackageCheck} label="Totale" value={String(summary.total)} tone="slate" />
          <OperationalKpiCard icon={Clock} label="Attivi" value={String(summary.active)} hint="non installati" tone="blue" />
          <OperationalKpiCard icon={AlertTriangle} label="In ritardo" value={String(summary.overdue)} hint="posa superata" tone="red" />
          <OperationalKpiCard icon={Flame} label="Urgenti" value={String(summary.urgent)} hint="posa entro 7gg" tone="amber" />
          <OperationalKpiCard icon={CheckCircle2} label="Installati" value={String(summary.installed)} tone="green" />
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[1480px] grid-cols-6 gap-3">
            {STATUSES.map((status) => (
              <WarehouseKanbanColumn
                key={status}
                status={status}
                items={itemsByStatus[status]}
                getSupplierName={getSupplierName}
                onSelectItem={handleSelectItem}
                selectedIds={selectedIds}
                onToggleSelection={onToggleSelection}
                readOnly={readOnly}
              />
            ))}
          </div>
        </div>
      </div>

      <WarehouseItemDetailDialog
        item={selectedItem}
        open={!!selectedItemId}
        onOpenChange={(open) => !open && setSelectedItemId(null)}
        onStatusChange={onStatusChange}
        onUpdateNotes={onUpdateNotes}
        getSupplierName={getSupplierName}
        isUpdating={isUpdating}
        readOnly={readOnly}
      />
    </>
  );
}
