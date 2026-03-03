import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy } from "lucide-react";
import type { SalesPerformance } from "@/hooks/useMarketingDashboard";

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

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-500" />
          <CardTitle className="text-base">Performance Commerciali</CardTitle>
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
                  <TableHead className="text-xs text-right">Vinti</TableHead>
                  <TableHead className="text-xs text-right">Fatturato</TableHead>
                  <TableHead className="text-xs text-right">Chiusura %</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => {
                  const closeRate = r.appointments_done > 0 ? Math.round((r.contracts_won / r.appointments_done) * 100) : 0;
                  return (
                    <TableRow key={r.user_id}>
                      <TableCell className="text-xs font-medium text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-sm font-medium">{r.name}</TableCell>
                      <TableCell className="text-sm text-right">{fmt(r.appointments_set)}</TableCell>
                      <TableCell className="text-sm text-right">{fmt(r.appointments_done)}</TableCell>
                      <TableCell className="text-sm text-right font-semibold">{fmt(r.contracts_won)}</TableCell>
                      <TableCell className="text-sm text-right font-semibold">{fmtCur(r.revenue)}</TableCell>
                      <TableCell className="text-sm text-right">{closeRate}%</TableCell>
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
