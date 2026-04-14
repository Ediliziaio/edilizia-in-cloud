import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ShieldAlert, ShieldCheck, Loader2, RefreshCw, CheckCircle2, ChevronDown, ChevronRight, AlertTriangle } from "lucide-react";

interface RlsTableInfo {
  table_name: string;
  rls_enabled: boolean;
  policy_count: number;
}

interface ScanResult {
  all_tables: RlsTableInfo[];
  tables_without_rls: string[];
  tables_without_policies: string[];
  count: number;
  warnings: number;
  scanned_at: string;
}

export function RlsMonitorSection() {
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [lastScan, setLastScan] = useState<ScanResult | null>(null);

  const { data: alertCount, isLoading } = useQuery({
    queryKey: ["rls-monitor-alerts"],
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const { data, error } = await supabase
        .from("system_health_metrics")
        .select("metadata, recorded_at")
        .eq("metric_type", "rls_missing")
        .gte("recorded_at", sevenDaysAgo)
        .order("recorded_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const seen = new Set<string>();
      for (const row of data || []) {
        const meta = row.metadata as Record<string, unknown>;
        const tableName = (meta?.table_name as string) || "unknown";
        seen.add(tableName);
      }
      return seen.size;
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
      return data as ScanResult;
    },
    onSuccess: (data) => {
      setLastScan(data);
      queryClient.invalidateQueries({ queryKey: ["rls-monitor-alerts"] });
    },
  });

  const count = alertCount ?? 0;
  const isClean = count === 0 && !isLoading;

  const tablesData = lastScan?.all_tables ?? [];
  const criticalTables = tablesData.filter((t) => !t.rls_enabled);
  const warnTables = tablesData.filter((t) => t.rls_enabled && t.policy_count === 0);
  const okTables = tablesData.filter((t) => t.rls_enabled && t.policy_count > 0);

  return (
    <div className="border-t pt-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">RLS Monitor</span>
          {!isLoading && (
            <Badge variant={isClean ? "default" : "destructive"} className="text-xs">
              {isClean ? "OK" : `${count} tabelle a rischio`}
            </Badge>
          )}
          {lastScan && lastScan.warnings > 0 && (
            <Badge variant="outline" className="text-xs border-yellow-400 text-yellow-600">
              {lastScan.warnings} senza policy
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

      {/* Loading */}
      {isLoading && (
        <div className="flex justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* No scan yet + clean state */}
      {!lastScan && isClean && (
        <div className="flex items-center gap-1 text-xs text-muted-foreground justify-center py-1">
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
          Nessun alert RLS negli ultimi 7 giorni
        </div>
      )}

      {/* No scan yet + alerts from history */}
      {!lastScan && count > 0 && (
        <p className="text-xs text-destructive text-center py-1">
          {count} tabelle senza RLS rilevate. Clicca &quot;Scansiona&quot; per un audit completo.
        </p>
      )}

      {/* Full scan results */}
      {lastScan && (
        <div className="space-y-2">
          {/* Summary */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground px-1">
            <span className="text-destructive font-medium">{criticalTables.length} senza RLS</span>
            <span className="text-yellow-600 font-medium">{warnTables.length} senza policy</span>
            <span className="text-emerald-600 font-medium">{okTables.length} OK</span>
            <span className="ml-auto">{tablesData.length} tabelle totali</span>
          </div>

          {/* Critical: no RLS */}
          {criticalTables.length > 0 && (
            <div className="space-y-0.5">
              {criticalTables.map((t) => (
                <div
                  key={t.table_name}
                  className="flex items-center justify-between text-xs bg-destructive/10 border border-destructive/20 rounded px-2 py-1"
                >
                  <div className="flex items-center gap-1.5">
                    <ShieldAlert className="h-3 w-3 text-destructive shrink-0" />
                    <span className="font-mono">{t.table_name}</span>
                  </div>
                  <Badge variant="destructive" className="text-xs h-4">RLS OFF</Badge>
                </div>
              ))}
            </div>
          )}

          {/* Warnings: RLS on but no policies */}
          {warnTables.length > 0 && (
            <div className="space-y-0.5">
              {warnTables.map((t) => (
                <div
                  key={t.table_name}
                  className="flex items-center justify-between text-xs bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-800 rounded px-2 py-1"
                >
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-yellow-600 shrink-0" />
                    <span className="font-mono">{t.table_name}</span>
                  </div>
                  <Badge variant="outline" className="text-xs h-4 border-yellow-400 text-yellow-600">0 policy</Badge>
                </div>
              ))}
            </div>
          )}

          {/* OK tables (collapsible) */}
          {okTables.length > 0 && (
            <div>
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowAll((v) => !v)}
              >
                {showAll ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {okTables.length} tabelle sicure
              </button>
              {showAll && (
                <div className="mt-1 space-y-0.5 max-h-48 overflow-y-auto">
                  {okTables.map((t) => (
                    <div
                      key={t.table_name}
                      className="flex items-center justify-between text-xs bg-emerald-50 dark:bg-emerald-950/20 rounded px-2 py-0.5"
                    >
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="h-3 w-3 text-emerald-500 shrink-0" />
                        <span className="font-mono">{t.table_name}</span>
                      </div>
                      <span className="text-emerald-600 text-xs">{t.policy_count} policy</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Scansionato: {new Date(lastScan.scanned_at).toLocaleString("it-IT")}
          </p>
        </div>
      )}
    </div>
  );
}
