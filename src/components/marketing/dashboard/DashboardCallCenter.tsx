import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Phone } from "lucide-react";
import type { CallCenterRow } from "@/hooks/useMarketingDashboard";

interface Props {
  callCenter: CallCenterRow[] | undefined;
  isLoading: boolean;
}

const fmt = (n: number) => new Intl.NumberFormat("it-IT").format(n);

function formatDuration(seconds: number): string {
  if (!seconds) return "0s";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function DashboardCallCenter({ callCenter, isLoading }: Props) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Call Center</CardTitle></CardHeader>
        <CardContent><Skeleton className="h-40 w-full" /></CardContent>
      </Card>
    );
  }

  const rows = callCenter || [];

  if (rows.length === 0) return null;

  const totalCalls = rows.reduce((s, r) => s + r.calls_total, 0);
  const totalAnswered = rows.reduce((s, r) => s + r.calls_answered, 0);
  const contactRate = totalCalls > 0 ? Math.round((totalAnswered / totalCalls) * 100) : 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Call Center</CardTitle>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>Chiamate: <strong className="text-foreground">{fmt(totalCalls)}</strong></span>
            <span>Risposte: <strong className="text-foreground">{fmt(totalAnswered)}</strong></span>
            <span>Tasso: <strong className="text-foreground">{contactRate}%</strong></span>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Operatore</TableHead>
                <TableHead className="text-xs text-right">Chiamate</TableHead>
                <TableHead className="text-xs text-right">Risposte</TableHead>
                <TableHead className="text-xs text-right">Tasso %</TableHead>
                <TableHead className="text-xs text-right">Durata media</TableHead>
                <TableHead className="text-xs text-right">App. Fissati</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(r => {
                const rate = r.calls_total > 0 ? Math.round((r.calls_answered / r.calls_total) * 100) : 0;
                return (
                  <TableRow key={r.user_id}>
                    <TableCell className="text-sm font-medium">{r.name}</TableCell>
                    <TableCell className="text-sm text-right">{fmt(r.calls_total)}</TableCell>
                    <TableCell className="text-sm text-right">{fmt(r.calls_answered)}</TableCell>
                    <TableCell className="text-sm text-right">{rate}%</TableCell>
                    <TableCell className="text-sm text-right">{formatDuration(r.avg_duration_sec)}</TableCell>
                    <TableCell className="text-sm text-right font-semibold">{fmt(r.appointments_set)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
