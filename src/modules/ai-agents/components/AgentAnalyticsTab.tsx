import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, Clock, MessageSquare, CalendarCheck, TrendingUp } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AnalyticsTable } from "./AnalyticsTable";
import { queryKeys } from "@/lib/queryKeys";

interface Conversation {
  id: string;
  status: string;
  duration_seconds: number;
  messages_count: number;
  appointment_created: boolean;
  started_at: string;
  elevenlabs_conversation_id: string | null;
  contact_id: string | null;
}

interface AgentAnalyticsTabProps {
  agentId: string;
}

export function AgentAnalyticsTab({ agentId }: AgentAnalyticsTabProps) {
  const { data: conversations, isLoading } = useQuery({
    queryKey: queryKeys.aiAgents.conversations(agentId),
    queryFn: async (): Promise<Conversation[]> => {
      const { data, error } = await supabase
        .from("ai_agent_conversations" as never)
        .select("id, status, duration_seconds, messages_count, appointment_created, started_at, elevenlabs_conversation_id, contact_id")
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

  const total = conversations?.length ?? 0;
  const totalDuration = conversations?.reduce((s, c) => s + c.duration_seconds, 0) ?? 0;
  const avgDuration = total > 0 ? Math.round(totalDuration / total) : 0;
  const totalMessages = conversations?.reduce((s, c) => s + c.messages_count, 0) ?? 0;
  const appointments = conversations?.filter((c) => c.appointment_created).length ?? 0;
  const completed = conversations?.filter((c) => c.status === "completed").length ?? 0;

  const formatDuration = (sec: number) => {
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    const s = sec % 60;
    return `${min}m ${s}s`;
  };

  const stats = [
    { label: "Conversazioni", value: total, icon: MessageSquare, color: "text-primary" },
    { label: "Durata media", value: formatDuration(avgDuration), icon: Clock, color: "text-primary" },
    { label: "Appuntamenti creati", value: appointments, icon: CalendarCheck, color: "text-primary" },
    { label: "Tasso completamento", value: total > 0 ? `${Math.round((completed / total) * 100)}%` : "—", icon: TrendingUp, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-lg border bg-card p-4 space-y-2">
            <div className="flex items-center gap-2">
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
              <span className="text-xs text-muted-foreground">{stat.label}</span>
            </div>
            <p className="text-2xl font-bold">{stat.value}</p>
          </div>
        ))}
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
        <AnalyticsTable conversations={conversations ?? []} />
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
