import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceStrict } from "date-fns";
import { it } from "date-fns/locale";
import { RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";

type DateRange = "day" | "week" | "month";
type StatusFilter = "all" | "running" | "completed" | "failed";

const statusBadge = (status: string) => {
  switch (status) {
    case "running":
      return <Badge className="bg-yellow-500/15 text-yellow-700 border-yellow-300">In corso</Badge>;
    case "completed":
      return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-300">Completato</Badge>;
    case "failed":
      return <Badge variant="destructive">Fallito</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};

function SyncLogs() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [dateRange, setDateRange] = useState<DateRange>("week");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: logs = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["sync-logs", statusFilter, dateRange],
    queryFn: async () => {
      let query = supabase
        .from("google_calendar_sync_log")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(50);

      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const now = new Date();
      if (dateRange === "day") {
        query = query.gte("started_at", new Date(now.getTime() - 86400000).toISOString());
      } else if (dateRange === "week") {
        query = query.gte("started_at", new Date(now.getTime() - 7 * 86400000).toISOString());
      } else {
        query = query.gte("started_at", new Date(now.getTime() - 30 * 86400000).toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  const getDuration = (row: any) => {
    if (!row.completed_at) return "—";
    return formatDistanceStrict(new Date(row.completed_at), new Date(row.started_at), { locale: it });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Sync Logs</h1>
          <p className="text-sm text-muted-foreground">Log di sincronizzazione Google Calendar (cron ogni 5 min)</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Aggiorna
        </Button>
      </div>

      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Stato" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti</SelectItem>
            <SelectItem value="running">In corso</SelectItem>
            <SelectItem value="completed">Completati</SelectItem>
            <SelectItem value="failed">Falliti</SelectItem>
          </SelectContent>
        </Select>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Periodo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="day">Ultimo giorno</SelectItem>
            <SelectItem value="week">Ultima settimana</SelectItem>
            <SelectItem value="month">Ultimo mese</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Data avvio</TableHead>
              <TableHead>Durata</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead className="text-right">Trovate</TableHead>
              <TableHead className="text-right">Sincronizzate</TableHead>
              <TableHead className="text-right">Fallite</TableHead>
              <TableHead>Errore</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Caricamento...
                </TableCell>
              </TableRow>
            ) : logs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                  Nessun log trovato
                </TableCell>
              </TableRow>
            ) : (
              logs.map((log: any) => {
                const isOpen = expandedId === log.id;
                const results = log.results as any[] | null;
                return (
                  <Collapsible key={log.id} open={isOpen} onOpenChange={() => setExpandedId(isOpen ? null : log.id)} asChild>
                    <>
                      <CollapsibleTrigger asChild>
                        <TableRow className="cursor-pointer">
                          <TableCell>
                            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            {format(new Date(log.started_at), "dd/MM/yyyy HH:mm:ss")}
                          </TableCell>
                          <TableCell>{getDuration(log)}</TableCell>
                          <TableCell>{statusBadge(log.status)}</TableCell>
                          <TableCell className="text-right">{log.connections_found}</TableCell>
                          <TableCell className="text-right">{log.connections_synced}</TableCell>
                          <TableCell className="text-right">{log.connections_failed}</TableCell>
                          <TableCell className="max-w-[200px] truncate text-xs text-destructive">
                            {log.error_message || "—"}
                          </TableCell>
                        </TableRow>
                      </CollapsibleTrigger>
                      <CollapsibleContent asChild>
                        <TableRow>
                          <TableCell colSpan={8} className="bg-muted/30 p-4">
                            {results && results.length > 0 ? (
                              <div className="space-y-2">
                                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dettaglio per utente</p>
                                <div className="grid gap-2">
                                  {results.map((r: any, i: number) => (
                                    <div key={i} className="flex items-center gap-3 text-sm rounded-md border bg-background p-3">
                                      <span className="font-medium">{r.user_id?.slice(0, 8)}…</span>
                                      {r.error ? (
                                        <span className="text-destructive text-xs">{r.error}</span>
                                      ) : (
                                        <span className="text-muted-foreground text-xs">
                                          Push: {r.pushed ?? 0} | Pull: {r.pulled ?? 0} | Deleted: {r.deleted ?? 0}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground">Nessun dettaglio disponibile</p>
                            )}
                          </TableCell>
                        </TableRow>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default SyncLogs;
