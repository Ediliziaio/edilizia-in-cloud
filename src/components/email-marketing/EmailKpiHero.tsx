/**
 * EmailKpiHero — riga di KPI "headline" per le statistiche email.
 *
 * Mostra le 4 metriche che contano davvero per chi fa email marketing:
 * Inviate, Tasso di consegna, Tasso di apertura, Tasso di clic — ognuna con
 * il valore percentuale grande, il conteggio assoluto sotto e un badge
 * benchmark (ottimo/buono/da migliorare) basato su medie di settore.
 */
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Send, MailCheck, MailOpen, MousePointerClick } from "lucide-react";
import { cn } from "@/lib/utils";

interface Stats {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
}

interface Props {
  stats: Stats;
}

type Tier = "great" | "good" | "low" | "none";

const TIER_BADGE: Record<Exclude<Tier, "none">, { label: string; className: string }> = {
  great: { label: "Ottimo", className: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  good: { label: "Buono", className: "bg-sky-100 text-sky-700 border-sky-200" },
  low: { label: "Da migliorare", className: "bg-amber-100 text-amber-700 border-amber-200" },
};

/** Soglie benchmark di settore (B2B/edilizia, prudenziali). */
function tierFor(metric: "delivery" | "open" | "click", pct: number, base: number): Tier {
  if (base === 0) return "none";
  if (metric === "delivery") return pct >= 95 ? "great" : pct >= 90 ? "good" : "low";
  if (metric === "open") return pct >= 25 ? "great" : pct >= 15 ? "good" : "low";
  return pct >= 3 ? "great" : pct >= 1.5 ? "good" : "low"; // click
}

export function EmailKpiHero({ stats }: Props) {
  const { sent, delivered, opened, clicked } = stats;
  const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);

  const deliveryPct = pct(delivered, sent);
  const openPct = pct(opened, delivered);
  const clickPct = pct(clicked, delivered);

  const cards = [
    {
      icon: <Send className="h-4 w-4" />,
      label: "Email inviate",
      big: sent.toLocaleString("it-IT"),
      sub: "totale nel periodo",
      tier: "none" as Tier,
      accent: "text-slate-700",
    },
    {
      icon: <MailCheck className="h-4 w-4" />,
      label: "Tasso di consegna",
      big: `${deliveryPct.toFixed(1)}%`,
      sub: `${delivered.toLocaleString("it-IT")} consegnate`,
      tier: tierFor("delivery", deliveryPct, sent),
      accent: "text-sky-600",
    },
    {
      icon: <MailOpen className="h-4 w-4" />,
      label: "Tasso di apertura",
      big: `${openPct.toFixed(1)}%`,
      sub: `${opened.toLocaleString("it-IT")} aperture`,
      tier: tierFor("open", openPct, delivered),
      accent: "text-emerald-600",
    },
    {
      icon: <MousePointerClick className="h-4 w-4" />,
      label: "Tasso di clic",
      big: `${clickPct.toFixed(1)}%`,
      sub: `${clicked.toLocaleString("it-IT")} click`,
      tier: tierFor("click", clickPct, delivered),
      accent: "text-violet-600",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <Card key={c.label} className="overflow-hidden">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className={cn("flex items-center gap-1.5 text-xs font-medium text-muted-foreground", c.accent)}>
                {c.icon}
                {c.label}
              </span>
              {c.tier !== "none" && (
                <Badge variant="outline" className={cn("text-[10px]", TIER_BADGE[c.tier].className)}>
                  {TIER_BADGE[c.tier].label}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-3xl font-bold tabular-nums text-foreground">{c.big}</p>
            <p className="text-xs text-muted-foreground">{c.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
