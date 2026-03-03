import { memo, useMemo } from "react";
import { FileText } from "lucide-react";
import type { KpiData } from "@/hooks/useMarketingDashboard";
import type { FinanceData, OperationsData } from "@/hooks/useCruscottoData";
import { fmtCur } from "@/components/marketing/dashboard/utils";
import { Skeleton } from "@/components/ui/skeleton";

interface Props {
  kpi: KpiData | undefined;
  kpiPrev: KpiData | undefined;
  finance: FinanceData;
  operations: OperationsData;
  isLoading: boolean;
}

function buildInsights(kpi: KpiData | undefined, kpiPrev: KpiData | undefined, finance: FinanceData, ops: OperationsData): string[] {
  const insights: string[] = [];

  // Revenue insight
  const rev = finance.revenueThisMonth;
  const revPrev = finance.revenuePrevMonth;
  if (revPrev > 0) {
    const delta = ((rev - revPrev) / revPrev * 100).toFixed(0);
    const dir = rev >= revPrev ? "in crescita" : "in calo";
    insights.push(`Fatturato ${fmtCur(rev)}, ${dir} del ${Math.abs(Number(delta))}% rispetto al periodo precedente.`);
  } else if (rev > 0) {
    insights.push(`Fatturato del periodo: ${fmtCur(rev)}.`);
  }

  // Margin insight
  const margin = finance.marginThisMonth;
  if (margin < 15) {
    insights.push(`Margine lordo critico (${margin.toFixed(1)}%). Verificare i costi commessa.`);
  } else if (margin < 30) {
    insights.push(`Margine lordo al ${margin.toFixed(1)}%, sotto la soglia ottimale del 30%.`);
  }

  // Pipeline insight
  const pipeline = Number(kpi?.pipeline_active_value ?? 0);
  const forecast = Number(kpi?.forecast_30d ?? 0);
  if (pipeline > 0) {
    insights.push(`Pipeline attiva ${fmtCur(pipeline)} con forecast 30gg di ${fmtCur(forecast)}.`);
  }

  // Cash flow insight
  if (finance.cashFlowNet < 0) {
    insights.push(`Cash flow negativo (${fmtCur(finance.cashFlowNet)}). Sollecitare incassi o ridurre uscite.`);
  }

  // Operations insight
  if (ops.overduePayments > 0) {
    insights.push(`${ops.overduePayments} pagamenti scaduti per ${fmtCur(ops.overdueAmount)}.`);
  }

  // Show rate insight
  const showRate = kpi?.show_rate ?? 0;
  if (showRate > 0 && showRate < 50) {
    insights.push(`Show rate basso (${showRate.toFixed(0)}%). Rivedere qualifica lead e promemoria.`);
  }

  // Close rate
  const closeRate = kpi?.close_rate ?? 0;
  const wonCount = kpi?.contracts_won ?? 0;
  if (wonCount > 0 && closeRate >= 30) {
    insights.push(`Tasso chiusura solido al ${closeRate.toFixed(0)}% con ${wonCount} contratti vinti.`);
  }

  return insights.slice(0, 4); // Max 4 insights
}

export const ExecutiveSummary = memo(function ExecutiveSummary({ kpi, kpiPrev, finance, operations, isLoading }: Props) {
  const insights = useMemo(() => buildInsights(kpi, kpiPrev, finance, operations), [kpi, kpiPrev, finance, operations]);

  if (isLoading) {
    return (
      <div className="p-4 rounded-lg border bg-card space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    );
  }

  if (insights.length === 0) return null;

  return (
    <div className="p-4 rounded-lg border bg-card">
      <div className="flex items-center gap-2 mb-2">
        <FileText className="h-4 w-4 text-muted-foreground" />
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Sintesi Esecutiva</h4>
      </div>
      <ul className="space-y-1">
        {insights.map((text, i) => (
          <li key={i} className="text-sm text-foreground leading-relaxed">
            • {text}
          </li>
        ))}
      </ul>
    </div>
  );
});
