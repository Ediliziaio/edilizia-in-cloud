import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, X, SlidersHorizontal, RotateCcw, Search } from "lucide-react";
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, addDays } from "date-fns";
import { it } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export interface OrdersFilterState {
  // Data
  dateFrom: string;
  dateTo: string;
  createdFrom: string;
  createdTo: string;
  // Search
  orderSearch: string;
  // Stati
  includeStatuses: string[];
  excludeStatuses: string[];
  // Pagamento
  paymentStatus: "all" | "paid" | "unpaid" | "overdue";
  // Importo
  amountMin: string;
  amountMax: string;
  // Persone
  salespersonId: string;
  laborIds: string[];
}

export const INITIAL_FILTER_STATE: OrdersFilterState = {
  dateFrom: "",
  dateTo: "",
  createdFrom: "",
  createdTo: "",
  orderSearch: "",
  includeStatuses: [],
  excludeStatuses: [],
  paymentStatus: "all",
  amountMin: "",
  amountMax: "",
  salespersonId: "",
  laborIds: [],
};

export function countActiveFilters(filters: OrdersFilterState): number {
  let count = 0;
  if (filters.dateFrom || filters.dateTo) count++;
  if (filters.createdFrom || filters.createdTo) count++;
  if (filters.orderSearch) count++;
  if (filters.includeStatuses.length > 0) count++;
  if (filters.excludeStatuses.length > 0) count++;
  if (filters.paymentStatus !== "all") count++;
  if (filters.amountMin || filters.amountMax) count++;
  if (filters.salespersonId) count++;
  if (filters.laborIds.length > 0) count++;
  return count;
}

interface DateRange {
  from: Date | undefined;
  to: Date | undefined;
}

interface OrdersFilterSidebarProps {
  filters: OrdersFilterState;
  onFiltersChange: (filters: OrdersFilterState) => void;
  statuses: Array<{ id: string; name: string; color: string }>;
  ordersCount: number;
  isOpen: boolean;
  onClose: () => void;
  salespeople?: Array<{ id: string; name: string }>;
  laborList?: Array<{ id: string; name: string }>;
  // URL-based filters (from "Più Filtri")
  customerFilter?: string;
  onCustomerFilterChange?: (value: string) => void;
  uniqueCustomers?: Array<{ id: string; name: string }>;
  supplierFilter?: string;
  onSupplierFilterChange?: (value: string) => void;
  uniqueSuppliers?: Array<{ id: string; name: string }>;
  contractDateRange?: DateRange;
  onContractDateRangeChange?: (range: DateRange) => void;
  warehouseDateRange?: DateRange;
  onWarehouseDateRangeChange?: (range: DateRange) => void;
  expectedDateRange?: DateRange;
  onExpectedDateRangeChange?: (range: DateRange) => void;
}

function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-3 px-4 text-sm font-medium text-gray-700 hover:text-gray-900 hover:bg-gray-50 transition-colors"
      >
        {title}
        {open ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>
      {open && <div className="px-4 pb-4 space-y-2">{children}</div>}
    </div>
  );
}

function SearchableRadioList({
  items,
  value,
  onChange,
  allLabel = "Tutti",
  placeholder = "Cerca...",
}: {
  items: Array<{ id: string; name: string }>;
  value: string;
  onChange: (value: string) => void;
  allLabel?: string;
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <div className="space-y-2">
      {items.length > 5 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            type="text"
            placeholder={placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm pl-8 h-8"
          />
        </div>
      )}
      <div className="space-y-1.5 max-h-44 overflow-y-auto">
        {!search && (
          <label className="flex items-center gap-2 cursor-pointer px-1 py-0.5 rounded hover:bg-gray-50 transition-colors">
            <input
              type="radio"
              name="searchable-radio"
              checked={value === "all" || value === ""}
              onChange={() => onChange("all")}
              className="accent-primary"
            />
            <span className="text-sm font-medium">{allLabel}</span>
          </label>
        )}
        {filtered.map((item) => (
          <label key={item.id} className="flex items-center gap-2 cursor-pointer px-1 py-0.5 rounded hover:bg-gray-50 transition-colors">
            <input
              type="radio"
              name="searchable-radio"
              checked={value === item.id}
              onChange={() => onChange(item.id)}
              className="accent-primary"
            />
            <span className="text-sm truncate">{item.name}</span>
          </label>
        ))}
        {filtered.length === 0 && search && (
          <p className="text-xs text-muted-foreground text-center py-2">Nessun risultato</p>
        )}
      </div>
    </div>
  );
}

function SearchableCheckboxList({
  items,
  selected,
  onToggle,
  placeholder = "Cerca...",
}: {
  items: Array<{ id: string; name: string }>;
  selected: string[];
  onToggle: (id: string) => void;
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, search]);

  return (
    <div className="space-y-2">
      {items.length > 5 && (
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
          <Input
            type="text"
            placeholder={placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm pl-8 h-8"
          />
        </div>
      )}
      <div className="space-y-1.5 max-h-44 overflow-y-auto">
        {filtered.map((item) => (
          <div key={item.id} className="flex items-center gap-2 px-1 py-0.5 rounded hover:bg-gray-50 transition-colors">
            <Checkbox
              id={`searchable-${item.id}`}
              checked={selected.includes(item.id)}
              onCheckedChange={() => onToggle(item.id)}
            />
            <Label
              htmlFor={`searchable-${item.id}`}
              className="cursor-pointer text-sm font-normal truncate"
            >
              {item.name}
            </Label>
          </div>
        ))}
        {filtered.length === 0 && search && (
          <p className="text-xs text-muted-foreground text-center py-2">Nessun risultato</p>
        )}
      </div>
    </div>
  );
}

function DateRangeSidebarSection({
  title,
  range,
  onRangeChange,
  defaultOpen = false,
}: {
  title: string;
  range: DateRange;
  onRangeChange: (range: DateRange) => void;
  defaultOpen?: boolean;
}) {
  const hasValue = range.from || range.to;
  return (
    <CollapsibleSection title={title} defaultOpen={defaultOpen || !!hasValue}>
      <div className="space-y-2">
        {hasValue && (
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">
              {range.from ? format(range.from, "dd/MM/yyyy", { locale: it }) : "..."} — {range.to ? format(range.to, "dd/MM/yyyy", { locale: it }) : "..."}
            </span>
            <button
              type="button"
              onClick={() => onRangeChange({ from: undefined, to: undefined })}
              className="text-xs text-muted-foreground hover:text-gray-700 underline"
            >
              Cancella
            </button>
          </div>
        )}
        <div className="flex flex-wrap gap-1.5 mb-2">
          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => { const t = new Date(); onRangeChange({ from: startOfDay(t), to: endOfDay(t) }); }}>Oggi</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => { const t = new Date(); onRangeChange({ from: startOfWeek(t, { locale: it }), to: endOfWeek(t, { locale: it }) }); }}>Settimana</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => { const t = new Date(); onRangeChange({ from: startOfMonth(t), to: endOfMonth(t) }); }}>Mese</Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => { const t = new Date(); onRangeChange({ from: startOfDay(t), to: endOfDay(addDays(t, 7)) }); }}>+7gg</Button>
        </div>
        <div>
          <Label className="text-xs text-gray-500 mb-1 block">Dal</Label>
          <Input
            type="date"
            value={range.from ? format(range.from, "yyyy-MM-dd") : ""}
            onChange={(e) => onRangeChange({ ...range, from: e.target.value ? new Date(e.target.value) : undefined })}
            className="text-sm"
          />
        </div>
        <div>
          <Label className="text-xs text-gray-500 mb-1 block">Al</Label>
          <Input
            type="date"
            value={range.to ? format(range.to, "yyyy-MM-dd") : ""}
            onChange={(e) => onRangeChange({ ...range, to: e.target.value ? new Date(e.target.value) : undefined })}
            className="text-sm"
          />
        </div>
      </div>
    </CollapsibleSection>
  );
}

function SidebarContent({
  filters,
  onFiltersChange,
  statuses,
  ordersCount,
  onClose,
  salespeople = [],
  laborList = [],
  customerFilter = "all",
  onCustomerFilterChange,
  uniqueCustomers = [],
  supplierFilter = "all",
  onSupplierFilterChange,
  uniqueSuppliers = [],
  contractDateRange = { from: undefined, to: undefined },
  onContractDateRangeChange,
  warehouseDateRange = { from: undefined, to: undefined },
  onWarehouseDateRangeChange,
  expectedDateRange = { from: undefined, to: undefined },
  onExpectedDateRangeChange,
}: Omit<OrdersFilterSidebarProps, "isOpen">) {
  const sidebarCount = countActiveFilters(filters);
  const urlCount = [
    customerFilter !== "all",
    supplierFilter !== "all",
    !!contractDateRange.from || !!contractDateRange.to,
    !!warehouseDateRange.from || !!warehouseDateRange.to,
    !!expectedDateRange.from || !!expectedDateRange.to,
  ].filter(Boolean).length;
  const activeCount = sidebarCount + urlCount;

  const update = (partial: Partial<OrdersFilterState>) => {
    onFiltersChange({ ...filters, ...partial });
  };

  const toggleStatus = (id: string) => {
    const next = filters.includeStatuses.includes(id)
      ? filters.includeStatuses.filter((s) => s !== id)
      : [...filters.includeStatuses, id];
    update({ includeStatuses: next });
  };

  const toggleExcludeStatus = (id: string) => {
    const next = filters.excludeStatuses.includes(id)
      ? filters.excludeStatuses.filter((s) => s !== id)
      : [...filters.excludeStatuses, id];
    update({ excludeStatuses: next });
  };

  const toggleLabor = (id: string) => {
    const next = filters.laborIds.includes(id)
      ? filters.laborIds.filter((l) => l !== id)
      : [...filters.laborIds, id];
    update({ laborIds: next });
  };

  const reset = () => {
    onFiltersChange({ ...INITIAL_FILTER_STATE });
    onCustomerFilterChange?.("all");
    onSupplierFilterChange?.("all");
    onContractDateRangeChange?.({ from: undefined, to: undefined });
    onWarehouseDateRangeChange?.({ from: undefined, to: undefined });
    onExpectedDateRangeChange?.({ from: undefined, to: undefined });
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-gray-500" />
          <span className="font-semibold text-sm text-gray-800">Filtri avanzati</span>
          {activeCount > 0 && (
            <Badge variant="secondary" className="h-5 px-1.5 text-xs">
              {activeCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">
            {ordersCount} ordin{ordersCount === 1 ? "e" : "i"}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 transition-colors"
            aria-label="Chiudi filtri"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Scrollable filter content */}
      <div className="flex-1 overflow-y-auto">
        {/* ── Ricerca ──────────────────────────────────────── */}
        <CollapsibleSection title="Cerca">
          <Input
            type="text"
            placeholder="Numero, codice, descrizione..."
            value={filters.orderSearch}
            onChange={(e) => update({ orderSearch: e.target.value })}
            className="text-sm"
          />
        </CollapsibleSection>

        {/* ── Stato commessa ───────────────────────────────── */}
        {statuses.length > 0 && (
          <CollapsibleSection title="Stato commessa">
            <div className="space-y-2">
              {statuses.map((status) => (
                <div key={status.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`status-${status.id}`}
                    checked={filters.includeStatuses.includes(status.id)}
                    onCheckedChange={() => toggleStatus(status.id)}
                  />
                  <Label
                    htmlFor={`status-${status.id}`}
                    className="flex items-center gap-2 cursor-pointer text-sm font-normal"
                  >
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: status.color }}
                    />
                    {status.name}
                  </Label>
                </div>
              ))}
              {filters.includeStatuses.length > 0 && (
                <button
                  type="button"
                  onClick={() => update({ includeStatuses: [] })}
                  className="text-xs text-muted-foreground hover:text-gray-700 underline mt-1"
                >
                  Deseleziona tutti
                </button>
              )}
            </div>
          </CollapsibleSection>
        )}

        {/* ── Escludi stati ─────────────────────────────────── */}
        {statuses.length > 0 && (
          <CollapsibleSection title="Escludi stati" defaultOpen={false}>
            <p className="text-xs text-amber-600 mb-2 bg-amber-50 px-2 py-1 rounded">
              Nascondi commesse con questi stati
            </p>
            <div className="space-y-2">
              {statuses.map((status) => (
                <div key={`excl-${status.id}`} className="flex items-center gap-2">
                  <Checkbox
                    id={`excl-status-${status.id}`}
                    checked={filters.excludeStatuses.includes(status.id)}
                    onCheckedChange={() => toggleExcludeStatus(status.id)}
                  />
                  <Label
                    htmlFor={`excl-status-${status.id}`}
                    className="flex items-center gap-2 cursor-pointer text-sm font-normal"
                  >
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: status.color }}
                    />
                    {status.name}
                  </Label>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* ── Data commessa ────────────────────────────────── */}
        <CollapsibleSection title="Data commessa">
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Dal</Label>
              <Input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => update({ dateFrom: e.target.value })}
                className="text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Al</Label>
              <Input
                type="date"
                value={filters.dateTo}
                onChange={(e) => update({ dateTo: e.target.value })}
                className="text-sm"
              />
            </div>
          </div>
        </CollapsibleSection>

        {/* ── Data creazione ────────────────────────────────── */}
        <CollapsibleSection title="Data creazione" defaultOpen={false}>
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Dal</Label>
              <Input
                type="date"
                value={filters.createdFrom}
                onChange={(e) => update({ createdFrom: e.target.value })}
                className="text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Al</Label>
              <Input
                type="date"
                value={filters.createdTo}
                onChange={(e) => update({ createdTo: e.target.value })}
                className="text-sm"
              />
            </div>
          </div>
        </CollapsibleSection>

        {/* ── Stato pagamento ───────────────────────────────── */}
        <CollapsibleSection title="Stato pagamento">
          <div className="space-y-2">
            {(
              [
                { value: "all", label: "Tutti" },
                { value: "paid", label: "Pagato" },
                { value: "unpaid", label: "Non pagato" },
                { value: "overdue", label: "Scaduto" },
              ] as const
            ).map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="paymentStatus"
                  value={opt.value}
                  checked={filters.paymentStatus === opt.value}
                  onChange={() => update({ paymentStatus: opt.value })}
                  className="accent-primary"
                />
                <span className="text-sm">{opt.label}</span>
              </label>
            ))}
          </div>
        </CollapsibleSection>

        {/* ── Importo ──────────────────────────────────────── */}
        <CollapsibleSection title="Importo (€)" defaultOpen={false}>
          <div className="space-y-2">
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Minimo</Label>
              <Input
                type="number"
                placeholder="0"
                value={filters.amountMin}
                onChange={(e) => update({ amountMin: e.target.value })}
                className="text-sm"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-500 mb-1 block">Massimo</Label>
              <Input
                type="number"
                placeholder="∞"
                value={filters.amountMax}
                onChange={(e) => update({ amountMax: e.target.value })}
                className="text-sm"
              />
            </div>
          </div>
        </CollapsibleSection>

        {/* ── Commerciale ──────────────────────────────────── */}
        {salespeople.length > 0 && (
          <CollapsibleSection title="Commerciale" defaultOpen={!!filters.salespersonId}>
            <SearchableRadioList
              items={salespeople}
              value={filters.salespersonId || "all"}
              onChange={(v) => update({ salespersonId: v === "all" ? "" : v })}
              allLabel="Tutti i commerciali"
              placeholder="Cerca commerciale..."
            />
          </CollapsibleSection>
        )}

        {/* ── Manodopera ───────────────────────────────────── */}
        {laborList.length > 0 && (
          <CollapsibleSection title="Manodopera" defaultOpen={filters.laborIds.length > 0}>
            <SearchableCheckboxList
              items={laborList}
              selected={filters.laborIds}
              onToggle={toggleLabor}
              placeholder="Cerca manodopera..."
            />
          </CollapsibleSection>
        )}

        {/* ── Cliente ─────────────────────────────────────── */}
        {uniqueCustomers.length > 0 && onCustomerFilterChange && (
          <CollapsibleSection title="Cliente" defaultOpen={customerFilter !== "all"}>
            <SearchableRadioList
              items={uniqueCustomers}
              value={customerFilter}
              onChange={onCustomerFilterChange}
              allLabel="Tutti i clienti"
              placeholder="Cerca cliente..."
            />
          </CollapsibleSection>
        )}

        {/* ── Fornitore ───────────────────────────────────── */}
        {uniqueSuppliers.length > 0 && onSupplierFilterChange && (
          <CollapsibleSection title="Fornitore" defaultOpen={supplierFilter !== "all"}>
            <SearchableRadioList
              items={uniqueSuppliers}
              value={supplierFilter}
              onChange={onSupplierFilterChange}
              allLabel="Tutti i fornitori"
              placeholder="Cerca fornitore..."
            />
          </CollapsibleSection>
        )}

        {/* ── Data Contratto ──────────────────────────────── */}
        {onContractDateRangeChange && (
          <DateRangeSidebarSection
            title="Data Contratto"
            range={contractDateRange}
            onRangeChange={onContractDateRangeChange}
          />
        )}

        {/* ── Arrivo Merce ────────────────────────────────── */}
        {onWarehouseDateRangeChange && (
          <DateRangeSidebarSection
            title="Arrivo Merce"
            range={warehouseDateRange}
            onRangeChange={onWarehouseDateRangeChange}
          />
        )}

        {/* ── Data Posa ───────────────────────────────────── */}
        {onExpectedDateRangeChange && (
          <DateRangeSidebarSection
            title="Data Posa"
            range={expectedDateRange}
            onRangeChange={onExpectedDateRangeChange}
          />
        )}
      </div>

      {/* Footer — reset button */}
      {activeCount > 0 && (
        <div className="px-4 py-3 border-t border-gray-100 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            onClick={reset}
          >
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Ripristina filtri
          </Button>
        </div>
      )}
    </div>
  );
}

export function OrdersFilterSidebar({
  filters,
  onFiltersChange,
  statuses,
  ordersCount,
  isOpen,
  onClose,
  salespeople,
  laborList,
  customerFilter,
  onCustomerFilterChange,
  uniqueCustomers,
  supplierFilter,
  onSupplierFilterChange,
  uniqueSuppliers,
  contractDateRange,
  onContractDateRangeChange,
  warehouseDateRange,
  onWarehouseDateRangeChange,
  expectedDateRange,
  onExpectedDateRangeChange,
}: OrdersFilterSidebarProps) {
  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="p-0 w-80 max-w-full flex flex-col">
        <SheetHeader className="sr-only">
          <SheetTitle>Filtri avanzati</SheetTitle>
        </SheetHeader>
        <SidebarContent
          filters={filters}
          onFiltersChange={onFiltersChange}
          statuses={statuses}
          ordersCount={ordersCount}
          onClose={onClose}
          salespeople={salespeople}
          laborList={laborList}
          customerFilter={customerFilter}
          onCustomerFilterChange={onCustomerFilterChange}
          uniqueCustomers={uniqueCustomers}
          supplierFilter={supplierFilter}
          onSupplierFilterChange={onSupplierFilterChange}
          uniqueSuppliers={uniqueSuppliers}
          contractDateRange={contractDateRange}
          onContractDateRangeChange={onContractDateRangeChange}
          warehouseDateRange={warehouseDateRange}
          onWarehouseDateRangeChange={onWarehouseDateRangeChange}
          expectedDateRange={expectedDateRange}
          onExpectedDateRangeChange={onExpectedDateRangeChange}
        />
      </SheetContent>
    </Sheet>
  );
}
