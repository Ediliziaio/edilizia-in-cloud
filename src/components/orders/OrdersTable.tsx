import React, { useState, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Link } from "react-router-dom";
import { Eye, Pencil, Trash2, X, ChevronDown, HardHat } from "lucide-react";
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
  supplierMap?: Map<string, string[]>;
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
  supplierMap = new Map(),
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
    supplier: (o: OrderWithDetails) => (supplierMap.get(o.id) || []).join(", "),
    payments: (o: OrderWithDetails) => getPendingPayments(o).length,
    status: (o: OrderWithDetails) => o.status?.name || "",
    expected_date: (o: OrderWithDetails) => o.expected_date || "",
    warehouse_arrival_date: (o: OrderWithDetails) => o.warehouse_arrival_date || "",
    work_start_date: (o: OrderWithDetails) => o.work_start_date || "",
    work_end_date: (o: OrderWithDetails) => o.work_end_date || "",
    payment_type: (o: OrderWithDetails) => o.payment_type || "",
    deposit: (o: OrderWithDetails) => (o.deposit_amount || 0) + (o.deposit_2_amount || 0),
    balance: (o: OrderWithDetails) => o.balance_amount || 0,
  }), [orderCosts, salespeopleMap, laborMap, supplierMap]);

  const { sortConfig, toggleSort, sortedItems } = useTableSort(orders, sortAccessors);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const useVirtual = sortedItems.length > 50;
  const tableBodyRef = useRef<HTMLTableSectionElement>(null);
  const virtualizer = useVirtualizer({
    count: sortedItems.length,
    getScrollElement: () => (useVirtual ? tableBodyRef.current?.closest(".overflow-x-auto") as HTMLElement | null : null),
    estimateSize: () => 56,
    overscan: 10,
    enabled: useVirtual,
  });

  const renderedItems = useVirtual
    ? virtualizer.getVirtualItems().map(vr => ({ vr, order: sortedItems[vr.index] }))
    : sortedItems.map((order, i) => ({ vr: { key: order.id, index: i, start: 0, size: 56 }, order }));

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
      {/* Mobile card list — shown only on xs */}
      <div className="sm:hidden divide-y">
        {sortedItems.map((order) => {
          const due = getAmountDue(order);
          const collected = getAmountCollected(order);
          const vatRate = order.vat_rate ?? 22;
          const totalIvato = order.total_amount * (1 + vatRate / 100);
          return (
            <Link
              key={order.id}
              to={`/azienda/ordini/${order.id}`}
              className="flex flex-col gap-2 px-4 py-4 hover:bg-muted/50 active:bg-muted transition-colors"
            >
              {/* Riga 1: codice + badges */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-bold text-sm">{order.order_code || "—"}</span>
                  {order.order_type === "appaltatore_lavoro" && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 shrink-0 border-amber-500 text-amber-700 bg-amber-50 dark:bg-amber-950/40"
                      aria-label="Lavoro per appaltatore"
                    >
                      <HardHat className="h-2.5 w-2.5 mr-0.5" />
                      Lavoro
                    </Badge>
                  )}
                </div>
                {order.status && (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 shrink-0"
                    style={{ borderColor: order.status.color, color: order.status.color }}
                  >
                    {order.status.name}
                  </Badge>
                )}
              </div>
              {/* Riga 2: descrizione + cliente */}
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{order.description || "—"}</p>
                {order.customer && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {order.customer.first_name} {order.customer.last_name}
                  </p>
                )}
              </div>
              {/* Riga 3: pagamento + totale */}
              <div className="flex items-end justify-between gap-2">
                <div>
                  {due > 0 ? (
                    <span className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                      Da ricevere: {formatCurrency(due)}
                    </span>
                  ) : collected > 0 ? (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                      ✓ Saldato
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">Nessun pagamento</span>
                  )}
                </div>
                <p className="font-bold text-base leading-tight shrink-0">{formatCurrency(totalIvato)}</p>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Desktop table — hidden on mobile */}
      <div className="hidden sm:block">
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
              {visibleColumns.has("date") && <SortableTableHead column="created_at" label="Data" sortConfig={sortConfig} onSort={toggleSort} className="hidden md:table-cell" />}
              <SortableTableHead column="description" label="Descrizione" sortConfig={sortConfig} onSort={toggleSort} />
              {visibleColumns.has("customer") && <SortableTableHead column="customer" label="Cliente" sortConfig={sortConfig} onSort={toggleSort} className="hidden sm:table-cell" />}
              {visibleColumns.has("totalIvato") && <SortableTableHead column="totalIvato" label="Tot. Ivato" sortConfig={sortConfig} onSort={toggleSort} className="hidden sm:table-cell text-right" />}
              {visibleColumns.has("imponibile") && <SortableTableHead column="total_amount" label="Imponibile" sortConfig={sortConfig} onSort={toggleSort} className="hidden lg:table-cell text-right" />}
              {visibleColumns.has("collected") && <SortableTableHead column="collected" label="Incassato" sortConfig={sortConfig} onSort={toggleSort} className="hidden md:table-cell text-right" />}
              {visibleColumns.has("due") && <SortableTableHead column="due" label="Da Ricevere" sortConfig={sortConfig} onSort={toggleSort} className="hidden md:table-cell text-right" />}
              {visibleColumns.has("variableCosts") && <SortableTableHead column="variableCosts" label="Costi Var." sortConfig={sortConfig} onSort={toggleSort} className="hidden lg:table-cell text-right" />}
              {visibleColumns.has("margin") && <SortableTableHead column="grossMargin" label="Margine" sortConfig={sortConfig} onSort={toggleSort} className="hidden lg:table-cell text-right" />}
              {visibleColumns.has("deposit") && <SortableTableHead column="deposit" label="Acconti" sortConfig={sortConfig} onSort={toggleSort} className="hidden lg:table-cell text-right" />}
              {visibleColumns.has("balance") && <SortableTableHead column="balance" label="Saldo" sortConfig={sortConfig} onSort={toggleSort} className="hidden lg:table-cell text-right" />}
              {visibleColumns.has("salesperson") && <SortableTableHead column="salesperson" label="Venditore" sortConfig={sortConfig} onSort={toggleSort} className="hidden xl:table-cell" />}
              {visibleColumns.has("labor") && <SortableTableHead column="labor" label="Manodopera" sortConfig={sortConfig} onSort={toggleSort} className="hidden xl:table-cell" />}
              {visibleColumns.has("supplier") && <SortableTableHead column="supplier" label="Fornitore" sortConfig={sortConfig} onSort={toggleSort} className="hidden xl:table-cell" />}
              {visibleColumns.has("expected_date") && <SortableTableHead column="expected_date" label="Data Posa" sortConfig={sortConfig} onSort={toggleSort} className="hidden lg:table-cell" />}
              {visibleColumns.has("warehouse_date") && <SortableTableHead column="warehouse_arrival_date" label="Arrivo Merce" sortConfig={sortConfig} onSort={toggleSort} className="hidden lg:table-cell" />}
              {visibleColumns.has("work_start") && <SortableTableHead column="work_start_date" label="Inizio Lavori" sortConfig={sortConfig} onSort={toggleSort} className="hidden lg:table-cell" />}
              {visibleColumns.has("work_end") && <SortableTableHead column="work_end_date" label="Fine Lavori" sortConfig={sortConfig} onSort={toggleSort} className="hidden lg:table-cell" />}
              {visibleColumns.has("payment_type") && <SortableTableHead column="payment_type" label="Tipo Pagamento" sortConfig={sortConfig} onSort={toggleSort} className="hidden lg:table-cell" />}
              {visibleColumns.has("payments") && <SortableTableHead column="payments" label="Pagamenti" sortConfig={sortConfig} onSort={toggleSort} className="hidden md:table-cell" />}
              <SortableTableHead column="status" label="Stato" sortConfig={sortConfig} onSort={toggleSort} />
              <TableHead className="text-right">Azioni</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody
            ref={tableBodyRef}
            style={useVirtual ? { height: `${virtualizer.getTotalSize()}px`, position: "relative", width: "100%" } : undefined}
          >
            {renderedItems.map(({ vr, order }) => {
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
                <TableRow
                  key={vr.key}
                  data-state={isSelected ? "selected" : undefined}
                  style={useVirtual ? { position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vr.start}px)` } : undefined}
                >
                  <TableCell>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleOne(order.id)}
                      aria-label={`Seleziona commessa ${order.order_code || order.description}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <Link to={`/azienda/ordini/${order.id}`} className="text-primary hover:underline cursor-pointer">
                        {order.order_code || "—"}
                      </Link>
                      {order.order_type === "appaltatore_lavoro" && (
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1 py-0 shrink-0 border-amber-500 text-amber-700 bg-amber-50 dark:bg-amber-950/40"
                          title="Lavoro per appaltatore"
                        >
                          <HardHat className="h-2.5 w-2.5" />
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  {visibleColumns.has("date") && (
                    <TableCell className="hidden md:table-cell text-muted-foreground text-sm whitespace-nowrap">
                      {format(new Date(order.created_at), "dd/MM/yyyy")}
                    </TableCell>
                  )}
                  <TableCell className="max-w-[120px] sm:max-w-[150px] truncate">
                    {order.description}
                  </TableCell>
                  {visibleColumns.has("customer") && (
                    <TableCell className="hidden sm:table-cell">
                      {order.customer
                        ? `${order.customer.first_name} ${order.customer.last_name}`
                        : "—"}
                    </TableCell>
                  )}
                  {visibleColumns.has("totalIvato") && (
                    <TableCell className="hidden sm:table-cell text-right">
                      {formatCurrency(totalIvato)}
                    </TableCell>
                  )}
                  {visibleColumns.has("imponibile") && (
                    <TableCell className="hidden lg:table-cell text-right">
                      {formatCurrency(order.total_amount)}
                    </TableCell>
                  )}
                  {visibleColumns.has("collected") && (
                    <TableCell className="hidden md:table-cell text-right">
                      <span className={collected > 0 ? "text-emerald-600 dark:text-emerald-400" : ""}>
                        {formatCurrency(collected)}
                      </span>
                    </TableCell>
                  )}
                  {visibleColumns.has("due") && (
                    <TableCell className="hidden md:table-cell text-right">
                      <span className={due > 0 ? "text-orange-600 dark:text-orange-400 font-medium" : "text-emerald-600 dark:text-emerald-400"}>
                        {formatCurrency(due)}
                      </span>
                    </TableCell>
                  )}
                  {visibleColumns.has("variableCosts") && (
                    <TableCell className="hidden lg:table-cell text-right">
                      <span className="text-muted-foreground">
                        {formatCurrency(variableCosts)}
                      </span>
                    </TableCell>
                  )}
                  {visibleColumns.has("margin") && (
                    <TableCell className="hidden lg:table-cell text-right">
                      <span className={`font-medium ${
                        marginPercent >= 30
                          ? "text-emerald-600 dark:text-emerald-400"
                          : marginPercent >= 15
                            ? "text-amber-600 dark:text-amber-400"
                            : "text-destructive"
                      }`}>
                        {formatCurrency(grossMargin)} ({marginPercent.toFixed(1)}%)
                      </span>
                    </TableCell>
                  )}
                  {visibleColumns.has("deposit") && (
                    <TableCell className="hidden lg:table-cell text-right">
                      {formatCurrency((order.deposit_amount || 0) + (order.deposit_2_amount || 0))}
                    </TableCell>
                  )}
                  {visibleColumns.has("balance") && (
                    <TableCell className="hidden lg:table-cell text-right">
                      {formatCurrency(order.balance_amount || 0)}
                    </TableCell>
                  )}
                  {visibleColumns.has("salesperson") && (
                    <TableCell className="hidden xl:table-cell text-sm">
                      {(salespeopleMap.get(order.id) || []).join(", ") || "—"}
                    </TableCell>
                  )}
                  {visibleColumns.has("labor") && (
                    <TableCell className="hidden xl:table-cell text-sm">
                      {(laborMap.get(order.id) || []).join(", ") || "—"}
                    </TableCell>
                  )}
                  {visibleColumns.has("supplier") && (
                    <TableCell className="hidden xl:table-cell text-sm">
                      {(supplierMap.get(order.id) || []).join(", ") || "—"}
                    </TableCell>
                  )}
                  {visibleColumns.has("expected_date") && (
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground whitespace-nowrap">
                      {order.expected_date ? format(new Date(order.expected_date), "dd/MM/yyyy") : "—"}
                    </TableCell>
                  )}
                  {visibleColumns.has("warehouse_date") && (
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground whitespace-nowrap">
                      {order.warehouse_arrival_date ? format(new Date(order.warehouse_arrival_date), "dd/MM/yyyy") : "—"}
                    </TableCell>
                  )}
                  {visibleColumns.has("work_start") && (
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground whitespace-nowrap">
                      {order.work_start_date ? format(new Date(order.work_start_date), "dd/MM/yyyy") : "—"}
                    </TableCell>
                  )}
                  {visibleColumns.has("work_end") && (
                    <TableCell className="hidden lg:table-cell text-sm text-muted-foreground whitespace-nowrap">
                      {order.work_end_date ? format(new Date(order.work_end_date), "dd/MM/yyyy") : "—"}
                    </TableCell>
                  )}
                  {visibleColumns.has("payment_type") && (
                    <TableCell className="hidden lg:table-cell text-sm">
                      {order.payment_type || "—"}
                    </TableCell>
                  )}
                  {visibleColumns.has("payments") && (
                    <TableCell className="hidden md:table-cell">
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
                  )}
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
                            <AlertDialogTitle>Elimina Commessa</AlertDialogTitle>
                            <AlertDialogDescription>
                              Sei sicuro di voler eliminare la commessa{" "}
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
      </div>{/* end hidden sm:block */}
    </Card>
  );
});
