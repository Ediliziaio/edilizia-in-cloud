import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Phone, Users, Zap, CalendarCheck, Timer, Target, PhoneCall, Clock } from "lucide-react";
import type { CallCenterKPI } from "@/hooks/useCallCenterReport";
import type { LucideIcon } from "lucide-react";

type ColorKey = "green" | "yellow" | "red" | "blue";

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

function getSpeedColor(min: number): ColorKey {
  if (min <= 5) return "green";
  if (min <= 60) return "yellow";
  return "red";
}

function getContactRateColor(pct: number): ColorKey {
  if (pct >= 60) return "green";
  if (pct >= 40) return "yellow";
  return "red";
}

function getAppRateColor(pct: number): ColorKey {
  if (pct >= 20) return "green";
  if (pct >= 10) return "yellow";
  return "red";
}

interface Props {
  kpi: CallCenterKPI | null;
  isLoading: boolean;
}

export function CallCenterKPISection({ kpi, isLoading }: Props) {
  if (!kpi && !isLoading) {
    return (
      <div className="text-center py-10">
        <p className="text-muted-foreground">Nessun dato disponibile per il periodo selezionato.</p>
        <p className="text-sm text-muted-foreground/70 mt-1">Verifica che i lead abbiano un operatore assegnato.</p>
      </div>
    );
  }

  const cards = [
    {
      title: "Speed to Lead",
      value: `${kpi?.avg_speed_to_lead_min ?? 0} min`,
      subtitle: `Mediana: ${kpi?.median_speed_to_lead_min ?? 0} min · ${kpi?.pct_entro_5min ?? 0}% entro 5 min`,
      icon: Zap,
      colorKey: getSpeedColor(kpi?.avg_speed_to_lead_min ?? 0),
      benchmark: "<5 min ottimo, <60 min buono",
    },
    {
      title: "Tasso di Contatto",
      value: `${kpi?.tasso_contatto ?? 0}%`,
      subtitle: `${kpi?.lead_contattati ?? 0} contattati su ${kpi?.lead_lavorati ?? 0} lavorati`,
      icon: Phone,
      colorKey: getContactRateColor(kpi?.tasso_contatto ?? 0),
      benchmark: "40–70%",
    },
    {
      title: "Tentativi / Contatto",
      value: `${kpi?.tentativi_per_contatto ?? 0}`,
      subtitle: `${kpi?.tentativi_totali ?? 0} chiamate totali`,
      icon: PhoneCall,
      colorKey: (kpi?.tentativi_per_contatto ?? 0) <= 3 ? "green" as ColorKey : (kpi?.tentativi_per_contatto ?? 0) <= 5 ? "yellow" as ColorKey : "red" as ColorKey,
      benchmark: "<3 ottimo, <5 ok",
    },
    {
      title: "Appuntamenti Fissati",
      value: `${kpi?.appuntamenti_fissati ?? 0}`,
      subtitle: `${kpi?.tasso_app_su_contattati ?? 0}% su contattati · ${kpi?.tasso_app_su_assegnati ?? 0}% su assegnati`,
      icon: CalendarCheck,
      colorKey: getAppRateColor(kpi?.tasso_app_su_contattati ?? 0),
      benchmark: "20–40% su contattati",
    },
    {
      title: "Show-Up Rate",
      value: `${kpi?.tasso_show_up ?? 0}%`,
      subtitle: `${kpi?.show_up_count ?? 0} / ${kpi?.appuntamenti_fissati ?? 0} appuntamenti`,
      icon: Users,
      colorKey: (kpi?.tasso_show_up ?? 0) >= 70 ? "green" as ColorKey : (kpi?.tasso_show_up ?? 0) >= 50 ? "yellow" as ColorKey : "red" as ColorKey,
      benchmark: ">70% ottimo",
    },
    {
      title: "Lead Lavorati",
      value: `${kpi?.pct_lead_lavorati ?? 0}%`,
      subtitle: `${kpi?.lead_lavorati ?? 0} / ${kpi?.lead_assegnati ?? 0} assegnati`,
      icon: Target,
      colorKey: (kpi?.pct_lead_lavorati ?? 0) >= 90 ? "green" as ColorKey : (kpi?.pct_lead_lavorati ?? 0) >= 70 ? "yellow" as ColorKey : "red" as ColorKey,
      benchmark: ">90%",
    },
    {
      title: "Chiamate / Giorno",
      value: `${kpi?.chiamate_per_giorno ?? 0}`,
      subtitle: `${kpi?.giorni_lavorati ?? 0} giorni attivi nel periodo`,
      icon: Clock,
      colorKey: (kpi?.chiamate_per_giorno ?? 0) >= 50 ? "green" as ColorKey : (kpi?.chiamate_per_giorno ?? 0) >= 20 ? "yellow" as ColorKey : "red" as ColorKey,
      benchmark: "50–100/gg",
    },
    {
      title: "Durata Media Chiamata",
      value: `${kpi?.durata_media_min ?? 0} min`,
      subtitle: "Solo chiamate con risposta",
      icon: Timer,
      colorKey: "blue" as ColorKey,
      benchmark: "3–8 min",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map(card => (
        <KPICard key={card.title} {...card} isLoading={isLoading} />
      ))}
    </div>
  );
}
