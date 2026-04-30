import { ShoppingBag, Euro, TrendingUp, AlertCircle, LifeBuoy, CheckCircle2, Hammer } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface OrdersStats {
  totalOrders: number;
  totalGross: number;
  collected: number;
  pending: number;
  countAssistenza?: number;
  countCompletati?: number;
  countDaCompletare?: number;
}

interface OrdersStatsCardsProps {
  stats: OrdersStats;
  onPendingClick?: () => void;
  activePendingFilter?: boolean;
  /** Filter shortcuts — click toggles statusFilter to sentinel */
  supportStatusId?: string | null;
  completedStatusId?: string | null;
  activeStatusFilter?: string;
  onStatusFilterClick?: (id: string) => void;
  onDaCompletareClick?: () => void;
}

// Sentinel values riconosciuti lato query in OrdersList
const SENTINEL_DA_COMPLETARE = "__da_completare__";
const SENTINEL_ASSISTENZA = "__assistenza__";
const SENTINEL_COMPLETATI = "__completati__";

interface StatCardProps {
  icon: React.ReactNode;
  value: string | number;
  label: string;
  iconBg: string;
  iconColor: string;
  onClick?: () => void;
  active?: boolean;
  activeRing?: string;
}

function StatCard({ icon, value, label, iconBg, iconColor, onClick, active, activeRing }: StatCardProps) {
  return (
    <Card
      className={cn(
        onClick && "cursor-pointer transition-all hover:shadow-md",
        active && activeRing && `ring-2 ${activeRing}`
      )}
      onClick={onClick}
    >
      <CardContent className="p-3 sm:p-4 flex items-center gap-2 sm:gap-3">
        <div className={cn("p-1.5 sm:p-2 rounded-lg shrink-0", iconBg)}>
          <span className={iconColor}>{icon}</span>
        </div>
        <div className="min-w-0">
          <p className="text-sm sm:text-2xl font-bold truncate">{value}</p>
          <p className={cn("text-[10px] sm:text-xs", active ? "font-medium" : "text-muted-foreground")}>
            {label}{active && " ✓"}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export function OrdersStatsCards({
  stats,
  onPendingClick,
  activePendingFilter,
  activeStatusFilter,
  onStatusFilterClick,
  onDaCompletareClick,
}: OrdersStatsCardsProps) {
  const iconSize = "h-4 w-4 sm:h-5 sm:w-5";

  return (
    <div className="space-y-3">
      {/* Riga 1 — Operative: conteggi per fase */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<ShoppingBag className={iconSize} />}
          value={stats.totalOrders}
          label="Commesse Totali"
          iconBg="bg-primary/10"
          iconColor="text-primary"
        />
        <StatCard
          icon={<Hammer className={iconSize} />}
          value={stats.countDaCompletare ?? 0}
          label="Da Completare"
          iconBg={activeStatusFilter === SENTINEL_DA_COMPLETARE ? "bg-amber-200 dark:bg-amber-900" : "bg-amber-100 dark:bg-amber-950"}
          iconColor="text-amber-600 dark:text-amber-400"
          onClick={onDaCompletareClick}
          active={activeStatusFilter === SENTINEL_DA_COMPLETARE}
          activeRing="ring-amber-400"
        />
        <StatCard
          icon={<CheckCircle2 className={iconSize} />}
          value={stats.countCompletati ?? 0}
          label="Completati"
          iconBg={activeStatusFilter === SENTINEL_COMPLETATI ? "bg-emerald-200 dark:bg-emerald-900" : "bg-emerald-100 dark:bg-emerald-950"}
          iconColor="text-emerald-600 dark:text-emerald-400"
          onClick={() => onStatusFilterClick?.(SENTINEL_COMPLETATI)}
          active={activeStatusFilter === SENTINEL_COMPLETATI}
          activeRing="ring-emerald-400"
        />
        <StatCard
          icon={<LifeBuoy className={iconSize} />}
          value={stats.countAssistenza ?? 0}
          label="In Assistenza"
          iconBg={activeStatusFilter === SENTINEL_ASSISTENZA ? "bg-orange-200 dark:bg-orange-900" : "bg-orange-100 dark:bg-orange-950"}
          iconColor="text-orange-600 dark:text-orange-500"
          onClick={() => onStatusFilterClick?.(SENTINEL_ASSISTENZA)}
          active={activeStatusFilter === SENTINEL_ASSISTENZA}
          activeRing="ring-orange-400"
        />
      </div>

      {/* Riga 2 — Finanziarie: flussi in € */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard
          icon={<Euro className={iconSize} />}
          value={formatCurrency(stats.totalGross)}
          label="Totale Ivato"
          iconBg="bg-blue-100 dark:bg-blue-950"
          iconColor="text-blue-600 dark:text-blue-400"
        />
        <StatCard
          icon={<TrendingUp className={iconSize} />}
          value={formatCurrency(stats.collected)}
          label="Incassato"
          iconBg="bg-emerald-100 dark:bg-emerald-950"
          iconColor="text-emerald-600 dark:text-emerald-400"
        />
        <StatCard
          icon={<AlertCircle className={iconSize} />}
          value={formatCurrency(stats.pending)}
          label="Da Incassare"
          iconBg={activePendingFilter ? "bg-rose-200 dark:bg-rose-900" : "bg-rose-100 dark:bg-rose-950"}
          iconColor="text-rose-600 dark:text-rose-400"
          onClick={onPendingClick}
          active={activePendingFilter}
          activeRing="ring-rose-400"
        />
      </div>
    </div>
  );
}
