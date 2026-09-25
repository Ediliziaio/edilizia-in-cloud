import { Bot, Phone, MessageSquare, TrendingUp, Clock, CreditCard } from "lucide-react";
import type { AICompanyStats } from "@/types/unifiedAgent.types";

// I sei numeri stavano su una striscia bianca con bordo al 90% di luminosita':
// su fondo bianco non si distingueva nulla e sembravano testo sparso. Ora ogni
// metrica e' una scheda con bordo visibile e una tinta propria, cosi' si
// riconosce a colpo d'occhio senza leggere l'etichetta.
const STAT_CONFIG = [
  {
    key: "agenti_attivi" as const,
    label: "Agenti attivi",
    icon: Bot,
    format: (v: number) => v.toString(),
    color: "text-blue-600",
    bg: "bg-blue-50 ring-1 ring-inset ring-blue-100",
  },
  {
    key: "conv_totali" as const,
    label: "Chiamate (30gg)",
    icon: Phone,
    format: (v: number) => v.toLocaleString("it-IT"),
    color: "text-violet-600",
    bg: "bg-violet-50 ring-1 ring-inset ring-violet-100",
  },
  {
    key: "minuti_totali" as const,
    label: "Minuti (30gg)",
    icon: Clock,
    format: (v: number) => `${Math.round(v)} min`,
    color: "text-amber-600",
    bg: "bg-amber-50 ring-1 ring-inset ring-amber-100",
  },
  {
    key: "chat_totali" as const,
    label: "Chat (30gg)",
    icon: MessageSquare,
    format: (v: number) => v.toLocaleString("it-IT"),
    color: "text-sky-600",
    bg: "bg-sky-50 ring-1 ring-inset ring-sky-100",
  },
  {
    key: "tasso_risposta" as const,
    label: "Tasso risposta",
    icon: TrendingUp,
    format: (v: number) => `${Math.round(v)}%`,
    color: "text-emerald-600",
    bg: "bg-emerald-50 ring-1 ring-inset ring-emerald-100",
  },
  {
    key: "crediti_usati" as const,
    label: "Crediti usati",
    icon: CreditCard,
    format: (v: number) =>
      v.toLocaleString("it-IT", { maximumFractionDigits: 0 }),
    color: "text-slate-600",
    bg: "bg-slate-100 ring-1 ring-inset ring-slate-200",
  },
];

export function AgentiAIStatsBar({ stats }: { stats: AICompanyStats }) {
  return (
    // Telefono: sei numeri 2×3 a filo pagina, senza icone. Da 768 senza il
    // px-6 che si sommava al margine del layout.
    <div className="grid grid-cols-2 gap-2.5 pb-4 sm:grid-cols-3 lg:grid-cols-6 md:gap-3 max-md:gap-2 max-md:pb-0">
      {STAT_CONFIG.map((cfg) => {
        const val = stats[cfg.key] ?? 0;
        const Icon = cfg.icon;
        return (
          <div
            key={cfg.key}
            className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white p-3 shadow-sm md:gap-3 max-md:min-w-0 max-md:rounded-lg max-md:px-2.5 max-md:py-2 max-md:shadow-none"
          >
            {/* Icona solo da 1280: a 1024, sei in riga, lasciava 40px al testo e
                le etichette diventavano «Age…», «Chi…», «Tas…». */}
            <div
              className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg max-xl:hidden ${cfg.bg}`}
            >
              <Icon className={`h-4 w-4 ${cfg.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold leading-tight text-slate-900 tabular-nums max-md:text-base">
                {cfg.format(val)}
              </p>
              {/* Da 768 l'etichetta può andare a capo: «Chiamate (30gg)» a 1024
                  veniva tagliata anche senza icona. */}
              <p className="truncate text-[11px] text-slate-500 md:whitespace-normal">{cfg.label}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
