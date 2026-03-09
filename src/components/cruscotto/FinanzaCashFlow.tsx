import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, Cell } from "recharts";
import { ArrowDownLeft, ArrowUpRight, Landmark, CreditCard, Flame, Clock, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FinanceData } from "@/hooks/useCruscottoData";
import { safeNumber } from "@/hooks/useCruscottoData";
import { fmtCur } from "@/components/marketing/dashboard/utils";

interface Props {
  finance: FinanceData;
  isLoading: boolean;
}

export const FinanzaCashFlow = memo(function FinanzaCashFlow({ finance, isLoading }: Props) {
  const { burnRate, cashRunwayDays, runwayStatus, runwayLabel, netBalance } = useMemo(() => {
    const now = new Date();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const dayOfMonth = now.getDate();

    // BUG 1 FIX: Correct runway formula
    const outflowSoFar = safeNumber(finance.thisMonthOutflow);
    const balance = safeNumber(finance.thisMonthIncome) - outflowSoFar;
    const dailyBurn = dayOfMonth > 0 ? safeNumber(outflowSoFar / dayOfMonth) : 0;
    const runway = dailyBurn > 0
      ? Math.max(0, Math.round(safeNumber(balance / dailyBurn)))
      : balance > 0 ? 999 : 0;

    // Runway label
    const label = runway >= 999
      ? "Stabile"
      : runway > 365
        ? `${Math.round(runway / 30)} mesi`
        : `${runway}gg`;

    // Status thresholds: 0-7 red, 8-30 orange, 31-90 yellow, >90 green
    const status: "green" | "yellow" | "red" =
      runway >= 999 ? "green" :
      runway > 90 ? "green" :
      runway > 30 ? "yellow" :
      "red";

    return { burnRate: dailyBurn, cashRunwayDays: runway, runwayStatus: status, runwayLabel: label, netBalance: balance };
  }, [finance]);

  // Income vs outflow ratio for progress bar
  const total = safeNumber(finance.thisMonthIncome) + safeNumber(finance.thisMonthOutflow);
  const incomePct = total > 0 ? (safeNumber(finance.thisMonthIncome) / total) * 100 : 50;

  // Empty state
  const isEmpty = !isLoading && finance.thisMonthIncome === 0 && finance.thisMonthOutflow === 0 && finance.pendingRevenue === 0;

  if (isEmpty) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Finanza & Cash Flow</h3>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <TrendingDown className="h-10 w-10 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">Nessun dato finanziario</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Inserisci ordini e costi per visualizzare il cash flow</p>
          </CardContent>
        </Card>
      </div>
    );
  }

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
                  {fmtCur(safeNumber(finance.cashFlowNet))}
                </div>
              </div>

              {/* Income vs Outflow visual bar */}
              <div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                  <span>Entrate vs Uscite</span>
                  <span>{safeNumber(incomePct).toFixed(0)}% / {safeNumber(100 - incomePct).toFixed(0)}%</span>
                </div>
                <div className="flex h-3 w-full rounded-full overflow-hidden bg-muted">
                  <div
                    className="bg-emerald-500 transition-all duration-500"
                    style={{ width: `${safeNumber(incomePct)}%` }}
                  />
                  <div
                    className="bg-destructive transition-all duration-500"
                    style={{ width: `${safeNumber(100 - incomePct)}%` }}
                  />
                </div>
              </div>

              {/* Income vs Outflow numbers */}
              <div className="grid grid-cols-2 gap-4">
                <div className="flex items-start gap-2">
                  <ArrowUpRight className="h-4 w-4 text-emerald-500 mt-0.5" />
                  <div>
                    <div className="text-xs text-muted-foreground">Entrate Previste</div>
                    <div className="text-sm font-semibold tabular-nums">{fmtCur(safeNumber(finance.thisMonthIncome))}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <ArrowDownLeft className="h-4 w-4 text-destructive mt-0.5" />
                  <div>
                    <div className="text-xs text-muted-foreground">Uscite Previste</div>
                    <div className="text-sm font-semibold tabular-nums">{fmtCur(safeNumber(finance.thisMonthOutflow))}</div>
                  </div>
                </div>
              </div>

              {/* Burn Rate + Cash Runway */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div className="flex items-start gap-2">
                  <Flame className="h-4 w-4 text-amber-500 mt-0.5" />
                  <div>
                    <div className="text-xs text-muted-foreground">Burn Rate /gg</div>
                    <div className="text-sm font-semibold tabular-nums">{fmtCur(safeNumber(burnRate))}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Clock className="h-4 w-4 mt-0.5" />
                  <div>
                    <div className="text-xs text-muted-foreground">Cash Runway</div>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className={cn(
                            "text-sm font-semibold tabular-nums cursor-help",
                            runwayStatus === "green" && "text-emerald-600 dark:text-emerald-400",
                            runwayStatus === "yellow" && "text-amber-600 dark:text-amber-400",
                            runwayStatus === "red" && "text-destructive",
                          )}>
                            {runwayLabel}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom" className="max-w-xs">
                          <p className="text-xs font-medium">Giorni stimati prima di esaurire il saldo netto</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Saldo: {fmtCur(safeNumber(netBalance))} / Burn: {fmtCur(safeNumber(burnRate))}/gg
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                </div>
              </div>

              {/* Pending + Supplier Debt */}
              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div className="flex items-start gap-2">
                  <CreditCard className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <div className="text-xs text-muted-foreground">Da Incassare</div>
                    <div className="text-sm font-semibold tabular-nums">{fmtCur(safeNumber(finance.pendingRevenue))}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Landmark className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div>
                    <div className="text-xs text-muted-foreground">Debiti Fornitori</div>
                    <div className="text-sm font-semibold tabular-nums">{fmtCur(safeNumber(finance.supplierDebt))}</div>
                  </div>
                </div>
              </div>

              {/* Margin */}
              <div className="pt-2 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Margine Ponderato Commesse</span>
                  <span className={cn(
                    "text-sm font-bold",
                    safeNumber(finance.marginThisMonth) >= 30 ? "text-emerald-600 dark:text-emerald-400" :
                    safeNumber(finance.marginThisMonth) >= 15 ? "text-amber-600 dark:text-amber-400" :
                    "text-destructive"
                  )}>
                    {safeNumber(finance.marginThisMonth).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Visual bar chart: Income vs Outflow */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Entrate vs Uscite</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  { name: "Entrate", value: safeNumber(finance.thisMonthIncome), fill: "hsl(142, 76%, 36%)" },
                  { name: "Uscite", value: safeNumber(finance.thisMonthOutflow), fill: "hsl(0, 84%, 60%)" },
                  { name: "Netto", value: safeNumber(finance.cashFlowNet), fill: finance.cashFlowNet >= 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)" },
                ]}
                margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
              >
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={v => fmtCur(v)} tick={{ fontSize: 10 }} />
                <RechartsTooltip formatter={(v: number) => fmtCur(v)} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {[
                    { fill: "hsl(142, 76%, 36%)" },
                    { fill: "hsl(0, 84%, 60%)" },
                    { fill: finance.cashFlowNet >= 0 ? "hsl(142, 76%, 36%)" : "hsl(0, 84%, 60%)" },
                  ].map((entry, i) => (
                    <Cell key={i} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
});
