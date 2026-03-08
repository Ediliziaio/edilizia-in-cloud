import { useState, useRef, useCallback, useMemo } from "react";
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
}

function getStatusIndicators(items: WarehouseItem[]) {
  return {
    ready: items.filter(i => i.status === "in_magazzino" || i.status === "installato").length,
    ordered: items.filter(i => i.status === "ordinato").length,
    toOrder: items.filter(i => i.status === "da_ordinare").length,
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
}: WarehouseListViewProps) {
  const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<WarehouseItem | null>(null);
  const parentRef = useRef<HTMLDivElement>(null);

  const isSupplierGroup = groupBy === "supplier";

  const formatDate = (dateStr: string) => format(new Date(dateStr), "dd MMM", { locale: it });

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
    setSelectedItem(item);
  }, []);

  // Virtualizer for the order groups list
  const virtualizer = useVirtualizer({
    count: orderGroups.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (index) => {
      const group = orderGroups[index];
      const isExpanded = expandedOrders.has(group.orderId);
      // Header ~56px, each item ~44px, footer ~40px
      return isExpanded ? 56 + group.items.length * 44 + 40 : 56;
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
      {selectedItems.size > 0 && (
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
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ maxHeight: "calc(100vh - 280px)" }}
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
                      "flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors",
                      isExpanded && "border-b"
                    )}
                    onClick={() => toggleOrder(group.orderId)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium truncate">
                            {isSupplierGroup
                              ? group.orderCode
                              : `${group.orderCode || "Ordine"} - ${group.customerName}`}
                          </span>
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
                            Posa: {formatDate(group.expectedDate)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1">
                        {indicators.ready > 0 && (
                          <Badge variant="outline" className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-xs">
                            {indicators.ready}
                          </Badge>
                        )}
                        {indicators.ordered > 0 && (
                          <Badge variant="outline" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-xs">
                            {indicators.ordered}
                          </Badge>
                        )}
                        {indicators.toOrder > 0 && (
                          <Badge variant="outline" className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs">
                            {indicators.toOrder}
                          </Badge>
                        )}
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
                        />
                      ))}

                      {/* Group actions */}
                      <div className="flex items-center justify-between pt-2">
                        {isSupplierGroup ? (
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
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => onMarkAllInstalled(group.items)}
                            disabled={isUpdating}
                          >
                            Segna tutti installati
                          </Button>
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
        open={!!selectedItem}
        onOpenChange={(open) => !open && setSelectedItem(null)}
        onStatusChange={onStatusChange}
        onUpdateNotes={onUpdateNotes}
        getSupplierName={getSupplierName}
        isUpdating={isUpdating}
        stockMatch={selectedItem && selectedItem.status === "da_ordinare" ? findStockMatch(selectedItem.name) : null}
      />
    </div>
  );
}

export default WarehouseListView;
