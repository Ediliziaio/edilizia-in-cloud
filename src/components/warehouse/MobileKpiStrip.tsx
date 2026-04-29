/**
 * MobileKpiStrip — KPI operative compatte per smartphone.
 *
 * Il masterprompt chiede 3 pill critiche e filtrabili. Nel modello reale di
 * WarehouseStats i filtri disponibili sono `quick: overdue` e status ordine:
 * quindi usiamo le tre KPI piu vicine agli intent operativi giornalieri.
 */
import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertOctagon, ChevronRight, Package, ShoppingCart } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { isItemOverdue, type OrderItemStatus, type WarehouseItem } from "@/types/warehouse";
import WarehouseStats, { type WarehouseStatsFilter } from "./WarehouseStats";
import WarehouseInventoryStats from "./WarehouseInventoryStats";

interface MobileKpiStripProps {
  items: WarehouseItem[];
  companyId: string;
  activeFilter: WarehouseStatsFilter;
  onCardClick: (next: WarehouseStatsFilter) => void;
}

interface MobileKpi {
  key: string;
  label: string;
  value: number;
  hint: string;
  icon: LucideIcon;
  filter: WarehouseStatsFilter;
  tone: "danger" | "success" | "warning" | "muted";
}

function isFilterActive(active: WarehouseStatsFilter, candidate: WarehouseStatsFilter): boolean {
  if (active.kind === "all" && candidate.kind === "all") return true;
  if (active.kind === "quick" && candidate.kind === "quick") return active.value === candidate.value;
  if (active.kind === "status" && candidate.kind === "status") return active.value === candidate.value;
  return false;
}

function countOrders(items: WarehouseItem[]) {
  return new Set(items.map((item) => item.order.id)).size;
}

function countByStatus(items: WarehouseItem[], status: OrderItemStatus) {
  return items.filter((item) => item.status === status);
}

export function MobileKpiStrip({
  items,
  companyId,
  activeFilter,
  onCardClick,
}: MobileKpiStripProps) {
  const [allOpen, setAllOpen] = useState(false);

  const pills = useMemo<MobileKpi[]>(() => {
    const overdue = items.filter(isItemOverdue);
    const inMagazzino = countByStatus(items, "in_magazzino");
    const daOrdinare = countByStatus(items, "da_ordinare");

    return [
      {
        key: "overdue",
        label: "In ritardo",
        value: overdue.length,
        hint: `${countOrders(overdue)} ordini`,
        icon: AlertOctagon,
        filter: { kind: "quick", value: "overdue" },
        tone: overdue.length > 0 ? "danger" : "muted",
      },
      {
        key: "ready",
        label: "In magazzino",
        value: inMagazzino.length,
        hint: `${countOrders(inMagazzino)} ordini`,
        icon: Package,
        filter: { kind: "status", value: "in_magazzino" },
        tone: "success",
      },
      {
        key: "to_order",
        label: "Da ordinare",
        value: daOrdinare.length,
        hint: `${countOrders(daOrdinare)} ordini`,
        icon: ShoppingCart,
        filter: { kind: "status", value: "da_ordinare" },
        tone: daOrdinare.length > 0 ? "warning" : "muted",
      },
    ];
  }, [items]);

  const toggleFilter = (filter: WarehouseStatsFilter) => {
    onCardClick(isFilterActive(activeFilter, filter) ? { kind: "all" } : filter);
  };

  return (
    <div className="md:hidden">
      <div
        className="flex gap-2 overflow-x-auto pb-1 -mx-2 px-2 scrollbar-hide"
        style={{ scrollSnapType: "x proximity" }}
      >
        {pills.map((pill) => {
          const Icon = pill.icon;
          const active = isFilterActive(activeFilter, pill.filter);
          return (
            <button
              key={pill.key}
              type="button"
              onClick={() => toggleFilter(pill.filter)}
              aria-pressed={active}
              style={{ scrollSnapAlign: "start" }}
              className={cn(
                "shrink-0 min-w-[128px] rounded-lg border px-3 py-2 text-left transition-colors",
                active && "ring-2 ring-primary/40",
                pill.tone === "danger" && "border-red-500/40 bg-red-50 text-red-950",
                pill.tone === "success" && "border-emerald-500/40 bg-emerald-50 text-emerald-950",
                pill.tone === "warning" && "border-amber-500/40 bg-amber-50 text-amber-950",
                pill.tone === "muted" && "border-border bg-card",
              )}
            >
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                  {pill.label}
                </span>
                <Icon className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="text-xl font-bold leading-tight">{pill.value}</div>
              <div className="text-[11px] text-muted-foreground">{pill.hint}</div>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setAllOpen(true)}
        className="mt-2 flex items-center justify-between w-full px-1 text-xs text-muted-foreground"
      >
        <span>Vedi tutte le metriche</span>
        <ChevronRight className="h-3.5 w-3.5" />
      </button>

      <Sheet open={allOpen} onOpenChange={setAllOpen}>
        <SheetContent side="bottom" className="h-[85svh] overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle>Tutte le metriche</SheetTitle>
          </SheetHeader>
          <div className="space-y-4">
            <WarehouseStats
              items={items}
              activeFilter={activeFilter}
              onCardClick={(filter) => {
                onCardClick(filter);
                setAllOpen(false);
              }}
            />
            <WarehouseInventoryStats companyId={companyId} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
