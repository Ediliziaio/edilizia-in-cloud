import { ShoppingBag, Euro, TrendingUp, AlertCircle, LifeBuoy, CheckCircle2, Hammer, BarChart3, ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency, formatCurrencyCompact } from "@/lib/formatters";
import { cn } from "@/lib/utils";

interface OrdersStats {
  totalOrders: number;
  totalGross: number;
  collected: number;
  pending: number;
  countAssistenza?: number;
  countCompletati?: number;
  countDaCompletare?: number;
  averageGross?: number;
  grossMargin?: number;
  lowMarginCount?: number;
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
  accentClass?: string;
  onClick?: () => void;
  active?: boolean;
  activeRing?: string;
}

function StatCard({ icon, value, label, iconBg, iconColor, accentClass, onClick, active, activeRing }: StatCardProps) {
  return (
    <Card
      className={cn(
        "relative overflow-hidden border-slate-200/80 bg-gradient-to-br from-white to-slate-50/80 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md",
        onClick ? "cursor-pointer" : "cursor-default",
        active && activeRing && `ring-2 ${activeRing}`
      )}
      onClick={onClick}
    >
      <div className={cn("absolute inset-y-0 left-0 w-1 bg-slate-300", accentClass)} />
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

interface BandMetricProps {
  icon: React.ReactNode;
  value: string | number;
  /** Versione compatta del valore mostrata su mobile (es. "1.3M €"). Se omesso, value è usato per entrambi. */
  valueShort?: string | number;
  label: string;
  hint: string;
  iconClass?: string;
  valueClass?: string;
  labelClass?: string;
  hintClass?: string;
  accentClass?: string;
  onClick?: () => void;
  active?: boolean;
}

function BandMetric({ icon, value, valueShort, label, hint, iconClass, valueClass, labelClass, hintClass, accentClass, onClick, active }: BandMetricProps) {
  const className = cn(
    "group relative flex w-full items-center gap-3 overflow-hidden rounded-xl border border-slate-200/80 bg-white px-3 py-3 text-left shadow-sm transition-all duration-200",
    "hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md",
    active && "border-amber-300 bg-amber-50/60 shadow-md"
  );

  const content = (
    <>
      <div className={cn("absolute inset-x-0 top-0 h-1 bg-blue-500", accentClass)} />
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 ring-1 ring-slate-200 transition-colors duration-200 group-hover:bg-slate-50", iconClass)}>
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[10px] font-semibold uppercase text-slate-500", labelClass)}>{label}</p>
        {/* Mobile: versione compatta (1.3M €). Desktop: valore intero (1.348.666,00 €) */}
        <p className={cn("mt-0.5 text-base font-bold text-slate-950 sm:hidden", valueClass)}>{valueShort ?? value}</p>
        <p className={cn("mt-0.5 hidden truncate text-lg font-bold text-slate-950 sm:block sm:text-xl", valueClass)}>{value}</p>
        <p className={cn("truncate text-[11px] text-slate-500", hintClass)}>{hint}</p>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
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
  const hasProfitabilityStats = stats.averageGross !== undefined || stats.grossMargin !== undefined || stats.lowMarginCount !== undefined;
  const marginIsPositive = (stats.grossMargin ?? 0) >= 0;

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
          accentClass="bg-blue-500"
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
          accentClass="bg-amber-400"
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
          accentClass="bg-emerald-500"
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
          accentClass="bg-orange-500"
        />
      </div>

      <div className="flex items-center justify-between pt-1">
        <div>
          <p className="text-xs font-semibold uppercase text-slate-500">Controllo economico</p>
          <p className="text-xs text-slate-500">Incassi, margini e valori della vista corrente.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-white via-white to-blue-50/45 p-3 shadow-sm sm:p-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <BandMetric
            icon={<Euro className={iconSize} />}
            value={formatCurrency(stats.totalGross)}
            valueShort={formatCurrencyCompact(stats.totalGross)}
            label="Totale Ivato"
            hint={`${stats.totalOrders} commesse in vista`}
            iconClass="bg-blue-50 text-blue-700 ring-blue-100"
            accentClass="bg-blue-500"
          />
          <BandMetric
            icon={<TrendingUp className={iconSize} />}
            value={formatCurrency(stats.collected)}
            valueShort={formatCurrencyCompact(stats.collected)}
            label="Incassato"
            hint="entrate gia registrate"
            iconClass="bg-emerald-50 text-emerald-700 ring-emerald-100"
            valueClass="text-emerald-700"
            accentClass="bg-emerald-500"
          />
          <BandMetric
            icon={<AlertCircle className={iconSize} />}
            value={formatCurrency(stats.pending)}
            valueShort={formatCurrencyCompact(stats.pending)}
            label="Da Incassare"
            hint={activePendingFilter ? "filtro attivo" : "clicca per filtrare"}
            iconClass="bg-amber-50 text-amber-700 ring-amber-100"
            valueClass="text-amber-700"
            accentClass="bg-amber-500"
            onClick={onPendingClick}
            active={activePendingFilter}
          />
        </div>

        {hasProfitabilityStats && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <BandMetric
              icon={<BarChart3 className={iconSize} />}
              value={formatCurrency(stats.averageGross ?? 0)}
              valueShort={formatCurrencyCompact(stats.averageGross ?? 0)}
              label="Valore Medio"
              hint="media della vista corrente"
              iconClass="bg-sky-50 text-sky-700 ring-sky-100"
              accentClass="bg-sky-500"
            />
            <BandMetric
              icon={<TrendingUp className={iconSize} />}
              value={formatCurrency(stats.grossMargin ?? 0)}
              valueShort={formatCurrencyCompact(stats.grossMargin ?? 0)}
              label="Margine Vista"
              hint={marginIsPositive ? "marginalita positiva" : "marginalita da verificare"}
              iconClass={marginIsPositive ? "bg-emerald-50 text-emerald-700 ring-emerald-100" : "bg-red-50 text-red-700 ring-red-100"}
              valueClass={marginIsPositive ? "text-emerald-700" : "text-red-700"}
              accentClass={marginIsPositive ? "bg-emerald-500" : "bg-red-500"}
            />
            <BandMetric
              icon={<ShieldAlert className={iconSize} />}
              value={stats.lowMarginCount ?? 0}
              label="Margine Basso"
              hint="commesse da controllare"
              iconClass="bg-orange-50 text-orange-700 ring-orange-100"
              valueClass="text-orange-700"
              accentClass="bg-orange-500"
            />
          </div>
        )}
      </div>
    </div>
  );
}
