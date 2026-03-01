import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, CheckCircle2, AlertTriangle, Loader2 } from "lucide-react";

export function AdminSystemHealth() {
  const { data, isLoading } = useQuery({
    queryKey: ["admin-system-health"],
    queryFn: async () => {
      // Sync logs from last 7 days
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data: syncLogs, error } = await supabase
        .from("google_calendar_sync_log")
        .select("status, connections_synced, connections_failed")
        .gte("started_at", sevenDaysAgo)
        .order("started_at", { ascending: false });

      if (error) throw error;

      const logs = syncLogs || [];
      const totalSyncs = logs.length;
      const failedSyncs = logs.filter((l) => l.status === "error" || l.status === "failed").length;
      const successRate = totalSyncs > 0 ? Math.round(((totalSyncs - failedSyncs) / totalSyncs) * 100) : 100;
      const totalConnectionsSynced = logs.reduce((s, l) => s + (l.connections_synced || 0), 0);
      const totalConnectionsFailed = logs.reduce((s, l) => s + (l.connections_failed || 0), 0);

      return {
        totalSyncs,
        failedSyncs,
        successRate,
        totalConnectionsSynced,
        totalConnectionsFailed,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  const isHealthy = (data?.successRate ?? 100) >= 90;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          System Health
          {!isLoading && (
            <Badge variant={isHealthy ? "default" : "destructive"} className="text-[10px] ml-auto">
              {isHealthy ? "Operativo" : "Problemi"}
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
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 mb-1">
                  {isHealthy ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                  )}
                </div>
                <p className="text-2xl font-bold">{data?.successRate}%</p>
                <p className="text-xs text-muted-foreground">Success rate (7gg)</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold">{data?.totalSyncs}</p>
                <p className="text-xs text-muted-foreground">Sync totali (7gg)</p>
              </div>
            </div>
            {(data?.totalConnectionsFailed ?? 0) > 0 && (
              <div className="border-t pt-2 text-sm text-muted-foreground">
                <span className="text-destructive font-medium">{data?.totalConnectionsFailed}</span> connessioni fallite su{" "}
                <span className="font-medium">{(data?.totalConnectionsSynced ?? 0) + (data?.totalConnectionsFailed ?? 0)}</span> totali
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
