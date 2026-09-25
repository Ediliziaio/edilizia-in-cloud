import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Calendar,
  ChevronDown,
  ExternalLink,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { isItemUrgent, isItemCritical, getDaysUntilPosa, getUrgencyLabel } from "@/types/warehouse";
import type { OrderItemStatus, WarehouseItem, OrderWithItems } from "@/types/warehouse";
import WarehouseItemDetailDialog from "./WarehouseItemDetailDialog";
import WarehouseItemRow from "./WarehouseItemRow";
import { useIsMobile } from "@/hooks/use-mobile";

interface WarehouseListViewProps {
  orderGroups: OrderWithItems[];
  onStatusChange: (itemId: string, status: OrderItemStatus) => void;
  onMarkAllInstalled: (items: WarehouseItem[]) => void;
  onBatchStatusChange: (itemIds: string[], status: OrderItemStatus) => void;
  getSupplierName: (supplierId: string | null) => string | null;
  isUpdating: boolean;
  stockItems?: { id: string; name: string; quantity: number }[];
  onUpdateNotes?: (itemId: string, notes: string | null) => void;
  groupBy?: string;
  // M9 — dropdown sezione mobile
  sections?: { id: string; name: string }[];
  onSectionChange?: (itemId: string, sectionId: string | null) => void;
  readOnly?: boolean;
}

function getStatusIndicators(items: WarehouseItem[]) {
  return {
    ready: items.filter(i => i.status === "in_magazzino" || i.status === "prenotato").length,
    ordered: items.filter(i => i.status === "ordinato" || i.status === "in_arrivo").length,
    toOrder: items.filter(i => i.status === "da_ordinare").length,
    installed: items.filter(i => i.status === "installato").length,
  };
}

function WarehouseListView({
  orderGroups,
  onStatusChange,
  onMarkAllInstalled,
  onBatchStatusChange,
  getSupplierName,
  isUpdating,
  stockItems = [],
  onUpdateNotes,
  groupBy,
  sections = [],
  onSectionChange,
  readOnly = false,
}: WarehouseListViewProps) {
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);
  const isMobile = useIsMobile();

  // Always resolve the FRESH item from orderGroups so that after a workflow
  // mutation (e.g. goods receipt) the dialog re-renders with the updated
  // fulfillment_status without needing to be closed and reopened.
  const selectedItem = useMemo<WarehouseItem | null>(() => {
    if (!selectedItemId) return null;
    for (const group of orderGroups) {
      const found = group.items.find((i) => i.id === selectedItemId);
      if (found) return found;
    }
    return null;
  }, [selectedItemId, orderGroups]);

  const isSupplierGroup = groupBy === "supplier";

  const formatDate = (dateStr: string) => format(new Date(dateStr), "dd MMM", { locale: it });

  useEffect(() => {
    if (isSupplierGroup || orderGroups.length === 0 || expandedOrders.size > 0) return;
    setExpandedOrders(new Set(orderGroups.slice(0, 6).map((group) => group.orderId)));
  }, [expandedOrders.size, isSupplierGroup, orderGroups]);

  const toggleOrder = useCallback((orderId: string) => {
    setExpandedOrders(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId); else next.add(orderId);
      return next;
    });
  }, []);

  const toggleItemSelection = useCallback((itemId: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
      return next;
    });
  }, []);

  const handleBatchAction = useCallback((status: OrderItemStatus) => {
    if (selectedItems.size === 0) return;
    onBatchStatusChange(Array.from(selectedItems), status);
    setSelectedItems(new Set());
  }, [selectedItems, onBatchStatusChange]);

  const stockMap = useMemo(() => {
    const map = new Map<string, { id: string; name: string; quantity: number }>();
    stockItems.forEach(s => map.set(s.name.toLowerCase(), s));
    return map;
  }, [stockItems]);

  const findStockMatch = useCallback((itemName: string) => {
    const nameLower = itemName.toLowerCase();
    return stockMap.get(nameLower) || 
      Array.from(stockMap.values()).find(s => nameLower.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(nameLower)) || 
      null;
  }, [stockMap]);

  const handleSelectItem = useCallback((item: WarehouseItem) => {
    setSelectedItemId(item.id);
  }, []);

  // Virtualizer for the order groups list
  const virtualizer = useVirtualizer({
    count: orderGroups.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const group = orderGroups[index];
      const isExpanded = expandedOrders.has(group.orderId);
      // Header + item rows. Rows need enough room on narrow/mobile layouts
      // because status and item copy stack instead of being squeezed.
      return isExpanded ? 72 + group.items.length * 86 + 48 : 72;
    },
    overscan: 5,
  });

  if (orderGroups.length === 0) {
    return (
      <div className="text-center py-12">
        <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <p className="text-muted-foreground">Nessun articolo trovato</p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Aggiungi articoli agli ordini per vederli qui
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Batch actions bar */}
      {!readOnly && selectedItems.size > 0 && (
        <div className="flex items-center justify-between p-3 bg-primary/5 border rounded-lg">
          <span className="text-sm font-medium">
            {selectedItems.size} selezionati
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleBatchAction("ordinato")} disabled={isUpdating}>
              Ordinato
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBatchAction("in_magazzino")} disabled={isUpdating}>
              In Magazzino
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleBatchAction("installato")} disabled={isUpdating}>
              Installato
            </Button>
          </div>
        </div>
      )}

      {/* Virtualized order groups */}
      {/* Mobile: niente riquadro con scroll suo dentro la pagina che scorre
          (due scroll uno dentro l'altro, col pollice non si sa quale si
          muove, e alla lista restavano ~250px sotto i controlli). Scorre la
          pagina; i gruppi sono chiusi di default e pesano poco. */}
      <div
        ref={parentRef}
        className="overflow-auto max-sm:overflow-visible"
        style={isMobile ? undefined : { maxHeight: "calc(100vh - 280px)" }}
      >
        <div
          style={{
            height: `${virtualizer.getTotalSize()}px`,
            width: "100%",
            position: "relative",
          }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const group = orderGroups[virtualRow.index];
            const indicators = getStatusIndicators(group.items);
            const totalActiveItems = Math.max(group.items.length - indicators.installed, 0);
            const readyLabel =
              indicators.toOrder > 0
                ? "Materiali da ordinare"
                : indicators.ordered > 0
                  ? "Merce in arrivo"
                  : indicators.ready >= totalActiveItems
                    ? "Pronto per uscita"
                    : "Da controllare";
            const isExpanded = expandedOrders.has(group.orderId);
            const urgent = group.items.some(isItemUrgent);
            const critical = group.items.some(isItemCritical);
            const urgentDays = group.items
              .map(getDaysUntilPosa)
              .filter((d): d is number => d !== null && d >= 0 && d <= 7);
            const daysUntil = urgentDays.length > 0 ? Math.min(...urgentDays) : null;

            return (
              <div
                key={group.orderId}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                ref={virtualizer.measureElement}
                data-index={virtualRow.index}
              >
                <div
                  className={cn(
                    "border rounded-lg transition-colors mb-2",
                    !isSupplierGroup && critical && "border-destructive",
                    !isSupplierGroup && urgent && !critical && "border-amber-500"
                  )}
                >
                  {/* Group header */}
                  <div
                    className={cn(
                      // Mobile: due righe (commessa · data/articoli e «x/y pronti»),
                      // non tre con quattro badge.
                      "flex flex-col gap-3 p-3 cursor-pointer hover:bg-muted/50 transition-colors sm:flex-row sm:items-center sm:justify-between max-sm:gap-1 max-sm:py-2",
                      isExpanded && "border-b"
                    )}
                    onClick={() => toggleOrder(group.orderId)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold truncate max-sm:text-sm">
                            {isSupplierGroup
                              ? group.orderCode
                              : `${group.orderCode || "Ordine"} - ${group.customerName}`}
                          </span>
                          {!isSupplierGroup && (
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-xs shrink-0 max-sm:hidden",
                                indicators.toOrder > 0 && "border-amber-300 bg-amber-50 text-amber-700",
                                indicators.toOrder === 0 && indicators.ordered > 0 && "border-blue-300 bg-blue-50 text-blue-700",
                                indicators.toOrder === 0 && indicators.ordered === 0 && "border-emerald-300 bg-emerald-50 text-emerald-700",
                              )}
                            >
                              {readyLabel}
                            </Badge>
                          )}
                          {!isSupplierGroup && (urgent || critical) && daysUntil !== null && (
                            <Badge
                              variant="destructive"
                              className={cn("text-xs shrink-0", !critical && "bg-amber-500 hover:bg-amber-600")}
                            >
                              {getUrgencyLabel(daysUntil)}
                            </Badge>
                          )}
                        </div>
                        {!isSupplierGroup && group.expectedDate && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                            <Calendar className="h-3 w-3" />
                            Lavori: {formatDate(group.expectedDate)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {indicators.ready > 0 && (
                          <Badge variant="outline" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs max-sm:hidden">
                            {indicators.ready} pronti
                          </Badge>
                        )}
                        {indicators.ordered > 0 && (
                          <Badge variant="outline" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs max-sm:hidden">
                            {indicators.ordered} in arrivo
                          </Badge>
                        )}
                        {indicators.toOrder > 0 && (
                          <Badge variant="outline" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs max-sm:hidden">
                            {indicators.toOrder} da ordinare
                          </Badge>
                        )}
                        <Badge variant="secondary" className="text-xs max-sm:px-1.5 max-sm:text-[11px]">
                          {indicators.ready}/{totalActiveItems || group.items.length} pronti
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">{group.items.length} art.</span>
                      <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", isExpanded && "rotate-180")} />
                    </div>
                  </div>

                  {/* Expanded items */}
                  {isExpanded && (
                    <div className="p-2 space-y-1 bg-muted/20">
                      {group.items.map((item) => (
                        <WarehouseItemRow
                          key={item.id}
                          item={item}
                          isSelected={selectedItems.has(item.id)}
                          onToggleSelection={toggleItemSelection}
                          onStatusChange={onStatusChange}
                          onUpdateNotes={onUpdateNotes}
                          onSelectItem={handleSelectItem}
                          supplierName={getSupplierName(item.supplier_id)}
                          stockMatch={item.status === "da_ordinare" ? findStockMatch(item.name) : null}
                          isUpdating={isUpdating}
                          isSupplierGroup={isSupplierGroup}
                          sections={sections}
                          onSectionChange={onSectionChange}
                          readOnly={readOnly}
                        />
                      ))}

                      {/* Group actions */}
                      <div className="flex items-center justify-between pt-2">
                        {!readOnly && isSupplierGroup ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => onBatchStatusChange(
                              group.items.filter(i => i.status === "da_ordinare").map(i => i.id),
                              "ordinato"
                            )}
                            disabled={isUpdating || group.items.filter(i => i.status === "da_ordinare").length === 0}
                          >
                            Segna tutti come Ordinati
                          </Button>
                        ) : !readOnly ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => onMarkAllInstalled(group.items)}
                            disabled={isUpdating}
                          >
                            Segna tutti installati
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Vista consulente in sola lettura</span>
                        )}
                        {!isSupplierGroup && (
                          <Button variant="ghost" size="sm" asChild>
                            <Link to={`/azienda/ordini/${group.orderId}`} className="text-xs">
                              <ExternalLink className="h-3 w-3 mr-1" />
                              Vai all'ordine
                            </Link>
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Item detail dialog */}
      <WarehouseItemDetailDialog
        item={selectedItem}
        open={!!selectedItemId}
        onOpenChange={(open) => !open && setSelectedItemId(null)}
        onStatusChange={onStatusChange}
        onUpdateNotes={onUpdateNotes}
        getSupplierName={getSupplierName}
        isUpdating={isUpdating}
        stockMatch={selectedItem && selectedItem.status === "da_ordinare" ? findStockMatch(selectedItem.name) : null}
        readOnly={readOnly}
      />
    </div>
  );
}

export default WarehouseListView;
