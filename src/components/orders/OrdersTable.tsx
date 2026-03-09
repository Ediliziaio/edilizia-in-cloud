import React, { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Eye, Pencil, Trash2, X, ChevronDown } from "lucide-react";
import { useTableSort } from "@/hooks/useTableSort";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { format } from "date-fns";
import { formatCurrency } from "@/lib/formatters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Card } from "@/components/ui/card";
import { type OrderWithDetails, type OrderStatus, getPendingPayments, getAmountDue, getAmountCollected } from "@/lib/orderUtils";

export interface OrderCosts {
  variableCosts: number;
  grossMargin: number;
}

interface OrdersTableProps {
  orders: OrderWithDetails[];
  onDelete: (orderId: string) => void;
  isDeleting: boolean;
  orderCosts: Map<string, OrderCosts>;
  statuses?: OrderStatus[];
  onBulkStatusChange?: (orderIds: string[], statusId: string) => void;
  onBulkDelete?: (orderIds: string[]) => void;
  isBulkUpdating?: boolean;
  visibleColumns?: Set<string>;
  salespeopleMap?: Map<string, string[]>;
  laborMap?: Map<string, string[]>;
}

export const OrdersTable = React.memo(function OrdersTable({
  orders,
  onDelete,
  isDeleting,
  orderCosts,
  statuses = [],
  onBulkStatusChange,
  onBulkDelete,
  isBulkUpdating = false,
  visibleColumns = new Set(["date"]),
  salespeopleMap = new Map(),
  laborMap = new Map(),
}: OrdersTableProps) {
  const sortAccessors = useMemo(() => ({
    order_code: (o: OrderWithDetails) => o.order_code || "",
    created_at: (o: OrderWithDetails) => o.created_at,
    description: (o: OrderWithDetails) => o.description || "",
    customer: (o: OrderWithDetails) => o.customer ? `${o.customer.first_name} ${o.customer.last_name}` : "",
    totalIvato: (o: OrderWithDetails) => o.total_amount * (1 + (o.vat_rate ?? 22) / 100),
    total_amount: (o: OrderWithDetails) => o.total_amount,
    collected: (o: OrderWithDetails) => getAmountCollected(o),
    due: (o: OrderWithDetails) => getAmountDue(o),
    variableCosts: (o: OrderWithDetails) => orderCosts.get(o.id)?.variableCosts ?? 0,
    grossMargin: (o: OrderWithDetails) => orderCosts.get(o.id)?.grossMargin ?? o.total_amount,
    salesperson: (o: OrderWithDetails) => (salespeopleMap.get(o.id) || []).join(", "),
    labor: (o: OrderWithDetails) => (laborMap.get(o.id) || []).join(", "),
    payments: (o: OrderWithDetails) => getPendingPayments(o).length,
    status: (o: OrderWithDetails) => o.status?.name || "",
  }), [orderCosts, salespeopleMap, laborMap]);

  const { sortConfig, toggleSort, sortedItems } = useTableSort(orders, sortAccessors);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allSelected = orders.length > 0 && selectedIds.size === orders.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < orders.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orders.map((o) => o.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkStatusChange = (statusId: string) => {
    if (onBulkStatusChange && selectedIds.size > 0) {
      onBulkStatusChange(Array.from(selectedIds), statusId);
      clearSelection();
    }
  };

  const handleBulkDelete = () => {
    if (onBulkDelete && selectedIds.size > 0) {
      onBulkDelete(Array.from(selectedIds));
      clearSelection();
    }
  };

  return (
    <Card>
      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-3 px-4 py-3 bg-primary/10 border-b rounded-t-lg flex-wrap">
          <Badge variant="secondary" className="text-sm font-medium">
            {selectedIds.size} selezionat{selectedIds.size === 1 ? "o" : "i"}
          </Badge>

          {statuses.length > 0 && onBulkStatusChange && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={isBulkUpdating}>
                  Cambia stato
                  <ChevronDown className="ml-1 h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {statuses.map((s) => (
                  <DropdownMenuItem key={s.id} onClick={() => handleBulkStatusChange(s.id)}>
                    <span
                      className="inline-block h-3 w-3 rounded-full mr-2 shrink-0"
                      style={{ backgroundColor: s.color }}
                    />
                    {s.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {onBulkDelete && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isBulkUpdating}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Elimina
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Elimina {selectedIds.size} ordin{selectedIds.size === 1 ? "e" : "i"}</AlertDialogTitle>
                  <AlertDialogDescription>
                    Sei sicuro di voler eliminare <strong>{selectedIds.size}</strong> ordin{selectedIds.size === 1 ? "e" : "i"}?
                    <br />
                    Verranno eliminati anche tutti i dati collegati. Questa azione non può essere annullata.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    onClick={handleBulkDelete}
                  >
                    Elimina {selectedIds.size} ordin{selectedIds.size === 1 ? "e" : "i"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}

          <Button variant="ghost" size="sm" onClick={clearSelection} className="ml-auto">
            <X className="h-4 w-4 mr-1" />
            Deseleziona
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[40px]">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Seleziona tutti"
                />
              </TableHead>
              <SortableTableHead column="order_code" label="Codice" sortConfig={sortConfig} onSort={toggleSort} />
              {visibleColumns.has("date") && <SortableTableHead column="created_at" label="Data" sortConfig={sortConfig} onSort={toggleSort} />}
              <SortableTableHead column="description" label="Descrizione" sortConfig={sortConfig} onSort={toggleSort} />
              <SortableTableHead column="customer" label="Cliente" sortConfig={sortConfig} onSort={toggleSort} />
              <SortableTableHead column="totalIvato" label="Tot. Ivato" sortConfig={sortConfig} onSort={toggleSort} className="text-right" />
              <SortableTableHead column="total_amount" label="Imponibile" sortConfig={sortConfig} onSort={toggleSort} className="text-right" />
              <SortableTableHead column="collected" label="Incassato" sortConfig={sortConfig} onSort={toggleSort} className="text-right" />
              <SortableTableHead column="due" label="Da Ricevere" sortConfig={sortConfig} onSort={toggleSort} className="text-right" />
              <SortableTableHead column="variableCosts" label="Costi Var." sortConfig={sortConfig} onSort={toggleSort} className="text-right" />
              <SortableTableHead column="grossMargin" label="Margine" sortConfig={sortConfig} onSort={toggleSort} className="text-right" />
              {visibleColumns.has("salesperson") && <SortableTableHead column="salesperson" label="Venditore" sortConfig={sortConfig} onSort={toggleSort} />}
              {visibleColumns.has("labor") && <SortableTableHead column="labor" label="Manodopera" sortConfig={sortConfig} onSort={toggleSort} />}
              <SortableTableHead column="payments" label="Pagamenti" sortConfig={sortConfig} onSort={toggleSort} />
              <SortableTableHead column="status" label="Stato" sortConfig={sortConfig} onSort={toggleSort} />
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedItems.map((order) => {
              const due = getAmountDue(order);
              const collected = getAmountCollected(order);
              const pending = getPendingPayments(order);
              const vatRate = order.vat_rate ?? 22;
              const totalIvato = order.total_amount * (1 + vatRate / 100);
              const costs = orderCosts.get(order.id);
              const variableCosts = costs?.variableCosts ?? 0;
              const grossMargin = costs?.grossMargin ?? order.total_amount;
              const marginPercent = order.total_amount > 0
                ? (grossMargin / order.total_amount) * 100
                : 0;
              const isSelected = selectedIds.has(order.id);

              return (
                <TableRow key={order.id} data-state={isSelected ? "selected" : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleOne(order.id)}
                      aria-label={`Seleziona ordine ${order.order_code || order.description}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <Link to={`/azienda/ordini/${order.id}`} className="text-primary hover:underline cursor-pointer">
                      {order.order_code || "—"}
                    </Link>
                  </TableCell>
                  {visibleColumns.has("date") && (
                    <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                      {format(new Date(order.created_at), "dd/MM/yyyy")}
                    </TableCell>
                  )}
                  <TableCell className="max-w-[150px] truncate">
                    {order.description}
                  </TableCell>
                  <TableCell>
                    {order.customer
                      ? `${order.customer.first_name} ${order.customer.last_name}`
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(totalIvato)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(order.total_amount)}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={collected > 0 ? "text-emerald-600 dark:text-emerald-400" : ""}>
                      {formatCurrency(collected)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={due > 0 ? "text-orange-600 dark:text-orange-400 font-medium" : "text-emerald-600 dark:text-emerald-400"}>
                      {formatCurrency(due)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="text-muted-foreground">
                      {formatCurrency(variableCosts)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <span className={`font-medium ${
                      marginPercent >= 30
                        ? "text-emerald-600 dark:text-emerald-400"
                        : marginPercent >= 20
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-destructive"
                    }`}>
                      {formatCurrency(grossMargin)} - {marginPercent.toFixed(1)}%
                    </span>
                  </TableCell>
                  {visibleColumns.has("salesperson") && (
                    <TableCell className="text-sm">
                      {(salespeopleMap.get(order.id) || []).join(", ") || "—"}
                    </TableCell>
                  )}
                  {visibleColumns.has("labor") && (
                    <TableCell className="text-sm">
                      {(laborMap.get(order.id) || []).join(", ") || "—"}
                    </TableCell>
                  )}
                  <TableCell>
                    {pending.length === 0 ? (
                      <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0">
                        OK
                      </Badge>
                    ) : (
                      <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 border-0">
                        {pending.join(", ")}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {order.status ? (
                      <Badge
                        variant="outline"
                        style={{
                          borderColor: order.status.color,
                          color: order.status.color,
                        }}
                      >
                        {order.status.name}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/azienda/ordini/${order.id}`}>
                          <Eye className="h-4 w-4" />
                        </Link>
                      </Button>
                      <Button variant="ghost" size="sm" asChild>
                        <Link to={`/azienda/ordini/${order.id}/modifica`}>
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" disabled={isDeleting}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Elimina Ordine</AlertDialogTitle>
                            <AlertDialogDescription>
                              Sei sicuro di voler eliminare l'ordine{" "}
                              <strong>{order.order_code || order.description}</strong>?
                              <br />
                              Verranno eliminati anche tutti i dati collegati (articoli, allegati, storico stati, ecc.).
                              <br />
                              Questa azione non può essere annullata.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Annulla</AlertDialogCancel>
                            <AlertDialogAction
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              onClick={() => onDelete(order.id)}
                            >
                              Elimina
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </Card>
  );
});
