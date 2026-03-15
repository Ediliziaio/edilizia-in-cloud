import { Bot, Phone, MessageSquare, TrendingUp, Clock, CreditCard } from "lucide-react";
import type { AICompanyStats } from "@/types/unifiedAgent.types";

const STAT_CONFIG = [
  {
    key: "agenti_attivi" as const,
    label: "Agenti attivi",
    icon: Bot,
    format: (v: number) => v.toString(),
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    key: "conv_totali" as const,
    label: "Chiamate (30gg)",
    icon: Phone,
    format: (v: number) => v.toLocaleString("it-IT"),
    color: "text-accent-foreground",
    bg: "bg-accent/50",
  },
  {
    key: "minuti_totali" as const,
    label: "Minuti (30gg)",
    icon: Clock,
    format: (v: number) => `${Math.round(v)} min`,
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    key: "chat_totali" as const,
    label: "Chat (30gg)",
    icon: MessageSquare,
    format: (v: number) => v.toLocaleString("it-IT"),
    color: "text-accent-foreground",
    bg: "bg-accent/50",
  },
  {
    key: "tasso_risposta" as const,
    label: "Tasso risposta",
    icon: TrendingUp,
    format: (v: number) => `${Math.round(v)}%`,
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    key: "crediti_usati" as const,
    label: "Crediti usati",
    icon: CreditCard,
    format: (v: number) =>
      v.toLocaleString("it-IT", { maximumFractionDigits: 0 }),
    color: "text-accent-foreground",
    bg: "bg-accent/50",
  },
];

export function AgentiAIStatsBar({ stats }: { stats: AICompanyStats }) {
  return (
    <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 px-6 py-4 bg-card border-b border-border">
      {STAT_CONFIG.map((cfg) => {
        const val = stats[cfg.key] ?? 0;
        const Icon = cfg.icon;
        return (
          <div key={cfg.key} className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${cfg.bg}`}
            >
              <Icon className={`h-4 w-4 ${cfg.color}`} />
            </div>
            <div>
              <p className="text-lg font-bold text-foreground leading-tight">
                {cfg.format(val)}
              </p>
              <p className="text-[11px] text-muted-foreground">{cfg.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
