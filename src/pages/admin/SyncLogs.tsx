import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceStrict } from "date-fns";
import { it } from "date-fns/locale";
import { RefreshCw, ChevronDown, ChevronRight, AlertTriangle, Loader2, CreditCard, Mail } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [activeTab, setActiveTab] = useState("sync");
  const [visitedTabs, setVisitedTabs] = useState<Set<string>>(() => new Set(["sync"]));
  const onTabChange = (v: string) => {
    setActiveTab(v);
    setVisitedTabs((prev) => {
      if (prev.has(v)) return prev;
      const next = new Set(prev);
      next.add(v);
      return next;
    });
  };
  const isMounted = (k: string) => visitedTabs.has(k);

  const { data: logs = [], isLoading, isError, error, refetch, isFetching } = useQuery({
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
    staleTime: 30_000,
  });

  const { data: edgeData, isLoading: edgeLoading } = useQuery({
    queryKey: ['admin-edge-perf'],
    queryFn: async () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('system_health_metrics')
        .select('function_name, status_code, latency_ms, recorded_at, error_message')
        .eq('metric_type', 'edge_function_call')
        .gte('recorded_at', oneDayAgo)
        .order('recorded_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      const metrics = data ?? [];
      const fnMap = new Map<string, { calls: number; errors: number; latencies: number[] }>();
      for (const m of metrics) {
        const fn = (m.function_name as string | null) ?? 'unknown';
        const entry = fnMap.get(fn) ?? { calls: 0, errors: 0, latencies: [] };
        entry.calls++;
        if (((m.status_code as number | null) ?? 0) >= 400) entry.errors++;
        if (m.latency_ms) entry.latencies.push(m.latency_ms as number);
        fnMap.set(fn, entry);
      }
      const byFunction = Array.from(fnMap.entries())
        .map(([name, d]) => ({
          name,
          calls: d.calls,
          errors: d.errors,
          errorRate: d.calls > 0 ? Math.round((d.errors / d.calls) * 100) : 0,
          avgLatency:
            d.latencies.length > 0
              ? Math.round(d.latencies.reduce((a, b) => a + b, 0) / d.latencies.length)
              : 0,
        }))
        .sort((a, b) => b.avgLatency - a.avgLatency)
        .slice(0, 15);
      const totalCalls = metrics.length;
      const totalErrors = metrics.filter((m) => ((m.status_code as number | null) ?? 0) >= 400).length;
      const latArr = metrics.filter((m) => m.latency_ms).map((m) => m.latency_ms as number);
      const avgLatency = latArr.length > 0 ? Math.round(latArr.reduce((a, b) => a + b, 0) / latArr.length) : 0;
      return { byFunction, totalCalls, totalErrors, avgLatency };
    },
    staleTime: 2 * 60 * 1000,
  });

  const getDuration = (row: any) => {
    if (!row.completed_at) return "—";
    return formatDistanceStrict(new Date(row.completed_at), new Date(row.started_at), { locale: it });
  };

  // Stats summary
  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold hidden md:block">Sync Logs</h1>
          <p className="text-sm text-muted-foreground">Log di sincronizzazione Google Calendar</p>
        </div>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Errore caricamento log</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>Impossibile caricare i log di sincronizzazione. {error instanceof Error ? error.message : "Riprova tra qualche secondo."}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Riprova
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const stats = {
    total: logs.length,
    completed: logs.filter((l: any) => l.status === "completed").length,
    failed: logs.filter((l: any) => l.status === "failed" || l.status === "error").length,
    running: logs.filter((l: any) => l.status === "running").length,
    totalSynced: logs.reduce((acc: number, l: any) => acc + (l.connections_synced || 0), 0),
    totalFailed: logs.reduce((acc: number, l: any) => acc + (l.connections_failed || 0), 0),
  };
  const successRate = stats.total > 0 ? Math.round(((stats.total - stats.failed) / stats.total) * 100) : 100;

  return (
    <div className="space-y-4 md:space-y-6">
      <h1 className="text-2xl font-bold hidden md:block">Log di Sistema</h1>
      <Tabs value={activeTab} onValueChange={onTabChange}>
        <TabsList>
          <TabsTrigger value="sync">Sync Calendar</TabsTrigger>
          <TabsTrigger value="stripe" className="gap-1">
            <CreditCard className="h-3.5 w-3.5" />
            Stripe
          </TabsTrigger>
          <TabsTrigger value="dunning" className="gap-1">
            <Mail className="h-3.5 w-3.5" />
            Dunning
          </TabsTrigger>
          <TabsTrigger value="edge">Edge Functions</TabsTrigger>
        </TabsList>

        <TabsContent value="sync" className="space-y-6 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Log di sincronizzazione Google Calendar</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
              Aggiorna
            </Button>
          </div>

          {/* Stats strip */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-xs text-muted-foreground">Esecuzioni totali</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold text-emerald-600">{stats.completed}</p>
              <p className="text-xs text-muted-foreground">Completate</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold text-destructive">{stats.failed}</p>
              <p className="text-xs text-muted-foreground">Fallite</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className="text-2xl font-bold">{stats.totalSynced}</p>
              <p className="text-xs text-muted-foreground">Sincronizzazioni</p>
            </div>
            <div className="rounded-lg border p-3 text-center">
              <p className={`text-2xl font-bold ${successRate >= 90 ? "text-emerald-600" : successRate >= 70 ? "text-yellow-600" : "text-destructive"}`}>
                {successRate}%
              </p>
              <p className="text-xs text-muted-foreground">Success rate</p>
            </div>
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

          <div className="rounded-md border overflow-x-auto">
            <Table className="min-w-[700px]">
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
                  <>
                    {[1, 2, 3, 4, 5].map((i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      </TableRow>
                    ))}
                  </>
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
                                          <span className="font-medium">{(r.userId || r.user_id)?.slice(0, 8)}…</span>
                                          {r.error ? (
                                            <span className="text-destructive text-xs">{r.error}</span>
                                          ) : (
                                            <span className="text-muted-foreground text-xs">
                                              Pull: {r.pull?.pulled ?? 0} | Created: {r.reconcile?.created ?? 0} | Updated: {r.reconcile?.updated ?? 0} | Removed: {r.reconcile?.removed ?? 0}
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
        </TabsContent>

        {/* Stripe Events Tab */}
        <TabsContent value="stripe" className="space-y-4 mt-4">
          {isMounted("stripe") && <StripeEventsTab />}
        </TabsContent>

        {/* Dunning Tab */}
        <TabsContent value="dunning" className="space-y-4 mt-4">
          {isMounted("dunning") && <DunningAttemptsTab />}
        </TabsContent>

        <TabsContent value="edge" className="space-y-4 mt-4">
          {isMounted("edge") && <>
          {/* Stat cards: stack su mobile, 3 cols su sm+ */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Chiamate (24h)</p>
                <p className="text-xl font-bold">{(edgeData?.totalCalls ?? 0).toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Errori</p>
                <p className={`text-xl font-bold ${(edgeData?.totalErrors ?? 0) > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                  {edgeData?.totalErrors ?? 0}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Latenza media</p>
                <p className="text-xl font-bold">{edgeData?.avgLatency ?? 0}ms</p>
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Top Funzioni per Latenza</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {edgeLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Funzione</TableHead>
                      <TableHead className="text-right">Chiamate</TableHead>
                      <TableHead className="text-right">Errori</TableHead>
                      <TableHead className="text-right">Latenza media</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(edgeData?.byFunction ?? []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                          Nessun dato nelle ultime 24h
                        </TableCell>
                      </TableRow>
                    ) : (edgeData?.byFunction ?? []).map((f) => (
                      <TableRow key={f.name}>
                        <TableCell className="font-mono text-xs">{f.name}</TableCell>
                        <TableCell className="text-right">{f.calls}</TableCell>
                        <TableCell className="text-right">
                          <span className={f.errors > 0 ? 'text-destructive font-medium' : ''}>{f.errors}</span>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={f.avgLatency > 2000 ? 'destructive' : f.avgLatency > 1000 ? 'secondary' : 'outline'}>
                            {f.avgLatency}ms
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
          </>}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Stripe Events Tab ────────────────────────────────────

function StripeEventsTab() {
  const [statusFilter, setStatusFilter] = useState<"all" | "processed" | "error" | "processing">("all");
  const [dateRange, setDateRange] = useState<DateRange>("week");

  const { data: events = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["stripe-events-log", statusFilter, dateRange],
    queryFn: async () => {
      let query = (supabase as any)
        .from("stripe_events_log")
        .select("*")
        .order("processed_at", { ascending: false })
        .limit(100);

      if (statusFilter !== "all") query = query.eq("status", statusFilter);

      const now = new Date();
      if (dateRange === "day") query = query.gte("processed_at", new Date(now.getTime() - 86400000).toISOString());
      else if (dateRange === "week") query = query.gte("processed_at", new Date(now.getTime() - 7 * 86400000).toISOString());
      else query = query.gte("processed_at", new Date(now.getTime() - 30 * 86400000).toISOString());

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        stripe_event_id: string;
        event_type: string;
        company_id: string | null;
        status: string;
        error_message: string | null;
        processed_at: string;
      }>;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const errors = events.filter((e) => e.status === "error").length;

  return (
    <div className="space-y-4">
      {errors > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{errors} eventi Stripe in errore</AlertTitle>
          <AlertDescription>Verifica la configurazione del webhook Stripe.</AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Stato" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti</SelectItem>
              <SelectItem value="processed">Processed</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="processing">Processing</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Periodo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Ultimo giorno</SelectItem>
              <SelectItem value="week">Ultima settimana</SelectItem>
              <SelectItem value="month">Ultimo mese</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Aggiorna
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo evento</TableHead>
              <TableHead>Stripe ID</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Errore</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [1, 2, 3, 4, 5].map((i) => (
                <TableRow key={i}>
                  {[1, 2, 3, 4, 5].map((j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                  Nessun evento Stripe trovato
                </TableCell>
              </TableRow>
            ) : events.map((e) => (
              <TableRow key={e.id} className={e.status === "error" ? "bg-destructive/5" : ""}>
                <TableCell className="font-mono text-xs">{e.event_type}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground">{e.stripe_event_id?.slice(0, 20)}…</TableCell>
                <TableCell>
                  {e.status === "processed" ? (
                    <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-300">processed</Badge>
                  ) : e.status === "error" ? (
                    <Badge variant="destructive">error</Badge>
                  ) : (
                    <Badge variant="secondary">{e.status}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {format(new Date(e.processed_at), "dd/MM HH:mm:ss")}
                </TableCell>
                <TableCell className="max-w-[240px] truncate text-xs text-destructive">
                  {e.error_message ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Dunning Attempts Tab ─────────────────────────────────

function DunningAttemptsTab() {
  const [statusFilter, setStatusFilter] = useState<"all" | "sent" | "failed">("all");
  const [dateRange, setDateRange] = useState<DateRange>("week");

  const { data: attempts = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["dunning-log", statusFilter, dateRange],
    queryFn: async () => {
      let query = (supabase as any)
        .from("dunning_attempts")
        .select("*, companies(name)")
        .order("sent_at", { ascending: false })
        .limit(100);

      if (statusFilter !== "all") query = query.eq("status", statusFilter);

      const now = new Date();
      if (dateRange === "day") query = query.gte("sent_at", new Date(now.getTime() - 86400000).toISOString());
      else if (dateRange === "week") query = query.gte("sent_at", new Date(now.getTime() - 7 * 86400000).toISOString());
      else query = query.gte("sent_at", new Date(now.getTime() - 30 * 86400000).toISOString());

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        company_id: string;
        dunning_day: string;
        status: string;
        sent_at: string | null;
        retry_count: number;
        permanently_failed: boolean;
        error_message: string | null;
        companies?: { name: string } | null;
      }>;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const permanentFails = attempts.filter((a) => a.permanently_failed).length;

  return (
    <div className="space-y-4">
      {permanentFails > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{permanentFails} email fallite definitivamente</AlertTitle>
          <AlertDescription>
            <a href="/admin/dunning" className="underline">Vai alla gestione dunning</a> per intervenire manualmente.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center justify-between">
        <div className="flex gap-3">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Stato" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti</SelectItem>
              <SelectItem value="sent">Inviato</SelectItem>
              <SelectItem value="failed">Fallito</SelectItem>
            </SelectContent>
          </Select>
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
            <SelectTrigger className="w-[160px]"><SelectValue placeholder="Periodo" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Ultimo giorno</SelectItem>
              <SelectItem value="week">Ultima settimana</SelectItem>
              <SelectItem value="month">Ultimo mese</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Aggiorna
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Azienda</TableHead>
              <TableHead>Tipo email</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Inviato</TableHead>
              <TableHead className="text-right">Tentativi</TableHead>
              <TableHead>Errore</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [1, 2, 3, 4].map((i) => (
                <TableRow key={i}>
                  {[1, 2, 3, 4, 5, 6].map((j) => (
                    <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                  ))}
                </TableRow>
              ))
            ) : attempts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                  Nessun tentativo dunning trovato
                </TableCell>
              </TableRow>
            ) : attempts.map((a) => (
              <TableRow key={a.id} className={a.permanently_failed ? "bg-destructive/5" : ""}>
                <TableCell className="text-sm font-medium">
                  {a.companies?.name ?? a.company_id.slice(0, 8)}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-xs">{a.dunning_day}</Badge>
                </TableCell>
                <TableCell>
                  {a.permanently_failed ? (
                    <Badge variant="destructive">Definitivo</Badge>
                  ) : a.status === "sent" ? (
                    <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-300">Inviato</Badge>
                  ) : a.status === "failed" ? (
                    <Badge variant="destructive">Fallito</Badge>
                  ) : (
                    <Badge variant="secondary">{a.status}</Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {a.sent_at ? format(new Date(a.sent_at), "dd/MM HH:mm", { locale: it }) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  {a.retry_count > 0 ? <Badge variant="secondary">{a.retry_count}×</Badge> : "—"}
                </TableCell>
                <TableCell className="max-w-[200px] truncate text-xs text-destructive">
                  {a.error_message ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default SyncLogs;
