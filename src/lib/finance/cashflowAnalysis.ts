/**
 * cashflowAnalysis — logica pura del forecast cassa predittivo.
 *
 * Estratto da SilvioCashflowForecast.tsx per renderlo testabile senza React/Supabase.
 * Nessuna nuova fonte dati: nomina e mette in evidenza segnali che il forecast
 * (silvio_cashflow_forecast_90d) già calcola.
 */

import { TrendingDown, AlertTriangle, ArrowDownUp, Clock } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatCurrency } from "@/lib/formatters";

export interface ForecastWeek {
  week_index: number;
  week_start: string;
  week_end: string;
  incassi_eur: number;
  uscite_eur: number;
  cashflow_netto_eur: number;
  saldo_atteso_eur: number;
  status: "ok" | "warning" | "critical";
}

export interface ForecastResult {
  aggiornato_al: string;
  saldo_oggi_eur: number;
  orizzonte_settimane: number;
  delay_pattern: {
    avg_delay_days_global: number;
    delays_per_client: Record<string, number>;
  };
  costo_personale_mensile_netto_eur: number;
  totale_incassi_previsti_eur: number;
  totale_uscite_previste_eur: number;
  saldo_atteso_fine_periodo_eur: number;
  saldo_minimo_eur: number;
  settimana_critica: string;
  critical_weeks_count: number;
  warning_weeks_count: number;
  weeks: ForecastWeek[];
}

export type AnomalySeverity = "critical" | "warning" | "info";

export interface CashAnomaly {
  id: string;
  severity: AnomalySeverity;
  icon: LucideIcon;
  title: string;
  detail: string;
  /** Settimana del forecast a cui l'anomalia si riferisce (per highlight/scroll). */
  weekIndex?: number;
}

/** Etichette di stato (decouple dalla presentazione STATUS_BADGE del componente). */
export const STATUS_LABELS: Record<string, string> = {
  ok: "OK",
  warning: "Attenzione",
  critical: "Critico",
};

const STATUS_RANK: Record<string, number> = { ok: 0, warning: 1, critical: 2 };

export function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

/**
 * Rileva anomalie di cassa azionabili dall'output del forecast.
 * Non introduce nuove fonti dati: nomina e mette in evidenza segnali che il
 * forecast già calcola (saldo cumulato, status settimanale, ritardi per cliente).
 */
export function detectCashAnomalies(data: ForecastResult): CashAnomaly[] {
  const anomalies: CashAnomaly[] = [];
  const weeks = data.weeks ?? [];
  const avgDelay = data.delay_pattern?.avg_delay_days_global ?? 0;

  // 1. Saldo cumulato che scende sotto zero — prima settimana interessata
  const firstNegative = weeks.find((w) => w.saldo_atteso_eur < 0);
  if (firstNegative) {
    anomalies.push({
      id: "neg-balance",
      severity: "critical",
      icon: TrendingDown,
      weekIndex: firstNegative.week_index,
      title: `Saldo sotto zero dalla S${firstNegative.week_index} (${fmtDate(firstNegative.week_start)})`,
      detail: `Il saldo cumulato previsto scende a ${formatCurrency(firstNegative.saldo_atteso_eur)}. Copri lo scoperto o anticipa incassi prima di quella settimana.`,
    });
  }

  // 2. Primo peggioramento di stato (OK → attenzione/critico)
  for (let i = 1; i < weeks.length; i++) {
    const prev = weeks[i - 1];
    const cur = weeks[i];
    if ((STATUS_RANK[cur.status] ?? 0) > (STATUS_RANK[prev.status] ?? 0) && cur.status !== "ok") {
      anomalies.push({
        id: `transition-${cur.week_index}`,
        severity: cur.status === "critical" ? "critical" : "warning",
        icon: AlertTriangle,
        weekIndex: cur.week_index,
        title: `Peggioramento in S${cur.week_index} (${fmtDate(cur.week_start)})`,
        detail: `La cassa passa da "${STATUS_LABELS[prev.status] ?? prev.status}" a "${STATUS_LABELS[cur.status] ?? cur.status}": saldo previsto ${formatCurrency(cur.saldo_atteso_eur)}.`,
      });
      break;
    }
  }

  // 3. Concentrazione di uscite (uscite molto superiori agli incassi della settimana)
  const outflowSpikes = weeks.filter(
    (w) => w.uscite_eur > 0 && w.uscite_eur >= Math.max(w.incassi_eur * 2, 1) && w.status !== "ok",
  );
  if (outflowSpikes.length) {
    const worst = outflowSpikes.reduce((a, b) => (b.uscite_eur > a.uscite_eur ? b : a));
    anomalies.push({
      id: `outflow-${worst.week_index}`,
      severity: worst.status === "critical" ? "critical" : "warning",
      icon: ArrowDownUp,
      weekIndex: worst.week_index,
      title: `Uscite concentrate in S${worst.week_index} (${fmtDate(worst.week_start)})`,
      detail: `Uscite ${formatCurrency(worst.uscite_eur)} contro incassi ${formatCurrency(worst.incassi_eur)}. Valuta di scaglionare i pagamenti su più settimane.`,
    });
  }

  // 4. Clienti che peggiorano il ritardo medio aziendale
  const perClient = data.delay_pattern?.delays_per_client ?? {};
  const laggards = Object.entries(perClient)
    .filter(([, d]) => typeof d === "number" && d > avgDelay && d - avgDelay >= 5)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  for (const [client, delay] of laggards) {
    const label = client.length > 40 ? `${client.slice(0, 37)}…` : client;
    const extra = Math.round(delay - avgDelay);
    anomalies.push({
      id: `client-${client}`,
      severity: extra >= 15 ? "warning" : "info",
      icon: Clock,
      title: `${label} paga in ritardo`,
      detail: `Ritardo medio ${Math.round(delay)}gg, +${extra}gg oltre la media aziendale (${Math.round(avgDelay)}gg). Sollecita o rivedi i termini di pagamento.`,
    });
  }

  return anomalies;
}
