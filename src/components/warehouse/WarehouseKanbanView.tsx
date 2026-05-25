import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Clock, PackageCheck } from "lucide-react";
import WarehouseKanbanColumn from "./WarehouseKanbanColumn";
import WarehouseItemDetailDialog from "./WarehouseItemDetailDialog";
import { getDaysUntilPosa } from "@/types/warehouse";
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
    const urgent = items.filter((item) => {
      const days = getDaysUntilPosa(item);
      return days !== null && days <= 7 && item.status !== "installato";
    }).length;

    return {
      total: items.length,
      urgent,
      active: items.filter((item) => item.status !== "installato").length,
      installed: itemsByStatus.installato.length,
    };
  }, [items, itemsByStatus.installato.length]);

  const handleSelectItem = (item: WarehouseItem) => setSelectedItemId(item.id);

  return (
    <>
      <div className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-4">
          <div className="rounded-md border bg-background p-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <PackageCheck className="h-4 w-4" aria-hidden="true" />
              Totale
            </div>
            <p className="mt-1 text-xl font-bold">{summary.total}</p>
          </div>
          <div className="rounded-md border bg-background p-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Clock className="h-4 w-4" aria-hidden="true" />
              Attivi
            </div>
            <p className="mt-1 text-xl font-bold">{summary.active}</p>
          </div>
          <div className="rounded-md border bg-background p-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
              Urgenti
            </div>
            <p className="mt-1 text-xl font-bold text-amber-700">{summary.urgent}</p>
          </div>
          <div className="rounded-md border bg-background p-3">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden="true" />
              Installati
            </div>
            <p className="mt-1 text-xl font-bold text-emerald-700">{summary.installed}</p>
          </div>
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
