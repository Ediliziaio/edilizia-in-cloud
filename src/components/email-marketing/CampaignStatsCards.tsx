import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, UserMinus, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

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

/**
 * CampaignStatsCards — salute della deliverability: bounce, disiscrizioni e
 * segnalazioni spam come TASSO (non solo conteggio), con colore che vira al
 * rosso quando supera le soglie di rischio (oltre quelle Gmail/Outlook
 * iniziano a penalizzare il mittente).
 */
export function CampaignStatsCards({ stats }: CampaignStatsCardsProps) {
  const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
  const bouncePct = pct(stats.bounced, stats.sent);
  const unsubPct = pct(stats.unsubscribed, stats.delivered);
  const spamPct = pct(stats.spam, stats.delivered);

  const cards = [
    {
      label: "Bounce (respinte)",
      icon: AlertTriangle,
      count: stats.bounced,
      rate: bouncePct,
      warn: bouncePct >= 5, // >5% bounce = problema serio
      hint: "Indirizzi non validi",
    },
    {
      label: "Disiscrizioni",
      icon: UserMinus,
      count: stats.unsubscribed,
      rate: unsubPct,
      warn: unsubPct >= 1, // >1% unsub = contenuto/frequenza da rivedere
      hint: "Chi ha annullato l'iscrizione",
    },
    {
      label: "Segnalazioni spam",
      icon: ShieldAlert,
      count: stats.spam,
      rate: spamPct,
      warn: spamPct >= 0.1, // >0.1% spam = soglia critica provider
      hint: "Marcate come spam",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1">
      {cards.map((c) => (
        <Card key={c.label} className={cn(c.warn && c.count > 0 && "border-red-200 bg-red-50/40")}>
          <CardContent className="flex flex-col gap-1 p-4">
            <div className="flex items-center gap-2">
              <c.icon className={cn("h-4 w-4", c.warn && c.count > 0 ? "text-red-600" : "text-muted-foreground")} />
              <span className="text-sm text-muted-foreground">{c.label}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <p className={cn("text-2xl font-bold tabular-nums", c.warn && c.count > 0 ? "text-red-700" : "text-foreground")}>
                {c.rate.toFixed(2)}%
              </p>
              <span className="text-sm text-muted-foreground tabular-nums">
                {c.count.toLocaleString("it-IT")}
              </span>
            </div>
            <p className="text-xs text-muted-foreground">{c.hint}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
