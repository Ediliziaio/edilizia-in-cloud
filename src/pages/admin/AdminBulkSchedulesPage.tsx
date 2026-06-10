/**
 * AdminBulkSchedulesPage — vista super_admin dei messaggi programmati bulk.
 *
 * Mostra TUTTI gli automation_flows con bulk_trigger_config valorizzato,
 * cross-company. Permette:
 *   - Filtro per company / status / canale
 *   - Visualizzare le ultime run (bulk_scheduler_runs)
 *   - Disabilitare un flow (status → draft)
 *   - Aprire il wizard per CREARE un flow per QUALSIASI company (super_admin)
 *
 * Riusa BulkScheduleWizard. La differenza: in admin context il wizard
 * accetterà anche un company_id esplicito (estensione futura).
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import {
  CalendarClock, Building2, Users, MessageSquare, Pause, Play, Trash2, Activity, AlertCircle, CheckCircle,
} from "lucide-react";

interface BulkFlow {
  id: string;
  name: string;
  description: string | null;
  status: "draft" | "published" | "archived";
  company_id: string;
  created_at: string;
  updated_at: string;
  bulk_trigger_config: {
    cron: string;
    timezone?: string;
    target: { type: string; value: string | null };
    channels: Array<{ type: string }>;
    template: { mode: "static" | "ai_generated"; body?: string; ai_prompt?: string };
    last_run_at: string | null;
    next_run_at: string | null;
  };
}

interface BulkRun {
  id: string;
  flow_id: string;
  company_id: string;
  scheduled_for: string;
  started_at: string;
  finished_at: string | null;
  targets_resolved: number;
  sent_ok: number;
  sent_failed: number;
  channel_breakdown: Record<string, number>;
  status: "running" | "success" | "partial" | "failed";
  error_summary: string | null;
}

interface CompanyLite { id: string; name: string }

export default function AdminBulkSchedulesPage() {
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("published");

  // Companies
  const { data: companies = [] } = useQuery({
    queryKey: ["admin-bulk-companies"],
    queryFn: async (): Promise<CompanyLite[]> => {
      const { data } = await supabase.from("companies").select("id, name").order("name");
      return (data ?? []) as CompanyLite[];
    },
    staleTime: 10 * 60 * 1000,
  });

  // Flows con bulk_trigger_config
  const { data: flows = [], isLoading } = useQuery({
    queryKey: ["admin-bulk-flows", filterCompany, filterStatus],
    queryFn: async (): Promise<BulkFlow[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q = (supabase as any)
        .from("automation_flows")
        .select("id, name, description, status, company_id, created_at, updated_at, bulk_trigger_config")
        .not("bulk_trigger_config", "is", null)
        .order("updated_at", { ascending: false });
      if (filterCompany !== "all") q = q.eq("company_id", filterCompany);
      if (filterStatus !== "all") q = q.eq("status", filterStatus);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as BulkFlow[];
    },
  });

  // Ultime run di tutti i flow filtrati
  const flowIds = useMemo(() => flows.map((f) => f.id), [flows]);
  const { data: runs = [] } = useQuery({
    queryKey: ["admin-bulk-runs", flowIds],
    enabled: flowIds.length > 0,
    queryFn: async (): Promise<BulkRun[]> => {
      const { data } = await supabase
        .from("bulk_scheduler_runs")
        .select("*")
        .in("flow_id", flowIds)
        .order("started_at", { ascending: false })
        .limit(50);
      return (data ?? []) as BulkRun[];
    },
  });

  // Lookup company name + last run by flow_id
  const companyNameById = useMemo(() => {
    const m = new Map<string, string>();
    companies.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [companies]);

  const lastRunByFlow = useMemo(() => {
    const m = new Map<string, BulkRun>();
    for (const r of runs) {
      if (!m.has(r.flow_id)) m.set(r.flow_id, r);
    }
    return m;
  }, [runs]);

  // Stats aggregate
  const stats = useMemo(() => {
    const totalFlows = flows.length;
    const published = flows.filter((f) => f.status === "published").length;
    const companiesActive = new Set(flows.map((f) => f.company_id)).size;
    const lastRunsAll = runs.slice(0, 20);
    const totalSent = lastRunsAll.reduce((s, r) => s + r.sent_ok, 0);
    const totalFailed = lastRunsAll.reduce((s, r) => s + r.sent_failed, 0);
    return { totalFlows, published, companiesActive, totalSent, totalFailed };
  }, [flows, runs]);

  // Mutations
  const toggleMut = useMutation({
    mutationFn: async ({ id, newStatus }: { id: string; newStatus: string }) => {
      const { error } = await supabase
        .from("automation_flows")
        .update({ status: newStatus })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Stato aggiornato");
      void qc.invalidateQueries({ queryKey: ["admin-bulk-flows"] });
    },
    onError: (e: Error) => toast.error("Errore", { description: e.message }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("automation_flows").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Messaggio programmato eliminato");
      void qc.invalidateQueries({ queryKey: ["admin-bulk-flows"] });
    },
    onError: (e: Error) => toast.error("Errore", { description: e.message }),
  });

  return (
    <div className="p-4 md:p-6 max-w-screen-xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="shrink-0 h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
          <CalendarClock className="h-5 w-5 text-violet-600 dark:text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Messaggi programmati — Cross Company</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Vista super_admin di tutti i messaggi programmati attivi su tutte le aziende.
            Per crearne uno, accedi come company_admin all'azienda e usa il wizard in /azienda/automazioni.
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="rounded-lg border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Flow totali</div>
          <div className="text-2xl font-bold tabular-nums mt-0.5">{stats.totalFlows}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {stats.published} attivi
          </div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Aziende</div>
          <div className="text-2xl font-bold tabular-nums mt-0.5">{stats.companiesActive}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">su {companies.length} totali</div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Inviati (ultime 20 run)</div>
          <div className="text-2xl font-bold tabular-nums mt-0.5 text-emerald-600">{stats.totalSent}</div>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Falliti</div>
          <div className={cn("text-2xl font-bold tabular-nums mt-0.5", stats.totalFailed > 0 ? "text-rose-600" : "text-slate-400")}>
            {stats.totalFailed}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterCompany} onValueChange={setFilterCompany}>
          <SelectTrigger className="h-9 w-56">
            <SelectValue placeholder="Tutte le aziende" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte le aziende ({companies.length})</SelectItem>
            {companies.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutti gli stati</SelectItem>
            <SelectItem value="published">Attivi</SelectItem>
            <SelectItem value="draft">In bozza</SelectItem>
            <SelectItem value="archived">Archiviati</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Flows list */}
      {isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24" />)}</div>
      ) : flows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            <CalendarClock className="h-8 w-8 mx-auto mb-2 opacity-40" />
            Nessun messaggio programmato attivo con questi filtri.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {flows.map((f) => {
            const cfg = f.bulk_trigger_config;
            const lastRun = lastRunByFlow.get(f.id);
            const isActive = f.status === "published";
            return (
              <Card key={f.id} className={cn("transition-opacity", !isActive && "opacity-60")}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                        <span>{f.name}</span>
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          <Building2 className="h-2.5 w-2.5" />
                          {companyNameById.get(f.company_id) ?? f.company_id.slice(0, 8)}
                        </Badge>
                        {isActive ? (
                          <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-300">Attivo</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">{f.status}</Badge>
                        )}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7"
                        title={isActive ? "Disabilita" : "Riabilita"}
                        onClick={() => toggleMut.mutate({ id: f.id, newStatus: isActive ? "draft" : "published" })}
                      >
                        {isActive ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                      </Button>
                      <Button
                        size="icon" variant="ghost" className="h-7 w-7 text-rose-600"
                        title="Elimina"
                        onClick={async () => {
                          if (await confirm({
                            title: `Eliminare "${f.name}"?`,
                            description: "L'azione è irreversibile.",
                            confirmLabel: "Elimina",
                            variant: "destructive",
                          })) {
                            deleteMut.mutate(f.id);
                          }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-2 text-xs">
                  <div className="flex flex-wrap gap-3 text-muted-foreground">
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" />
                      <code className="font-mono text-[10px]">{cfg.cron}</code>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {cfg.target.type === "role" ? `role: ${cfg.target.value}` : cfg.target.type}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {cfg.channels.map((c) => c.type).join(", ") || "—"}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      Mode: <strong>{cfg.template.mode === "ai_generated" ? "AI" : "statico"}</strong>
                    </span>
                  </div>
                  {cfg.next_run_at && (
                    <div className="text-[11px] text-muted-foreground">
                      Prossima esecuzione: {new Date(cfg.next_run_at).toLocaleString("it-IT")}
                    </div>
                  )}
                  {lastRun && (
                    <div className="rounded-md border bg-slate-50 p-2 flex items-center gap-2 text-[11px]">
                      <Activity className="h-3 w-3 text-slate-500" />
                      <span className="text-muted-foreground">Ultima run {new Date(lastRun.started_at).toLocaleString("it-IT")}:</span>
                      <span className="inline-flex items-center gap-1 text-emerald-700">
                        <CheckCircle className="h-3 w-3" /> {lastRun.sent_ok} ok
                      </span>
                      {lastRun.sent_failed > 0 && (
                        <span className="inline-flex items-center gap-1 text-rose-700">
                          <AlertCircle className="h-3 w-3" /> {lastRun.sent_failed} falliti
                        </span>
                      )}
                      <Badge variant="outline" className={cn(
                        "text-[9px]",
                        lastRun.status === "success" && "border-emerald-300 text-emerald-700",
                        lastRun.status === "partial" && "border-amber-300 text-amber-700",
                        lastRun.status === "failed" && "border-rose-300 text-rose-700",
                      )}>
                        {lastRun.status}
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
