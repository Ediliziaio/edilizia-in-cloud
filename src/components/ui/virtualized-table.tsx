/**
 * S3-02 — VirtualizedTable
 *
 * Componente riusabile per virtualizzare liste lunghe (500+ righe) mantenendo
 * filtri/ricerca/ordinamento/selezione gestiti dal chiamante. Usa TanStack
 * react-virtual (gia' presente in package.json).
 *
 * Pattern d'uso:
 *
 *   <VirtualizedTable
 *     items={filteredOrders}
 *     estimatedRowHeight={64}
 *     ariaLabel="Lista ordini"
 *     renderHeader={() => <OrdersTableHeader ... />}
 *     renderRow={(o) => <OrderRow order={o} />}
 *     emptyState={<OrdersEmptyState />}
 *   />
 *
 * Nota CSS: con virtualizzazione le righe sono `position: absolute` dentro un
 * container con altezza calcolata. Il componente passato a renderRow deve
 * essere un blocco self-sizing (flex/grid), non un <tr>.
 */
import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";

export interface VirtualizedTableProps<T> {
  items: T[];
  estimatedRowHeight?: number;
  overscan?: number;
  renderRow: (item: T, index: number) => ReactNode;
  renderHeader?: () => ReactNode;
  emptyState?: ReactNode;
  className?: string;
  /** Altezza massima inline (default: calc(100vh - 280px)). */
  maxHeight?: string;
  /** aria-label per screen reader. */
  ariaLabel?: string;
  /** Key estrattore — preferito al fallback index per evitare re-mount sui filtri. */
  getRowKey?: (item: T, index: number) => string | number;
}

export function VirtualizedTable<T>({
  items,
  estimatedRowHeight = 56,
  overscan = 8,
  renderRow,
  renderHeader,
  emptyState,
  className,
  maxHeight = "calc(100vh - 280px)",
  ariaLabel,
  getRowKey,
}: VirtualizedTableProps<T>) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimatedRowHeight,
    overscan,
  });

  if (items.length === 0 && emptyState) {
    return <div className="flex items-center justify-center py-16">{emptyState}</div>;
  }

  return (
    <div
      ref={parentRef}
      className={cn("relative overflow-auto", className)}
      style={{ height: "100%", maxHeight }}
      role="table"
      aria-label={ariaLabel}
      aria-rowcount={items.length}
    >
      {renderHeader && (
        <div className="sticky top-0 z-10 bg-background border-b" role="row">
          {renderHeader()}
        </div>
      )}
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: "100%",
          position: "relative",
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const item = items[virtualRow.index];
          const key = getRowKey ? getRowKey(item, virtualRow.index) : virtualRow.key;
          return (
            <div
              key={key}
              data-index={virtualRow.index}
              ref={virtualizer.measureElement}
              className="absolute top-0 left-0 w-full"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
              role="row"
              aria-rowindex={virtualRow.index + 1}
            >
              {renderRow(item, virtualRow.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
