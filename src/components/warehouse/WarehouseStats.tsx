/**
 * WarehouseStats — KPI cards per modalità Workflow ordini.
 *
 * Cards CLICCABILI: ognuna applica il filtro corrispondente (toggle on/off).
 * Elimina la duplicazione tra KPI cards e pill quick filter sotto.
 *
 * Cards: Completamento (non-cliccabile, info ring) · In Ritardo · In Magazzino
 *        · In Transito · Da Ordinare.
 */

import { useMemo } from "react";
import { Package, ShoppingCart, Truck, CheckCircle2, AlertOctagon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/formatters";
import { isItemOverdue } from "@/types/warehouse";
import type { OrderItemStatus, WarehouseItem } from "@/types/warehouse";

export type WarehouseStatsFilter =
  | { kind: "all" }
  | { kind: "quick"; value: "overdue" }
  | { kind: "status"; value: OrderItemStatus };

interface WarehouseStatsProps {
  items: WarehouseItem[];
  /** Stato corrente del filter (da Warehouse.tsx: status o quick filter). */
  activeFilter: WarehouseStatsFilter;
  /** Click su una KPI card → applica filtro (o lo rimuove se già attivo). */
  onCardClick: (next: WarehouseStatsFilter) => void;
}

function ProgressRing({ percentage, size = 80, strokeWidth = 8 }: {
  percentage: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="transform -rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="currentColor" strokeWidth={strokeWidth} className="text-muted/20" />
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="currentColor" strokeWidth={strokeWidth}
          strokeDasharray={circumference} strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-primary transition-all duration-500" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-bold">{Math.round(percentage)}%</span>
      </div>
    </div>
  );
}

/** Determina se un certo filtro è attualmente attivo (per highlight visivo). */
function isFilterActive(active: WarehouseStatsFilter, candidate: WarehouseStatsFilter): boolean {
  if (active.kind === "all" && candidate.kind === "all") return true;
  if (active.kind === "quick" && candidate.kind === "quick") return active.value === candidate.value;
  if (active.kind === "status" && candidate.kind === "status") return active.value === candidate.value;
  return false;
}

export default function WarehouseStats({ items, activeFilter, onCardClick }: WarehouseStatsProps) {
  const stats = useMemo(() => {
    const installed = items.filter((i) => i.status === "installato");
    const inMagazzino = items.filter((i) => i.status === "in_magazzino");
    const ordinati = items.filter((i) => i.status === "ordinato");
    const daOrdinare = items.filter((i) => i.status === "da_ordinare");
    const overdue = items.filter(isItemOverdue);

    const uniqueOrders = (arr: WarehouseItem[]) => new Set(arr.map((i) => i.order.id)).size;
    const calculateValue = (arr: WarehouseItem[]) =>
      arr.reduce((sum, item) => sum + (item.purchase_price || 0) * (item.quantity || 1), 0);

    return {
      completion: {
        percentage: items.length > 0 ? (installed.length / items.length) * 100 : 0,
        completed: installed.length,
        total: items.length,
      },
      overdue: { count: overdue.length, orders: uniqueOrders(overdue) },
      inMagazzino: { count: inMagazzino.length, orders: uniqueOrders(inMagazzino), value: calculateValue(inMagazzino) },
      ordinati: { count: ordinati.length, orders: uniqueOrders(ordinati), value: calculateValue(ordinati) },
      daOrdinare: { count: daOrdinare.length, orders: uniqueOrders(daOrdinare), value: calculateValue(daOrdinare) },
    };
  }, [items]);

  /** Toggle: se la card è già il filtro attivo → reset a "all", altrimenti applica. */
  const handleClick = (candidate: WarehouseStatsFilter) => {
    onCardClick(isFilterActive(activeFilter, candidate) ? { kind: "all" } : candidate);
  };

  return (
    <div className="grid gap-3 md:grid-cols-5">
      {/* Completion — non cliccabile (info aggregata) */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Completamento</CardTitle>
          <CheckCircle2 className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent className="flex flex-col items-center">
          <ProgressRing percentage={stats.completion.percentage} />
          <p className="text-xs text-muted-foreground mt-2">
            {stats.completion.completed}/{stats.completion.total} installati
          </p>
        </CardContent>
      </Card>

      {/* In Ritardo */}
      <ClickableCard
        active={isFilterActive(activeFilter, { kind: "quick", value: "overdue" })}
        onClick={() => handleClick({ kind: "quick", value: "overdue" })}
        accent={stats.overdue.count > 0 ? "destructive" : "muted"}
        title="In Ritardo"
        icon={AlertOctagon}
        value={stats.overdue.count}
        primaryHint={`in ${stats.overdue.orders} ordini`}
        secondaryHint="posa scaduta, non pronti"
      />

      {/* In Magazzino */}
      <ClickableCard
        active={isFilterActive(activeFilter, { kind: "status", value: "in_magazzino" })}
        onClick={() => handleClick({ kind: "status", value: "in_magazzino" })}
        accent="emerald"
        title="In Magazzino"
        icon={Package}
        value={stats.inMagazzino.count}
        primaryHint={`in ${stats.inMagazzino.orders} ordini`}
        secondaryHint={`${formatCurrency(stats.inMagazzino.value)} valore`}
      />

      {/* In Transito */}
      <ClickableCard
        active={isFilterActive(activeFilter, { kind: "status", value: "ordinato" })}
        onClick={() => handleClick({ kind: "status", value: "ordinato" })}
        accent="blue"
        title="In Transito"
        icon={Truck}
        value={stats.ordinati.count}
        primaryHint={`in ${stats.ordinati.orders} ordini`}
        secondaryHint={`${formatCurrency(stats.ordinati.value)} in arrivo`}
      />

      {/* Da Ordinare */}
      <ClickableCard
        active={isFilterActive(activeFilter, { kind: "status", value: "da_ordinare" })}
        onClick={() => handleClick({ kind: "status", value: "da_ordinare" })}
        accent="amber"
        title="Da Ordinare"
        icon={ShoppingCart}
        value={stats.daOrdinare.count}
        primaryHint={`in ${stats.daOrdinare.orders} ordini`}
        secondaryHint={`${formatCurrency(stats.daOrdinare.value)} da spendere`}
      />
    </div>
  );
}

const accentClasses = {
  destructive: { ring: "ring-destructive", text: "text-destructive", border: "border-destructive" },
  emerald: { ring: "ring-emerald-500", text: "text-emerald-600", border: "border-emerald-500" },
  blue: { ring: "ring-blue-500", text: "text-blue-600", border: "border-blue-500" },
  amber: { ring: "ring-amber-500", text: "text-amber-600", border: "border-amber-500" },
  muted: { ring: "ring-muted", text: "text-muted-foreground", border: "border-muted" },
} as const;

function ClickableCard({
  active,
  onClick,
  accent,
  title,
  icon: Icon,
  value,
  primaryHint,
  secondaryHint,
}: {
  active: boolean;
  onClick: () => void;
  accent: keyof typeof accentClasses;
  title: string;
  icon: typeof Package;
  value: number;
  primaryHint: string;
  secondaryHint: string;
}) {
  const a = accentClasses[accent];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "text-left transition-all rounded-lg",
        active && `ring-2 ring-offset-1 ${a.ring}`,
      )}
    >
      <Card className={cn("h-full", active && `${a.border} bg-muted/30`)}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <Icon className={cn("h-4 w-4", a.text)} />
        </CardHeader>
        <CardContent>
          <div className={cn("text-2xl font-bold", a.text)}>{value}</div>
          <p className="text-xs text-muted-foreground">{primaryHint}</p>
          <p className={cn("text-sm font-medium mt-1", value > 0 ? a.text : "text-muted-foreground")}>
            {secondaryHint}
          </p>
        </CardContent>
      </Card>
    </button>
  );
}
