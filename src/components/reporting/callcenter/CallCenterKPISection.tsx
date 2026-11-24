import { Phone, Users, Zap, CalendarCheck, Timer, Target, PhoneCall, Clock } from "lucide-react";
import { KPICard, type ColorKey } from "@/components/reporting/shared/KPICard";
import type { CallCenterKPI } from "@/hooks/useCallCenterReport";
import { variazionePercento, variazionePunti } from "@/lib/reporting/variazioneKpi";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

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
  /** Gli stessi numeri sul periodo prima (stessi giorni, tanti mesi prima). */
  prima?: CallCenterKPI | null;
  isLoading: boolean;
}

export function CallCenterKPISection({ kpi, prima, isLoading }: Props) {
  const t = useT();
  const p = prima ?? null;
  // Senza il periodo prima (o con zero lead) niente frase di confronto.
  const conPrima = !!p && (p.lead_assegnati ?? 0) > 0;
  if (!kpi && !isLoading) {
    return (
      <div className="text-center py-10 max-sm:py-4">
        <p className="text-muted-foreground">{t("Nessun dato disponibile per il periodo selezionato.")}</p>
        <p className="text-sm text-muted-foreground/70 mt-1 max-sm:hidden">{t("Verifica che i lead abbiano un operatore assegnato.")}</p>
      </div>
    );
  }

  const cards = [
    {
      title: t("Speed to Lead"),
      value: `${kpi?.avg_speed_to_lead_min ?? 0} min`,
      subtitle: t("Mediana: {median_speed_to_lead_min} min · {pct_entro_5min}% entro 5 min", { median_speed_to_lead_min: kpi?.median_speed_to_lead_min ?? 0, pct_entro_5min: kpi?.pct_entro_5min ?? 0 }),
      icon: Zap,
      colorKey: getSpeedColor(kpi?.avg_speed_to_lead_min ?? 0),
      benchmark: t("<5 min ottimo, <60 min buono"),
      variazione: conPrima && (kpi?.avg_speed_to_lead_min ?? 0) > 0 ? variazionePercento(kpi?.avg_speed_to_lead_min, p?.avg_speed_to_lead_min, true) : null,
    },
    {
      title: t("Tasso di Contatto"),
      value: `${kpi?.tasso_contatto ?? 0}%`,
      subtitle: t("{lead_contattati} contattati su {lead_lavorati} lavorati", { lead_contattati: kpi?.lead_contattati ?? 0, lead_lavorati: kpi?.lead_lavorati ?? 0 }),
      icon: Phone,
      colorKey: getContactRateColor(kpi?.tasso_contatto ?? 0),
      benchmark: "40–70%",
      anello: { pct: kpi?.tasso_contatto ?? 0, soglie: [40, 60] as [number, number] },
      variazione: conPrima ? variazionePunti(kpi?.tasso_contatto, p?.tasso_contatto) : null,
    },
    {
      title: t("Tentativi / Contatto"),
      value: `${kpi?.tentativi_per_contatto ?? 0}`,
      subtitle: t("{tentativi_totali} chiamate totali", { tentativi_totali: kpi?.tentativi_totali ?? 0 }),
      icon: PhoneCall,
      colorKey: (kpi?.tentativi_per_contatto ?? 0) <= 3 ? "green" as ColorKey : (kpi?.tentativi_per_contatto ?? 0) <= 5 ? "yellow" as ColorKey : "red" as ColorKey,
      benchmark: t("<3 ottimo, <5 ok"),
      variazione: conPrima ? variazionePercento(kpi?.tentativi_per_contatto, p?.tentativi_per_contatto, true) : null,
    },
    {
      title: t("Appuntamenti Fissati"),
      value: `${kpi?.appuntamenti_fissati ?? 0}`,
      subtitle: t("{tasso_app_su_contattati}% su contattati · {tasso_app_su_assegnati}% su assegnati", { tasso_app_su_contattati: kpi?.tasso_app_su_contattati ?? 0, tasso_app_su_assegnati: kpi?.tasso_app_su_assegnati ?? 0 }),
      icon: CalendarCheck,
      colorKey: getAppRateColor(kpi?.tasso_app_su_contattati ?? 0),
      benchmark: t("20–40% su contattati"),
      variazione: conPrima ? variazionePercento(kpi?.appuntamenti_fissati, p?.appuntamenti_fissati) : null,
    },
    {
      title: t("Show-Up Rate"),
      value: `${kpi?.tasso_show_up ?? 0}%`,
      subtitle: t("{show_up_count} / {appuntamenti_fissati} appuntamenti", { show_up_count: kpi?.show_up_count ?? 0, appuntamenti_fissati: kpi?.appuntamenti_fissati ?? 0 }),
      icon: Users,
      colorKey: (kpi?.tasso_show_up ?? 0) >= 70 ? "green" as ColorKey : (kpi?.tasso_show_up ?? 0) >= 50 ? "yellow" as ColorKey : "red" as ColorKey,
      benchmark: t(">70% ottimo"),
      anello: { pct: kpi?.tasso_show_up ?? 0, soglie: [50, 70] as [number, number] },
      variazione: conPrima && (p?.appuntamenti_fissati ?? 0) > 0 ? variazionePunti(kpi?.tasso_show_up, p?.tasso_show_up) : null,
    },
    {
      title: t("Lead Lavorati"),
      value: `${kpi?.pct_lead_lavorati ?? 0}%`,
      subtitle: t("{lead_lavorati} / {lead_assegnati} assegnati", { lead_lavorati: kpi?.lead_lavorati ?? 0, lead_assegnati: kpi?.lead_assegnati ?? 0 }),
      icon: Target,
      colorKey: (kpi?.pct_lead_lavorati ?? 0) >= 90 ? "green" as ColorKey : (kpi?.pct_lead_lavorati ?? 0) >= 70 ? "yellow" as ColorKey : "red" as ColorKey,
      benchmark: ">90%",
      anello: { pct: kpi?.pct_lead_lavorati ?? 0, soglie: [70, 90] as [number, number] },
      variazione: conPrima ? variazionePunti(kpi?.pct_lead_lavorati, p?.pct_lead_lavorati) : null,
    },
    {
      title: t("Chiamate / Giorno"),
      value: `${kpi?.chiamate_per_giorno ?? 0}`,
      subtitle: t("{giorni_lavorati} giorni attivi nel periodo", { giorni_lavorati: kpi?.giorni_lavorati ?? 0 }),
      icon: Clock,
      colorKey: (kpi?.chiamate_per_giorno ?? 0) >= 50 ? "green" as ColorKey : (kpi?.chiamate_per_giorno ?? 0) >= 20 ? "yellow" as ColorKey : "red" as ColorKey,
      benchmark: t("50–100/gg"),
      variazione: conPrima ? variazionePercento(kpi?.chiamate_per_giorno, p?.chiamate_per_giorno) : null,
    },
    {
      title: t("Durata Media Chiamata"),
      value: `${kpi?.durata_media_min ?? 0} min`,
      subtitle: t("Solo chiamate con risposta"),
      icon: Timer,
      colorKey: "blue" as ColorKey,
      benchmark: t("3–8 min"),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-sm:grid-cols-2 max-sm:gap-2">
      {cards.map(card => (
        <KPICard key={card.title} {...card} isLoading={isLoading} />
      ))}
    </div>
  );
}
