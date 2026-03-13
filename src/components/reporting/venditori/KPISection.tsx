import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Target, Users, Euro, TrendingUp, Percent, Timer } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import type { VendorKPI } from "@/hooks/useVendorReport";
import type { LucideIcon } from "lucide-react";

type ColorKey = "green" | "yellow" | "red" | "blue";

function getColor(field: string, val: number): ColorKey {
  if (field === "avg_giorni_chiusura") {
    return val <= 0 ? "blue" : val < 30 ? "green" : val < 60 ? "yellow" : "red";
  }
  const thresholds: Record<string, [number, number]> = {
    tasso_chiusura: [35, 20],
    tasso_show_up: [70, 50],
    tasso_app_to_close: [25, 12],
  };
  const [hi, lo] = thresholds[field] ?? [100, 0];
  return val >= hi ? "green" : val >= lo ? "yellow" : "red";
}

const colorStyles: Record<ColorKey, { bg: string; icon: string; val: string }> = {
  green: { bg: "bg-green-50 dark:bg-green-950/30", icon: "bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400", val: "text-green-700 dark:text-green-400" },
  yellow: { bg: "bg-amber-50 dark:bg-amber-950/30", icon: "bg-amber-100 text-amber-600 dark:bg-amber-900/50 dark:text-amber-400", val: "text-amber-700 dark:text-amber-400" },
  red: { bg: "bg-red-50 dark:bg-red-950/30", icon: "bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400", val: "text-red-700 dark:text-red-400" },
  blue: { bg: "bg-blue-50 dark:bg-blue-950/30", icon: "bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400", val: "text-blue-700 dark:text-blue-400" },
};

function KPICard({ title, value, subtitle, icon: Icon, colorKey, benchmark, isLoading }: {
  title: string; value: string; subtitle?: string;
  icon: LucideIcon; colorKey: ColorKey;
  benchmark?: string; isLoading?: boolean;
}) {
  const s = colorStyles[colorKey];
  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-5 space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    );
  }
  return (
    <Card className={s.bg}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-2">
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <div className={`p-2 rounded-lg ${s.icon}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className={`text-2xl font-bold ${s.val}`}>{value}</p>
        {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        {benchmark && (
          <p className="text-[11px] text-muted-foreground/70 mt-2 italic">Benchmark: {benchmark}</p>
        )}
      </CardContent>
    </Card>
  );
}

interface Props { kpi: VendorKPI | null; isLoading: boolean; }

export function KPISection({ kpi, isLoading }: Props) {
  if (!kpi && !isLoading) {
    return (
      <div className="text-center py-10">
        <p className="text-muted-foreground">Nessun dato disponibile per il periodo selezionato.</p>
        <p className="text-sm text-muted-foreground/70 mt-1">Verifica che le Opportunità abbiano l'agente assegnato.</p>
      </div>
    );
  }

  const cards = [
    { title: "Tasso di Chiusura", value: `${kpi?.tasso_chiusura ?? 0}%`, subtitle: `${kpi?.opp_vinte ?? 0} vinte su ${(kpi?.opp_vinte ?? 0) + (kpi?.opp_perse ?? 0)} chiuse`, icon: Target, colorKey: getColor("tasso_chiusura", kpi?.tasso_chiusura ?? 0), benchmark: "25–45% settore edile" },
    { title: "Show-Up Rate", value: `${kpi?.tasso_show_up ?? 0}%`, subtitle: `${kpi?.appuntamenti_effettuati ?? 0} / ${kpi?.appuntamenti_fissati ?? 0} appuntamenti`, icon: Users, colorKey: getColor("tasso_show_up", kpi?.tasso_show_up ?? 0), benchmark: ">70% ottimo" },
    { title: "Fatturato Generato", value: formatCurrency(kpi?.fatturato_generato ?? 0), subtitle: `Pipeline: ${formatCurrency(kpi?.pipeline_valore ?? 0)}`, icon: Euro, colorKey: "blue" as ColorKey },
    { title: "Importo Medio Chiusura", value: formatCurrency(kpi?.importo_medio_chiusura ?? 0), subtitle: `Su ${kpi?.opp_vinte ?? 0} opportunità vinte`, icon: TrendingUp, colorKey: "blue" as ColorKey },
    { title: "App → Chiusura", value: `${kpi?.tasso_app_to_close ?? 0}%`, subtitle: `Ogni 100 app effettuati → ${kpi?.tasso_app_to_close ?? 0} chiuse`, icon: Percent, colorKey: getColor("tasso_app_to_close", kpi?.tasso_app_to_close ?? 0), benchmark: ">25% eccellente" },
    { title: "Ciclo Vendita Medio", value: `${kpi?.avg_giorni_chiusura ?? 0}gg`, subtitle: `Min ${kpi?.min_giorni_chiusura ?? 0}gg — Max ${kpi?.max_giorni_chiusura ?? 0}gg`, icon: Timer, colorKey: getColor("avg_giorni_chiusura", kpi?.avg_giorni_chiusura ?? 0), benchmark: "<30gg ottimo, <60gg ok" },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {cards.map(card => (
        <KPICard key={card.title} {...card} isLoading={isLoading} />
      ))}
    </div>
  );
}
