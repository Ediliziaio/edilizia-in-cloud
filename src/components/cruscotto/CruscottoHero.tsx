import { useMemo } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { FinanceData, OperationsData } from "@/hooks/useCruscottoData";
import type { KpiData } from "@/hooks/useMarketingDashboard";
import { cn } from "@/lib/utils";
import { formatCurrencyCompact } from "@/lib/formatters";

const fmtEur = formatCurrencyCompact;

function pctDelta(curr: number, prev: number): number | null {
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
}

function calcHealth(kpi: KpiData | undefined, finance: FinanceData, ops: OperationsData) {
  const margin = finance.marginThisMonth ?? 0;
  const cf = finance.cashFlowNet ?? 0;
  const closeRate = kpi?.close_rate ?? 0;
  const showRate = kpi?.show_rate ?? 0;
  const late = (ops.lateOrders ?? 0) + (ops.overduePayments ?? 0);

  const scores = [
    margin >= 30 ? 100 : margin >= 15 ? 60 : margin >= 0 ? 30 : 0,
    cf > 5000 ? 100 : cf >= 0 ? 70 : cf > -5000 ? 30 : 0,
    closeRate >= 30 ? 100 : closeRate >= 15 ? 60 : closeRate > 0 ? 30 : 0,
    showRate >= 70 ? 100 : showRate >= 50 ? 60 : showRate > 0 ? 20 : 0,
    late === 0 ? 100 : late <= 2 ? 60 : late <= 5 ? 30 : 0,
  ];
  const weights = [0.25, 0.25, 0.20, 0.15, 0.15];
  const total = Math.round(scores.reduce((s, v, i) => s + v * weights[i], 0));
  const status = total >= 70 ? "green" : total >= 40 ? "yellow" : "red";
  return { score: total, status } as const;
}

interface Props {
  finance: FinanceData;
  operations: OperationsData;
  kpi: KpiData | undefined;
  monthRevenue: number;
  quarterRevenue: number;
  ytdRevenue: number;
  isLoading?: boolean;
}

function HeroSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {[...Array(4)].map((_, i) => (
        <Skeleton key={i} className="h-40 rounded-xl" />
      ))}
    </div>
  );
}

export function CruscottoHero({ finance, operations, kpi, monthRevenue, quarterRevenue, ytdRevenue, isLoading }: Props) {
  const delta = useMemo(() => pctDelta(finance.revenueThisMonth, finance.revenuePrevMonth), [finance]);
  const { score, status } = useMemo(() => calcHealth(kpi, finance, operations), [kpi, finance, operations]);
  const posNet = finance.pendingRevenue - finance.supplierDebt;

  const scoreColor = status === "green" ? "hsl(var(--chart-2))" : status === "yellow" ? "hsl(45 93% 47%)" : "hsl(var(--destructive))";

  if (isLoading) return <HeroSkeleton />;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {/* Fatturato */}
      <Card className="border-none shadow-md bg-gradient-to-br from-card to-muted/30">
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Fatturato</p>
          <div className="flex items-end gap-2">
            <span className="text-2xl font-bold text-foreground">{fmtEur(monthRevenue)}</span>
            {delta === null ? (
              <Minus className="w-3.5 h-3.5 text-muted-foreground mb-1" />
            ) : delta > 0 ? (
              <span className="flex items-center gap-0.5 text-xs font-medium text-green-600 mb-1">
                <TrendingUp className="w-3 h-3" /> +{delta.toFixed(0)}%
              </span>
            ) : (
              <span className="flex items-center gap-0.5 text-xs font-medium text-destructive mb-1">
                <TrendingDown className="w-3 h-3" /> {delta.toFixed(0)}%
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">vs mese prec.</p>
          <div className="flex gap-4 pt-1 border-t border-border/50">
            <div>
              <p className="text-[10px] text-muted-foreground">Trimestre</p>
              <p className="text-sm font-semibold text-foreground">{fmtEur(quarterRevenue)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Anno (YTD)</p>
              <p className="text-sm font-semibold text-foreground">{fmtEur(ytdRevenue)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cash Flow Mese */}
      <Card className="border-none shadow-md">
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Cash Flow Mese</p>
          <div className="flex items-end gap-2">
            <span className={cn("text-2xl font-bold", finance.cashFlowNet >= 0 ? "text-green-600" : "text-destructive")}>
              {finance.cashFlowNet >= 0 ? "+" : ""}{fmtEur(finance.cashFlowNet)}
            </span>
            <span className={cn("text-[10px] font-medium mb-1", finance.cashFlowNet >= 0 ? "text-green-600" : "text-destructive")}>
              ● {finance.cashFlowNet >= 0 ? "Positivo" : "Negativo"}
            </span>
          </div>
          <div className="flex gap-4 pt-1 border-t border-border/50">
            <div>
              <p className="text-[10px] text-muted-foreground">Entrate</p>
              <p className="text-sm font-semibold text-green-600">{fmtEur(finance.thisMonthIncome)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Uscite</p>
              <p className="text-sm font-semibold text-destructive">{fmtEur(finance.thisMonthOutflow)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Posizione Netta */}
      <Card className="border-none shadow-md">
        <CardContent className="p-4 space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Posizione Netta</p>
          <span className={cn("text-2xl font-bold", posNet >= 0 ? "text-green-600" : "text-destructive")}>
            {posNet >= 0 ? "+" : ""}{fmtEur(posNet)}
          </span>
          <p className="text-[11px] text-muted-foreground">crediti – debiti</p>
          <div className="flex gap-4 pt-1 border-t border-border/50">
            <div>
              <p className="text-[10px] text-muted-foreground">Da incassare</p>
              <p className="text-sm font-semibold text-foreground">{fmtEur(finance.pendingRevenue)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground">Debiti fornitori</p>
              <p className="text-sm font-semibold text-foreground">{fmtEur(finance.supplierDebt)}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Salute Aziendale */}
      <Card className="border-none shadow-md">
        <CardContent className="p-4 flex items-center gap-4">
          <div className="w-20 h-20 relative shrink-0">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="hsl(var(--muted))" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke={scoreColor} strokeWidth="3"
                strokeDasharray={`${score} ${100 - score}`}
                strokeLinecap="round"
                style={{ transition: "stroke-dasharray 0.5s ease" }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-lg font-bold text-foreground">{score}</span>
            </div>
          </div>
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Salute Aziendale</p>
            <p className={cn("text-sm font-semibold",
              status === "green" && "text-green-600",
              status === "yellow" && "text-amber-600",
              status === "red" && "text-destructive"
            )}>
              {status === "green" ? "Ottimo" : status === "yellow" ? "Attenzione" : "Critico"}
            </p>
            <p className="text-[10px] text-muted-foreground">su 100 punti</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Margine · Cash flow · Vendite · Show rate · Operazioni</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
