import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart3, Info } from "lucide-react";
import type { SourceAnalysis } from "@/hooks/useMarketingDashboard";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

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
        <CardHeader><CardTitle className="text-base">Analisi Fonti & ROI</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-40 w-full" /></CardContent>
      </Card>
    );
  }

  const rawRows = sources || [];
  const hasSpend = rawRows.some(r => r.spend > 0);
  
  // Sort by ROI desc if spend data exists, else by leads
  const rows = useMemo(() => {
    return [...rawRows].sort((a, b) => {
      if (hasSpend) {
        return (b.roi_pct ?? -Infinity) - (a.roi_pct ?? -Infinity);
      }
      return b.leads - a.leads;
    });
  }, [rawRows, hasSpend]);

  return (
    <TooltipProvider delayDuration={200}>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Analisi Fonti & ROI</CardTitle>
            </div>
            {!hasSpend && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground cursor-help">
                    <Info className="h-3 w-3" />
                    Dati costo non configurati
                  </div>
                </TooltipTrigger>
                <TooltipContent><p>Aggiungi dati in Costi Campagne per visualizzare CPL, CPA e ROI</p></TooltipContent>
              </Tooltip>
            )}
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
                    {hasSpend && <TableHead className="text-xs text-right font-semibold">ROI %</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(r => {
                    const convRate = r.leads > 0 ? Math.round((r.contracts_won / r.leads) * 100) : 0;
                    const cpl = r.spend > 0 && r.leads > 0 ? r.spend / r.leads : null;
                    const cpa = r.spend > 0 && r.contracts_won > 0 ? r.spend / r.contracts_won : null;
                    const roiPct = r.roi_pct;
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
                        {hasSpend && (
                          <TableCell className={cn("text-sm text-right font-bold",
                            roiPct !== null && roiPct > 0 && "text-emerald-600 dark:text-emerald-400",
                            roiPct !== null && roiPct < 0 && "text-red-600 dark:text-red-400",
                          )}>
                            {roiPct !== null ? `${Math.round(roiPct)}%` : "–"}
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
    </TooltipProvider>
  );
}
