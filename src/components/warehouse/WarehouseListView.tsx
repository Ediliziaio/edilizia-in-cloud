import { useState } from "react";
import { Link } from "react-router-dom";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import {
  Calendar,
  ChevronDown,
  ExternalLink,
  Package,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
import { cn } from "@/lib/utils";

type OrderItemStatus = "da_ordinare" | "ordinato" | "in_magazzino" | "installato";

const STATUS_CONFIG: Record<OrderItemStatus, { label: string }> = {
  da_ordinare: { label: "Da Ordinare" },
  ordinato: { label: "Ordinato" },
  in_magazzino: { label: "In Magazzino" },
  installato: { label: "Installato" },
};

interface WarehouseItem {
  id: string;
  name: string;
  description: string | null;
  quantity: number | null;
  status: OrderItemStatus;
  supplier_id: string | null;
  purchase_price: number | null;
  updated_at?: string | null;
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

interface OrderWithItems {
  orderId: string;
  orderCode: string | null;
  customerName: string;
  expectedDate: string | null;
  items: WarehouseItem[];
}

interface WarehouseListViewProps {
  orderGroups: OrderWithItems[];
  onStatusChange: (itemId: string, status: OrderItemStatus) => void;
  onMarkAllInstalled: (items: WarehouseItem[]) => void;
  onBatchStatusChange: (itemIds: string[], status: OrderItemStatus) => void;
  getSupplierName: (supplierId: string | null) => string | null;
  isUpdating: boolean;
}

function getStatusIndicators(items: WarehouseItem[]) {
  return {
    ready: items.filter(i => i.status === "in_magazzino" || i.status === "installato").length,
    ordered: items.filter(i => i.status === "ordinato").length,
    toOrder: items.filter(i => i.status === "da_ordinare").length,
  };
}

export default function WarehouseListView({
  orderGroups,
  onStatusChange,
  onMarkAllInstalled,
  onBatchStatusChange,
  getSupplierName,
  isUpdating,
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

  const allItems = orderGroups.flatMap((g) => g.items);

  // Check if order is urgent (posa <= 7 days and has items not ready)
  const isOrderUrgent = (group: OrderWithItems) => {
    if (!group.expectedDate) return false;
    const daysUntil = differenceInDays(new Date(group.expectedDate), new Date());
    const hasNotReady = group.items.some(i => i.status === "da_ordinare" || i.status === "ordinato");
    return daysUntil <= 7 && daysUntil >= 0 && hasNotReady;
  };

  const isOrderCritical = (group: OrderWithItems) => {
    if (!group.expectedDate) return false;
    const daysUntil = differenceInDays(new Date(group.expectedDate), new Date());
    const hasNotReady = group.items.some(i => i.status === "da_ordinare" || i.status === "ordinato");
    return daysUntil <= 3 && daysUntil >= 0 && hasNotReady;
  };

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
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBatchAction("ordinato")}
              disabled={isUpdating}
            >
              Ordinato
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBatchAction("in_magazzino")}
              disabled={isUpdating}
            >
              In Magazzino
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleBatchAction("installato")}
              disabled={isUpdating}
            >
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
        const daysUntil = group.expectedDate 
          ? differenceInDays(new Date(group.expectedDate), new Date())
          : null;

        return (
          <Collapsible 
            key={group.orderId} 
            open={isExpanded}
            onOpenChange={() => toggleOrder(group.orderId)}
          >
            <div 
              className={cn(
                "border rounded-lg transition-colors",
                critical && "border-destructive",
                urgent && !critical && "border-amber-500"
              )}
            >
              {/* Order header row */}
              <CollapsibleTrigger asChild>
                <div 
                  className={cn(
                    "flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50 transition-colors",
                    isExpanded && "border-b"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Order code & customer */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">
                          {group.orderCode || "Ordine"} - {group.customerName}
                        </span>
                        {(urgent || critical) && daysUntil !== null && (
                          <Badge 
                            variant="destructive" 
                            className={cn(
                              "text-xs shrink-0",
                              !critical && "bg-amber-500 hover:bg-amber-600"
                            )}
                          >
                            {daysUntil === 0 ? "OGGI" : daysUntil === 1 ? "Domani" : `${daysUntil}g`}
                          </Badge>
                        )}
                      </div>
                      {group.expectedDate && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Calendar className="h-3 w-3" />
                          Posa: {formatDate(group.expectedDate)}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {/* Status indicators */}
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

                    {/* Items count */}
                    <span className="text-xs text-muted-foreground">
                      {group.items.length} art.
                    </span>

                    {/* Expand icon */}
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
                            <p className="font-medium text-sm truncate">{item.name}</p>
                            {supplierName && (
                              <p className="text-xs text-muted-foreground truncate">
                                {supplierName}
                              </p>
                            )}
                          </div>
                        </div>

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
                    );
                  })}

                  {/* Order actions */}
                  <div className="flex items-center justify-between pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => onMarkAllInstalled(group.items)}
                      disabled={isUpdating}
                    >
                      Segna tutti installati
                    </Button>
                    <Button variant="ghost" size="sm" asChild>
                      <Link to={`/azienda/ordini/${group.orderId}`} className="text-xs">
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Vai all'ordine
                      </Link>
                    </Button>
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
