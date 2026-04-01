import { useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare, AlertCircle, Clock, CheckCircle } from "lucide-react";

interface ConversationSummary {
  companyId: string;
  companyName: string;
  lastMessage: string;
  lastMessageDate: string;
  totalMessages: number;
  unansweredByAdmin: boolean;
  status: string;
  priority: string;
  resolvedAt: string | null;
  agingHours: number;
}

interface SupportMessage {
  id: string;
  company_id: string;
  sender_role: string;
  message: string;
  created_at: string;
}

interface SupportStatsProps {
  conversations: ConversationSummary[];
  totalMessagesToday: number;
  messages: SupportMessage[];
}

export function SupportStats({ conversations, totalMessagesToday, messages }: SupportStatsProps) {
  const openCount = conversations.filter((c) => c.status === "open").length;
  const unansweredCount = conversations.filter((c) => c.unansweredByAdmin).length;

  const resolvedThisWeek = useMemo(() => {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    return conversations.filter((c) => c.resolvedAt && new Date(c.resolvedAt) >= weekAgo).length;
  }, [conversations]);

  const avgResponseTime = useMemo(() => {
    // Calculate average time between last company message and first admin reply after it
    const grouped = new Map<string, SupportMessage[]>();
    for (const msg of messages) {
      if (!grouped.has(msg.company_id)) grouped.set(msg.company_id, []);
      grouped.get(msg.company_id)!.push(msg);
    }

    const responseTimes: number[] = [];
    for (const msgs of grouped.values()) {
      const sorted = [...msgs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].sender_role !== "super_admin" && sorted[i + 1].sender_role === "super_admin") {
          const delta = new Date(sorted[i + 1].created_at).getTime() - new Date(sorted[i].created_at).getTime();
          responseTimes.push(delta);
        }
      }
    }

    if (responseTimes.length === 0) return null;
    const avgMs = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
    const hours = Math.floor(avgMs / (1000 * 60 * 60));
    const minutes = Math.floor((avgMs % (1000 * 60 * 60)) / (1000 * 60));
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }, [messages]);

  const slaViolations = (conversations ?? []).filter(
    (c) =>
      c.status !== 'risolto' &&
      c.status !== 'resolved' &&
      c.status !== 'closed' &&
      c.agingHours > 4 &&
      c.unansweredByAdmin
  ).length;

  const avgResponseHours = useMemo(() => {
    const grouped = new Map<string, SupportMessage[]>();
    for (const msg of messages) {
      if (!grouped.has(msg.company_id)) grouped.set(msg.company_id, []);
      grouped.get(msg.company_id)!.push(msg);
    }
    const times: number[] = [];
    for (const msgs of grouped.values()) {
      const sorted = [...msgs].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      for (let i = 0; i < sorted.length - 1; i++) {
        if (sorted[i].sender_role !== 'super_admin' && sorted[i + 1].sender_role === 'super_admin') {
          times.push((new Date(sorted[i + 1].created_at).getTime() - new Date(sorted[i].created_at).getTime()) / 3600000);
        }
      }
    }
    if (times.length === 0) return 0;
    return times.reduce((a, b) => a + b, 0) / times.length;
  }, [messages]);

  const stats = [
    {
      label: "Aperte",
      value: openCount,
      icon: MessageSquare,
      color: "text-primary",
    },
    {
      label: "Da rispondere",
      value: unansweredCount,
      icon: AlertCircle,
      color: "text-destructive",
    },
    {
      label: "Tempo medio risposta",
      value: avgResponseTime || "—",
      icon: Clock,
      color: "text-chart-3",
    },
    {
      label: "Risolte questa settimana",
      value: resolvedThisWeek,
      icon: CheckCircle,
      color: "text-green-600",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4 flex items-center gap-4">
              <div className="p-2 rounded-lg bg-muted">
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold">{stat.value}</p>
                <p className="text-sm text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Card className={slaViolations > 0 ? 'border-destructive' : ''}>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Violazioni SLA</p>
            <p className={`text-xl font-bold ${slaViolations > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
              {slaViolations}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Tempo medio risposta</p>
            <p className="text-xl font-bold">{avgResponseHours.toFixed(1)}h</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
