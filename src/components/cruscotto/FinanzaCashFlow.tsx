import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

import { ArrowDownLeft, ArrowUpRight, Landmark, CreditCard, Flame, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FinanceData } from "@/hooks/useCruscottoData";
import { fmtCur, fmt } from "@/components/marketing/dashboard/utils";

interface Props {
  finance: FinanceData;
  isLoading: boolean;
}

export const FinanzaCashFlow = memo(function FinanzaCashFlow({ finance, isLoading }: Props) {
  const { burnRate, cashRunwayDays, runwayStatus } = useMemo(() => {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();
    
    // Daily burn rate = total month outflow / days in month
    const dailyBurn = daysInMonth > 0 ? finance.thisMonthOutflow / daysInMonth : 0;
    
    // Cash runway = net available / daily burn
    const netAvailable = finance.thisMonthIncome - (finance.thisMonthOutflow * (dayOfMonth / daysInMonth));
    const runway = dailyBurn > 0 ? Math.round((finance.thisMonthIncome) / dailyBurn) : 999;
    
    const status: "green" | "yellow" | "red" = runway > 60 ? "green" : runway >= 30 ? "yellow" : "red";

    return { burnRate: dailyBurn, cashRunwayDays: Math.max(0, runway), runwayStatus: status };
  }, [finance]);

  // Income vs outflow ratio for progress bar
  const total = finance.thisMonthIncome + finance.thisMonthOutflow;
  const incomePct = total > 0 ? (finance.thisMonthIncome / total) * 100 : 50;

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Finanza & Cash Flow</h3>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Bilancio Mese Corrente</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-40" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Net Cash Flow */}
              <div>
                <div className="text-xs text-muted-foreground mb-1">Cash Flow Netto</div>
                <div className={cn(
                  "text-2xl font-bold tabular-nums",
                  finance.cashFlowNet >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
                )}>
                  {fmtCur(finance.cashFlowNet)}
                </div>
              </div>

              {/* Income vs Outflow visual bar */}
              <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                  <span>Entrate vs Uscite</span>
                  <span>{incomePct.toFixed(0)}% / {(100 - incomePct).toFixed(0)}%</span>
                </div>
                <div className="flex h-3 w-full rounded-full overflow-hidden bg-muted">
                  <div
                    className="bg-emerald-500 transition-all duration-500"
                    style={{ width: `${incomePct}%` }}
                  />
                  <div
                    className="bg-destructive transition-all duration-500"
                    style={{ width: `${100 - incomePct}%` }}
                  />
                </div>
              </div>

              {/* Income vs Outflow numbers */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-2">
                  <ArrowUpRight className="h-4 w-4 text-emerald-500 mt-0.5" />
                  <div>
                    <div className="text-xs text-muted-foreground">Entrate Previste</div>
                    <div className="text-sm font-semibold tabular-nums">{fmtCur(finance.thisMonthIncome)}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <ArrowDownLeft className="h-4 w-4 text-destructive mt-0.5" />
                  <div>
                    <div className="text-xs text-muted-foreground">Uscite Previste</div>
                    <div className="text-sm font-semibold tabular-nums">{fmtCur(finance.thisMonthOutflow)}</div>
                  </div>
                </div>
              </div>

              {/* Burn Rate + Cash Runway */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div className="flex items-start gap-2">
                  <Flame className="h-4 w-4 text-amber-500 mt-0.5" />
                  <div>
                    <div className="text-xs text-muted-foreground">Burn Rate /gg</div>
                    <div className="text-sm font-semibold tabular-nums">{fmtCur(burnRate)}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 mt-0.5" />
                  <div>
                    <div className="text-xs text-muted-foreground">Cash Runway</div>
                    <div className={cn(
                      "text-sm font-semibold tabular-nums",
                      runwayStatus === "green" && "text-emerald-600 dark:text-emerald-400",
                      runwayStatus === "yellow" && "text-amber-600 dark:text-amber-400",
                      runwayStatus === "red" && "text-destructive",
                    )}>
                      {cashRunwayDays > 365 ? "∞" : `${cashRunwayDays}gg`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Pending + Supplier Debt */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div className="flex items-start gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <div className="text-xs text-muted-foreground">Da Incassare</div>
                    <div className="text-sm font-semibold tabular-nums">{fmtCur(finance.pendingRevenue)}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Landmark className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <div className="text-xs text-muted-foreground">Debiti Fornitori</div>
                    <div className="text-sm font-semibold tabular-nums">{fmtCur(finance.supplierDebt)}</div>
                  </div>
                </div>
              </div>

              {/* Margin */}
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Margine Medio Commessa</span>
                  <span className={cn(
                    "text-sm font-bold",
                    finance.marginThisMonth >= 30 ? "text-emerald-600 dark:text-emerald-400" :
                    finance.marginThisMonth >= 15 ? "text-amber-600 dark:text-amber-400" :
                    "text-destructive"
                  )}>
                    {finance.marginThisMonth.toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
});
