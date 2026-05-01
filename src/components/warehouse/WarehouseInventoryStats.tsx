/**
 * WarehouseInventoryStats — KPI cards per la modalità Inventario.
 *
 * Mostrati su tab Giacenze/Lotti/DDT. Dimensione coerente con
 * WarehouseStats (workflow) per evitare layout shift al toggle macro.
 *
 * KPI essenziali:
 *   - Valore inventario (sum qty * unit_cost)
 *   - Articoli a stock
 *   - Quantità totale
 *   - Sottoscorta (qty < min_stock_level)
 */

import { useMemo } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Boxes,
  CalendarClock,
  Euro,
  Package,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";
import type { WarehouseItem } from "@/types/warehouse";

export type WarehouseInventoryMetricKey =
  | "inventory_value"
  | "stock_items"
  | "total_quantity"
  | "low_stock"
  | "critical_materials"
  | "near_low_stock"
  | "incoming_7d"
  | "missing_cost";

interface Props {
  companyId?: string;
  stockItems?: StockItem[];
  orderItems?: WarehouseItem[];
  visibleCards?: WarehouseInventoryMetricKey[];
}

interface StockItem {
  id: string;
  name?: string | null;
  quantity: number | null;
  unit_cost?: number | null;
  min_stock_level?: number | null;
}

export default function WarehouseInventoryStats({ stockItems = [], orderItems = [], visibleCards }: Props) {
  const stats = useMemo(() => {
    const sottoscorta = stockItems.filter(
      (item) => Number(item.quantity ?? 0) < Number(item.min_stock_level ?? 0),
    ).length;
    const materialiCritici = stockItems.filter((item) => {
      const quantity = Number(item.quantity ?? 0);
      const minStock = Number(item.min_stock_level ?? 0);
      return quantity <= 0 || (minStock > 0 && quantity < minStock);
    }).length;
    const inEsaurimento = stockItems.filter((item) => {
      const quantity = Number(item.quantity ?? 0);
      const minStock = Number(item.min_stock_level ?? 0);
      return minStock > 0 && quantity >= minStock && quantity <= minStock * 1.2;
    }).length;
    const senzaCosto = stockItems.filter((item) => Number(item.unit_cost ?? 0) <= 0).length;
    const now = new Date();
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const inArrivo7gg = orderItems.filter((item) => {
      if (item.status !== "ordinato" && item.status !== "in_arrivo") return false;
      const arrivalDate = item.order.warehouse_arrival_date;
      if (!arrivalDate) return false;
      const date = new Date(arrivalDate);
      return date >= now && date <= sevenDaysFromNow;
    }).length;
    const valoreTotale = stockItems.reduce(
      (sum, item) => sum + Number(item.quantity ?? 0) * Number(item.unit_cost ?? 0),
      0,
    );
    const quantitaTotale = stockItems.reduce(
      (sum, item) => sum + Number(item.quantity ?? 0),
      0,
    );

    return {
      totalArticoli: stockItems.length,
      quantitaTotale,
      sottoscorta,
      materialiCritici,
      inEsaurimento,
      inArrivo7gg,
      senzaCosto,
      valoreTotale,
    };
  }, [orderItems, stockItems]);

  const cards = useMemo(
    () => [
      {
        key: "inventory_value" as const,
        label: "Valore inventario",
        value: formatCurrency(stats.valoreTotale),
        hint: `${stats.totalArticoli} articoli a stock`,
        icon: Euro,
        accent: "blue" as const,
      },
      {
        key: "stock_items" as const,
        label: "Articoli a stock",
        value: String(stats.totalArticoli),
        hint: "schede con giacenza",
        icon: Package,
        accent: "primary" as const,
      },
      {
        key: "total_quantity" as const,
        label: "Quantità totale",
        value: String(stats.quantitaTotale),
        hint: "pezzi disponibili",
        icon: Boxes,
        accent: "primary" as const,
      },
      {
        key: "low_stock" as const,
        label: "Sottoscorta",
        value: String(stats.sottoscorta),
        hint: "sotto soglia minima",
        icon: AlertTriangle,
        accent: stats.sottoscorta > 0 ? ("amber" as const) : ("emerald" as const),
      },
      {
        key: "critical_materials" as const,
        label: "Materiali critici",
        value: String(stats.materialiCritici),
        hint: "zero o sotto soglia",
        icon: AlertCircle,
        accent: stats.materialiCritici > 0 ? ("red" as const) : ("emerald" as const),
      },
      {
        key: "near_low_stock" as const,
        label: "In esaurimento",
        value: String(stats.inEsaurimento),
        hint: "entro +20% dalla soglia",
        icon: TrendingDown,
        accent: stats.inEsaurimento > 0 ? ("amber" as const) : ("emerald" as const),
      },
      {
        key: "incoming_7d" as const,
        label: "In arrivo 7gg",
        value: String(stats.inArrivo7gg),
        hint: "con arrivo magazzino previsto",
        icon: CalendarClock,
        accent: "blue" as const,
      },
      {
        key: "missing_cost" as const,
        label: "Senza costo",
        value: String(stats.senzaCosto),
        hint: "falsano il valore inventario",
        icon: Euro,
        accent: stats.senzaCosto > 0 ? ("red" as const) : ("emerald" as const),
      },
    ],
    [stats],
  );

  const visible = new Set<WarehouseInventoryMetricKey>(
    visibleCards ?? ["inventory_value", "stock_items", "total_quantity", "low_stock"],
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.filter((card) => visible.has(card.key)).map(({ key, ...card }) => (
        <KpiCard key={key} {...card} />
      ))}
    </div>
  );
}

const accentMap = {
  primary: "border-l-primary",
  emerald: "border-l-emerald-500",
  amber: "border-l-amber-500",
  blue: "border-l-blue-500",
  red: "border-l-red-500",
} as const;

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  icon: LucideIcon;
  accent: keyof typeof accentMap;
}) {
  return (
    <Card className={cn("border-l-4 transition-colors", accentMap[accent])}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">
            {label}
          </p>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="text-2xl font-bold leading-tight">{value}</p>
        <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>
      </CardContent>
    </Card>
  );
}
