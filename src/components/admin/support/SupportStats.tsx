import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare, AlertCircle, Clock, BarChart3 } from "lucide-react";

interface ConversationSummary {
  companyId: string;
  companyName: string;
  lastMessage: string;
  lastMessageDate: string;
  totalMessages: number;
  unansweredByAdmin: boolean;
}

interface SupportStatsProps {
  conversations: ConversationSummary[];
  totalMessagesToday: number;
}

export function SupportStats({ conversations, totalMessagesToday }: SupportStatsProps) {
  const activeCount = conversations.length;
  const unansweredCount = conversations.filter((c) => c.unansweredByAdmin).length;

  const stats = [
    {
      label: "Conversazioni attive",
      value: activeCount,
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
      label: "Messaggi oggi",
      value: totalMessagesToday,
      icon: BarChart3,
      color: "text-chart-3",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
  );
}
