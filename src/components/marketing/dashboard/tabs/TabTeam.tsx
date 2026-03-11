import { memo } from "react";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DashboardSalesTable } from "@/components/marketing/dashboard/DashboardSalesTable";
import { fmt, fmtCur } from "@/components/marketing/dashboard/utils";
import type { DashboardStats } from "@/hooks/useMarketingDashboard";
import { Trophy, Users, Target, Phone, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRecalculateAllLeadScores } from "@/hooks/useSalesOS";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface Props {
  data: DashboardStats | undefined;
  isLoading: boolean;
}

export const TabTeam = memo(function TabTeam({ data, isLoading }: Props) {
  const sales = data?.sales_performance || [];
  const totalRevenue = sales.reduce((s, r) => s + r.revenue, 0);
  const totalWon = sales.reduce((s, r) => s + r.contracts_won, 0);
  const avgCloseRate = sales.length > 0
    ? Math.round(sales.reduce((s, r) => s + (r.appointments_done > 0 ? (r.contracts_won / r.appointments_done) * 100 : 0), 0) / sales.length)
    : 0;

  const cc = data?.call_center || [];

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Users className="h-4 w-4 text-muted-foreground/60" />
            <span className="text-xs text-muted-foreground">Team</span>
          </div>
          <div className="text-2xl font-bold">{sales.length}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Trophy className="h-4 w-4 text-amber-500" />
            <span className="text-xs text-muted-foreground">Contratti Vinti</span>
          </div>
          <div className="text-2xl font-bold">{totalWon}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-muted-foreground">Fatturato Totale</span>
          </div>
          <div className="text-2xl font-bold">{fmtCur(totalRevenue)}</div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-1">
            <Target className="h-4 w-4 text-muted-foreground/60" />
            <span className="text-xs text-muted-foreground">Chiusura Media</span>
          </div>
          <div className="text-2xl font-bold">{avgCloseRate}%</div>
        </Card>
      </div>

      {/* Full sales table */}
      <DashboardSalesTable sales={data?.sales_performance} isLoading={isLoading} />

      {/* Call center per operatore */}
      {cc.length > 0 && (
        <Card>
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold">Attività Call Center per Operatore</span>
            </div>
            <span className="text-xs text-muted-foreground">
              Totale: {fmt(cc.reduce((s, r) => s + r.calls_total, 0))} chiamate
            </span>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Operatore</TableHead>
                  <TableHead className="text-xs text-right">Chiamate</TableHead>
                  <TableHead className="text-xs text-right">Risposte</TableHead>
                  <TableHead className="text-xs text-right">Tasso %</TableHead>
                  <TableHead className="text-xs text-right">App. Fissati</TableHead>
                  <TableHead className="text-xs text-right">Conv. Call→App</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cc.map(row => {
                  const contactRate = row.calls_total > 0 ? (row.calls_answered / row.calls_total) * 100 : 0;
                  const convRate = row.calls_total > 0 ? (row.appointments_set / row.calls_total) * 100 : 0;
                  return (
                    <TableRow key={row.user_id}>
                      <TableCell className="text-sm font-medium">{row.name}</TableCell>
                      <TableCell className="text-sm text-right">{fmt(row.calls_total)}</TableCell>
                      <TableCell className="text-sm text-right">{fmt(row.calls_answered)}</TableCell>
                      <TableCell className={`text-sm text-right font-medium ${
                        contactRate >= 50 ? "text-green-600 dark:text-green-400" :
                        contactRate >= 30 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"
                      }`}>
                        {contactRate.toFixed(1)}%
                      </TableCell>
                      <TableCell className="text-sm text-right font-semibold">{fmt(row.appointments_set)}</TableCell>
                      <TableCell className="text-sm text-right text-muted-foreground">{convRate.toFixed(1)}%</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
});
