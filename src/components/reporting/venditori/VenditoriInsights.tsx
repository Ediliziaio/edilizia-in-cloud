import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { AlertTriangle, CheckCircle, TrendingDown, Lightbulb, Info } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";
import type { VendorKPI, VendorTrend } from "@/hooks/useVendorReport";
import { SOGLIE_VENDITORI as SOGLIE, tassoTesto } from "@/lib/reporting/venditoriRegole";
import { useT, intlCampo } from "@/lib/campo/lingua/LinguaCampo";

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

function generateInsights(kpi: VendorKPI | null, trend: VendorTrend[], _kpiList: VendorKPI[], tr: ReturnType<typeof useT>): Insight[] {
  if (!kpi) return [];
  const insights: Insight[] = [];

  // Tasso chiusura: vinte ÷ (vinte + perse). Serve qualche chiusura per dirne
  // qualcosa (prima contava le opportunità create, anche se nessuna era chiusa,
  // e un tasso non calcolabile diventava «Solo il null%»).
  const chiuse = kpi.opp_vinte + kpi.opp_perse;
  const chiusura = kpi.tasso_chiusura;
  if (chiusura != null && chiuse >= 4) {
    if (chiusura >= 45) {
      insights.push({ type: "success", priority: 5, title: tr("🏆 Tasso di chiusura eccellente"), message: tr("{chiusura} di win rate su {chiuse} chiuse — tra i top performer (benchmark: 25–45%).", { chiusura: tassoTesto(chiusura), chiuse }) });
    } else if (chiusura < SOGLIE.tasso_chiusura.critico) {
      insights.push({ type: "danger", priority: 1, title: tr("⚠️ Tasso di chiusura critico"), message: tr("Vinte {opp_vinte} su {chiuse} chiuse ({chiusura}). Benchmark minimo: {critico}%. Valutare qualificazione lead e processo di vendita.", { opp_vinte: kpi.opp_vinte, chiuse, chiusura: tassoTesto(chiusura), critico: SOGLIE.tasso_chiusura.critico }) });
    } else if (chiusura < SOGLIE.tasso_chiusura.buono) {
      insights.push({ type: "warning", priority: 2, title: tr("Tasso di chiusura da migliorare"), message: tr("{chiusura} — sotto il {buono}% che il report considera buono. Possibili cause: lead poco qualificati, proposta non adeguata, follow-up insufficiente.", { chiusura: tassoTesto(chiusura), buono: SOGLIE.tasso_chiusura.buono }) });
    }
  }

  // Show-up rate: effettuati ÷ (effettuati + no-show)
  const conEsito = kpi.appuntamenti_effettuati + kpi.appuntamenti_no_show;
  const showUp = kpi.tasso_show_up;
  if (showUp != null && showUp < SOGLIE.tasso_show_up.critico && conEsito > 5) {
    insights.push({ type: "danger", priority: 1, title: tr("Show-Up Rate preoccupante"), message: tr("Solo il {showUp} degli appuntamenti con un esito è stato fatto ({appuntamenti_no_show} no-show). Azioni: reminder automatici, conferma giorno prima, qualificazione migliore.", { showUp: tassoTesto(showUp), appuntamenti_no_show: kpi.appuntamenti_no_show }) });
  } else if (showUp != null && showUp >= 80 && conEsito > 5) {
    insights.push({ type: "success", priority: 5, title: tr("Ottimo Show-Up Rate"), message: tr("{showUp} degli appuntamenti effettuato — ottimo indicatore di qualità dei lead.", { showUp: tassoTesto(showUp) }) });
  }

  // Ciclo vendita
  if (kpi.avg_giorni_chiusura >= SOGLIE.avg_giorni_chiusura.critico && kpi.opp_vinte > 2) {
    insights.push({ type: "warning", priority: 3, title: tr("Ciclo di vendita lungo"), message: tr("Media di {avg_giorni_chiusura} giorni per chiudere. Considerare urgenza artificiale, scadenza offerta, follow-up più frequente.", { avg_giorni_chiusura: kpi.avg_giorni_chiusura }) });
  }

  // Pipeline coverage
  if (kpi.pipeline_valore > 0 && kpi.fatturato_generato > 0) {
    const coverage = Math.round(kpi.pipeline_valore / kpi.fatturato_generato * 10) / 10;
    if (coverage < 2) {
      insights.push({ type: "warning", priority: 2, title: tr("Pipeline Coverage bassa"), message: tr("La pipeline vale {coverage}× il fatturato realizzato. Per garantire il target futuro serve almeno 3×.", { coverage: coverage.toLocaleString(intlCampo()) }) });
    } else if (coverage >= 4) {
      insights.push({ type: "success", priority: 5, title: tr("Pipeline abbondante"), message: tr("Pipeline {coverage}× il fatturato realizzato — buon margine per i prossimi mesi.", { coverage: coverage.toLocaleString(intlCampo()) }) });
    }
  }

  // Fatturato perso > generato
  if (kpi.fatturato_perso > kpi.fatturato_generato && kpi.opp_perse > 0) {
    insights.push({ type: "danger", priority: 1, title: tr("Fatturato perso superiore al realizzato"), message: tr("Persi {fatturato_perso} vs {fatturato_generato} generati. Analizzare ragioni di perdita.", { fatturato_perso: formatCurrency(kpi.fatturato_perso), fatturato_generato: formatCurrency(kpi.fatturato_generato) }) });
  }

  // Trend 3 mesi consecutivi
  if (trend.length >= 3) {
    const ultimi3 = trend.filter((t) => t.fatturato > 0).slice(-3);
    if (ultimi3.length === 3) {
      if (ultimi3[2].fatturato > ultimi3[1].fatturato && ultimi3[1].fatturato > ultimi3[0].fatturato) {
        insights.push({ type: "success", priority: 4, title: tr("📈 Trend in crescita"), message: tr("Fatturato in aumento per 3 mesi consecutivi — trend positivo confermato.") });
      } else if (ultimi3[2].fatturato < ultimi3[1].fatturato && ultimi3[1].fatturato < ultimi3[0].fatturato) {
        insights.push({ type: "danger", priority: 2, title: tr("📉 Trend in calo"), message: tr("Fatturato in diminuzione per 3 mesi consecutivi — serve un intervento immediato.") });
      }
    }
  }

  // Nessuna opp: né create, né chiuse, né aperte
  if (kpi.opp_totali === 0 && chiuse === 0 && kpi.opp_aperte === 0) {
    insights.push({ type: "info", priority: 5, title: tr("Nessuna opportunità nel periodo"), message: tr("Non ci sono opportunità registrate. Verificare che le opportunità abbiano l'agente assegnato.") });
  }

  // Show-up ok ma chiusure scarse
  const appClose = kpi.tasso_app_to_close;
  if (appClose != null && showUp != null && appClose < SOGLIE.tasso_app_to_close.critico && showUp >= SOGLIE.tasso_show_up.critico && kpi.appuntamenti_effettuati >= 3) {
    insights.push({ type: "tip", priority: 3, title: tr("💡 Show-up ok, chiusure scarse"), message: tr("Gli appuntamenti vengono effettuati ({showUp}) ma pochi si convertono ({appClose}). Il problema è nella fase di presentazione/proposta.", { showUp: tassoTesto(showUp), appClose: tassoTesto(appClose) }) });
  }

  return insights.sort((a, b) => a.priority - b.priority);
}

interface Props {
  kpi: VendorKPI | null;
  trend: VendorTrend[];
  kpiList: VendorKPI[];
}

export function VenditoriInsights({ kpi, trend, kpiList }: Props) {
  const t = useT();
  const insights = generateInsights(kpi, trend, kpiList, t);
  if (!insights.length) return null;

  // Telefono: gli insight testuali restano al computer.
  return (
    <Card className="max-sm:hidden">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Lightbulb className="h-4 w-4" />
          {t("Insights Automatici")}
        </CardTitle>
        <CardDescription>{t("Analisi generata automaticamente dai tuoi dati")}</CardDescription>
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
