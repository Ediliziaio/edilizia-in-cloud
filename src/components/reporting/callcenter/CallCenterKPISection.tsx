import { Phone, Users, Zap, CalendarCheck, Timer, Target, PhoneCall, Clock } from "lucide-react";
import { KPICard, type ColorKey } from "@/components/reporting/shared/KPICard";
import type { CallCenterKPI } from "@/hooks/useCallCenterReport";

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
