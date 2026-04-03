import { useState } from "react";
import { ChevronDown, ChevronUp, X, SlidersHorizontal } from "lucide-react";
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
  dateFrom: string;
  dateTo: string;
  orderSearch: string;
  includeStatuses: string[];
  paymentStatus: "all" | "paid" | "unpaid" | "overdue";
  amountMin: string;
  amountMax: string;
}

export const INITIAL_FILTER_STATE: OrdersFilterState = {
  dateFrom: "",
  dateTo: "",
  orderSearch: "",
  includeStatuses: [],
  paymentStatus: "all",
  amountMin: "",
  amountMax: "",
};

interface OrdersFilterSidebarProps {
  filters: OrdersFilterState;
  onFiltersChange: (filters: OrdersFilterState) => void;
  statuses: Array<{ id: string; name: string; color: string }>;
  ordersCount: number;
  isOpen: boolean;
  onClose: () => void;
}

function countActiveFilters(filters: OrdersFilterState): number {
  let count = 0;
  if (filters.dateFrom || filters.dateTo) count++;
  if (filters.orderSearch) count++;
  if (filters.includeStatuses.length > 0) count++;
  if (filters.paymentStatus !== "all") count++;
  if (filters.amountMin || filters.amountMax) count++;
  return count;
}

interface CollapsibleSectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsibleSection({ title, children, defaultOpen = true }: CollapsibleSectionProps) {
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

  const reset = () => {
    onFiltersChange({ ...INITIAL_FILTER_STATE });
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
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
            className="lg:hidden p-1 rounded hover:bg-gray-100 transition-colors"
            aria-label="Chiudi filtri"
          >
            <X className="h-4 w-4 text-gray-500" />
          </button>
        </div>
      </div>

      {/* Scrollable filter content */}
      <div className="flex-1 overflow-y-auto">
        {/* Data ordine */}
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

        {/* Numero ordine */}
        <CollapsibleSection title="Numero / Descrizione">
          <Input
            type="text"
            placeholder="Cerca codice o descrizione..."
            value={filters.orderSearch}
            onChange={(e) => update({ orderSearch: e.target.value })}
            className="text-sm"
          />
        </CollapsibleSection>

        {/* Stati */}
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

        {/* Stato pagamento */}
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

        {/* Importo */}
        <CollapsibleSection title="Importo (€)">
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
      </div>

      {/* Footer — reset button */}
      {activeCount > 0 && (
        <div className="px-4 py-3 border-t border-gray-100">
          <Button
            variant="outline"
            size="sm"
            className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 hover:border-red-300"
            onClick={reset}
          >
            <X className="h-3.5 w-3.5 mr-1.5" />
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
}: OrdersFilterSidebarProps) {
  return (
    <>
      {/* Desktop: fixed sidebar */}
      <aside className="hidden lg:flex flex-col w-72 shrink-0 border-r border-gray-100 min-h-0 sticky top-0 self-start max-h-screen overflow-hidden">
        <SidebarContent
          filters={filters}
          onFiltersChange={onFiltersChange}
          statuses={statuses}
          ordersCount={ordersCount}
          onClose={onClose}
        />
      </aside>

      {/* Mobile: Sheet/drawer */}
      <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="left" className="p-0 w-80 max-w-full">
          <SheetHeader className="sr-only">
            <SheetTitle>Filtri avanzati</SheetTitle>
          </SheetHeader>
          <SidebarContent
            filters={filters}
            onFiltersChange={onFiltersChange}
            statuses={statuses}
            ordersCount={ordersCount}
            onClose={onClose}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
