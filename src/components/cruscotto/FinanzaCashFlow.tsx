import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownLeft, ArrowUpRight, Landmark, CreditCard } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FinanceData } from "@/hooks/useCruscottoData";
import { fmtCur } from "@/components/marketing/dashboard/utils";

interface Props {
  finance: FinanceData;
  isLoading: boolean;
}

export const FinanzaCashFlow = memo(function FinanzaCashFlow({ finance, isLoading }: Props) {
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

              {/* Income vs Outflow */}
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

              {/* Additional metrics */}
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
