import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, TrendingUp, TrendingDown } from "lucide-react";
import type { SalesPerformance } from "@/hooks/useMarketingDashboard";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmt, fmtCur } from "./utils";

interface Props {
  sales: SalesPerformance[] | undefined;
  isLoading: boolean;
  compact?: boolean;
}

interface SalesTarget {
  user_id: string;
  target_revenue: number;
  target_contracts: number;
  target_appointments: number;
}

function TargetProgress({ value, target }: { value: number; target: number }) {
  if (!target || target <= 0) return <span className="text-xs text-muted-foreground">—</span>;
  const pct = Math.min(Math.round((value / target) * 100), 100);
  const color = pct >= 80 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-500" : "bg-red-500";
  
  return (
    <div className="flex items-center gap-1.5 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className={cn("text-[10px] font-semibold tabular-nums",
        pct >= 80 && "text-emerald-600 dark:text-emerald-400",
        pct >= 50 && pct < 80 && "text-amber-600 dark:text-amber-400",
        pct < 50 && "text-red-600 dark:text-red-400"
      )}>{pct}%</span>
    </div>
  );
}

export const DashboardSalesTable = memo(function DashboardSalesTable({ sales, isLoading, compact }: Props) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  const { data: targets } = useQuery({
    queryKey: ["sales-targets", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_targets" as any) // TODO: remove 'as any' when types are regenerated
        .select("user_id, target_revenue, target_contracts, target_appointments")
        .eq("company_id", companyId!)
        .eq("period_type", "weekly");
      if (error) throw error;
      return (data || []) as unknown as SalesTarget[];
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Performance Commerciali</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-40 w-full" /></CardContent>
      </Card>
    );
  }

  const rows = sales || [];
  const targetMap = new Map<string, SalesTarget>();
  (targets || []).forEach(t => targetMap.set(t.user_id, t));
  const hasTargets = (targets || []).length > 0;

  const avgRevenue = rows.length > 0 ? rows.reduce((s, r) => s + r.revenue, 0) / rows.length : 0;
  const avgCloseRate = rows.length > 0 ? rows.reduce((s, r) => s + (r.appointments_done > 0 ? (r.contracts_won / r.appointments_done) * 100 : 0), 0) / rows.length : 0;
  const avgShowRate = rows.length > 0 ? rows.reduce((s, r) => s + r.show_rate, 0) / rows.length : 0;

  if (compact) {
    return (
      <div className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">Nessun dato</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Commerciale</TableHead>
                <TableHead className="text-xs text-right">App. Svolti</TableHead>
                <TableHead className="text-xs text-right">Vinti</TableHead>
                <TableHead className="text-xs text-right">Fatturato</TableHead>
                <TableHead className="text-xs text-right">Chiusura %</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const closeRate = r.appointments_done > 0 ? Math.round((r.contracts_won / r.appointments_done) * 100) : 0;
                return (
                  <TableRow key={r.user_id}>
                    <TableCell className="text-xs font-medium py-1.5">{r.name}</TableCell>
                    <TableCell className="text-xs text-right py-1.5">{fmt(r.appointments_done)}</TableCell>
                    <TableCell className="text-xs text-right font-semibold py-1.5">{fmt(r.contracts_won)}</TableCell>
                    <TableCell className="text-xs text-right font-semibold py-1.5">{fmtCur(r.revenue)}</TableCell>
                    <TableCell className="text-xs text-right py-1.5">{closeRate}%</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </div>
    );
  }

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
                  {hasTargets && <TableHead className="text-xs text-center">Target €</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const closeRate = r.appointments_done > 0 ? Math.round((r.contracts_won / r.appointments_done) * 100) : 0;
                  const vsAvg = avgRevenue > 0 ? Math.round(((r.revenue - avgRevenue) / avgRevenue) * 100) : 0;
                  const isAboveAvg = vsAvg > 10;
                  const isBelowAvg = vsAvg < -10;
                  const target = targetMap.get(r.user_id);

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
                      {hasTargets && (
                        <TableCell>
                          <TargetProgress value={r.revenue} target={target?.target_revenue || 0} />
                        </TableCell>
                      )}
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
});
