/**
 * KPI overview globali di TUTTI gli agenti AI dell'azienda.
 * Mostrato come header della pagina elenco agenti.
 *
 * Metriche (ultimi 7gg):
 * - Agenti totali / Attivi
 * - Conversazioni 24h / 7gg
 * - Appuntamenti creati 7gg
 * - Durata media conversazione
 * - Tasso conversione (appuntamenti / conversazioni)
 * - Sentiment medio (positive + neutral vs negative)
 *
 * Pattern: card grid responsive, KPI non reagiscono a filtri (sempre totali).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/contexts/AuthContext";
import {
  Bot, PlayCircle, MessageSquare, CalendarCheck, Clock, TrendingUp, Smile,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MS_DAY = 86400 * 1000;

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}

export function AgentOverviewStats() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const day1Iso = new Date(Date.now() - MS_DAY).toISOString();
  const day7Iso = new Date(Date.now() - 7 * MS_DAY).toISOString();

  const { data, isLoading } = useQuery({
    queryKey: ["ai-agents-overview", companyId],
    queryFn: async () => {
      if (!companyId) return null;

      // Count agenti
      const [agentsTotalRes, agentsActiveRes] = await Promise.all([
        supabase.from("ai_agents" as never).select("id", { count: "exact", head: true }).eq("company_id", companyId),
        supabase.from("ai_agents" as never).select("id", { count: "exact", head: true }).eq("company_id", companyId).neq("status", "archived"),
      ]);

      // Conversazioni ultimi 7gg — dettaglio per calcolare duration media + sentiment
      const { data: convos } = await supabase
        .from("ai_agent_conversations" as never)
        .select("id, duration_seconds, appointment_created, sentiment, started_at, status")
        .eq("company_id", companyId)
        .gte("started_at", day7Iso)
        .limit(2000);

      const convos7d = (convos ?? []) as Array<{
        duration_seconds: number;
        appointment_created: boolean;
        sentiment: string | null;
        started_at: string;
        status: string;
      }>;
      const convos24h = convos7d.filter(c => c.started_at >= day1Iso);
      const totalDuration = convos7d.reduce((s, c) => s + (c.duration_seconds || 0), 0);
      const avgDuration = convos7d.length > 0 ? Math.round(totalDuration / convos7d.length) : 0;
      const appointments7d = convos7d.filter(c => c.appointment_created).length;
      const convRate7d = convos7d.length > 0
        ? Math.round((appointments7d / convos7d.length) * 100)
        : null;
      const sentimentCounts = convos7d.reduce((acc, c) => {
        const s = (c.sentiment ?? "neutral").toLowerCase();
        if (s === "positive" || s === "positivo") acc.positive++;
        else if (s === "negative" || s === "negativo") acc.negative++;
        else acc.neutral++;
        return acc;
      }, { positive: 0, neutral: 0, negative: 0 });
      const sentimentScore = convos7d.length > 0
        ? Math.round(((sentimentCounts.positive + sentimentCounts.neutral * 0.5) / convos7d.length) * 100)
        : null;

      return {
        agentsTotal: agentsTotalRes.count ?? 0,
        agentsActive: agentsActiveRes.count ?? 0,
        convos24h: convos24h.length,
        convos7d: convos7d.length,
        avgDuration,
        appointments7d,
        convRate7d,
        sentimentScore,
        sentimentCounts,
      };
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
  });

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
      <StatCard
        icon={<Bot className="h-4 w-4" />}
        label="Agenti totali"
        value={data.agentsTotal}
        accent="bg-primary/10 text-primary"
      />
      <StatCard
        icon={<PlayCircle className="h-4 w-4" />}
        label="Attivi"
        value={data.agentsActive}
        accent="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
      />
      <StatCard
        icon={<MessageSquare className="h-4 w-4" />}
        label="Conv. 24h"
        value={data.convos24h}
        subtitle={`${data.convos7d} ultimi 7gg`}
        accent="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
      />
      <StatCard
        icon={<Clock className="h-4 w-4" />}
        label="Durata media"
        value={data.convos7d > 0 ? formatDuration(data.avgDuration) : "—"}
        subtitle="Negli ultimi 7 giorni"
        accent="bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"
      />
      <StatCard
        icon={<CalendarCheck className="h-4 w-4" />}
        label="Appuntamenti 7gg"
        value={data.appointments7d}
        accent="bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300"
      />
      <StatCard
        icon={<TrendingUp className="h-4 w-4" />}
        label="Conversion rate"
        value={data.convRate7d !== null ? `${data.convRate7d}%` : "—"}
        subtitle={data.convRate7d === null ? "Nessuna conv." : `${data.appointments7d}/${data.convos7d}`}
        accent="bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
      />
      <StatCard
        icon={<Smile className="h-4 w-4" />}
        label="Sentiment score"
        value={data.sentimentScore !== null ? `${data.sentimentScore}%` : "—"}
        subtitle={data.sentimentScore === null
          ? "—"
          : `${data.sentimentCounts.positive}P · ${data.sentimentCounts.neutral}N · ${data.sentimentCounts.negative}N-`}
        accent="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
      />
    </div>
  );
}

function StatCard({
  icon, label, value, subtitle, accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtitle?: string;
  accent: string;
}) {
  return (
    <Card>
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
