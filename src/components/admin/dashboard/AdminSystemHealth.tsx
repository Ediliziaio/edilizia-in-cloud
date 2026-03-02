import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2, AlertTriangle, Loader2, Zap, ShieldAlert, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

interface HealthMetric {
  id: string;
  metric_type: string;
  function_name: string | null;
  status_code: number | null;
  latency_ms: number | null;
  error_message: string | null;
  metadata: Record<string, unknown>;
  recorded_at: string;
}

export function AdminSystemHealth() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-system-health-v2"],
    queryFn: async () => {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

      const [metricsRes, syncLogsRes, rateLimitRes] = await Promise.all([
        supabase
          .from("system_health_metrics")
          .select("*")
          .gte("recorded_at", oneDayAgo)
          .order("recorded_at", { ascending: false })
          .limit(500),
        supabase
          .from("google_calendar_sync_log")
          .select("status, connections_synced, connections_failed, started_at")
          .gte("started_at", sevenDaysAgo)
          .order("started_at", { ascending: false }),
        supabase
          .from("system_health_metrics")
          .select("*")
          .eq("metric_type", "rate_limit_hit")
          .gte("recorded_at", oneDayAgo)
          .limit(100),
      ]);

      const metrics = (metricsRes.data || []) as HealthMetric[];
      const syncLogs = syncLogsRes.data || [];
      const rateLimitHits = (rateLimitRes.data || []) as HealthMetric[];

      // Edge function call metrics
      const edgeCalls = metrics.filter((m) => m.metric_type === "edge_function_call");
      const totalCalls = edgeCalls.length;
      const errorCalls = edgeCalls.filter((m) => (m.status_code || 0) >= 400).length;
      const successRate = totalCalls > 0 ? Math.round(((totalCalls - errorCalls) / totalCalls) * 100) : 100;
      
      // Average latency
      const latencies = edgeCalls.filter((m) => m.latency_ms).map((m) => m.latency_ms!);
      const avgLatency = latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
      const p95Latency = latencies.length > 0
        ? latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)] || 0
        : 0;

      // Per-function breakdown
      const fnMap = new Map<string, { calls: number; errors: number; avgLatency: number; latencies: number[] }>();
      for (const m of edgeCalls) {
        const fn = m.function_name || "unknown";
        const entry = fnMap.get(fn) || { calls: 0, errors: 0, avgLatency: 0, latencies: [] };
        entry.calls++;
        if ((m.status_code || 0) >= 400) entry.errors++;
        if (m.latency_ms) entry.latencies.push(m.latency_ms);
        fnMap.set(fn, entry);
      }
      const functionBreakdown = Array.from(fnMap.entries()).map(([name, data]) => ({
        name: name.length > 20 ? name.substring(0, 20) + "…" : name,
        fullName: name,
        calls: data.calls,
        errors: data.errors,
        avgLatency: data.latencies.length > 0
          ? Math.round(data.latencies.reduce((a, b) => a + b, 0) / data.latencies.length)
          : 0,
        successRate: data.calls > 0 ? Math.round(((data.calls - data.errors) / data.calls) * 100) : 100,
      })).sort((a, b) => b.calls - a.calls);

      // Sync health
      const syncTotal = syncLogs.length;
      const syncFailed = syncLogs.filter((l: any) => l.status === "error" || l.status === "failed").length;
      const syncSuccessRate = syncTotal > 0 ? Math.round(((syncTotal - syncFailed) / syncTotal) * 100) : 100;

      return {
        totalCalls,
        errorCalls,
        successRate,
        avgLatency,
        p95Latency,
        functionBreakdown,
        rateLimitHits: rateLimitHits.length,
        syncTotal,
        syncFailed,
        syncSuccessRate,
      };
    },
    staleTime: 60 * 1000,
  });

  const overallHealthy = (data?.successRate ?? 100) >= 90 && (data?.syncSuccessRate ?? 100) >= 90;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          System Health
          {!isLoading && (
            <Badge variant={overallHealthy ? "default" : "destructive"} className="text-[10px] ml-auto">
              {overallHealthy ? "Operativo" : "Problemi"}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {data?.totalCalls === 0 && (
              <p className="text-xs text-center text-muted-foreground py-2">Nessun dato disponibile nelle ultime 24h</p>
            )}
            {/* Key Metrics */}
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center p-2 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center gap-1 mb-1">
                  {(data?.successRate ?? 100) >= 90 ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  )}
                </div>
                <p className="text-xl font-bold">{data?.successRate}%</p>
                <p className="text-[10px] text-muted-foreground">API Success (24h)</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Zap className="h-4 w-4 text-primary" />
                </div>
                <p className="text-xl font-bold">{data?.avgLatency}ms</p>
                <p className="text-[10px] text-muted-foreground">Avg Latency</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-xl font-bold">{data?.p95Latency}ms</p>
                <p className="text-[10px] text-muted-foreground">P95 Latency</p>
              </div>
              <div className="text-center p-2 rounded-lg bg-muted/50">
                <div className="flex items-center justify-center gap-1 mb-1">
                  <ShieldAlert className="h-4 w-4 text-muted-foreground" />
                </div>
                <p className="text-xl font-bold">{data?.rateLimitHits}</p>
                <p className="text-[10px] text-muted-foreground">Rate Limits (24h)</p>
              </div>
            </div>

            {/* Function Breakdown Chart */}
            {(data?.functionBreakdown?.length ?? 0) > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Chiamate per funzione (24h)</p>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={data!.functionBreakdown} layout="vertical" margin={{ left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 10 }} />
                    <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
                      formatter={(value: number, name: string) => {
                        if (name === "calls") return [value, "Chiamate"];
                        return [value, "Errori"];
                      }}
                    />
                    <Bar dataKey="calls" fill="hsl(var(--primary))" radius={[0, 2, 2, 0]} />
                    <Bar dataKey="errors" fill="hsl(var(--destructive))" radius={[0, 2, 2, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Sync Health */}
            <div className="border-t pt-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Calendar Sync (7gg)</span>
                <span className="font-medium">
                  {data?.syncSuccessRate}% success · {data?.syncTotal} sync
                  {(data?.syncFailed ?? 0) > 0 && (
                    <span className="text-destructive ml-1">({data?.syncFailed} fallite)</span>
                  )}
                </span>
              </div>
            </div>

            {/* Total calls summary */}
            <div className="text-xs text-muted-foreground text-center">
              {data?.totalCalls} chiamate API · {data?.errorCalls} errori (ultime 24h)
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
