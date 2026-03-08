import { memo, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { KpiData } from "@/hooks/useMarketingDashboard";
import type { FinanceData, OperationsData } from "@/hooks/useCruscottoData";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  kpi: KpiData | undefined;
  finance: FinanceData;
  operations: OperationsData;
  isLoading: boolean;
}

interface ScoreFactor {
  label: string;
  score: number; // 0-100
  status: "green" | "yellow" | "red";
  summary: string;
}

function calcFactors(kpi: KpiData | undefined, finance: FinanceData, operations: OperationsData): ScoreFactor[] {
  const factors: ScoreFactor[] = [];

  const margin = finance.marginThisMonth;
  const marginScore = margin >= 30 ? 100 : margin >= 15 ? 60 : margin >= 0 ? 30 : 0;
  factors.push({ label: "Margine", score: marginScore, status: marginScore >= 70 ? "green" : marginScore >= 40 ? "yellow" : "red", summary: margin >= 30 ? "OK" : margin >= 15 ? "Attenzione" : "Critico" });

  const cf = finance.cashFlowNet;
  const cfScore = cf > 5000 ? 100 : cf >= 0 ? 70 : cf > -5000 ? 30 : 0;
  factors.push({ label: "Cash Flow", score: cfScore, status: cfScore >= 70 ? "green" : cfScore >= 40 ? "yellow" : "red", summary: cf > 0 ? "Positivo" : cf === 0 ? "Neutro" : "Negativo" });

  const closeRate = kpi?.close_rate ?? 0;
  const crScore = closeRate >= 30 ? 100 : closeRate >= 15 ? 60 : closeRate > 0 ? 30 : 0;
  factors.push({ label: "Vendite", score: crScore, status: crScore >= 70 ? "green" : crScore >= 40 ? "yellow" : "red", summary: closeRate >= 30 ? "Forti" : closeRate >= 15 ? "Nella media" : "Deboli" });

  const showRate = kpi?.show_rate ?? 0;
  const srScore = showRate >= 70 ? 100 : showRate >= 50 ? 60 : showRate > 0 ? 20 : 0;
  factors.push({ label: "Show Rate", score: srScore, status: srScore >= 70 ? "green" : srScore >= 40 ? "yellow" : "red", summary: showRate >= 70 ? "Alto" : showRate >= 50 ? "Medio" : "Basso" });

  const late = operations.lateOrders + operations.overduePayments;
  const opsScore = late === 0 ? 100 : late <= 2 ? 60 : late <= 5 ? 30 : 0;
  factors.push({ label: "Operazioni", score: opsScore, status: opsScore >= 70 ? "green" : opsScore >= 40 ? "yellow" : "red", summary: late === 0 ? "In ordine" : late <= 3 ? "Da monitorare" : "Critiche" });

  return factors;
}

const WEIGHTS = [0.25, 0.25, 0.20, 0.15, 0.15];
const WEIGHT_LABELS = ["25%", "25%", "20%", "15%", "15%"];

export const CompanyHealthScore = memo(function CompanyHealthScore({ kpi, finance, operations, isLoading }: Props) {
  const factors = useMemo(() => calcFactors(kpi, finance, operations), [kpi, finance, operations]);
  const totalScore = useMemo(
    () => Math.round(factors.reduce((sum, f, i) => sum + f.score * WEIGHTS[i], 0)),
    [factors]
  );

  const overallStatus = totalScore >= 70 ? "green" : totalScore >= 40 ? "yellow" : "red";

  if (isLoading) {
    return (
      <div className="flex items-center gap-6 p-6 rounded-xl border bg-card">
        <Skeleton className="h-24 w-24 rounded-full shrink-0" />
        <div className="space-y-2 flex-1">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-start gap-6 p-6 rounded-xl border bg-card">
      {/* Score circle */}
      <div className="relative shrink-0 self-center sm:self-start">
        <svg width="96" height="96" viewBox="0 0 96 96" className="transform -rotate-90">
          <circle cx="48" cy="48" r="40" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
          <circle
            cx="48" cy="48" r="40"
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 40}`}
            strokeDashoffset={`${2 * Math.PI * 40 * (1 - totalScore / 100)}`}
            className={cn(
              "transition-all duration-700",
              overallStatus === "green" && "stroke-emerald-500",
              overallStatus === "yellow" && "stroke-amber-500",
              overallStatus === "red" && "stroke-destructive",
            )}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={cn(
            "text-2xl font-bold tabular-nums",
            overallStatus === "green" && "text-emerald-600 dark:text-emerald-400",
            overallStatus === "yellow" && "text-amber-600 dark:text-amber-400",
            overallStatus === "red" && "text-destructive",
          )}>
            {totalScore}
          </span>
        </div>
      </div>

      {/* Factors summary + bars */}
      <div className="flex-1 min-w-0 w-full">
        <h3 className="text-sm font-semibold text-foreground mb-1">Salute Aziendale</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {factors.map(f => (
            <span
              key={f.label}
              className={cn(
                "inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium",
                f.status === "green" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                f.status === "yellow" && "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                f.status === "red" && "bg-destructive/10 text-destructive",
              )}
            >
              <span className={cn(
                "h-1.5 w-1.5 rounded-full",
                f.status === "green" && "bg-emerald-500",
                f.status === "yellow" && "bg-amber-500",
                f.status === "red" && "bg-destructive",
              )} />
              {f.label}: {f.summary}
            </span>
          ))}
        </div>

        {/* Breakdown bars — clickable */}
        <HealthBreakdownBars factors={factors} />
      </div>
    </div>
  );
});

const ROUTE_MAP: Record<string, string> = {
  Margine: "/azienda/previsionale",
  "Cash Flow": "/azienda/previsionale",
  Vendite: "/azienda/marketing",
  "Show Rate": "/azienda/marketing/calendario",
  Operazioni: "/azienda/ordini",
};

function HealthBreakdownBars({ factors }: { factors: ScoreFactor[] }) {
  const navigate = useNavigate();
  return (
    <div className="space-y-2">
      {factors.map((f, i) => (
        <div
          key={f.label}
          className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/50 rounded-md px-1 py-0.5 transition-colors"
          onClick={() => {
            const route = ROUTE_MAP[f.label];
            if (route) navigate(route);
          }}
        >
          <span className="w-20 text-muted-foreground truncate">{f.label}</span>
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                f.status === "green" && "bg-emerald-500",
                f.status === "yellow" && "bg-amber-500",
                f.status === "red" && "bg-destructive",
              )}
              style={{ width: `${f.score}%` }}
            />
          </div>
          <span className="w-8 text-right text-muted-foreground tabular-nums">{WEIGHT_LABELS[i]}</span>
        </div>
      ))}
    </div>
  );
      </div>
    </div>
  );
});
