/**
 * KPI overview globali di tutti i flussi aziendali.
 * Mostrato sopra `AutomationFlowsList` / `AutomazioniUnified`.
 *
 * Metriche (ultimi 7 giorni salvo diversa indicazione):
 * - Totale flussi / Attivi
 * - Iscrizioni attive (in corso)
 * - Esecuzioni 24h / 7gg
 * - Success rate 7gg
 * - Errori ultime 24h (chiamata all'azione: clic → apri filtro errori)
 *
 * Design: 2 righe di card, cliccabili dove ha senso filtrare la lista.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  Zap, PlayCircle, Users, Activity, CheckCircle2, AlertTriangle,
} from "lucide-react";

interface Props {
  companyId: string;
  onErrorClick?: () => void;
  onActiveClick?: () => void;
}

const MS_DAY = 86400 * 1000;

export function AutomationOverviewStats({ companyId, onErrorClick, onActiveClick }: Props) {
  const nowIso = new Date().toISOString();
  const day1Iso = new Date(Date.now() - MS_DAY).toISOString();
  const day7Iso = new Date(Date.now() - 7 * MS_DAY).toISOString();

  const { data, isLoading } = useQuery({
    queryKey: ["automation-overview-stats", companyId],
    queryFn: async () => {
      // Parallelizza tutte le count query — tutte head+count=exact per leggerezza.
      const [
        flowsTotal,
        flowsActive,
        enrollmentsActive,
        logs24h,
        logs7d,
        logs7dSuccess,
        errors24h,
      ] = await Promise.all([
        supabase.from("automation_flows").select("id", { count: "exact", head: true }).eq("company_id", companyId),
        supabase.from("automation_flows").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "published"),
        supabase.from("automation_enrollments").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", "active"),
        supabase.from("automation_execution_log").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", day1Iso),
        supabase.from("automation_execution_log").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", day7Iso),
        supabase.from("automation_execution_log").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", day7Iso).eq("status", "success"),
        supabase.from("automation_execution_log").select("id", { count: "exact", head: true }).eq("company_id", companyId).gte("created_at", day1Iso).eq("status", "failed"),
      ]);

      return {
        flowsTotal: flowsTotal.count ?? 0,
        flowsActive: flowsActive.count ?? 0,
        enrollmentsActive: enrollmentsActive.count ?? 0,
        runs24h: logs24h.count ?? 0,
        runs7d: logs7d.count ?? 0,
        runs7dSuccess: logs7dSuccess.count ?? 0,
        errors24h: errors24h.count ?? 0,
      };
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  const successRate = data.runs7d > 0
    ? Math.round((data.runs7dSuccess / data.runs7d) * 100)
    : null;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <StatCard
        icon={<Zap className="h-4 w-4" />}
        label="Flussi totali"
        value={data.flowsTotal}
        accent="bg-primary/10 text-primary"
      />
      <StatCard
        icon={<PlayCircle className="h-4 w-4" />}
        label="Attivi (published)"
        value={data.flowsActive}
        accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
        onClick={onActiveClick}
      />
      <StatCard
        icon={<Users className="h-4 w-4" />}
        label="Iscrizioni attive"
        value={data.enrollmentsActive}
        accent="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
      />
      <StatCard
        icon={<Activity className="h-4 w-4" />}
        label="Esecuzioni 24h"
        value={data.runs24h}
        subtitle={`${data.runs7d} negli ultimi 7gg`}
        accent="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
      />
      <StatCard
        icon={<CheckCircle2 className="h-4 w-4" />}
        label="Success rate 7gg"
        value={successRate !== null ? `${successRate}%` : "—"}
        subtitle={successRate === null ? "Nessuna esecuzione" : `${data.runs7dSuccess}/${data.runs7d} OK`}
        accent="bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300"
      />
      <StatCard
        icon={<AlertTriangle className="h-4 w-4" />}
        label="Errori 24h"
        value={data.errors24h}
        accent={data.errors24h > 0
          ? "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"
          : "bg-muted text-muted-foreground"}
        onClick={data.errors24h > 0 ? onErrorClick : undefined}
        active={data.errors24h > 0}
      />
    </div>
  );
}

function StatCard({
  icon, label, value, subtitle, accent, onClick, active,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
  accent: string;
  onClick?: () => void;
  active?: boolean;
}) {
  return (
    <Card
      className={cn(
        "transition-all",
        onClick && "cursor-pointer hover:shadow-md",
        active && "ring-1 ring-rose-300"
      )}
      onClick={onClick}
    >
      <CardContent className="p-3 flex items-start gap-2.5">
        <div className={cn("p-1.5 rounded-lg shrink-0", accent)}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{label}</p>
          <p className="text-xl font-bold leading-tight mt-0.5">{value}</p>
          {subtitle && (
            <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{subtitle}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
