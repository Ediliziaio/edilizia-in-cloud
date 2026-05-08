/**
 * KbExternalSourcesTab — Gestione fonti esterne con auto-sync.
 *
 * Mostra:
 *   - Lista fonti con stato sync, hash drift, doc target collegato
 *   - Bottone "Sync ora" per source singola (dry-run o reale)
 *   - Bottone "Sync tutte due" (rispetta frequency_hours)
 *   - Drift alerts (overdue, errori consecutivi, doc mai aggiornato in 365gg)
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  RefreshCw,
  PlayCircle,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Globe,
} from "lucide-react";

interface SourceStatus {
  id: string;
  name: string;
  url: string;
  scrape_strategy: string;
  frequency_hours: number;
  enabled: boolean;
  last_synced_at: string | null;
  last_change_detected_at: string | null;
  last_status: string;
  consecutive_errors: number;
  target_doc_id: string | null;
  target_language: string;
  target_category_path: string | null;
  target_doc_title: string | null;
  target_last_verified_at: string | null;
  target_valid_until: string | null;
  schedule_status: "never_synced" | "overdue" | "on_schedule";
  drift_severity: "critical" | "warning" | "info" | "stale" | "ok";
}

interface SyncResultItem {
  source_id: string;
  source_name: string;
  status: "no_change" | "changed" | "error" | "skipped";
  hash?: string;
  new_doc_id?: string;
  replaced_doc_id?: string;
  error?: string;
  content_chars?: number;
  duration_ms: number;
}

const DRIFT_BADGE: Record<SourceStatus["drift_severity"], string> = {
  critical: "border-rose-300 text-rose-700 bg-rose-50",
  warning: "border-amber-300 text-amber-700 bg-amber-50",
  info: "border-blue-300 text-blue-700 bg-blue-50",
  stale: "border-violet-300 text-violet-700 bg-violet-50",
  ok: "border-emerald-300 text-emerald-700 bg-emerald-50",
};

const STATUS_BADGE: Record<string, string> = {
  ok: "border-emerald-300 text-emerald-700 bg-emerald-50",
  no_change: "border-slate-300 text-slate-700 bg-slate-50",
  changed: "border-blue-300 text-blue-700 bg-blue-50",
  error: "border-rose-300 text-rose-700 bg-rose-50",
  never_run: "border-amber-300 text-amber-700 bg-amber-50",
  skipped: "border-slate-300 text-slate-600 bg-slate-50",
};

function formatRelative(iso: string | null): string {
  if (!iso) return "mai";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return "ora";
  if (min < 60) return `${min} min fa`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h fa`;
  const days = Math.floor(h / 24);
  if (days < 30) return `${days}gg fa`;
  return d.toLocaleDateString("it-IT");
}

export function KbExternalSourcesTab() {
  const qc = useQueryClient();
  const [lastRunResults, setLastRunResults] = useState<SyncResultItem[] | null>(null);

  const { data: sources, isLoading } = useQuery({
    queryKey: ["admin-kb-ext-sources"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_kb_external_sources_status")
        .select("*")
        .order("drift_severity", { ascending: true })
        .order("last_synced_at", { ascending: true, nullsFirst: true });
      if (error) throw error;
      return (data ?? []) as SourceStatus[];
    },
  });

  const syncMutation = useMutation({
    mutationFn: async (vars: { sourceId?: string; dryRun: boolean }) => {
      const body: Record<string, unknown> = { dry_run: vars.dryRun };
      if (vars.sourceId) body.source_id = vars.sourceId;
      const { data, error } = await supabase.functions.invoke("kb-sync-external-sources", {
        body,
      });
      if (error) throw error;
      return data as { processed: number; changed: number; errors: number; results: SyncResultItem[] };
    },
    onSuccess: (data, vars) => {
      setLastRunResults(data.results ?? []);
      qc.invalidateQueries({ queryKey: ["admin-kb-ext-sources"] });
      qc.invalidateQueries({ queryKey: ["admin-kb-quality"] });
      const msg = vars.dryRun
        ? `Dry-run: ${data.processed} fonti analizzate · ${data.changed} con cambi rilevati`
        : `Sync: ${data.changed} aggiornate · ${data.errors} errori · ${data.processed} totali`;
      toast.success("Sync completato", { description: msg });
    },
    onError: (e) => {
      toast.error("Errore sync", { description: String(e) });
    },
  });

  if (isLoading) return <Skeleton className="h-[400px]" />;
  const list = sources ?? [];

  const overdue = list.filter(s => s.schedule_status === "overdue").length;
  const errors = list.filter(s => s.consecutive_errors > 0).length;
  const totalChanged = list.filter(s => s.last_status === "changed").length;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Fonti esterne (auto-sync)
          </h3>
          <p className="text-xs text-muted-foreground max-w-2xl">
            Fonti pubbliche scrapate periodicamente per mantenere fresca la KB
            (aliquote IVA, codici tributo, contributi CCNL, bonus edilizi).
            Ogni cambio rilevato versiona il vecchio doc (<code>valid_until=now</code>) e crea uno nuovo.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate({ dryRun: true })}
            disabled={syncMutation.isPending}
          >
            <PlayCircle className="h-4 w-4 mr-1.5" />
            Dry-run
          </Button>
          <Button
            size="sm"
            onClick={() => syncMutation.mutate({ dryRun: false })}
            disabled={syncMutation.isPending}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
            Sync tutte due
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <SummaryCard label="Fonti totali" value={list.length} />
        <SummaryCard label="In ritardo" value={overdue} severity={overdue > 0 ? "warning" : "ok"} />
        <SummaryCard label="Con errori" value={errors} severity={errors > 0 ? "critical" : "ok"} />
        <SummaryCard label="Doc aggiornati" value={totalChanged} severity="info" />
      </div>

      {/* Risultati ultima esecuzione */}
      {lastRunResults && lastRunResults.length > 0 && (
        <Card>
          <CardContent className="p-3 space-y-1.5">
            <p className="text-xs font-semibold">Ultima esecuzione</p>
            {lastRunResults.map(r => (
              <div key={r.source_id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate flex items-center gap-1.5">
                  {r.status === "changed" && <CheckCircle2 className="h-3 w-3 text-blue-600" />}
                  {r.status === "no_change" && <Clock className="h-3 w-3 text-slate-500" />}
                  {r.status === "error" && <AlertTriangle className="h-3 w-3 text-rose-600" />}
                  <span className="truncate">{r.source_name}</span>
                </span>
                <span className="flex items-center gap-2 shrink-0 text-muted-foreground">
                  {r.content_chars && <span>{r.content_chars} char</span>}
                  <span>{r.duration_ms}ms</span>
                  <Badge variant="outline" className={STATUS_BADGE[r.status] ?? ""}>
                    {r.status}
                  </Badge>
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Lista fonti */}
      {list.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              Nessuna fonte esterna configurata. La migration di seed avrebbe dovuto inserirne 5 di default.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {list.map(src => (
            <Card key={src.id} className={src.consecutive_errors >= 3 ? "border-rose-300" : ""}>
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{src.name}</span>
                      <Badge variant="outline" className={DRIFT_BADGE[src.drift_severity]}>
                        {src.drift_severity}
                      </Badge>
                      <Badge variant="outline" className={STATUS_BADGE[src.last_status] ?? ""}>
                        {src.last_status}
                      </Badge>
                      {!src.enabled && (
                        <Badge variant="outline" className="border-slate-300 text-slate-600">
                          disabilitata
                        </Badge>
                      )}
                    </div>
                    <a
                      href={src.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1 truncate max-w-full"
                    >
                      <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                      <span className="truncate">{src.url}</span>
                    </a>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => syncMutation.mutate({ sourceId: src.id, dryRun: false })}
                    disabled={syncMutation.isPending}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Sync ora
                  </Button>
                </div>

                <div className="flex flex-wrap gap-1.5 text-[10px]">
                  <Badge variant="outline" className="font-mono">{src.scrape_strategy}</Badge>
                  <Badge variant="outline">🌐 {src.target_language}</Badge>
                  {src.target_category_path && (
                    <Badge variant="outline">📂 {src.target_category_path}</Badge>
                  )}
                  <Badge variant="outline">ogni {src.frequency_hours}h</Badge>
                  <Badge variant="outline">
                    sync: {formatRelative(src.last_synced_at)}
                  </Badge>
                  {src.last_change_detected_at && (
                    <Badge variant="outline">
                      ultimo cambio: {formatRelative(src.last_change_detected_at)}
                    </Badge>
                  )}
                  {src.consecutive_errors > 0 && (
                    <Badge variant="outline" className="border-rose-300 text-rose-700">
                      ⚠ {src.consecutive_errors} err
                    </Badge>
                  )}
                  {src.target_doc_title ? (
                    <Badge variant="secondary" className="font-mono truncate max-w-[200px]">
                      doc: {src.target_doc_title}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-300 text-amber-700">
                      nessun doc collegato
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  severity = "ok",
}: {
  label: string;
  value: number;
  severity?: "ok" | "info" | "warning" | "critical";
}) {
  const cls =
    severity === "critical"
      ? "border-rose-300 text-rose-700"
      : severity === "warning"
      ? "border-amber-300 text-amber-700"
      : severity === "info"
      ? "border-blue-300 text-blue-700"
      : "border-emerald-300 text-emerald-700";
  return (
    <Card className={cls}>
      <CardContent className="p-3">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold">{value}</p>
      </CardContent>
    </Card>
  );
}
