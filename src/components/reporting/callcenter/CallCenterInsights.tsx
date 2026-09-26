import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertTriangle, CheckCircle, TrendingDown, Lightbulb, Info } from "lucide-react";
import type { CallCenterKPI } from "@/hooks/useCallCenterReport";

interface Insight {
  type: "success" | "warning" | "danger" | "info" | "tip";
  title: string;
  message: string;
  priority: number;
}

const INSIGHT_STYLES = {
  success: { bg: "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800", icon: CheckCircle, iconColor: "text-green-600", titleColor: "text-green-800 dark:text-green-300" },
  warning: { bg: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800", icon: AlertTriangle, iconColor: "text-amber-600", titleColor: "text-amber-800 dark:text-amber-300" },
  danger: { bg: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800", icon: TrendingDown, iconColor: "text-red-600", titleColor: "text-red-800 dark:text-red-300" },
  info: { bg: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800", icon: Info, iconColor: "text-blue-600", titleColor: "text-blue-800 dark:text-blue-300" },
  tip: { bg: "bg-indigo-50 border-indigo-200 dark:bg-indigo-950/30 dark:border-indigo-800", icon: Lightbulb, iconColor: "text-indigo-600", titleColor: "text-indigo-800 dark:text-indigo-300" },
};

function generateInsights(kpi: CallCenterKPI | null): Insight[] {
  if (!kpi) return [];
  const insights: Insight[] = [];

  // Speed to Lead
  if (kpi.avg_speed_to_lead_min > 0 && kpi.avg_speed_to_lead_min <= 5) {
    insights.push({ type: "success", priority: 5, title: "⚡ Speed to Lead eccellente", message: `Media di ${kpi.avg_speed_to_lead_min} min — i lead vengono contattati rapidamente. Il ${kpi.pct_entro_5min}% entro 5 minuti.` });
  } else if (kpi.avg_speed_to_lead_min > 60) {
    insights.push({ type: "danger", priority: 1, title: "🐌 Speed to Lead critico", message: `Media di ${kpi.avg_speed_to_lead_min} min per la prima chiamata. Dopo 60 min le probabilità di contatto calano drasticamente. Solo il ${kpi.pct_entro_5min}% entro 5 min.` });
  } else if (kpi.avg_speed_to_lead_min > 30) {
    insights.push({ type: "warning", priority: 2, title: "Speed to Lead da migliorare", message: `Media di ${kpi.avg_speed_to_lead_min} min — puntare a <5 min per massimizzare il tasso di contatto.` });
  }

  // Tasso contatto
  if (kpi.tasso_contatto >= 60) {
    insights.push({ type: "success", priority: 5, title: "📞 Tasso di contatto eccellente", message: `${kpi.tasso_contatto}% dei lead lavorati viene contattato con successo — ottima performance.` });
  } else if (kpi.tasso_contatto < 40 && kpi.lead_lavorati > 5) {
    insights.push({ type: "danger", priority: 1, title: "Tasso di contatto basso", message: `Solo il ${kpi.tasso_contatto}% dei lead viene contattato. Cause possibili: orari di chiamata errati, dati di contatto imprecisi, pochi tentativi (media: ${kpi.tentativi_per_contatto}).` });
  }

  // Lead non lavorati
  if (kpi.pct_lead_lavorati < 70 && kpi.lead_assegnati > 5) {
    insights.push({ type: "warning", priority: 2, title: "Lead non lavorati", message: `Il ${Math.round(100 - kpi.pct_lead_lavorati)}% dei lead assegnati (${kpi.lead_assegnati - kpi.lead_lavorati} su ${kpi.lead_assegnati}) non è stato ancora lavorato.` });
  } else if (kpi.pct_lead_lavorati >= 95) {
    insights.push({ type: "success", priority: 5, title: "✅ Copertura lead completa", message: `Il ${kpi.pct_lead_lavorati}% dei lead assegnati è stato lavorato — nessun lead trascurato.` });
  }

  // Show-up rate
  if (kpi.tasso_show_up < 50 && kpi.appuntamenti_fissati > 3) {
    insights.push({ type: "danger", priority: 1, title: "Show-Up Rate preoccupante", message: `Solo il ${kpi.tasso_show_up}% degli appuntamenti fissati viene effettuato. Azioni: reminder automatici, conferma il giorno prima, qualificazione migliore.` });
  } else if (kpi.tasso_show_up >= 80) {
    insights.push({ type: "success", priority: 5, title: "Ottimo Show-Up Rate", message: `${kpi.tasso_show_up}% degli appuntamenti fissati viene effettuato — buona qualificazione.` });
  }

  // Tasso appuntamento su contattati
  if (kpi.tasso_app_su_contattati >= 20) {
    insights.push({ type: "success", priority: 4, title: "🎯 Conversione contatto → appuntamento alta", message: `${kpi.tasso_app_su_contattati}% dei contatti diventa appuntamento — script di vendita efficace.` });
  } else if (kpi.tasso_app_su_contattati < 10 && kpi.lead_contattati > 5) {
    insights.push({ type: "warning", priority: 2, title: "Pochi appuntamenti dai contatti", message: `Solo il ${kpi.tasso_app_su_contattati}% dei contattati fissa un appuntamento. Rivedere lo script di qualificazione e proposta di valore.` });
  }

  // Alta produttività
  if (kpi.chiamate_per_giorno >= 80) {
    insights.push({ type: "success", priority: 4, title: "🚀 Alta produttività", message: `${kpi.chiamate_per_giorno} chiamate/giorno — volume eccellente, verificare che la qualità resti alta.` });
  } else if (kpi.chiamate_per_giorno < 20 && kpi.giorni_lavorati > 3) {
    insights.push({ type: "warning", priority: 3, title: "Volume chiamate basso", message: `Solo ${kpi.chiamate_per_giorno} chiamate/giorno su ${kpi.giorni_lavorati} giorni attivi. Il benchmark è 50–100 chiamate/giorno.` });
  }

  // Anomalia: contatto alto ma pochi appuntamenti
  if (kpi.tasso_contatto >= 50 && kpi.tasso_app_su_contattati < 10 && kpi.lead_contattati > 10) {
    insights.push({ type: "tip", priority: 3, title: "💡 Contatti ok, appuntamenti scarsi", message: `Il tasso di contatto è buono (${kpi.tasso_contatto}%) ma solo il ${kpi.tasso_app_su_contattati}% dei contatti fissa un appuntamento. Il problema è nello script o nella proposta di valore telefonica.` });
  }

  // Oltre 24 ore
  if (kpi.pct_oltre_24ore > 30) {
    insights.push({ type: "danger", priority: 1, title: "Troppi lead contattati dopo 24h", message: `Il ${kpi.pct_oltre_24ore}% dei lead viene contattato dopo 24 ore — a quel punto la probabilità di conversione scende dell'80%.` });
  }

  // Nessun lead
  if (kpi.lead_assegnati === 0) {
    insights.push({ type: "info", priority: 5, title: "Nessun lead nel periodo", message: "Non ci sono lead assegnati. Verificare che i lead abbiano un operatore assegnato nel CRM." });
  }

  return insights.sort((a, b) => a.priority - b.priority);
}

interface Props {
  kpi: CallCenterKPI | null;
}

export function CallCenterInsights({ kpi }: Props) {
  const insights = generateInsights(kpi);
  if (!insights.length) return null;

  // Telefono: gli insight testuali restano al computer (le azioni sono già nella diagnosi).
  return (
    <Card className="max-sm:hidden">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Lightbulb className="h-4 w-4" />
          Insights Automatici
        </CardTitle>
        <CardDescription>Analisi generata automaticamente dai dati del call center</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {insights.map((ins, i) => {
          const style = INSIGHT_STYLES[ins.type];
          const Icon = style.icon;
          return (
            <div key={i} className={`flex gap-3 p-3 rounded-lg border ${style.bg}`}>
              <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${style.iconColor}`} />
              <div>
                <p className={`font-medium text-sm ${style.titleColor}`}>{ins.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{ins.message}</p>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
