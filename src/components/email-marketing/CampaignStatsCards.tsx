import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, AlertTriangle, UserMinus, ShieldAlert } from "lucide-react";

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
  const cards = [
    { label: "Email Consegna", value: stats.delivered, icon: CheckCircle, color: "text-green-600" },
    { label: "Respinto", value: stats.bounced, icon: AlertTriangle, color: "text-orange-600" },
    { label: "Annullato l'iscrizione", value: stats.unsubscribed, icon: UserMinus, color: "text-red-600" },
    { label: "Reclami di spam", value: stats.spam, icon: ShieldAlert, color: "text-destructive" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {cards.map((c) => (
        <Card key={c.label}>
          <CardContent className="p-5 flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <c.icon className={`h-4 w-4 ${c.color}`} />
              <span className="text-sm text-muted-foreground">{c.label}</span>
            </div>
            <p className="text-3xl font-bold text-foreground">{c.value.toLocaleString("it-IT")}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
