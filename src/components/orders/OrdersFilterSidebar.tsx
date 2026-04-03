import { useState } from "react";
import { ChevronDown, ChevronUp, X, SlidersHorizontal, RotateCcw } from "lucide-react";
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

interface OrdersFilterSidebarProps {
  filters: OrdersFilterState;
  onFiltersChange: (filters: OrdersFilterState) => void;
  statuses: Array<{ id: string; name: string; color: string }>;
  ordersCount: number;
  isOpen: boolean;
  onClose: () => void;
  salespeople?: Array<{ id: string; name: string }>;
  laborList?: Array<{ id: string; name: string }>;
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

function SidebarContent({
  filters,
  onFiltersChange,
  statuses,
  ordersCount,
  onClose,
  salespeople = [],
  laborList = [],
}: Omit<OrdersFilterSidebarProps, "isOpen">) {
  const activeCount = countActiveFilters(filters);

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

  const reset = () => onFiltersChange({ ...INITIAL_FILTER_STATE });

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

        {/* ── Stato ordine ─────────────────────────────────── */}
        {statuses.length > 0 && (
          <CollapsibleSection title="Stato ordine">
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
              Nascondi ordini con questi stati
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

        {/* ── Data ordine ──────────────────────────────────── */}
        <CollapsibleSection title="Data ordine">
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
          <CollapsibleSection title="Commerciale" defaultOpen={false}>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="salesperson"
                  value=""
                  checked={filters.salespersonId === ""}
                  onChange={() => update({ salespersonId: "" })}
                  className="accent-primary"
                />
                <span className="text-sm">Tutti</span>
              </label>
              {salespeople.map((sp) => (
                <label key={sp.id} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="salesperson"
                    value={sp.id}
                    checked={filters.salespersonId === sp.id}
                    onChange={() => update({ salespersonId: sp.id })}
                    className="accent-primary"
                  />
                  <span className="text-sm">{sp.name}</span>
                </label>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* ── Manodopera ───────────────────────────────────── */}
        {laborList.length > 0 && (
          <CollapsibleSection title="Manodopera" defaultOpen={false}>
            <div className="space-y-2 max-h-44 overflow-y-auto">
              {laborList.map((l) => (
                <div key={l.id} className="flex items-center gap-2">
                  <Checkbox
                    id={`labor-${l.id}`}
                    checked={filters.laborIds.includes(l.id)}
                    onCheckedChange={() => toggleLabor(l.id)}
                  />
                  <Label
                    htmlFor={`labor-${l.id}`}
                    className="cursor-pointer text-sm font-normal"
                  >
                    {l.name}
                  </Label>
                </div>
              ))}
            </div>
          </CollapsibleSection>
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
        />
      </SheetContent>
    </Sheet>
  );
}
