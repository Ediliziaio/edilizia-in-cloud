import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, TrendingUp, TrendingDown } from "lucide-react";
import type { SalesPerformance } from "@/hooks/useMarketingDashboard";
import { cn } from "@/lib/utils";

interface Props {
  sales: SalesPerformance[] | undefined;
  isLoading: boolean;
}

const fmt = (n: number) => new Intl.NumberFormat("it-IT").format(n);
const fmtCur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export function DashboardSalesTable({ sales, isLoading }: Props) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Performance Commerciali</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-40 w-full" /></CardContent>
      </Card>
    );
  }

  const rows = sales || [];
  
  // Calculate team averages
  const avgRevenue = rows.length > 0 ? rows.reduce((s, r) => s + r.revenue, 0) / rows.length : 0;
  const avgCloseRate = rows.length > 0 ? rows.reduce((s, r) => s + (r.appointments_done > 0 ? (r.contracts_won / r.appointments_done) * 100 : 0), 0) / rows.length : 0;
  const avgShowRate = rows.length > 0 ? rows.reduce((s, r) => s + r.show_rate, 0) / rows.length : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            <CardTitle className="text-base">Performance Commerciali</CardTitle>
          </div>
          {rows.length > 0 && (
            <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
              <span>Media team: {fmtCur(avgRevenue)} | Chiusura {Math.round(avgCloseRate)}% | Show {Math.round(avgShowRate)}%</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nessun dato</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">#</TableHead>
                  <TableHead className="text-xs">Commerciale</TableHead>
                  <TableHead className="text-xs text-right">App. Fissati</TableHead>
                  <TableHead className="text-xs text-right">App. Svolti</TableHead>
                  <TableHead className="text-xs text-right">Show Rate</TableHead>
                  <TableHead className="text-xs text-right">Vinti</TableHead>
                  <TableHead className="text-xs text-right">Fatturato</TableHead>
                  <TableHead className="text-xs text-right">Chiusura %</TableHead>
                  <TableHead className="text-xs text-right">vs Media</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const closeRate = r.appointments_done > 0 ? Math.round((r.contracts_won / r.appointments_done) * 100) : 0;
                  const vsAvg = avgRevenue > 0 ? Math.round(((r.revenue - avgRevenue) / avgRevenue) * 100) : 0;
                  const isAboveAvg = vsAvg > 10;
                  const isBelowAvg = vsAvg < -10;

                  return (
                    <TableRow key={r.user_id} className={cn(
                      i === 0 && rows.length > 1 && "bg-amber-50/50 dark:bg-amber-950/20",
                      isBelowAvg && "bg-red-50/30 dark:bg-red-950/10"
                    )}>
                      <TableCell className="text-xs font-medium text-muted-foreground">
                        {i === 0 && rows.length > 1 ? <Trophy className="h-3.5 w-3.5 text-amber-500" /> : i + 1}
                      </TableCell>
                      <TableCell className="text-sm font-medium">{r.name}</TableCell>
                      <TableCell className="text-sm text-right">{fmt(r.appointments_set)}</TableCell>
                      <TableCell className="text-sm text-right">{fmt(r.appointments_done)}</TableCell>
                      <TableCell className={cn("text-sm text-right", r.show_rate < avgShowRate * 0.8 && "text-red-600 dark:text-red-400")}>
                        {r.show_rate}%
                      </TableCell>
                      <TableCell className="text-sm text-right font-semibold">{fmt(r.contracts_won)}</TableCell>
                      <TableCell className="text-sm text-right font-semibold">{fmtCur(r.revenue)}</TableCell>
                      <TableCell className="text-sm text-right">{closeRate}%</TableCell>
                      <TableCell className="text-sm text-right">
                        <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold",
                          isAboveAvg && "text-emerald-600 dark:text-emerald-400",
                          isBelowAvg && "text-red-600 dark:text-red-400",
                          !isAboveAvg && !isBelowAvg && "text-muted-foreground"
                        )}>
                          {isAboveAvg && <TrendingUp className="h-3 w-3" />}
                          {isBelowAvg && <TrendingDown className="h-3 w-3" />}
                          {vsAvg > 0 ? "+" : ""}{vsAvg}%
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
