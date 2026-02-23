import { Card, CardContent } from "@/components/ui/card";
import { Mail, CheckCircle, MousePointerClick, AlertTriangle, UserMinus, ShieldAlert } from "lucide-react";

interface StatsData {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  spam: number;
}

interface CampaignStatsCardsProps {
  stats: StatsData;
}

export function CampaignStatsCards({ stats }: CampaignStatsCardsProps) {
  const rate = (num: number, den: number) => den > 0 ? ((num / den) * 100).toFixed(1) + "%" : "0%";

  const cards = [
    { label: "Consegnate", value: stats.delivered, rate: rate(stats.delivered, stats.sent), icon: CheckCircle, color: "text-green-600" },
    { label: "Aperte", value: stats.opened, rate: rate(stats.opened, stats.delivered), icon: Mail, color: "text-blue-600" },
    { label: "Cliccate", value: stats.clicked, rate: rate(stats.clicked, stats.delivered), icon: MousePointerClick, color: "text-purple-600" },
    { label: "Bounce", value: stats.bounced, rate: rate(stats.bounced, stats.sent), icon: AlertTriangle, color: "text-orange-600" },
    { label: "Disiscrizioni", value: stats.unsubscribed, rate: rate(stats.unsubscribed, stats.delivered), icon: UserMinus, color: "text-red-600" },
    { label: "Spam", value: stats.spam, rate: rate(stats.spam, stats.delivered), icon: ShieldAlert, color: "text-destructive" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-4 flex flex-col items-center text-center gap-1">
            <c.icon className={`h-5 w-5 ${c.color}`} />
            <p className="text-2xl font-bold text-foreground">{c.value.toLocaleString("it-IT")}</p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className="text-xs font-medium text-muted-foreground">{c.rate}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
