import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  BarChart3, Clock, MessageSquare, CalendarCheck, TrendingUp, Download,
  Smile, Meh, Frown, Activity,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AnalyticsTable } from "./AnalyticsTable";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";

interface Conversation {
  id: string;
  status: string;
  duration_seconds: number;
  messages_count: number;
  appointment_created: boolean;
  started_at: string;
  elevenlabs_conversation_id: string | null;
  contact_id: string | null;
  sentiment?: string | null;
  sentiment_score?: number | null;
}

interface AgentAnalyticsTabProps {
  agentId: string;
}

/** Converte una stringa sentiment (italiana/inglese/null) in bucket canonico */
function bucketSentiment(raw: string | null | undefined): "positive" | "neutral" | "negative" {
  const s = (raw ?? "").toLowerCase();
  if (s === "positive" || s === "positivo") return "positive";
  if (s === "negative" || s === "negativo") return "negative";
  return "neutral";
}

function formatDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const s = sec % 60;
  return `${min}m ${s}s`;
}

function downloadCsv(rows: Conversation[], agentId: string) {
  const header = [
    "id", "started_at", "status", "duration_seconds", "messages_count",
    "appointment_created", "sentiment", "sentiment_score", "contact_id",
    "elevenlabs_conversation_id",
  ];
  const escape = (v: unknown) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    header.join(","),
    ...rows.map(r => header.map(h => escape((r as Record<string, unknown>)[h])).join(",")),
  ];
  const csv = lines.join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `agent-${agentId.slice(0, 8)}-conversations-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function AgentAnalyticsTab({ agentId }: AgentAnalyticsTabProps) {
  const { data: conversations, isLoading } = useQuery({
    queryKey: queryKeys.aiAgents.conversations(agentId),
    queryFn: async (): Promise<Conversation[]> => {
      const { data, error } = await supabase
        .from("ai_agent_conversations" as never)
        .select("id, status, duration_seconds, messages_count, appointment_created, started_at, elevenlabs_conversation_id, contact_id, sentiment, sentiment_score")
        .eq("agent_id", agentId)
        .order("started_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Conversation[];
    },
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
      </div>
    );
  }

  const convos = conversations ?? [];
  const total = convos.length;
  const totalDuration = convos.reduce((s, c) => s + c.duration_seconds, 0);
  const avgDuration = total > 0 ? Math.round(totalDuration / total) : 0;
  const totalMessages = convos.reduce((s, c) => s + c.messages_count, 0);
  const appointments = convos.filter(c => c.appointment_created).length;
  const completed = convos.filter(c => c.status === "completed").length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : null;
  const conversionRate = total > 0 ? Math.round((appointments / total) * 100) : null;

  // Sentiment breakdown
  const sentimentBuckets = convos.reduce(
    (acc, c) => {
      const b = bucketSentiment(c.sentiment);
      acc[b]++;
      return acc;
    },
    { positive: 0, neutral: 0, negative: 0 },
  );
  const sentimentScore = total > 0
    ? Math.round(((sentimentBuckets.positive + sentimentBuckets.neutral * 0.5) / total) * 100)
    : null;

  // Last 7 days trend (raggruppamento grezzo per giorno)
  const last7d = convos.filter(c => {
    const d = new Date(c.started_at);
    return d.getTime() > Date.now() - 7 * 86400 * 1000;
  });

  const stats = [
    { label: "Conversazioni totali", value: total, icon: MessageSquare, color: "text-primary" },
    { label: "Ultimi 7 giorni", value: last7d.length, icon: Activity, color: "text-blue-600" },
    { label: "Durata media", value: total > 0 ? formatDuration(avgDuration) : "—", icon: Clock, color: "text-violet-600" },
    { label: "Appuntamenti creati", value: appointments, icon: CalendarCheck, color: "text-teal-600" },
    { label: "Conversion rate", value: conversionRate !== null ? `${conversionRate}%` : "—", icon: TrendingUp, color: "text-emerald-600" },
    { label: "Completion rate", value: completionRate !== null ? `${completionRate}%` : "—", icon: BarChart3, color: "text-indigo-600" },
  ];

  const sentimentPct = (n: number) => total > 0 ? Math.round((n / total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header con pulsante export */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-sm font-medium">Statistiche conversazioni</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {total > 0
              ? `${total} conversazioni totali (${last7d.length} negli ultimi 7 giorni)`
              : "Nessuna conversazione ancora registrata"}
          </p>
        </div>
        {total > 0 && (
          <Button size="sm" variant="outline" onClick={() => {
            downloadCsv(convos, agentId);
            toast.success("Export CSV avviato");
          }}>
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Esporta CSV
          </Button>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border bg-card p-3 space-y-1">
            <div className="flex items-center gap-1.5">
              <stat.icon className={`h-3.5 w-3.5 ${stat.color}`} />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wide">{stat.label}</span>
            </div>
            <p className="text-xl font-bold leading-tight">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Sentiment breakdown — nuovo */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Smile className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Sentiment delle conversazioni</span>
          </div>
          {sentimentScore !== null && (
            <span className="text-xs text-muted-foreground">
              Score: <span className="font-semibold text-foreground">{sentimentScore}%</span>
            </span>
          )}
        </div>

        {total === 0 ? (
          <p className="text-xs text-muted-foreground">
            Il sentiment viene analizzato automaticamente al termine di ogni conversazione.
          </p>
        ) : (
          <>
            {/* Stacked progress bar */}
            <div className="flex h-2.5 rounded-full overflow-hidden bg-muted">
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${sentimentPct(sentimentBuckets.positive)}%` }}
                title={`Positive: ${sentimentBuckets.positive}`}
              />
              <div
                className="bg-slate-400 transition-all"
                style={{ width: `${sentimentPct(sentimentBuckets.neutral)}%` }}
                title={`Neutral: ${sentimentBuckets.neutral}`}
              />
              <div
                className="bg-rose-500 transition-all"
                style={{ width: `${sentimentPct(sentimentBuckets.negative)}%` }}
                title={`Negative: ${sentimentBuckets.negative}`}
              />
            </div>

            {/* Breakdown legend */}
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Smile className="h-4 w-4 text-emerald-600 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold">{sentimentBuckets.positive} <span className="text-muted-foreground font-normal">({sentimentPct(sentimentBuckets.positive)}%)</span></p>
                  <p className="text-muted-foreground text-[10px]">Positive</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Meh className="h-4 w-4 text-slate-500 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold">{sentimentBuckets.neutral} <span className="text-muted-foreground font-normal">({sentimentPct(sentimentBuckets.neutral)}%)</span></p>
                  <p className="text-muted-foreground text-[10px]">Neutral</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Frown className="h-4 w-4 text-rose-600 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold">{sentimentBuckets.negative} <span className="text-muted-foreground font-normal">({sentimentPct(sentimentBuckets.negative)}%)</span></p>
                  <p className="text-muted-foreground text-[10px]">Negative</p>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Summary */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">Riepilogo</span>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Messaggi totali</span>
            <span className="font-medium">{totalMessages}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Tempo totale</span>
            <span className="font-medium">{formatDuration(totalDuration)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Completate</span>
            <span className="font-medium">{completed}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Appuntamenti</span>
            <span className="font-medium">{appointments}</span>
          </div>
        </div>
      </div>

      {/* Conversations table */}
      {total > 0 ? (
        <AnalyticsTable conversations={convos} />
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center space-y-2">
          <MessageSquare className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">
            Nessuna conversazione registrata. Le statistiche appariranno dopo la prima interazione.
          </p>
        </div>
      )}
    </div>
  );
}
