import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Loader2, RefreshCw, CheckCircle2 } from "lucide-react";

interface RlsAlert {
  table_name: string;
  recorded_at: string;
}

export function RlsMonitorSection() {
  const queryClient = useQueryClient();

  const { data: alerts, isLoading } = useQuery({
    queryKey: ["rls-monitor-alerts"],
    queryFn: async () => {
      // Get the latest rls_missing alerts (last 7 days, deduplicated by table)
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("system_health_metrics")
        .select("metadata, recorded_at")
        .eq("metric_type", "rls_missing")
        .gte("recorded_at", sevenDaysAgo)
        .order("recorded_at", { ascending: false })
        .limit(200);

      if (error) throw error;

      // Deduplicate by table name, keep latest
      const seen = new Map<string, RlsAlert>();
      for (const row of data || []) {
        const meta = row.metadata as Record<string, unknown>;
        const tableName = (meta?.table_name as string) || "unknown";
        if (!seen.has(tableName)) {
          seen.set(tableName, { table_name: tableName, recorded_at: row.recorded_at });
        }
      }
      return Array.from(seen.values());
    },
    staleTime: 60 * 1000,
  });

  const scanMutation = useMutation({
    mutationFn: async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Non autenticato");

      const { data, error } = await supabase.functions.invoke("check-rls-status", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw error;
      return data as { tables_without_rls: string[]; count: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rls-monitor-alerts"] });
    },
  });

  const count = alerts?.length ?? 0;
  const isClean = count === 0 && !isLoading;

  return (
    <div className="border-t pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">RLS Monitor</span>
          {!isLoading && (
            <Badge variant={isClean ? "default" : "destructive"} className="text-[10px]">
              {isClean ? "OK" : `${count} alert`}
            </Badge>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => scanMutation.mutate()}
          disabled={scanMutation.isPending}
        >
          {scanMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          Scansiona
        </Button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {isClean && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground justify-center py-1">
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          Tutte le tabelle hanno RLS abilitata
        </div>
      )}

      {count > 0 && (
        <div className="space-y-1">
          {alerts!.map((a) => (
            <div key={a.table_name} className="flex items-center justify-between text-xs bg-destructive/10 rounded px-2 py-1">
              <span className="font-mono">{a.table_name}</span>
              <span className="text-muted-foreground">
                {new Date(a.recorded_at).toLocaleDateString("it-IT")}
              </span>
            </div>
          ))}
        </div>
      )}

      {scanMutation.isSuccess && (
        <p className="text-[10px] text-muted-foreground text-center">
          Scansione completata: {scanMutation.data?.count ?? 0} tabelle senza RLS
        </p>
      )}
    </div>
  );
}
