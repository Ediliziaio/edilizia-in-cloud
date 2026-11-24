import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  RefreshCw, FileText, CheckCircle, XCircle, Clock, Search,
  TrendingDown, BarChart2, Activity, CalendarDays, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { format } from "date-fns";
import { statoRegistro } from "@/lib/automazioniRegistro";
import { useT, dateFnsCampo } from "@/lib/campo/lingua/LinguaCampo";

interface Props {
  flowId?: string;
}

const STATO_ICON: Record<string, React.ReactNode> = {
  success: <CheckCircle className="h-3.5 w-3.5 text-green-500" />,
  error:   <XCircle className="h-3.5 w-3.5 text-destructive" />,
  running: <Clock className="h-3.5 w-3.5 text-primary" />,
  pending: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  skipped: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
};

function ProgressBar({ value, max, color = "bg-primary" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-muted-foreground w-8 text-right">{pct}%</span>
    </div>
  );
}

const NODE_TYPE_COLOR: Record<string, string> = {
  trigger: "bg-emerald-500",
  action: "bg-blue-500",
  condition: "bg-amber-500",
  delay: "bg-purple-500",
  goal: "bg-green-600",
  split: "bg-teal-500",
  end: "bg-gray-400",
};

function FunnelTab({ flowId }: { flowId: string }) {
  const t = useT();
  const { data: funnel = [], isLoading } = useQuery({
    queryKey: ["flow-funnel-nodes", flowId],
    queryFn: async () => {
      // Fetch execution log and node labels in parallel
      const [logRes, nodesRes] = await Promise.all([
        (supabase as any)
          .from("automation_execution_log")
          .select("node_id, node_type, status")
          .eq("flow_id", flowId),
        (supabase as any)
          .from("automation_nodes")
          .select("id, label, node_type, position_y")
          .eq("flow_id", flowId),
      ]);

      const logs = logRes.data ?? [];
      const nodes = nodesRes.data ?? [];

      // Build node label map
      const nodeMap: Record<string, { label: string; node_type: string; position_y: number }> = {};
      for (const n of nodes) nodeMap[n.id] = { label: n.label, node_type: n.node_type, position_y: n.position_y ?? 0 };

      // Group by node_id
      const map: Record<string, { node_id: string; label: string; node_type: string; position_y: number; total: number; success: number; error: number; skipped: number }> = {};
      for (const row of logs) {
        const key = row.node_id || "unknown";
        if (!map[key]) {
          const nodeInfo = nodeMap[key];
          map[key] = {
            node_id: key,
            label: nodeInfo?.label || row.node_type || key.slice(0, 8),
            node_type: nodeInfo?.node_type || row.node_type || "unknown",
            position_y: nodeInfo?.position_y ?? 9999,
            total: 0, success: 0, error: 0, skipped: 0,
          };
        }
        map[key].total++;
        if (row.status === "success") map[key].success++;
        else if (row.status === "error") map[key].error++;
        else if (row.status === "skipped") map[key].skipped++;
      }

      // Sort by position_y (flow order) so table matches canvas top→bottom
      return Object.values(map).sort((a, b) => a.position_y - b.position_y);
    },
    enabled: !!flowId,
  });

  if (isLoading) {
    return <div className="py-12 text-center text-muted-foreground text-sm">{t("Caricamento funnel...")}</div>;
  }

  if (funnel.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <BarChart2 className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm font-medium">{t("Nessun dato disponibile")}</p>
        <p className="text-xs mt-1">{t("Il funnel apparirà dopo le prime esecuzioni.")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-muted-foreground" />
          {t("Funnel di esecuzione per nodo")}
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("Passaggi completati vs. falliti per ogni nodo del flusso, in ordine di esecuzione.")}
        </p>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Nodo")}</TableHead>
              <TableHead>{t("Tipo")}</TableHead>
              <TableHead className="text-right">{t("Totale")}</TableHead>
              <TableHead className="text-right">{t("Successo")}</TableHead>
              <TableHead className="text-right">{t("Errori")}</TableHead>
              <TableHead className="w-36">{t("Completamento")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {funnel.map((row) => (
              <TableRow key={row.node_id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full shrink-0 ${NODE_TYPE_COLOR[row.node_type] ?? "bg-muted-foreground"}`} />
                    <span className="text-sm font-medium truncate max-w-[160px]">{row.label}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <span className="text-xs text-muted-foreground capitalize">{row.node_type}</span>
                </TableCell>
                <TableCell className="text-right text-sm">{row.total}</TableCell>
                <TableCell className="text-right">
                  <span className="text-sm text-green-600 font-medium">{row.success}</span>
                </TableCell>
                <TableCell className="text-right">
                  {row.error > 0 ? (
                    <span className="text-sm text-destructive font-medium">{row.error}</span>
                  ) : (
                    <span className="text-sm text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell>
                  <ProgressBar
                    value={row.success}
                    max={row.total}
                    color={row.error > row.success ? "bg-destructive" : NODE_TYPE_COLOR[row.node_type] ?? "bg-primary"}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConversionSummary flowId={flowId} />
    </div>
  );
}

function ConversionSummary({ flowId }: { flowId: string }) {
  const t = useT();
  const { data } = useQuery({
    queryKey: ["flow-conversion", flowId],
    queryFn: async () => {
      const [enrollRes, goalRes] = await Promise.all([
        (supabase as any)
          .from("automation_enrollments")
          .select("status", { count: "exact", head: false })
          .eq("flow_id", flowId),
        (supabase as any)
          .from("automation_execution_log")
          .select("id", { count: "exact", head: true })
          .eq("flow_id", flowId)
          .eq("node_type", "goal")
          .eq("status", "success"),
      ]);

      const enrollments = enrollRes.data ?? [];
      const total = enrollments.length;
      const completed = enrollments.filter((e: any) => e.status === "completed").length;
      const goalHits = goalRes.count ?? 0;

      return { total, completed, goalHits };
    },
    enabled: !!flowId,
  });

  if (!data || data.total === 0) return null;

  const completionRate = Math.round((data.completed / data.total) * 100);
  const goalRate = Math.round((data.goalHits / data.total) * 100);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2">
      <div className="border rounded-lg p-3 bg-muted/20">
        <p className="text-[11px] text-muted-foreground">{t("Tasso completamento")}</p>
        <p className="text-xl font-bold text-green-600">{completionRate}%</p>
        <p className="text-[10px] text-muted-foreground">{t("{completed} / {total} flussi", { completed: String(data.completed ?? ""), total: String(data.total ?? "") })}</p>
      </div>
      <div className="border rounded-lg p-3 bg-muted/20">
        <p className="text-[11px] text-muted-foreground">{t("Goal raggiunti")}</p>
        <p className="text-xl font-bold text-primary">{data.goalHits}</p>
        <p className="text-[10px] text-muted-foreground">{t("{goalRate}% dei contatti", { goalRate: String(goalRate ?? "") })}</p>
      </div>
      <div className="border rounded-lg p-3 bg-muted/20">
        <p className="text-[11px] text-muted-foreground">{t("Totale esecuzioni")}</p>
        <p className="text-xl font-bold">{data.total}</p>
        <p className="text-[10px] text-muted-foreground">{t("contatti totali")}</p>
      </div>
    </div>
  );
}

export function WorkflowRegistro({ flowId }: Props) {
  const t = useT();
  const [filtroStato, setFiltroStato] = useState("all");
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const hasDateFilter = !!(dateFrom || dateTo);

  const { data: logs = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["flow-execution-logs", flowId, filtroStato, search, dateFrom, dateTo],
    queryFn: async () => {
      let q = (supabase as any)
        .from("automation_execution_log")
        .select("*")
        .eq("flow_id", flowId!)
        .order("created_at", { ascending: false })
        .limit(200);

      if (filtroStato !== "all") q = q.eq("status", filtroStato);
      if (dateFrom) q = q.gte("created_at", `${dateFrom}T00:00:00`);
      if (dateTo) q = q.lte("created_at", `${dateTo}T23:59:59`);

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!flowId,
  });

  const { data: runs = [] } = useQuery({
    queryKey: ["flow-execution-runs", flowId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("flow_execution_runs")
        .select("*")
        .eq("flow_id", flowId!)
        .order("started_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!flowId,
  });

  if (!flowId) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
        {t("Salva il flusso per visualizzare il registro.")}
      </div>
    );
  }

  const filteredLogs = logs.filter((log: any) =>
    !search.trim() ||
    (log.node_type || "").toLowerCase().includes(search.toLowerCase()) ||
    (log.node_id || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{t("Registro & Analytics")}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("Monitoraggio delle esecuzioni e analisi delle performance del flusso.")}
        </p>
      </div>

      <Tabs defaultValue="log">
        <TabsList className="h-8">
          <TabsTrigger value="log" className="text-xs gap-1.5">
            <Activity className="h-3.5 w-3.5" /> {t("Log esecuzioni")}
          </TabsTrigger>
          <TabsTrigger value="funnel" className="text-xs gap-1.5">
            <TrendingDown className="h-3.5 w-3.5" /> {t("Funnel & Analytics")}
          </TabsTrigger>
        </TabsList>

        {/* ── Log Tab ── */}
        <TabsContent value="log" className="space-y-4 mt-4">
          {/* Summary cards */}
          {runs.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SummaryCard label={t("Esecuzioni (ultime 100)")} value={runs.length} />
              <SummaryCard label={t("Completate")} value={runs.filter((r: any) => r.status === "completed").length} />
              <SummaryCard label={t("Errori")} value={runs.filter((r: any) => r.status === "error").length} />
              <SummaryCard
                label={t("Durata media")}
                value={
                  runs.filter((r: any) => r.duration_ms).length > 0
                    ? `${Math.round(
                        runs.filter((r: any) => r.duration_ms).reduce((s: number, r: any) => s + r.duration_ms, 0) /
                          runs.filter((r: any) => r.duration_ms).length
                      )}ms`
                    : "—"
                }
              />
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <Select value={filtroStato} onValueChange={setFiltroStato}>
              <SelectTrigger className="w-[160px] h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("Ogni stato")}</SelectItem>
                <SelectItem value="success">{t("Successo")}</SelectItem>
                <SelectItem value="error">{t("Errore")}</SelectItem>
                <SelectItem value="running">{t("In corso")}</SelectItem>
                <SelectItem value="skipped">{t("Rinviato")}</SelectItem>
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={t("Cerca per tipo nodo...")}
                className="w-[200px] h-8 text-sm pl-8"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            {/* Date range */}
            <div className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
              <Input
                type="date"
                className="w-[130px] h-8 text-xs"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                title={t("Da")}
              />
              <span className="text-xs text-muted-foreground">—</span>
              <Input
                type="date"
                className="w-[130px] h-8 text-xs"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                title="A"
              />
              {hasDateFilter && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                  title={t("Rimuovi filtro date")}
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>

            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => refetch()}>
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {/* Table */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("Tipo nodo")}</TableHead>
                  <TableHead>{t("Stato")}</TableHead>
                  <TableHead>{t("Eseguito il")}</TableHead>
                  <TableHead>{t("Dettaglio azione")}</TableHead>
                  <TableHead>{t("Errore")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-48 text-center text-muted-foreground">
                      {t("Caricamento...")}
                    </TableCell>
                  </TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-48">
                      <div className="flex flex-col items-center justify-center text-muted-foreground">
                        <FileText className="h-10 w-10 mb-3 opacity-30" />
                        <p className="text-sm font-medium">{t("Nessun registro trovato")}</p>
                        <p className="text-xs mt-1">{t("I log appariranno dopo la prima esecuzione.")}</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map((log: any) => (
                    <TableRow key={log.id}>
                      <TableCell>
                        <span className="capitalize text-sm font-medium">{log.node_type}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {STATO_ICON[log.status] ?? null}
                          <span className="text-xs">{t(statoRegistro(log.status).etichetta)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(log.created_at), "dd/MM/yy HH:mm:ss", { locale: dateFnsCampo() })}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                        {log.output_json?.action ?? log.output_json?.branch ?? "—"}
                      </TableCell>
                      {/* Il motivo di un rinvio non è un errore: niente rosso. */}
                      <TableCell
                        className={`text-xs max-w-[200px] truncate ${statoRegistro(log.status).tono === "errore" ? "text-destructive" : "text-muted-foreground"}`}
                        title={log.error_message || undefined}
                      >
                        {log.error_message || "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Funnel Tab ── */}
        <TabsContent value="funnel" className="mt-4">
          <FunnelTab flowId={flowId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border rounded-lg p-3 bg-muted/20">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
