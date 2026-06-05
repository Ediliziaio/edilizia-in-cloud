/**
 * EmailPipelineStatus — cruscotto tecnico pipeline email-AI
 *
 * Mostra in un'unica view:
 *   - % email classificate/embeddate (24h / totale)
 *   - Coda estrazione (docs + opportunità in attesa conferma)
 *   - Salute dei cron (da silvio_ops_health, solo super_admin)
 *
 * Raggiunta dalla tab "Sistema" in EmailAiSettingsPage.
 * Nessuna azione destructiva — sola lettura + link a Silvio per follow-up.
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  AlertTriangle,
  Brain,
  FileText,
  Inbox,
  TrendingUp,
  Activity,
  Clock,
  XCircle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PipelineStats {
  emails_24h: number;
  classified_24h: number;
  embedded_24h: number;
  total_emails: number;
  total_classified: number;
  docs_pending_confirm: number;
  opportunita_pending: number;
}

interface CronFail {
  job: string;
  fallite: number;
  ultimo_errore: string | null;
}

interface OpsHealth {
  cron_falliti_2h: CronFail[];
  cron_attivi_totali: number;
  verificato_al: string;
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

function usePipelineStats(companyId: string | undefined) {
  // Cast away strict typing for tables not yet in generated types
  const sbAny = supabase as unknown as {
    from: (t: string) => ReturnType<typeof supabase.from>;
    rpc: (fn: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
  };

  return useQuery<PipelineStats>({
    queryKey: ["email-pipeline-stats", companyId],
    enabled: !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<PipelineStats> => {
      const now = new Date();
      const cutoff24h = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();

      const [r24h, rDocs, rOpps] = await Promise.all([
        sbAny
          .from("email_inbox")
          .select("id, ai_category, embedding")
          .eq("company_id", companyId as string)
          .gte("received_at", cutoff24h),
        sbAny
          .from("email_documento_estratto")
          .select("id", { count: "exact", head: false })
          .eq("company_id", companyId as string)
          .in("stato", ["da_confermare", "duplicato"])
          .limit(1),
        sbAny
          .from("email_opportunita_bozza")
          .select("id", { count: "exact", head: false })
          .eq("company_id", companyId as string)
          .eq("stato", "da_valutare")
          .limit(1),
      ]);

      const emails24 = ((r24h as { data: unknown[] | null }).data ?? []) as Array<{
        ai_category: string | null;
        embedding: unknown;
      }>;
      const classified24 = emails24.filter((e) => e.ai_category).length;
      const embedded24 = emails24.filter((e) => e.embedding).length;

      // For totals use count queries
      const rTotalAll = await sbAny
        .from("email_inbox")
        .select("id, ai_category", { count: "exact" } as Record<string, unknown>)
        .eq("company_id", companyId as string);
      const totalEmails = (rTotalAll as { count: number | null }).count ?? 0;
      const rClassified = await sbAny
        .from("email_inbox")
        .select("id", { count: "exact" } as Record<string, unknown>)
        .eq("company_id", companyId as string)
        .not("ai_category", "is", null);
      const totalClassified = (rClassified as { count: number | null }).count ?? 0;

      return {
        emails_24h: emails24.length,
        classified_24h: classified24,
        embedded_24h: embedded24,
        total_emails: totalEmails,
        total_classified: totalClassified,
        docs_pending_confirm: (rDocs as { count: number | null }).count ?? 0,
        opportunita_pending: (rOpps as { count: number | null }).count ?? 0,
      };
    },
  });
}

function useOpsHealth(enabled: boolean) {
  return useQuery<OpsHealth>({
    queryKey: ["silvio-ops-health"],
    enabled,
    staleTime: 120_000,
    queryFn: async (): Promise<OpsHealth> => {
      const { data, error } = await (supabase.rpc as unknown as (fn: string) => Promise<{ data: unknown; error: unknown }>)(
        "silvio_ops_health"
      );
      if (error) throw error;
      return data as OpsHealth;
    },
  });
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: typeof Inbox;
  label: string;
  value: number | string;
  sub?: string;
  color?: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate">{label}</p>
            <p className={cn("text-2xl font-bold mt-0.5", color ?? "text-slate-800")}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
          </div>
          <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", color ? "bg-current/10" : "bg-slate-100")}>
            <Icon className={cn("h-5 w-5", color ?? "text-slate-600")} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EmailPipelineStatus() {
  const { effectiveCompany, profile } = useAuth();
  const companyId = effectiveCompany?.id;
  const isSuperAdmin = profile?.role === "super_admin";

  const { data: stats, isLoading: loadingStats } = usePipelineStats(companyId);
  const { data: health, isLoading: loadingHealth } = useOpsHealth(isSuperAdmin);

  // ─ Classification % ─────────────────────────────────────────────────────
  const classifiedPct = stats
    ? stats.total_emails > 0
      ? Math.round((stats.total_classified / stats.total_emails) * 100)
      : 0
    : 0;

  const classified24Pct = stats
    ? stats.emails_24h > 0
      ? Math.round((stats.classified_24h / stats.emails_24h) * 100)
      : 0
    : 0;

  // ─ Cron health summary ──────────────────────────────────────────────────
  const cronsFailing = health ? health.cron_falliti_2h.length : 0;

  return (
    <div className="space-y-5">
      {/* ── Section 1: Processing stats ──────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-blue-600" />
          Processamento ultime 24h
        </h3>
        {loadingStats ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <StatCard
              icon={Inbox}
              label="Email ricevute (24h)"
              value={stats?.emails_24h ?? 0}
              color="text-slate-700"
            />
            <StatCard
              icon={Brain}
              label="Classificate (24h)"
              value={`${stats?.classified_24h ?? 0} — ${classified24Pct}%`}
              sub={classified24Pct >= 95 ? "✓ Ottimo" : classified24Pct >= 70 ? "In corso" : "Basso"}
              color={classified24Pct >= 95 ? "text-emerald-600" : classified24Pct >= 70 ? "text-amber-600" : "text-red-600"}
            />
            <StatCard
              icon={TrendingUp}
              label="Totale classificate"
              value={`${classifiedPct}%`}
              sub={`${stats?.total_classified ?? 0} di ${stats?.total_emails ?? 0}`}
              color={classifiedPct >= 95 ? "text-emerald-600" : "text-amber-600"}
            />
          </div>
        )}
      </div>

      {/* ── Section 2: Extraction backlog ────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <FileText className="h-4 w-4 text-violet-600" />
          Coda di revisione documenti
        </h3>
        {loadingStats ? (
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <StatCard
              icon={FileText}
              label="Fatture da confermare"
              value={stats?.docs_pending_confirm ?? 0}
              sub={
                (stats?.docs_pending_confirm ?? 0) === 0
                  ? "Tutto in ordine"
                  : "Aprire Email AI → Fatture"
              }
              color={
                (stats?.docs_pending_confirm ?? 0) > 0
                  ? "text-amber-600"
                  : "text-emerald-600"
              }
            />
            <StatCard
              icon={TrendingUp}
              label="Opportunità da valutare"
              value={stats?.opportunita_pending ?? 0}
              sub={
                (stats?.opportunita_pending ?? 0) === 0
                  ? "Nessuna in attesa"
                  : "Aprire Email AI → Opportunità"
              }
              color={
                (stats?.opportunita_pending ?? 0) > 0
                  ? "text-sky-600"
                  : "text-emerald-600"
              }
            />
          </div>
        )}
      </div>

      {/* ── Section 3: Cron health (super_admin only) ────────────────── */}
      {isSuperAdmin && (
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-500" />
            Salute cron
            {!loadingHealth && health && (
              <span className="ml-auto text-xs text-muted-foreground">
                {health.cron_attivi_totali} attivi
              </span>
            )}
          </h3>

          {loadingHealth ? (
            <Skeleton className="h-16 rounded-xl" />
          ) : health ? (
            cronsFailing === 0 ? (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-sm text-emerald-700">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Nessun cron in errore nelle ultime 2h
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-sm text-red-700 mb-2">
                  <AlertTriangle className="h-4 w-4 shrink-0" />
                  {cronsFailing} cron {cronsFailing === 1 ? "fallito" : "falliti"} nelle ultime 2h
                </div>
                {health.cron_falliti_2h.map((c) => (
                  <div key={c.job} className="bg-white border border-red-100 rounded-lg p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                      <span className="text-xs font-mono font-medium text-slate-700">{c.job}</span>
                      <Badge variant="outline" className="ml-auto text-red-600 border-red-200 text-[10px]">
                        {c.fallite}×
                      </Badge>
                    </div>
                    {c.ultimo_errore && (
                      <p className="text-[11px] text-muted-foreground pl-5 break-words">
                        {c.ultimo_errore}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )
          ) : null}
        </div>
      )}
    </div>
  );
}
