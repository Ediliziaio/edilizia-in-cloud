import { memo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, Minus, Euro, Percent, Users, CalendarCheck, Trophy, Target, Zap, CreditCard, Landmark, Package, ArrowDownCircle, ArrowUpCircle, Flame, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { KpiData } from "@/hooks/useMarketingDashboard";
import type { FinanceData, OperationsData } from "@/hooks/useCruscottoData";
import { calcDelta, fmtCur, fmt } from "@/components/marketing/dashboard/utils";

interface Props {
  kpi: KpiData | undefined;
  kpiPrev: KpiData | undefined;
  finance: FinanceData;
  operations: OperationsData;
  isLoading: boolean;
  onDrilldown?: (type: string) => void;
}

interface KpiDef {
  label: string;
  tooltip: string;
  icon: React.ElementType;
  getValue: (kpi: KpiData | undefined, finance: FinanceData, operations: OperationsData) => number;
  getPrevValue: (kpiPrev: KpiData | undefined, finance: FinanceData, operations: OperationsData) => number;
  format: (v: number) => string;
  thresholds?: { green: number; yellow: number };
  invertColor?: boolean;
  link?: string;
}

const FINANCIAL_KPIS: KpiDef[] = [
  {
    label: "Fatturato Periodo",
    tooltip: "Ricavi totali nel periodo selezionato",
    icon: Euro,
    getValue: (_, f) => f.revenueThisMonth,
    getPrevValue: (_, f) => f.revenuePrevMonth,
    format: fmtCur,
    link: "/azienda/ordini",
  },
  {
    label: "Proiezione Mese",
    tooltip: "Stima fatturato a fine mese basata sulla velocity attuale",
    icon: Target,
    getValue: (_, f) => {
      const now = new Date();
      const dayOfMonth = now.getDate();
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      return dayOfMonth > 0 ? (f.revenueThisMonth / dayOfMonth) * daysInMonth : 0;
    },
    getPrevValue: () => 0,
    format: fmtCur,
  },
  {
    label: "N° Ordini",
    tooltip: "Ordini attivi nel periodo",
    icon: Package,
    getValue: (_, _f, ops) => ops.activeOrders,
    getPrevValue: () => 0,
    format: fmt,
    link: "/azienda/ordini",
  },
  {
    label: "Costo Medio Ordine",
    tooltip: "Fatturato periodo / N° ordini attivi",
    icon: Euro,
    getValue: (_, f, ops) => ops.activeOrders > 0 ? f.revenueThisMonth / ops.activeOrders : 0,
    getPrevValue: () => 0,
    format: fmtCur,
  },
  {
    label: "Margine Lordo %",
    tooltip: "Media margine lordo sugli ordini",
    icon: Percent,
    getValue: (_, f) => f.marginThisMonth,
    getPrevValue: (_, f) => f.marginPrevMonth,
    format: v => `${v.toFixed(1)}%`,
    thresholds: { green: 30, yellow: 15 },
    link: "/azienda/previsionale",
  },
  {
    label: "Entrate Mese",
    tooltip: "Pagamenti attesi in entrata nel mese corrente",
    icon: ArrowDownCircle,
    getValue: (_, f) => f.thisMonthIncome,
    getPrevValue: () => 0,
    format: fmtCur,
    link: "/azienda/previsionale",
  },
  {
    label: "Uscite Mese",
    tooltip: "Costi da pagare nel mese corrente",
    icon: ArrowUpCircle,
    getValue: (_, f) => f.thisMonthOutflow,
    getPrevValue: () => 0,
    format: fmtCur,
    invertColor: true,
    link: "/azienda/previsionale",
  },
  {
    label: "Cash Flow",
    tooltip: "Entrate – Uscite previste mese corrente",
    icon: Landmark,
    getValue: (_, f) => f.cashFlowNet,
    getPrevValue: () => 0,
    format: fmtCur,
    link: "/azienda/previsionale",
  },
  {
    label: "Burn Rate",
    tooltip: "Uscite giornaliere medie (uscite mese / giorno corrente)",
    icon: Flame,
    getValue: (_, f) => {
      const dayOfMonth = new Date().getDate();
      return dayOfMonth > 0 ? f.thisMonthOutflow / dayOfMonth : 0;
    },
    getPrevValue: () => 0,
    format: v => `${fmtCur(v)}/gg`,
    invertColor: true,
  },
  {
    label: "Da Incassare",
    tooltip: "Totale pagamenti non ancora ricevuti",
    icon: CreditCard,
    getValue: (_, f) => f.pendingRevenue,
    getPrevValue: () => 0,
    format: fmtCur,
    link: "/azienda/previsionale",
  },
  {
    label: "Debiti Fornitori",
    tooltip: "Costi non pagati verso fornitori",
    icon: CreditCard,
    getValue: (_, f) => f.supplierDebt,
    getPrevValue: () => 0,
    format: fmtCur,
    invertColor: true,
    link: "/azienda/costi",
  },
];

const COMMERCIAL_KPIS: KpiDef[] = [
  {
    label: "Lead Nuovi",
    tooltip: "Lead creati nel periodo",
    icon: Users,
    getValue: (k) => k?.leads_new ?? 0,
    getPrevValue: (kp) => kp?.leads_new ?? 0,
    format: fmt,
    link: "/azienda/marketing",
  },
  {
    label: "Appuntamenti",
    tooltip: "Appuntamenti fissati nel periodo",
    icon: CalendarCheck,
    getValue: (k) => k?.appointments_set ?? 0,
    getPrevValue: (kp) => kp?.appointments_set ?? 0,
    format: fmt,
    link: "/azienda/marketing/calendario",
  },
  {
    label: "Show Rate",
    tooltip: "App. svolti / App. fissati × 100",
    icon: Target,
    getValue: (k) => k?.show_rate ?? 0,
    getPrevValue: (kp) => kp?.show_rate ?? 0,
    format: v => `${v.toFixed(1)}%`,
    thresholds: { green: 70, yellow: 50 },
  },
  {
    label: "Contratti Vinti",
    tooltip: "Opportunità con status vinta",
    icon: Trophy,
    getValue: (k) => k?.contracts_won ?? 0,
    getPrevValue: (kp) => kp?.contracts_won ?? 0,
    format: fmt,
    link: "/azienda/ordini",
  },
  {
    label: "Tasso Chiusura",
    tooltip: "Contratti vinti / App. svolti × 100",
    icon: Target,
    getValue: (k) => k?.close_rate ?? 0,
    getPrevValue: (kp) => kp?.close_rate ?? 0,
    format: v => `${v.toFixed(1)}%`,
    thresholds: { green: 30, yellow: 15 },
  },
  {
    label: "Ticket Medio",
    tooltip: "Fatturato / Contratti vinti",
    icon: Euro,
    getValue: (k) => k?.avg_ticket ?? 0,
    getPrevValue: (kp) => kp?.avg_ticket ?? 0,
    format: fmtCur,
  },
  {
    label: "Sales Velocity",
    tooltip: "(Opp × Win Rate × Ticket) / Ciclo medio — €/giorno",
    icon: Zap,
    getValue: (k) => k?.sales_velocity ?? 0,
    getPrevValue: (kp) => kp?.sales_velocity ?? 0,
    format: v => `${fmtCur(v)}/gg`,
  },
];

function KpiCard({ def, kpi, kpiPrev, finance, operations, isLoading }: { def: KpiDef; kpi: KpiData | undefined; kpiPrev: KpiData | undefined; finance: FinanceData; operations: OperationsData; isLoading: boolean }) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card className="p-4">
        <Skeleton className="h-3 w-20 mb-2" />
        <Skeleton className="h-6 w-24" />
      </Card>
    );
  }

  const value = def.getValue(kpi, finance, operations);
  const prevValue = def.getPrevValue(kpiPrev, finance, operations);
  const delta = calcDelta(value, prevValue);

  const DeltaIcon = delta.direction === "up" ? TrendingUp : delta.direction === "down" ? TrendingDown : Minus;

  let valueColor = "text-foreground";
  if (def.thresholds) {
    if (value >= def.thresholds.green) valueColor = "text-emerald-600 dark:text-emerald-400";
    else if (value >= def.thresholds.yellow) valueColor = "text-amber-600 dark:text-amber-400";
    else valueColor = "text-destructive";
  }

  if (def.label === "Cash Flow") {
    valueColor = value >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive";
  }

  const Icon = def.icon;
  const isClickable = !!def.link;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Card
            className={cn("p-4 hover:shadow-md transition-shadow", isClickable && "cursor-pointer hover:ring-1 hover:ring-primary/30")}
            onClick={isClickable ? () => navigate(def.link!) : undefined}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium truncate">{def.label}</span>
              <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            </div>
            <div className={cn("text-lg font-bold tabular-nums", valueColor)}>
              {def.format(value)}
            </div>
            {delta.direction !== "flat" && prevValue !== 0 && (
              <div className={cn(
                "flex items-center gap-1 mt-1 text-xs font-medium",
                delta.direction === "up"
                  ? (def.invertColor ? "text-destructive" : "text-emerald-600 dark:text-emerald-400")
                  : (def.invertColor ? "text-emerald-600 dark:text-emerald-400" : "text-destructive")
              )}>
                <DeltaIcon className="h-3 w-3" />
                {delta.value}%
              </div>
            )}
          </Card>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="text-xs">{def.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

const HIDDEN_FINANCIAL_LABELS = new Set(["Proiezione Mese", "Costo Medio Ordine", "Burn Rate"]);
const VISIBLE_FINANCIAL = FINANCIAL_KPIS.filter(d => !HIDDEN_FINANCIAL_LABELS.has(d.label));
const EXTRA_FINANCIAL = FINANCIAL_KPIS.filter(d => HIDDEN_FINANCIAL_LABELS.has(d.label));

export const ExecutiveOverview = memo(function ExecutiveOverview({ kpi, kpiPrev, finance, operations, isLoading, onDrilldown }: Props) {
  const [showAll, setShowAll] = useState(false);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">KPI Finanziari</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {VISIBLE_FINANCIAL.map(def => (
            <KpiCard key={def.label} def={def} kpi={kpi} kpiPrev={kpiPrev} finance={finance} operations={operations} isLoading={isLoading} />
          ))}
        </div>
        {EXTRA_FINANCIAL.length > 0 && (
          <Collapsible open={showAll} onOpenChange={setShowAll} className="mt-2">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground">
                <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", showAll && "rotate-180")} />
                {showAll ? "Nascondi dettagli" : "Mostra tutte le KPI"}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-2">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {EXTRA_FINANCIAL.map(def => (
                  <KpiCard key={def.label} def={def} kpi={kpi} kpiPrev={kpiPrev} finance={finance} operations={operations} isLoading={isLoading} />
                ))}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </div>

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">KPI Commerciali</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
          {COMMERCIAL_KPIS.map(def => (
            <KpiCard key={def.label} def={def} kpi={kpi} kpiPrev={kpiPrev} finance={finance} operations={operations} isLoading={isLoading} />
          ))}
        </div>
      </div>
    </div>
  );
});
