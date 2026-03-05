import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import {
  Calendar,
  ChevronDown,
  ExternalLink,
  Package,
  StickyNote,
  PackageCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { STATUS_CONFIG, isItemUrgent, isItemCritical, getDaysUntilPosa, getUrgencyLabel } from "@/types/warehouse";
import type { OrderItemStatus, WarehouseItem, OrderWithItems } from "@/types/warehouse";

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

function ItemNotePopover({ item, onUpdateNotes }: { item: WarehouseItem; onUpdateNotes?: (itemId: string, notes: string | null) => void }) {
  const [noteText, setNoteText] = useState(item.notes || "");
  const [open, setOpen] = useState(false);

  const handleSave = () => {
    onUpdateNotes?.(item.id, noteText.trim() || null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setNoteText(item.notes || ""); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0">
          <StickyNote className={cn("h-3.5 w-3.5", item.notes ? "text-amber-500" : "text-muted-foreground/40")} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-3" align="end">
        <Textarea
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          placeholder="Aggiungi nota..."
          className="text-sm min-h-[60px]"
        />
        <div className="flex justify-end gap-2 mt-2">
          {item.notes && (
            <Button variant="ghost" size="sm" onClick={() => { onUpdateNotes?.(item.id, null); setOpen(false); }}>
              Cancella
            </Button>
          )}
          <Button size="sm" onClick={handleSave}>Salva</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
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

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "dd MMM", { locale: it });
  };

  const toggleOrder = (orderId: string) => {
    const newExpanded = new Set(expandedOrders);
    if (newExpanded.has(orderId)) {
      newExpanded.delete(orderId);
    } else {
      newExpanded.add(orderId);
    }
    setExpandedOrders(newExpanded);
  };

  const toggleItemSelection = (itemId: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(itemId)) {
      newSelected.delete(itemId);
    } else {
      newSelected.add(itemId);
    }
    setSelectedItems(newSelected);
  };

  const handleBatchAction = (status: OrderItemStatus) => {
    if (selectedItems.size === 0) return;
    onBatchStatusChange(Array.from(selectedItems), status);
    setSelectedItems(new Set());
  };

  // Stock matching: find stock item by name (case-insensitive partial match)
  const findStockMatch = (itemName: string) => {
    const nameLower = itemName.toLowerCase();
    return stockItems.find(s => s.name.toLowerCase() === nameLower || nameLower.includes(s.name.toLowerCase()) || s.name.toLowerCase().includes(nameLower));
  };

  // Check if order is urgent (any item urgent/critical)
  const isOrderUrgent = (group: OrderWithItems) => group.items.some(isItemUrgent);
  const isOrderCritical = (group: OrderWithItems) => group.items.some(isItemCritical);
  const isSupplierGroup = groupBy === "supplier";

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

      {/* Order accordion list */}
      {orderGroups.map((group) => {
        const indicators = getStatusIndicators(group.items);
        const isExpanded = expandedOrders.has(group.orderId);
        const urgent = isOrderUrgent(group);
        const critical = isOrderCritical(group);
        const urgentDays = group.items
          .map(getDaysUntilPosa)
          .filter((d): d is number => d !== null && d >= 0 && d <= 7);
        const daysUntil = urgentDays.length > 0 ? Math.min(...urgentDays) : null;

        return (
          <Collapsible 
            key={group.orderId} 
            open={isExpanded}
            onOpenChange={() => toggleOrder(group.orderId)}
          >
            <div 
              className={cn(
                "border rounded-lg transition-colors",
                !isSupplierGroup && critical && "border-destructive",
                !isSupplierGroup && urgent && !critical && "border-amber-500"
              )}
            >
              {/* Group header row */}
              <CollapsibleTrigger asChild>
                <div 
                  className={cn(
                    "flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors",
                    isExpanded && "border-b"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {isSupplierGroup
                            ? group.orderCode
                            : `${group.orderCode || "Ordine"} - ${group.customerName}`
                          }
                        </span>
                        {!isSupplierGroup && (urgent || critical) && daysUntil !== null && (
                          <Badge 
                            variant="destructive" 
                            className={cn(
                              "text-xs shrink-0",
                              !critical && "bg-amber-500 hover:bg-amber-600"
                            )}
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

                    <span className="text-xs text-muted-foreground">
                      {group.items.length} art.
                    </span>

                    <ChevronDown className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform",
                      isExpanded && "rotate-180"
                    )} />
                  </div>
                </div>
              </CollapsibleTrigger>

              {/* Expanded items */}
              <CollapsibleContent>
                <div className="p-2 space-y-1 bg-muted/20">
                  {group.items.map((item) => {
                    const supplierName = getSupplierName(item.supplier_id);
                    const stockMatch = item.status === "da_ordinare" ? findStockMatch(item.name) : null;

                    return (
                      <div
                        key={item.id}
                        className={cn(
                          "flex items-center justify-between p-2 rounded bg-background border",
                          selectedItems.has(item.id) && "ring-1 ring-primary"
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Checkbox
                            checked={selectedItems.has(item.id)}
                            onCheckedChange={() => toggleItemSelection(item.id)}
                          />
                          <Badge variant="secondary" className="font-mono text-xs shrink-0">
                            {item.quantity || 1}x
                          </Badge>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="font-medium text-sm truncate">{item.name}</p>
                              {stockMatch && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 text-xs shrink-0 gap-1">
                                      <PackageCheck className="h-3 w-3" />
                                      {stockMatch.quantity} in stock
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Disponibile in giacenza: {stockMatch.name} ({stockMatch.quantity} pz)
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            {(supplierName || (isSupplierGroup && item.order.order_code)) && (
                              <p className="text-xs text-muted-foreground truncate">
                                {isSupplierGroup
                                  ? `${item.order.order_code || "Ordine"} - ${item.order.customer.first_name} ${item.order.customer.last_name}`
                                  : supplierName}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <ItemNotePopover item={item} onUpdateNotes={onUpdateNotes} />
                          <Select
                            value={item.status}
                            onValueChange={(value) =>
                              onStatusChange(item.id, value as OrderItemStatus)
                            }
                            disabled={isUpdating}
                          >
                            <SelectTrigger className="w-32 h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {Object.entries(STATUS_CONFIG).map(([status, config]) => (
                                <SelectItem key={status} value={status}>
                                  {config.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    );
                  })}

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
              </CollapsibleContent>
            </div>
          </Collapsible>
        );
      })}
    </div>
  );
}

export default WarehouseListView;
