import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3 } from "lucide-react";
import type { SourceAnalysis } from "@/hooks/useMarketingDashboard";

interface Props {
  sources: SourceAnalysis[] | undefined;
  isLoading: boolean;
}

const fmt = (n: number) => new Intl.NumberFormat("it-IT").format(n);
const fmtCur = (n: number) => new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export function DashboardSourcesTable({ sources, isLoading }: Props) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Analisi Fonti</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-40 w-full" /></CardContent>
      </Card>
    );
  }

  const rows = sources || [];
  const hasSpend = rows.some(r => r.spend > 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <CardTitle className="text-base">Analisi Fonti</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Nessun dato nel periodo</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Fonte</TableHead>
                  <TableHead className="text-xs text-right">Lead</TableHead>
                  <TableHead className="text-xs text-right">Contratti</TableHead>
                  <TableHead className="text-xs text-right">Fatturato</TableHead>
                  <TableHead className="text-xs text-right">Conv. %</TableHead>
                  {hasSpend && <TableHead className="text-xs text-right">Spesa</TableHead>}
                  {hasSpend && <TableHead className="text-xs text-right">CPL</TableHead>}
                  {hasSpend && <TableHead className="text-xs text-right">CPA</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(r => {
                  const convRate = r.leads > 0 ? Math.round((r.contracts_won / r.leads) * 100) : 0;
                  const cpl = r.spend > 0 && r.leads > 0 ? r.spend / r.leads : null;
                  const cpa = r.spend > 0 && r.contracts_won > 0 ? r.spend / r.contracts_won : null;
                  return (
                    <TableRow key={r.source}>
                      <TableCell className="text-sm font-medium">{r.source}</TableCell>
                      <TableCell className="text-sm text-right">{fmt(r.leads)}</TableCell>
                      <TableCell className="text-sm text-right font-semibold">{fmt(r.contracts_won)}</TableCell>
                      <TableCell className="text-sm text-right font-semibold">{fmtCur(r.revenue)}</TableCell>
                      <TableCell className="text-sm text-right">{convRate}%</TableCell>
                      {hasSpend && <TableCell className="text-sm text-right">{r.spend > 0 ? fmtCur(r.spend) : "–"}</TableCell>}
                      {hasSpend && <TableCell className="text-sm text-right">{cpl ? fmtCur(cpl) : "–"}</TableCell>}
                      {hasSpend && <TableCell className="text-sm text-right">{cpa ? fmtCur(cpa) : "–"}</TableCell>}
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
