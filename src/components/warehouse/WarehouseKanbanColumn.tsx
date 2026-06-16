import { useDroppable } from "@dnd-kit/core";
import { AlertTriangle } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import WarehouseKanbanCard from "./WarehouseKanbanCard";
import { isItemCritical, isItemOverdue, isItemUrgent, STATUS_CONFIG } from "@/types/warehouse";
import type { OrderItemStatus, WarehouseItem } from "@/types/warehouse";

/** Accento colore (barra superiore) derivato dal colore di stato. */
const ACCENT_BG: Record<string, string> = {
  "text-amber-600": "bg-amber-400",
  "text-blue-600": "bg-blue-400",
  "text-indigo-600": "bg-indigo-400",
  "text-green-600": "bg-green-500",
  "text-purple-600": "bg-purple-400",
  "text-muted-foreground": "bg-slate-300",
};

interface WarehouseKanbanColumnProps {
  status: OrderItemStatus;
  items: WarehouseItem[];
  getSupplierName: (supplierId: string | null) => string | null;
  onSelectItem: (item: WarehouseItem) => void;
  selectedIds?: Set<string>;
  onToggleSelection?: (itemId: string) => void;
  readOnly?: boolean;
}

export default function WarehouseKanbanColumn({ 
  status, 
  items, 
  getSupplierName,
  onSelectItem,
  selectedIds = new Set(),
  onToggleSelection,
  readOnly = false,
}: WarehouseKanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: status, disabled: readOnly });
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;
  const attentionCount = items.filter((item) => isItemCritical(item) || isItemUrgent(item) || isItemOverdue(item)).length;
  const accent = ACCENT_BG[config.color] ?? "bg-slate-300";

  return (
    <div
      className={cn(
        "flex h-[calc(100vh-330px)] min-h-[520px] flex-col overflow-hidden rounded-lg border bg-background shadow-sm transition-shadow",
        isOver && "ring-2 ring-primary shadow-md",
      )}
    >
      <div className={cn("h-1 shrink-0", accent)} />
      <div className={cn("border-b px-3 py-2.5", config.bgColor)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white/70 ring-1 ring-black/5">
                <Icon className={cn("h-3.5 w-3.5", config.color)} />
              </span>
              <span className="truncate text-sm font-semibold">{config.label}</span>
            </div>
            <div className="mt-1.5">
              {attentionCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  {attentionCount} da presidiare
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">flusso regolare</span>
              )}
            </div>
          </div>
          <span className="flex h-7 min-w-[28px] shrink-0 items-center justify-center rounded-full bg-foreground/80 px-2 text-xs font-bold text-background tabular-nums">
            {items.length}
          </span>
        </div>
      </div>

      <div ref={setNodeRef} className="flex-1 p-3 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="space-y-3 pr-2">
            {items.length === 0 ? (
              <div className="flex h-40 flex-col items-center justify-center rounded-md border border-dashed bg-muted/20 px-4 text-center">
                <p className="text-sm font-medium text-muted-foreground">Nessun articolo</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {readOnly ? "Nessun articolo in questo stato." : "Trascina qui una riga quando cambia stato."}
                </p>
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
                  readOnly={readOnly}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
