import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, Medal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SalesPerformance } from "@/hooks/useMarketingDashboard";
import { fmtCur, fmt } from "@/components/marketing/dashboard/utils";

interface Props {
  sales: SalesPerformance[] | undefined;
  isLoading: boolean;
}

export const HRPerformance = memo(function HRPerformance({ sales, isLoading }: Props) {
  const ranked = useMemo(() => {
    if (!sales) return [];
    return [...sales].sort((a, b) => b.revenue - a.revenue);
  }, [sales]);

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">HR & Performance Team</h3>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-amber-500" />
            Ranking Commerciali
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : ranked.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nessun dato disponibile</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Commerciale</TableHead>
                  <TableHead className="text-right">Contratti</TableHead>
                  <TableHead className="text-right">Fatturato</TableHead>
                  <TableHead className="text-right">Show Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranked.map((s, i) => (
                  <TableRow key={s.user_id}>
                    <TableCell>
                      {i === 0 ? <Medal className="h-4 w-4 text-amber-500" /> :
                       i === 1 ? <Medal className="h-4 w-4 text-gray-400" /> :
                       i === 2 ? <Medal className="h-4 w-4 text-amber-700" /> :
                       <span className="text-xs text-muted-foreground">{i + 1}</span>}
                    </TableCell>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(s.contracts_won)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmtCur(s.revenue)}</TableCell>
                    <TableCell className={cn(
                      "text-right tabular-nums font-medium",
                      s.show_rate >= 70 ? "text-emerald-600 dark:text-emerald-400" :
                      s.show_rate >= 50 ? "text-amber-600 dark:text-amber-400" :
                      "text-destructive"
                    )}>
                      {s.show_rate.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
});
