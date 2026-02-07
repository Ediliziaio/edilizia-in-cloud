import { useState } from "react";
import { Link } from "react-router-dom";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import {
  Calendar,
  CheckCircle2,
  Package,
  ShoppingCart,
  Truck,
  ExternalLink,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type OrderItemStatus = "da_ordinare" | "ordinato" | "in_magazzino" | "installato";

const STATUS_CONFIG: Record<OrderItemStatus, { 
  label: string; 
  color: string; 
  bgColor: string; 
  borderColor: string; 
  icon: typeof Package;
}> = {
  da_ordinare: {
    label: "Da Ordinare",
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    borderColor: "border-l-4 border-amber-500",
    icon: ShoppingCart,
  },
  ordinato: {
    label: "Ordinato",
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    borderColor: "border-l-4 border-blue-500",
    icon: Truck,
  },
  in_magazzino: {
    label: "In Magazzino",
    color: "text-green-700",
    bgColor: "bg-green-50",
    borderColor: "border-l-4 border-green-500",
    icon: Package,
  },
  installato: {
    label: "Installato",
    color: "text-slate-700",
    bgColor: "bg-slate-50",
    borderColor: "border-l-4 border-slate-500",
    icon: CheckCircle2,
  },
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

export default function WarehouseListView({
  orderGroups,
  onStatusChange,
  onMarkAllInstalled,
  onBatchStatusChange,
  getSupplierName,
  isUpdating,
}: WarehouseListViewProps) {
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const formatDate = (dateStr: string) => {
    return format(new Date(dateStr), "dd MMM yyyy", { locale: it });
  };

  const getDaysInStatus = (updatedAt: string | null | undefined) => {
    if (!updatedAt) return null;
    const days = differenceInDays(new Date(), new Date(updatedAt));
    return days;
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

  const toggleAllItems = (items: WarehouseItem[]) => {
    const itemIds = items.map((i) => i.id);
    const allSelected = itemIds.every((id) => selectedItems.has(id));

    const newSelected = new Set(selectedItems);
    if (allSelected) {
      itemIds.forEach((id) => newSelected.delete(id));
    } else {
      itemIds.forEach((id) => newSelected.add(id));
    }
    setSelectedItems(newSelected);
  };

  const handleBatchAction = (status: OrderItemStatus) => {
    if (selectedItems.size === 0) return;
    onBatchStatusChange(Array.from(selectedItems), status);
    setSelectedItems(new Set());
  };

  const allItems = orderGroups.flatMap((g) => g.items);

  return (
    <div className="space-y-4">
      {/* Batch actions bar */}
      {selectedItems.size > 0 && (
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="py-3">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-3">
                <Checkbox
                  checked={
                    allItems.length > 0 &&
                    allItems.every((i) => selectedItems.has(i.id))
                  }
                  onCheckedChange={() => toggleAllItems(allItems)}
                />
                <span className="text-sm font-medium">
                  {selectedItems.size} articoli selezionati
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Azioni:</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBatchAction("ordinato")}
                  disabled={isUpdating}
                >
                  <Truck className="h-4 w-4 mr-1" />
                  Ordinato
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBatchAction("in_magazzino")}
                  disabled={isUpdating}
                >
                  <Package className="h-4 w-4 mr-1" />
                  In Magazzino
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleBatchAction("installato")}
                  disabled={isUpdating}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Installato
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {orderGroups.map((orderGroup) => {
        const groupItemIds = orderGroup.items.map((i) => i.id);
        const allGroupSelected = groupItemIds.every((id) =>
          selectedItems.has(id)
        );
        const someGroupSelected =
          groupItemIds.some((id) => selectedItems.has(id)) && !allGroupSelected;

        return (
          <Card key={orderGroup.orderId}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Checkbox
                    checked={allGroupSelected}
                    ref={(el) => {
                      if (el) {
                        (el as HTMLButtonElement & { indeterminate: boolean }).indeterminate = someGroupSelected;
                      }
                    }}
                    onCheckedChange={() => toggleAllItems(orderGroup.items)}
                  />
                  <div>
                    <Link to={`/azienda/ordini/${orderGroup.orderId}`}>
                      <CardTitle className="text-lg hover:underline cursor-pointer flex items-center gap-2">
                        {orderGroup.orderCode || "Ordine"} - {orderGroup.customerName}
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </CardTitle>
                    </Link>
                    {orderGroup.expectedDate && (
                      <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                        <Calendar className="h-3 w-3" />
                        Posa prevista: {formatDate(orderGroup.expectedDate)}
                      </p>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onMarkAllInstalled(orderGroup.items)}
                  disabled={isUpdating}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Segna tutti Installati
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {orderGroup.items.map((item) => {
                  const statusConfig = STATUS_CONFIG[item.status];
                  const supplierName = getSupplierName(item.supplier_id);
                  const daysInStatus = getDaysInStatus(item.updated_at);
                  const isLongWait =
                    item.status === "ordinato" && daysInStatus !== null && daysInStatus > 14;

                  return (
                    <div
                      key={item.id}
                      className={cn(
                        "p-3 rounded-lg flex items-center justify-between group",
                        statusConfig.bgColor,
                        statusConfig.borderColor,
                        selectedItems.has(item.id) && "ring-2 ring-primary"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Checkbox
                          checked={selectedItems.has(item.id)}
                          onCheckedChange={() => toggleItemSelection(item.id)}
                        />
                        <Badge
                          variant="secondary"
                          className={cn("font-mono", statusConfig.color)}
                        >
                          {item.quantity || 1}x
                        </Badge>
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            {supplierName && (
                              <span>Fornitore: {supplierName}</span>
                            )}
                            {daysInStatus !== null && daysInStatus > 0 && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span
                                      className={cn(
                                        "flex items-center gap-1",
                                        isLongWait && "text-amber-600 font-medium"
                                      )}
                                    >
                                      <Clock className="h-3 w-3" />
                                      {daysInStatus}g
                                      {isLongWait && " ⚠️"}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p>
                                      In questo stato da {daysInStatus} giorni
                                      {isLongWait && " - Attesa prolungata"}
                                    </p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                        </div>
                      </div>

                      <Select
                        value={item.status}
                        onValueChange={(value) =>
                          onStatusChange(item.id, value as OrderItemStatus)
                        }
                        disabled={isUpdating}
                      >
                        <SelectTrigger className="w-36">
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
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
