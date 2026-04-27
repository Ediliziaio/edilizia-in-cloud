/**
 * WarehouseInventoryStats — KPI cards per la modalità Inventario.
 *
 * Mostrati su tab Giacenze/Lotti/DDT. Dimensione coerente con
 * WarehouseStats (workflow) per evitare layout shift al toggle macro.
 *
 * 4 KPI:
 *   - Articoli totali
 *   - Sottoscorta (qty < min_stock_level)
 *   - Valore magazzino (sum qty * unit_cost)
 *   - Movimenti 7gg (carico + scarico)
 */

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package, AlertTriangle, Euro, TrendingUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface Props {
  companyId: string;
}

interface InventoryStat {
  totalArticoli: number;
  sottoscorta: number;
  valoreTotale: number;
  movimenti7gg: number;
}

export default function WarehouseInventoryStats({ companyId }: Props) {
  const { data, isLoading } = useQuery<InventoryStat>({
    queryKey: ["warehouse", "inventory-stats", companyId],
    queryFn: async () => {
      // 1) Articoli totali — count head:true (no payload) per performance
      const { count: totalArticoli } = await supabase
        .from("warehouse_stock")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId);

      // 2) Articoli con quantity < min_stock_level — fetch quantity+min e filtro client-side
      //    (Postgrest non supporta filtri inter-colonne in modo nativo)
      const { data: stockRows } = await supabase
        .from("warehouse_stock")
        .select("quantity, unit_cost, min_stock_level")
        .eq("company_id", companyId);
      const sottoscorta = (stockRows ?? []).filter(
        (r) => Number(r.quantity ?? 0) < Number(r.min_stock_level ?? 0),
      ).length;
      const valoreTotale = (stockRows ?? []).reduce(
        (sum, r) => sum + Number(r.quantity ?? 0) * Number(r.unit_cost ?? 0),
        0,
      );

      // 3) Movimenti 7gg
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { count: movimenti7gg } = await supabase
        .from("warehouse_movements")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId)
        .gte("created_at", sevenDaysAgo);

      return {
        totalArticoli: totalArticoli ?? 0,
        sottoscorta,
        valoreTotale,
        movimenti7gg: movimenti7gg ?? 0,
      };
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });

  const cards = useMemo(
    () => [
      {
        label: "Articoli totali",
        value: isLoading ? "…" : String(data?.totalArticoli ?? 0),
        hint: "in anagrafica magazzino",
        icon: Package,
        accent: "primary" as const,
      },
      {
        label: "Sottoscorta",
        value: isLoading ? "…" : String(data?.sottoscorta ?? 0),
        hint: "qty < soglia minima",
        icon: AlertTriangle,
        accent: (data?.sottoscorta ?? 0) > 0 ? ("amber" as const) : ("emerald" as const),
      },
      {
        label: "Valore magazzino",
        value: isLoading ? "…" : formatCurrency(data?.valoreTotale ?? 0),
        hint: "qty × costo unitario",
        icon: Euro,
        accent: "blue" as const,
      },
      {
        label: "Movimenti 7gg",
        value: isLoading ? "…" : String(data?.movimenti7gg ?? 0),
        hint: "carico + scarico",
        icon: TrendingUp,
        accent: "primary" as const,
      },
    ],
    [data, isLoading],
  );

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((c) => (
        <KpiCard key={c.label} {...c} />
      ))}
    </div>
  );
}

const accentMap = {
  primary: "border-l-primary",
  emerald: "border-l-emerald-500",
  amber: "border-l-amber-500",
  blue: "border-l-blue-500",
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
  icon: typeof Package;
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
