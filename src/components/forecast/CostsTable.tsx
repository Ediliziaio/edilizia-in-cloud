import { useMemo, useState } from "react";
import { format, addDays, differenceInCalendarDays, parseISO, startOfDay, endOfDay } from "date-fns";
import { usePagination } from "@/hooks/usePagination";
import { TablePagination } from "@/components/ui/table-pagination";
import { it } from "date-fns/locale";
import { Link } from "react-router-dom";
import {
  Plus, Check, Pencil, Trash2, Receipt, Repeat,
  Package, ExternalLink, Undo2, CheckSquare,
  MoreHorizontal, X, Copy, AlertCircle, AlertTriangle,
  Clock, CircleDot, Settings2, ChevronLeft, ChevronRight,
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
import { COST_ID_PREFIX, RECURRENCE_LABELS } from "@/lib/forecastTypes";
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

function parseCostDate(value?: string | null): Date | null {
  if (!value || value === "9999-12-31") return null;
  const parsed = parseISO(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getCategoryColor(category: string): string {
  const key = category.toLowerCase();
  return CATEGORY_COLORS[key] || "border-muted-foreground/40 text-muted-foreground";
}

interface CostsTableProps {
  /** Stato reale dell'uscita per id, dalla vista v_uscite_stato: conosce i
      termini ("60 gg fine mese") che la sola due_date non racconta. */
  statoUscitaById?: Map<string, { data_pagamento: string | null; giorni: number | null; stato: string }>;
  /** Contenuto a sinistra della riga strumenti (i chip di stato): cosi'
      filtri e menu Colonne condividono UNA riga invece di due. */
  leftSlot?: React.ReactNode;
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
  /** Chi vede i costi ma non è amministratore: solo lettura. Il database per
   *  lo staff accetta solo la lettura dei costi (decisione sulla finanza):
   *  senza questo, i pulsanti c'erano e il salvataggio veniva rifiutato. */
  soloLettura?: boolean;
}

const CONFIGURABLE_COLUMNS = [
  { key: "origin", label: "Origine" },
  { key: "costType", label: "Tipo" },
  { key: "supplier", label: "Fornitore" },
  { key: "category", label: "Categoria" },
  { key: "amount", label: "Imponibile" },
  { key: "vatRate", label: "IVA" },
  { key: "gross", label: "Totale" },
  { key: "recurrence", label: "Ricorrenza" },
  { key: "dueDate", label: "Scadenza" },
  { key: "status", label: "Stato" },
  { key: "delay", label: "Ritardo" },
  { key: "order", label: "Ordine" },
] as const;

// Colonne accese di default: le sei che servono per decidere. Il resto
// (imponibile, IVA, origine, tipo, categoria, ricorrenza, ritardo) resta
// disponibile dal menu Colonne — l'essenziale sta già nel nome (categoria e
// origine come sottoriga), nel tooltip del totale e nel badge di stato.
const DEFAULT_VISIBLE_COLUMNS = new Set(["supplier", "gross", "dueDate", "status", "order"]);

export function CostsTable({
  statoUscitaById,
  items,
  type,
  selectedIds,
  costNameCounts,
  onToggleSelect,
  onToggleSelectAll,
  leftSlot,
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
  soloLettura = false,
  bulkMarkPaidPending,
  bulkMarkUnpaidPending,
}: CostsTableProps) {
  const todayRef = useMemo(() => startOfDay(new Date()), []);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(() => new Set(DEFAULT_VISIBLE_COLUMNS));

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isColVisible = (key: string) => visibleColumns.has(key);
  const soonRef = useMemo(() => endOfDay(addDays(todayRef, 7)), [todayRef]);

  const costAccessors = useMemo(() => ({
    name: (c: UnifiedCost) => c.name,
    origin: (c: UnifiedCost) => c.isFromOrder ? "Da modulo" : "Manuale",
    costType: (c: UnifiedCost) => c.cost_type === "fixed" ? "Fisso" : "Variabile",
    supplier: (c: UnifiedCost) => (c as any).supplier?.name || c.supplierName || "",
    category: (c: UnifiedCost) => c.category || "",
    amount: (c: UnifiedCost) => c.amount,
    vatRate: (c: UnifiedCost) => Number(c.vat_rate) || Number((c as any).supplier?.vat_rate) || 0,
    recurrence: (c: UnifiedCost) => c.recurrence,
    dueDate: (c: UnifiedCost) => parseCostDate(c.due_date),
    status: (c: UnifiedCost) => {
      if (c.is_paid) return "Pagato";
      const d = parseCostDate(c.due_date);
      if (!d) return "Da pianificare";
      if (d < todayRef) return "Scaduto";
      if (d <= soonRef) return "In scadenza";
      if (c.recurrence !== "once" && d > soonRef) return "Previsto";
      return "Da pagare";
    },
    delay: (c: UnifiedCost) => {
      if (c.is_paid && c.paid_date) {
        const dueDate = parseCostDate(c.due_date);
        if (dueDate) return differenceInCalendarDays(parseISO(c.paid_date), dueDate);
      }
      if (!c.is_paid && c.due_date) {
        const d = parseCostDate(c.due_date);
        if (d && d < todayRef) return differenceInCalendarDays(todayRef, d);
      }
      return 0;
    },
    order: (c: UnifiedCost) => c.order?.order_code || "",
  }), [todayRef, soonRef]);

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
      // `??` e non `||`: aliquota 0 esplicita = esente, non "manca il dato".
      const vr = Number(c.vat_rate ?? (c as any).supplier?.vat_rate ?? 0) || 0;
      const { grossAmount, vatAmount } = calculateGrossFromNet(c.amount, vr);
      totalNet += c.amount;
      totalVat += vatAmount;
      totalGross += grossAmount;
      if (c.is_paid) { paidNet += c.amount; paidGross += grossAmount; }
      else { unpaidNet += c.amount; unpaidGross += grossAmount; }
    });
    return { totalNet, totalVat, totalGross, unpaidNet, unpaidGross, paidNet, paidGross };
  }, [items]);

  const selectableItems = soloLettura ? [] : paginatedItems.filter(c => !c.isFromOrder);
  const allSelectableIds = selectableItems.map(c => c.id);
  const allSelected = allSelectableIds.length > 0 && allSelectableIds.every(id => selectedIds.has(id));
  const someSelected = selectedIds.size > 0;

  const getStatusBadge = (cost: UnifiedCost) => {
    const dueDate = parseCostDate(cost.due_date);
    const uscita = statoUscitaById?.get(cost.id);

    if (cost.is_paid) {
      const paidLabel = cost.paid_date ? `Pagato il ${format(parseISO(cost.paid_date), "dd/MM/yyyy", { locale: it })}` : "Pagato";
      return (
        <div className="flex items-center gap-1 flex-wrap">
          <Badge className="bg-green-100 text-green-700 border-green-300 dark:bg-green-900/30 dark:text-green-400 gap-1">
            <Check className="h-3 w-3" /> {paidLabel}
          </Badge>
          {(cost as any).payment_method && (
            <span className="text-xs text-muted-foreground">({(cost as any).payment_method})</span>
          )}
        </div>
      );
    }

    // Preavviso: i soldi stanno per uscire e c'è ancora tempo per
    // organizzarsi. Vale anche quando la data la calcola il termine.
    if (uscita?.stato === "preavviso") {
      const g = uscita.giorni;
      return (
        <Badge className="gap-1 border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-900 dark:bg-amber-900/30 dark:text-amber-300">
          <AlertTriangle className="h-3 w-3" />
          {g === null ? "In uscita a breve" : g <= 1 ? "Esce domani" : `Esce tra ${g}gg`}
        </Badge>
      );
    }
    if (uscita?.stato === "scaduta" && uscita.giorni !== null && !dueDate) {
      return (
        <Badge className="gap-1 border-red-300 bg-red-100 text-red-700 dark:border-red-900 dark:bg-red-900/30 dark:text-red-400">
          <AlertTriangle className="h-3 w-3" /> Scaduto {Math.abs(uscita.giorni)}gg
        </Badge>
      );
    }

    if (dueDate && dueDate < todayRef) {
      const days = differenceInCalendarDays(todayRef, dueDate);
      return (
        <Badge className="bg-red-100 text-red-700 border-red-300 dark:bg-red-900/30 dark:text-red-400 gap-1">
          <AlertTriangle className="h-3 w-3" /> Scaduto {days}gg
        </Badge>
      );
    }

    if (dueDate && dueDate >= todayRef && dueDate <= soonRef) {
      const days = differenceInCalendarDays(dueDate, todayRef);
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
    if (cost.is_paid && cost.paid_date) {
      const dueDate = parseCostDate(cost.due_date);
      if (!dueDate) return <span className="text-muted-foreground text-xs">—</span>;
      const delta = differenceInCalendarDays(parseISO(cost.paid_date), dueDate);
      if (delta > 0) return <span className="text-red-600 font-medium text-xs">+{delta}gg</span>;
      if (delta < 0) return <span className="text-green-600 font-medium text-xs">{delta}gg</span>;
      return <span className="text-muted-foreground text-xs">0gg</span>;
    }
    if (!cost.is_paid) {
      const d = parseCostDate(cost.due_date);
      if (d && d < todayRef) {
        const days = differenceInCalendarDays(todayRef, d);
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
      {/* "Aggiungi Costo Fisso" rimosso: doppiava "Nuovo Costo" nella toolbar
          a pochi centimetri. La CTA contestuale resta solo a lista vuota. */}
      {/* Mobile no: lo stato sta nel pannello dei filtri, le colonne non ci sono. */}
      <div className="flex flex-wrap items-center justify-between gap-2 max-sm:hidden">
        <div className="min-w-0 flex-1">{leftSlot}</div>
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
        <div className="flex items-center gap-2 flex-wrap p-3 rounded-lg bg-muted border max-sm:hidden">
          <span className="text-sm font-medium">
            {selectedIds.size} costi selezionati
            <span className="ml-1.5 tabular-nums text-muted-foreground">
              · {formatCurrency(items
                .filter((c) => selectedIds.has(c.id))
                .reduce((sum, c) => {
                  const rate = Number((c as any).vat_rate ?? (c as any).supplier?.vat_rate ?? 0) || 0;
                  return sum + calculateGrossFromNet(Number(c.amount) || 0, rate).grossAmount;
                }, 0))} lordi
            </span>
          </span>
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
        // Mobile: una riga di testo (il «+» è accanto alla ricerca).
        <div className="text-center py-12 text-muted-foreground max-sm:py-3 max-sm:text-xs">
          <Receipt className="h-10 w-10 mx-auto mb-3 opacity-40 max-sm:hidden" />
          <p className="mb-3 max-sm:mb-0">Nessun costo trovato</p>
          {type !== "all" && !soloLettura && (
            <Button size="sm" variant="outline" onClick={() => onOpenCreate(type === "variable" ? "variable" : "fixed")} className="gap-1 max-sm:hidden">
              <Plus className="h-4 w-4" />
              Aggiungi il primo costo
            </Button>
          )}
        </div>
      ) : (
        <>
        {/* MOBILE: una riga da ~52px per costo (nome; categoria, fornitore e
            scadenza; lordo e «Paga» o lo stato). Si tocca per modificarlo.
            Prima: una scheda con badge, data e tre bottoni per ogni costo. */}
        <div className="divide-y divide-border overflow-hidden rounded-lg border bg-card sm:hidden">
          {paginatedItems.map((cost) => {
            const vatRate = Number(cost.vat_rate ?? (cost as any).supplier?.vat_rate ?? 0) || 0;
            const grossM = calculateGrossFromNet(Number(cost.amount) || 0, vatRate).grossAmount;
            const dueM = parseCostDate(cost.due_date);
            const ritardo = !cost.is_paid && dueM && dueM < todayRef ? differenceInCalendarDays(todayRef, dueM) : null;
            const modificabile = !cost.isFromOrder && !soloLettura;
            const payable = modificabile && !cost.is_paid && !cost.id.startsWith(COST_ID_PREFIX.EMPLOYEE_SALARY);
            return (
              <div
                key={cost.id}
                role={modificabile ? "button" : undefined}
                tabIndex={modificabile ? 0 : undefined}
                onClick={modificabile ? () => onOpenEdit(cost) : undefined}
                className={cn("flex items-center gap-2.5 px-3 py-2.5", modificabile && "cursor-pointer active:bg-muted", ritardo && "bg-red-50/60")}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold leading-tight">{cost.name}</p>
                  <p className="mt-0.5 truncate text-[11px] leading-tight text-muted-foreground">
                    {[
                      cost.category || (cost.cost_type === "fixed" ? "Fisso" : "Variabile"),
                      (cost as any).supplier?.name || cost.supplierName,
                      dueM && cost.due_date !== "9999-12-31" ? format(dueM, "dd/MM") : null,
                    ].filter(Boolean).join(" · ")}
                    {ritardo ? <span className="font-medium text-red-600"> · da {ritardo} gg</span> : null}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[13px] font-semibold leading-tight tabular-nums">{formatCurrency(grossM)}</p>
                  {cost.is_paid ? (
                    <p className="mt-0.5 text-[11px] leading-tight text-emerald-700">Pagato</p>
                  ) : payable ? (
                    <button
                      type="button"
                      className="tap-compact mt-0.5 text-[11px] font-medium leading-tight text-primary"
                      onClick={(e) => { e.stopPropagation(); onMarkPaid(cost.id); }}
                    >
                      Paga
                    </button>
                  ) : (
                    <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">Da pagare</p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="hidden rounded-md border overflow-x-auto sm:block">
          {/* min-w: con table-fixed + w-full la tabella si comprimeva alla larghezza dello
              schermo (a 375px colonne da 11-30px illeggibili) invece di scrollare in orizzontale */}
          <Table className="min-w-[900px] table-fixed [&_td]:py-2.5 [&_th]:h-9">
              <TableHeader>
              <TableRow>
                <TableHead className="w-[3%]">
                  {!soloLettura && (
                    <Checkbox checked={allSelected} onCheckedChange={() => onToggleSelectAll(allSelectableIds)} aria-label="Seleziona tutti" />
                  )}
                </TableHead>
                <SortableTableHead column="name" label="Costo" sortConfig={costSort} onSort={toggleCostSort} className="w-[26%]" />
                {isColVisible("origin") && <SortableTableHead column="origin" label="Origine" sortConfig={costSort} onSort={toggleCostSort} className="w-[6%]" />}
                {type === "all" && isColVisible("costType") && <SortableTableHead column="costType" label="Tipo" sortConfig={costSort} onSort={toggleCostSort} className="w-[6%]" />}
                {isColVisible("supplier") && <SortableTableHead column="supplier" label="Fornitore" sortConfig={costSort} onSort={toggleCostSort} className="w-[14%]" />}
                {isColVisible("category") && <SortableTableHead column="category" label="Categoria" sortConfig={costSort} onSort={toggleCostSort} className="w-[7%]" />}
                {isColVisible("amount") && <SortableTableHead column="amount" label="Imponibile" sortConfig={costSort} onSort={toggleCostSort} className="text-right w-[8%]" />}
                {isColVisible("vatRate") && <SortableTableHead column="vatRate" label="IVA" sortConfig={costSort} onSort={toggleCostSort} className="w-[5%]" />}
                {isColVisible("gross") && <SortableTableHead column="gross" label="Totale" sortConfig={costSort} onSort={toggleCostSort} className="text-right w-[11%]" />}
                {isColVisible("recurrence") && <SortableTableHead column="recurrence" label="Ricorrenza" sortConfig={costSort} onSort={toggleCostSort} className="w-[7%]" />}
                {isColVisible("dueDate") && <SortableTableHead column="dueDate" label="Scadenza" sortConfig={costSort} onSort={toggleCostSort} className="w-[11%]" />}
                {isColVisible("status") && <SortableTableHead column="status" label="Stato" sortConfig={costSort} onSort={toggleCostSort} className="w-[14%]" />}
                {isColVisible("delay") && <SortableTableHead column="delay" label="Ritardo" sortConfig={costSort} onSort={toggleCostSort} className="w-[5%]" />}
                {hasOrderCol && <SortableTableHead column="order" label="Ordine" sortConfig={costSort} onSort={toggleCostSort} className="w-[10%]" />}
                <TableHead className="text-right w-[11%]">Azioni</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedItems.map((cost) => {
                const vatRate = Number(cost.vat_rate ?? (cost as any).supplier?.vat_rate ?? 0) || 0;
                // Riga stipendio sintetica: niente azioni di pagamento (non
                // esiste nel DB; risulta pagata da sola a mese chiuso).
                const isSalaryRow = cost.id.startsWith(COST_ID_PREFIX.EMPLOYEE_SALARY);
                const { grossAmount, vatAmount } = calculateGrossFromNet(cost.amount, vatRate);
                const isSelected = selectedIds.has(cost.id);
                const dueDate = parseCostDate(cost.due_date);
                const isOverdue = !cost.is_paid && dueDate && dueDate < todayRef;
                const isExpiring = !cost.is_paid && dueDate && dueDate >= todayRef && dueDate <= soonRef;
                return (
                  <TableRow key={cost.id} className={`${isOverdue ? "bg-red-50/60 dark:bg-red-900/10" : isExpiring ? "bg-orange-50/60 dark:bg-orange-900/10" : cost.isFromOrder ? "bg-orange-50/30 dark:bg-orange-900/5" : ""} ${isSelected ? "bg-muted/50" : ""}`}>
                    <TableCell>
                      {!cost.isFromOrder && !soloLettura ? (
                        <Checkbox checked={isSelected} onCheckedChange={() => onToggleSelect(cost.id)} aria-label={`Seleziona ${cost.name}`} />
                      ) : (
                        <span className="block w-4" />
                      )}
                    </TableCell>
                    <TableCell title={cost.name}>
                      <p className="truncate font-medium">{cost.name}</p>
                      {/* Categoria e origine vivono qui sotto: così le colonne
                          dedicate possono restare spente senza perdere nulla. */}
                      <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                        {cost.isFromOrder && <Package className="h-3 w-3 shrink-0 text-orange-500" aria-label="Dal modulo ordini" />}
                        {cost.category || (cost.cost_type === "fixed" ? "Fisso" : "Variabile")}
                      </p>
                    </TableCell>
                    {isColVisible("origin") && (
                    <TableCell>
                      {cost.isFromOrder ? (
                        <Badge className="bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-900/30 dark:text-orange-400 gap-1 text-[10px] px-1.5">
                          <Package className="h-3 w-3" /> Da modulo
                        </Badge>
                      ) : (
                        <Badge className="bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 gap-1 text-[10px] px-1.5">
                          <Pencil className="h-3 w-3" /> Manuale
                        </Badge>
                      )}
                    </TableCell>
                    )}
                    {type === "all" && isColVisible("costType") && (
                      <TableCell>
                        <Badge variant="outline" className={cost.cost_type === "fixed" ? "border-red-400 text-red-600" : "border-amber-400 text-amber-600"}>
                          {cost.cost_type === "fixed" ? "Fisso" : "Variabile"}
                        </Badge>
                      </TableCell>
                    )}
                    {isColVisible("supplier") && (
                    <TableCell className="truncate" title={(cost as any).supplier?.name || cost.supplierName || ''}>
                      {(cost as any).supplier?.name || cost.supplierName || (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    )}
                    {isColVisible("category") && (
                    <TableCell className="truncate" title={cost.category || ''}>
                      {cost.category ? (
                        <Badge variant="outline" className={cn("text-[10px] px-1.5", getCategoryColor(cost.category))}>
                          {cost.category}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">—</span>
                      )}
                    </TableCell>
                    )}
                    {isColVisible("amount") && (
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
                    )}
                    {isColVisible("vatRate") && (
                    <TableCell>
                      {vatRate > 0 ? (
                        <Badge variant="outline" className="text-xs border-violet-300 text-violet-600 dark:text-violet-400">
                          {vatRate}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">Esente</span>
                      )}
                    </TableCell>
                    )}
                    {isColVisible("gross") && (
                    <TableCell className="text-right tabular-nums font-medium">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="cursor-help">{formatCurrency(grossAmount)}</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <div className="text-xs space-y-0.5">
                            <p>Imponibile: {formatCurrency(cost.amount)}</p>
                            <p>IVA {vatRate > 0 ? `(${vatRate}%)` : "esente"}: {formatCurrency(vatAmount)}</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    )}
                    {isColVisible("recurrence") && (
                    <TableCell>
                      <Badge variant="outline" className="text-[10px] px-1.5">
                        <Repeat className="h-3 w-3 mr-1" />
                        {RECURRENCE_LABELS[cost.recurrence] || cost.recurrence}
                      </Badge>
                    </TableCell>
                    )}
                    {isColVisible("dueDate") && (
                    <TableCell>
                      <span className="inline-flex items-center gap-1">
                        {dueDate ? format(dueDate, "dd/MM/yyyy", { locale: it }) : "—"}
                        {cost.recurrence !== "once" && (
                          <Repeat
                            className="h-3 w-3 text-muted-foreground"
                            aria-label={RECURRENCE_LABELS[cost.recurrence] || cost.recurrence}
                          />
                        )}
                      </span>
                    </TableCell>
                    )}
                    {isColVisible("status") && <TableCell>{getStatusBadge(cost)}</TableCell>}
                    {isColVisible("delay") && <TableCell>{getDelayCell(cost)}</TableCell>}
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
                        {!cost.isFromOrder && !soloLettura && (
                          <>
                            {!cost.is_paid ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMarkPaid(cost.id)} aria-label="Segna come pagato">
                                    <CheckSquare className="h-3.5 w-3.5 text-green-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Segna come pagato</TooltipContent>
                              </Tooltip>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMarkUnpaid(cost.id)} aria-label="Riporta a non pagato">
                                    <Undo2 className="h-3.5 w-3.5 text-orange-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Riporta a non pagato</TooltipContent>
                              </Tooltip>
                            )}
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenTasks(cost.id)} aria-label="Task collegate">
                                  <AlertCircle className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Task collegate</TooltipContent>
                            </Tooltip>
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenEdit(cost)} aria-label="Modifica costo">
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Altre azioni">
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
                            {isSalaryRow ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="inline-flex h-7 w-7 items-center justify-center text-slate-300" aria-label="Stipendio dal contratto">
                                    <CheckSquare className="h-3.5 w-3.5" />
                                  </span>
                                </TooltipTrigger>
                                <TooltipContent>Calcolato dal contratto: risulta pagato da solo a mese chiuso</TooltipContent>
                              </Tooltip>
                            ) : soloLettura ? null : !cost.is_paid ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMarkPaid(cost.id)} aria-label="Segna come pagato">
                                    <CheckSquare className="h-3.5 w-3.5 text-green-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Segna come pagato</TooltipContent>
                              </Tooltip>
                            ) : (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onMarkOrderItemUnpaid(cost)} aria-label="Riporta a non pagato">
                                    <Undo2 className="h-3.5 w-3.5 text-orange-600" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Riporta a non pagato</TooltipContent>
                              </Tooltip>
                            )}
                            {cost.order && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-7 w-7" asChild aria-label="Vai all'ordine collegato">
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
                  <TableCell colSpan={footerLeadingCols}>
                    Totale ({items.length})
                  </TableCell>
                  {isColVisible("amount") && <TableCell className="text-right tabular-nums">{formatCurrency(footerTotals.totalNet)}</TableCell>}
                  {isColVisible("vatRate") && <TableCell className="text-right tabular-nums text-xs text-violet-600 dark:text-violet-400">{formatCurrency(footerTotals.totalVat)}</TableCell>}
                  {isColVisible("gross") && <TableCell className="text-right tabular-nums">{formatCurrency(footerTotals.totalGross)}</TableCell>}
                  {footerTrailingCols > 0 && (
                    <TableCell colSpan={footerTrailingCols}>
                      <div className="flex flex-col gap-0.5 text-xs">
                        <span className="text-red-600">Da pagare: {formatCurrency(footerTotals.unpaidGross)}</span>
                        <span className="text-green-600">Pagato: {formatCurrency(footerTotals.paidGross)}</span>
                      </div>
                    </TableCell>
                  )}
                  <TableCell colSpan={hasOrderCol ? 2 : 1} />
                </TableRow>
              </TableFooter>
            )}
          </Table>
        </div>
        {/* Mobile: solo precedente/successiva. Il contenitore c'è solo quando la
            paginazione compare (niente margine vuoto sul desktop). */}
        {totalItems > 25 && (
          <div className="max-sm:hidden">
            <TablePagination
              currentPage={currentPage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={totalItems}
              onPageChange={setPage}
              onPageSizeChange={setPageSize}
            />
          </div>
        )}
        {totalPages > 1 && (
          <div className="flex items-center justify-between sm:hidden">
            <Button variant="outline" size="icon" className="tap-compact h-8 w-8" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} aria-label="Pagina precedente">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">{currentPage} di {totalPages}</span>
            <Button variant="outline" size="icon" className="tap-compact h-8 w-8" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} aria-label="Pagina successiva">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        )}
        </>
      )}
    </div>
  );
}
