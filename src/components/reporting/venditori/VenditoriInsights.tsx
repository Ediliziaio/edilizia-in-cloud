import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertTriangle, CheckCircle, TrendingDown, Lightbulb, Info } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import type { VendorKPI, VendorTrend } from "@/hooks/useVendorReport";

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

function generateInsights(kpi: VendorKPI | null, trend: VendorTrend[], _kpiList: VendorKPI[]): Insight[] {
  if (!kpi) return [];
  const insights: Insight[] = [];

  // Tasso chiusura
  if ((kpi.tasso_chiusura ?? 0) >= 45) {
    insights.push({ type: "success", priority: 5, title: "🏆 Tasso di chiusura eccellente", message: `${kpi.tasso_chiusura}% di win rate — tra i top performer (benchmark: 25–45%).` });
  } else if ((kpi.tasso_chiusura ?? 0) < 20 && kpi.opp_totali > 3) {
    insights.push({ type: "danger", priority: 1, title: "⚠️ Tasso di chiusura critico", message: `Solo il ${kpi.tasso_chiusura}% delle opportunità viene chiusa. Benchmark minimo: 20%. Valutare qualificazione lead e processo di vendita.` });
  } else if ((kpi.tasso_chiusura ?? 0) < 30 && kpi.opp_totali > 3) {
    insights.push({ type: "warning", priority: 2, title: "Tasso di chiusura da migliorare", message: `${kpi.tasso_chiusura}% — sotto la media (30%). Possibili cause: lead poco qualificati, proposta non adeguata, follow-up insufficiente.` });
  }

  // Show-up rate
  if ((kpi.tasso_show_up ?? 0) < 50 && kpi.appuntamenti_fissati > 5) {
    insights.push({ type: "danger", priority: 1, title: "Show-Up Rate preoccupante", message: `Solo il ${kpi.tasso_show_up}% degli appuntamenti viene onorato. Azioni: reminder automatici, conferma giorno prima, qualificazione migliore.` });
  } else if ((kpi.tasso_show_up ?? 0) >= 80) {
    insights.push({ type: "success", priority: 5, title: "Ottimo Show-Up Rate", message: `${kpi.tasso_show_up}% degli appuntamenti effettuato — ottimo indicatore di qualità dei lead.` });
  }

  // Ciclo vendita
  if (kpi.avg_giorni_chiusura > 60 && kpi.opp_vinte > 2) {
    insights.push({ type: "warning", priority: 3, title: "Ciclo di vendita lungo", message: `Media di ${kpi.avg_giorni_chiusura} giorni per chiudere. Considerare urgenza artificiale, scadenza offerta, follow-up più frequente.` });
  }

  // Pipeline coverage
  if (kpi.pipeline_valore > 0 && kpi.fatturato_generato > 0) {
    const coverage = Math.round(kpi.pipeline_valore / kpi.fatturato_generato * 10) / 10;
    if (coverage < 2) {
      insights.push({ type: "warning", priority: 2, title: "Pipeline Coverage bassa", message: `La pipeline vale ${coverage}× il fatturato realizzato. Per garantire il target futuro serve almeno 3×.` });
    } else if (coverage >= 4) {
      insights.push({ type: "success", priority: 5, title: "Pipeline abbondante", message: `Pipeline ${coverage}× il fatturato realizzato — buona cushion per i prossimi mesi.` });
    }
  }

  // Fatturato perso > generato
  if (kpi.fatturato_perso > kpi.fatturato_generato && kpi.opp_perse > 0) {
    insights.push({ type: "danger", priority: 1, title: "Fatturato perso superiore al realizzato", message: `Persi ${formatCurrency(kpi.fatturato_perso)} vs ${formatCurrency(kpi.fatturato_generato)} generati. Analizzare ragioni di perdita.` });
  }

  // Trend 3 mesi consecutivi
  if (trend.length >= 3) {
    const ultimi3 = trend.filter((t) => t.fatturato > 0).slice(-3);
    if (ultimi3.length === 3) {
      if (ultimi3[2].fatturato > ultimi3[1].fatturato && ultimi3[1].fatturato > ultimi3[0].fatturato) {
        insights.push({ type: "success", priority: 4, title: "📈 Trend in crescita", message: "Fatturato in aumento per 3 mesi consecutivi — trend positivo confermato." });
      } else if (ultimi3[2].fatturato < ultimi3[1].fatturato && ultimi3[1].fatturato < ultimi3[0].fatturato) {
        insights.push({ type: "danger", priority: 2, title: "📉 Trend in calo", message: "Fatturato in diminuzione per 3 mesi consecutivi — serve un intervento immediato." });
      }
    }
  }

  // Nessuna opp
  if (kpi.opp_totali === 0) {
    insights.push({ type: "info", priority: 5, title: "Nessuna opportunità nel periodo", message: "Non ci sono opportunità registrate. Verificare che le opportunità abbiano l'agente assegnato." });
  }

  // Show-up ok ma chiusure scarse
  if ((kpi.tasso_app_to_close ?? 0) < 15 && (kpi.tasso_show_up ?? 0) > 60) {
    insights.push({ type: "tip", priority: 3, title: "💡 Show-up ok, chiusure scarse", message: `Gli appuntamenti vengono effettuati (${kpi.tasso_show_up}%) ma pochi si convertono (${kpi.tasso_app_to_close}%). Il problema è nella fase di presentazione/proposta.` });
  }

  return insights.sort((a, b) => a.priority - b.priority);
}

interface Props {
  kpi: VendorKPI | null;
  trend: VendorTrend[];
  kpiList: VendorKPI[];
}

export function VenditoriInsights({ kpi, trend, kpiList }: Props) {
  const insights = generateInsights(kpi, trend, kpiList);
  if (!insights.length) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Lightbulb className="h-4 w-4" />
          Insights Automatici
        </CardTitle>
        <CardDescription>Analisi generata automaticamente dai tuoi dati</CardDescription>
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
