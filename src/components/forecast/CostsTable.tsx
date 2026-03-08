import { useMemo, useState } from "react";
import { format, addDays, differenceInCalendarDays } from "date-fns";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/table-pagination";
import { it } from "date-fns/locale";
import { Link } from "react-router-dom";
import {
  Plus, Check, Pencil, Trash2, Receipt, Repeat,
  Package, ExternalLink, Undo2, CheckSquare,
  MoreHorizontal, X, Copy, AlertCircle, AlertTriangle,
  Clock, CircleDot, Settings2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { useTableSort } from "@/hooks/useTableSort";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { calculateGrossFromNet } from "@/lib/vatUtils";
import { RECURRENCE_LABELS } from "@/lib/forecastTypes";
import type { UnifiedCost } from "@/hooks/useCompanyCostsData";

const CATEGORY_COLORS: Record<string, string> = {
  finanziaria: "border-indigo-400 text-indigo-600 dark:text-indigo-400",
  bancarie: "border-indigo-400 text-indigo-600 dark:text-indigo-400",
  fiscale: "border-rose-400 text-rose-600 dark:text-rose-400",
  tasse: "border-rose-400 text-rose-600 dark:text-rose-400",
  iva: "border-rose-400 text-rose-600 dark:text-rose-400",
  investimenti: "border-cyan-400 text-cyan-600 dark:text-cyan-400",
  equity: "border-purple-400 text-purple-600 dark:text-purple-400",
  marketing: "border-amber-400 text-amber-600 dark:text-amber-400",
  personale: "border-teal-400 text-teal-600 dark:text-teal-400",
};

function getCategoryColor(category: string): string {
  const key = category.toLowerCase();
  return CATEGORY_COLORS[key] || "border-muted-foreground/40 text-muted-foreground";
}

interface CostsTableProps {
  items: UnifiedCost[];
  type: string;
  selectedIds: Set<string>;
  costNameCounts: Map<string, number>;
  onToggleSelect: (id: string) => void;
  onToggleSelectAll: (selectableIds: string[]) => void;
  onClearSelection: () => void;
  onOpenCreate: (type: string) => void;
  onOpenEdit: (cost: UnifiedCost) => void;
  onOpenDuplicate: (cost: UnifiedCost) => void;
  onDelete: (id: string) => void;
  onDeleteGroup: (name: string) => void;
  onBulkDelete: () => void;
  onBulkMarkPaid: (ids: string[]) => void;
  onBulkMarkUnpaid: (ids: string[]) => void;
  onMarkPaid: (id: string) => void;
  onMarkUnpaid: (id: string) => void;
  onMarkOrderItemUnpaid: (cost: UnifiedCost) => void;
  onOpenTasks: (id: string) => void;
  bulkMarkPaidPending: boolean;
  bulkMarkUnpaidPending: boolean;
}

const CONFIGURABLE_COLUMNS = [
  { key: "origin", label: "Origine" },
  { key: "costType", label: "Tipo" },
  { key: "supplier", label: "Fornitore" },
  { key: "category", label: "Categoria" },
  { key: "amount", label: "Imponibile" },
  { key: "vatRate", label: "IVA" },
  { key: "gross", label: "Totale Lordo" },
  { key: "recurrence", label: "Ricorrenza" },
  { key: "dueDate", label: "Scadenza" },
  { key: "status", label: "Stato" },
  { key: "delay", label: "Ritardo" },
  { key: "order", label: "Ordine" },
] as const;

export function CostsTable({
  items,
  type,
  selectedIds,
  costNameCounts,
  onToggleSelect,
  onToggleSelectAll,
  onClearSelection,
  onOpenCreate,
  onOpenEdit,
  onOpenDuplicate,
  onDelete,
  onDeleteGroup,
  onBulkDelete,
  onBulkMarkPaid,
  onBulkMarkUnpaid,
  onMarkPaid,
  onMarkUnpaid,
  onMarkOrderItemUnpaid,
  onOpenTasks,
  bulkMarkPaidPending,
  bulkMarkUnpaidPending,
}: CostsTableProps) {
  const nowRef = useMemo(() => new Date(), []);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => new Set(CONFIGURABLE_COLUMNS.map(c => c.key)));

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isColVisible = (key: string) => visibleColumns.has(key);
  const soonRef = useMemo(() => addDays(new Date(), 7), []);

  const costAccessors = useMemo(() => ({
    name: (c: UnifiedCost) => c.name,
    origin: (c: UnifiedCost) => c.isFromOrder ? "Da Ordine" : "Manuale",
    costType: (c: UnifiedCost) => c.cost_type === "fixed" ? "Fisso" : "Variabile",
    supplier: (c: UnifiedCost) => (c as any).supplier?.name || c.supplierName || "",
    category: (c: UnifiedCost) => c.category || "",
    amount: (c: UnifiedCost) => c.amount,
    vatRate: (c: UnifiedCost) => Number(c.vat_rate) || Number((c as any).supplier?.vat_rate) || 0,
    recurrence: (c: UnifiedCost) => c.recurrence,
    dueDate: (c: UnifiedCost) => c.due_date ? new Date(c.due_date) : null,
    status: (c: UnifiedCost) => {
      if (c.is_paid) return "Pagato";
      const d = new Date(c.due_date);
      if (d < nowRef) return "Scaduto";
      if (d <= soonRef) return "In scadenza";
      if (c.recurrence !== "once" && d > soonRef) return "Previsto";
      return "Da pagare";
    },
    delay: (c: UnifiedCost) => {
      if (c.is_paid && c.paid_date && c.due_date) {
        return differenceInCalendarDays(new Date(c.paid_date), new Date(c.due_date));
      }
      if (!c.is_paid && c.due_date) {
        const d = new Date(c.due_date);
        if (d < nowRef) return differenceInCalendarDays(nowRef, d);
      }
      return 0;
    },
    order: (c: UnifiedCost) => c.order?.order_code || "",
  }), [nowRef, soonRef]);

  const costAccessorsWithGross = useMemo(() => ({
    ...costAccessors,
    gross: (c: UnifiedCost) => {
      const vr = Number(c.vat_rate) || Number((c as any).supplier?.vat_rate) || 0;
      return calculateGrossFromNet(c.amount, vr).grossAmount;
    },
  }), [costAccessors]);

  const { sortConfig: costSort, toggleSort: toggleCostSort, sortedItems } = useTableSort(items, costAccessorsWithGross);

  const {
    paginatedItems,
    currentPage,
    totalPages,
    pageSize,
    totalItems,
    setPage,
    setPageSize,
  } = usePagination(sortedItems);

  const footerTotals = useMemo(() => {
    let totalNet = 0, totalVat = 0, totalGross = 0;
    let unpaidNet = 0, unpaidGross = 0, paidNet = 0, paidGross = 0;
    items.forEach(c => {
      const vr = Number(c.vat_rate) || Number((c as any).supplier?.vat_rate) || 0;
      const { grossAmount, vatAmount } = calculateGrossFromNet(c.amount, vr);
      totalNet += c.amount;
      totalVat += vatAmount;
      totalGross += grossAmount;
      if (c.is_paid) { paidNet += c.amount; paidGross += grossAmount; }
      else { unpaidNet += c.amount; unpaidGross += grossAmount; }
    });
    return { totalNet, totalVat, totalGross, unpaidNet, unpaidGross, paidNet, paidGross };
  }, [items]);

  const selectableItems = paginatedItems.filter(c => !c.isFromOrder);
  const allSelectableIds = selectableItems.map(c => c.id);
  const allSelected = allSelectableIds.length > 0 && allSelectableIds.every(id => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  const getStatusBadge = (cost: UnifiedCost) => {
    const dueDate = cost.due_date ? new Date(cost.due_date) : null;

    if (cost.is_paid) {
      const paidLabel = cost.paid_date ? `Pagato il ${format(new Date(cost.paid_date), "dd/MM/yyyy", { locale: it })}` : "Pagato";
      return (
        <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 gap-1">
          <Check className="h-3 w-3" /> {paidLabel}
        </Badge>
      );
    }

    if (dueDate && dueDate < nowRef) {
      const days = differenceInCalendarDays(nowRef, dueDate);
      return (
        <Badge className="bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 gap-1">
          <AlertTriangle className="h-3 w-3" /> Scaduto {days}gg
        </Badge>
      );
    }

    if (dueDate && dueDate >= nowRef && dueDate <= soonRef) {
      const days = differenceInCalendarDays(dueDate, nowRef);
      return (
        <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300 dark:bg-yellow-900/30 dark:text-yellow-400 gap-1">
          <Clock className="h-3 w-3" /> In scadenza ({days}gg)
        </Badge>
      );
    }

    if (cost.recurrence !== "once" && dueDate && dueDate > soonRef) {
      return (
        <Badge className="bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-900/30 dark:text-sky-400 gap-1">
          <CircleDot className="h-3 w-3" /> Previsto
        </Badge>
      );
    }

    return (
      <Badge className="bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-900/30 dark:text-gray-400 gap-1">
        Da pagare
      </Badge>
    );
  };

  const getDelayCell = (cost: UnifiedCost) => {
    if (cost.is_paid && cost.paid_date && cost.due_date) {
      const delta = differenceInCalendarDays(new Date(cost.paid_date), new Date(cost.due_date));
      if (delta > 0) return <span className="text-red-600 font-medium text-xs">+{delta}gg</span>;
      if (delta < 0) return <span className="text-green-600 font-medium text-xs">{delta}gg</span>;
      return <span className="text-muted-foreground text-xs">0gg</span>;
    }
    if (!cost.is_paid && cost.due_date) {
      const d = new Date(cost.due_date);
      if (d < nowRef) {
        const days = differenceInCalendarDays(nowRef, d);
        return <span className="text-red-600 font-semibold text-xs">+{days}gg</span>;
      }
    }
    return <span className="text-muted-foreground text-xs">—</span>;
  };

  // Count visible columns for footer colSpan
  const hasOrderCol = (type === "variable" || type === "all") && isColVisible("order");
  const footerLeadingCols = 2 + // checkbox + name (always visible)
    (isColVisible("origin") ? 1 : 0) +
    (type === "all" && isColVisible("costType") ? 1 : 0) +
    (isColVisible("supplier") ? 1 : 0) +
    (isColVisible("category") ? 1 : 0);
  
  const footerTrailingCols = 
    (isColVisible("recurrence") ? 1 : 0) +
    (isColVisible("dueDate") ? 1 : 0) +
    (isColVisible("status") ? 1 : 0) +
    (isColVisible("delay") ? 1 : 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        {type !== "all" && (
          <Button size="sm" onClick={() => onOpenCreate(type === "variable" ? "variable" : "fixed")} className="gap-1">
            <Plus className="h-4 w-4" />
            Aggiungi {type === "fixed" ? "Costo Fisso" : "Costo Variabile"}
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1">
              <Settings2 className="h-4 w-4" />
              Colonne
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Colonne visibili</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {CONFIGURABLE_COLUMNS
              .filter(col => col.key !== "costType" || type === "all")
              .filter(col => col.key !== "order" || type === "variable" || type === "all")
              .map(col => (
                <DropdownMenuCheckboxItem
                  key={col.key}
                  checked={isColVisible(col.key)}
                  onCheckedChange={() => toggleColumn(col.key)}
                  onSelect={(e) => e.preventDefault()}
                >
                  {col.label}
                </DropdownMenuCheckboxItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {someSelected && (
        <div className="flex items-center gap-2 flex-wrap p-3 rounded-lg bg-muted border">
          <span className="text-sm font-medium">{selectedIds.size} costi selezionati</span>
          <div className="flex items-center gap-1.5 ml-auto">
            <Button
              size="sm" variant="outline"
              className="gap-1 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400 dark:hover:bg-green-900/20"
              onClick={() => onBulkMarkPaid(Array.from(selectedIds))}
              disabled={bulkMarkPaidPending}
            >
              <Check className="h-3.5 w-3.5" /> Segna pagati
            </Button>
            <Button
              size="sm" variant="outline"
              className="gap-1 border-orange-300 text-orange-700 hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/20"
              onClick={() => onBulkMarkUnpaid(Array.from(selectedIds))}
              disabled={bulkMarkUnpaidPending}
            >
              <Undo2 className="h-3.5 w-3.5" /> Segna non pagati
            </Button>
            <Button size="sm" variant="destructive" className="gap-1" onClick={onBulkDelete}>
              <Trash2 className="h-3.5 w-3.5" /> Elimina
            </Button>
            <Button size="sm" variant="ghost" className="gap-1" onClick={onClearSelection}>
              <X className="h-3.5 w-3.5" /> Deseleziona
            </Button>
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Receipt className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="mb-3">Nessun costo trovato</p>
          {type !== "all" && (
            <Button size="sm" variant="outline" onClick={() => onOpenCreate(type === "variable" ? "variable" : "fixed")} className="gap-1">
              <Plus className="h-4 w-4" />
              Aggiungi il primo costo
            </Button>
          )}
        </div>
      ) : (
        <>
        <div className="rounded-md border overflow-hidden">
          <Table className="table-fixed">
              <TableHeader>
              <TableRow>
                <TableHead className="w-[3%]">
                  <Checkbox checked={allSelected} onCheckedChange={() => onToggleSelectAll(allSelectableIds)} aria-label="Seleziona tutti" />
                </TableHead>
                <SortableTableHead column="name" label="Nome" sortConfig={costSort} onSort={toggleCostSort} className="w-[13%]" />
                {isColVisible("origin") && <SortableTableHead column="origin" label="Origine" sortConfig={costSort} onSort={toggleCostSort} className="w-[6%]" />}
                {type === "all" && isColVisible("costType") && <SortableTableHead column="costType" label="Tipo" sortConfig={costSort} onSort={toggleCostSort} className="w-[6%]" />}
                {isColVisible("supplier") && <SortableTableHead column="supplier" label="Fornitore" sortConfig={costSort} onSort={toggleCostSort} className="w-[9%]" />}
                {isColVisible("category") && <SortableTableHead column="category" label="Categoria" sortConfig={costSort} onSort={toggleCostSort} className="w-[7%]" />}
                {isColVisible("amount") && <SortableTableHead column="amount" label="Imponibile" sortConfig={costSort} onSort={toggleCostSort} className="text-right w-[8%]" />}
                {isColVisible("vatRate") && <SortableTableHead column="vatRate" label="IVA" sortConfig={costSort} onSort={toggleCostSort} className="w-[5%]" />}
                {isColVisible("gross") && <SortableTableHead column="gross" label="Totale Lordo" sortConfig={costSort} onSort={toggleCostSort} className="text-right w-[8%]" />}
                {isColVisible("recurrence") && <SortableTableHead column="recurrence" label="Ricorrenza" sortConfig={costSort} onSort={toggleCostSort} className="w-[7%]" />}
                {isColVisible("dueDate") && <SortableTableHead column="dueDate" label="Scadenza" sortConfig={costSort} onSort={toggleCostSort} className="w-[8%]" />}
                {isColVisible("status") && <SortableTableHead column="status" label="Stato" sortConfig={costSort} onSort={toggleCostSort} className="w-[8%]" />}
                {isColVisible("delay") && <SortableTableHead column="delay" label="Ritardo" sortConfig={costSort} onSort={toggleCostSort} className="w-[5%]" />}
                {hasOrderCol && <SortableTableHead column="order" label="Ordine" sortConfig={costSort} onSort={toggleCostSort} className="w-[7%]" />}
                <TableHead className="text-right w-[6%]">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.map((cost) => {
                const vatRate = Number(cost.vat_rate) || Number((cost as any).supplier?.vat_rate) || 0;
                const { grossAmount, vatAmount } = calculateGrossFromNet(cost.amount, vatRate);
                const isSelected = selectedIds.has(cost.id);
                const dueDate = cost.due_date ? new Date(cost.due_date) : null;
                const isOverdue = !cost.is_paid && dueDate && dueDate < nowRef;
                const isExpiring = !cost.is_paid && dueDate && dueDate >= nowRef && dueDate <= soonRef;
                return (
                  <TableRow key={cost.id} className={`${isOverdue ? "bg-red-50/60 dark:bg-red-900/10" : isExpiring ? "bg-orange-50/60 dark:bg-orange-900/10" : cost.isFromOrder ? "bg-orange-50/30 dark:bg-orange-900/5" : ""} ${isSelected ? "bg-muted/50" : ""}`}>
                    <TableCell>
                      {!cost.isFromOrder ? (
                        <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect(cost.id)} aria-label={`Seleziona ${cost.name}`} />
                      ) : (
                        <span className="block w-4" />
                      )}
                    </TableCell>
                    <TableCell className="font-medium truncate">{cost.name}</TableCell>
                    <TableCell>
                      {cost.isFromOrder ? (
                        <Badge className="bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 gap-1 text-[10px] px-1.5">
                          <Package className="h-3 w-3" /> Da Ordine
                        </Badge>
                      ) : (
                        <Badge className="bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 gap-1 text-[10px] px-1.5">
                          <Pencil className="h-3 w-3" /> Manuale
                        </Badge>
                      )}
                    </TableCell>
                    {type === "all" && (
                      <TableCell>
                        <Badge variant="outline" className={cost.cost_type === "fixed" ? "border-red-400 text-red-600" : "border-amber-400 text-amber-600"}>
                          {cost.cost_type === "fixed" ? "Fisso" : "Variabile"}
                        </Badge>
                      </TableCell>
                    )}
                    <TableCell className="truncate">
                      {(cost as any).supplier?.name || cost.supplierName || (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="truncate">
                      {cost.category ? (
                        <Badge variant="outline" className={cn("text-[10px] px-1.5", getCategoryColor(cost.category))}>
                          {cost.category}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="font-medium cursor-help">{formatCurrency(cost.amount)}</span>
                        </TooltipTrigger>
                        {vatRate > 0 && (
                          <TooltipContent>
                            <div className="text-xs space-y-0.5">
                              <p>Imponibile: {formatCurrency(cost.amount)}</p>
                              <p>IVA ({vatRate}%): {formatCurrency(vatAmount)}</p>
                              <Separator className="my-1" />
                              <p className="font-semibold">Totale: {formatCurrency(grossAmount)}</p>
                            </div>
                          </TooltipContent>
                        )}
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      {vatRate > 0 ? (
                        <Badge variant="outline" className="text-xs border-violet-300 text-violet-600 dark:text-violet-400">
                          {vatRate}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">Esente</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {formatCurrency(grossAmount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] px-1.5">
                        <Repeat className="h-3 w-3 mr-1" />
                        {RECURRENCE_LABELS[cost.recurrence] || cost.recurrence}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {cost.due_date ? format(new Date(cost.due_date), "dd/MM/yyyy", { locale: it }) : "—"}
                    </TableCell>
                    <TableCell>{getStatusBadge(cost)}</TableCell>
                    <TableCell>{getDelayCell(cost)}</TableCell>
                    {hasOrderCol && (
                      <TableCell>
                        {cost.order ? (
                          <Link to={`/azienda/ordini/${cost.order.id}`} className="text-primary hover:underline text-sm flex items-center gap-1">
                            {cost.order.order_code || "Ordine"}
                            <ExternalLink className="h-3 w-3" />
                          </Link>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {!cost.isFromOrder && (
                          <>
                            {!cost.is_paid ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMarkPaid(cost.id)}>
                                    <CheckSquare className="h-3.5 w-3.5 text-green-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Segna come pagato</TooltipContent>
                              </Tooltip>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMarkUnpaid(cost.id)}>
                                    <Undo2 className="h-3.5 w-3.5 text-orange-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Riporta a non pagato</TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenTasks(cost.id)}>
                                  <AlertCircle className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Task collegate</TooltipContent>
                            </Tooltip>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenEdit(cost)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7">
                                  <MoreHorizontal className="h-3.5 w-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => onOpenDuplicate(cost)}>
                                  <Copy className="h-4 w-4 mr-2" /> Duplica (+1 mese)
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(cost.id)}>
                                  <Trash2 className="h-4 w-4 mr-2" /> Elimina
                                </DropdownMenuItem>
                                {(costNameCounts.get(cost.name) || 0) > 1 && (
                                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDeleteGroup(cost.name)}>
                                    <Trash2 className="h-4 w-4 mr-2" /> Elimina tutti "{cost.name}" ({costNameCounts.get(cost.name)})
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </>
                        )}
                        {cost.isFromOrder && (
                          <>
                            {!cost.is_paid ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMarkPaid(cost.id)}>
                                    <CheckSquare className="h-3.5 w-3.5 text-green-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Segna come pagato</TooltipContent>
                              </Tooltip>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMarkOrderItemUnpaid(cost)}>
                                    <Undo2 className="h-3.5 w-3.5 text-orange-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Riporta a non pagato</TooltipContent>
                              </Tooltip>
                            )}
                            {cost.order && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                                    <Link to={`/azienda/ordini/${cost.order.id}`}>
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </Link>
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Vai all'ordine</TooltipContent>
                              </Tooltip>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            {items.length > 0 && (
              <TableFooter>
              <TableRow className="bg-muted/50 font-semibold">
                  <TableCell colSpan={baseColCount}>
                    Totale ({items.length})
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(footerTotals.totalNet)}</TableCell>
                  <TableCell className="text-right tabular-nums text-xs text-violet-600 dark:text-violet-400">{formatCurrency(footerTotals.totalVat)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatCurrency(footerTotals.totalGross)}</TableCell>
                  <TableCell colSpan={3}>
                    <div className="flex flex-col gap-0.5 text-xs">
                      <span className="text-red-600">Da pagare: {formatCurrency(footerTotals.unpaidGross)}</span>
                      <span className="text-green-600">Pagato: {formatCurrency(footerTotals.paidGross)}</span>
                    </div>
                  </TableCell>
                  <TableCell colSpan={hasOrderCol ? 2 : 1} />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
        <TablePagination
          currentPage={currentPage}
          totalPages={totalPages}
          pageSize={pageSize}
          totalItems={totalItems}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
        </>
      )}
    </div>
  );
}
