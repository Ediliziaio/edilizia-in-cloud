// src/lib/forecastUtils.ts
// Funzioni pure per calcolo revenue forecast (OLS regression)
// Zero dipendenze esterne, unit-testabili

import type { MrrDataPoint, ForecastResult } from "@/types/dashboard";

interface RegressionResult {
  slope: number;
  intercept: number;
  stdError: number;
}

interface DataPoint {
  x: number;
  y: number;
}

/**
 * Calcola la regressione lineare OLS su una serie di punti.
 * Ritorna slope, intercept e stdError dei residui.
 */
export function calculateLinearRegression(dataPoints: DataPoint[]): RegressionResult {
  const n = dataPoints.length;
  if (n < 2) {
    return { slope: 0, intercept: dataPoints[0]?.y ?? 0, stdError: 0 };
  }

  const sumX = dataPoints.reduce((acc, p) => acc + p.x, 0);
  const sumY = dataPoints.reduce((acc, p) => acc + p.y, 0);
  const sumXY = dataPoints.reduce((acc, p) => acc + p.x * p.y, 0);
  const sumXX = dataPoints.reduce((acc, p) => acc + p.x * p.x, 0);

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) {
    return { slope: 0, intercept: sumY / n, stdError: 0 };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  // Standard error dei residui: sqrt(sum((y - yHat)^2) / (n-2))
  const residualSumSq = dataPoints.reduce((acc, p) => {
    const yHat = intercept + slope * p.x;
    return acc + Math.pow(p.y - yHat, 2);
  }, 0);
  const stdError = n > 2 ? Math.sqrt(residualSumSq / (n - 2)) : 0;

  return { slope, intercept, stdError };
}

/**
 * Calcola il forecast MRR a 30, 60, 90 giorni basato sui dati storici.
 * I dati storici sono ordinati per mese (dal più vecchio al più recente).
 */
export function computeForecast(historicalData: MrrDataPoint[]): ForecastResult[] {
  if (historicalData.length === 0) {
    return [
      { days: 30, projectedMrr: 0, deltaMrr: 0, deltaPercent: 0, confidenceLow: 0, confidenceHigh: 0 },
      { days: 60, projectedMrr: 0, deltaMrr: 0, deltaPercent: 0, confidenceLow: 0, confidenceHigh: 0 },
      { days: 90, projectedMrr: 0, deltaMrr: 0, deltaPercent: 0, confidenceLow: 0, confidenceHigh: 0 },
    ];
  }

  // Converti dati storici in punti (x = indice mese, y = MRR)
  const dataPoints: DataPoint[] = historicalData.map((d, i) => ({ x: i, y: d.mrrEur }));

  const { slope, intercept, stdError } = calculateLinearRegression(dataPoints);
  const lastIndex = dataPoints.length - 1;
  const currentMrr = historicalData[historicalData.length - 1]?.mrrEur ?? 0;

  // Proiezione: ogni mese ≈ 30 giorni
  // 30gg = +1 mese, 60gg = +2 mesi, 90gg = +3 mesi
  const forecasts: ForecastResult[] = ([30, 60, 90] as const).map((days, i) => {
    const monthsAhead = i + 1;
    const projectedMrr = Math.max(0, intercept + slope * (lastIndex + monthsAhead));
    const deltaMrr = projectedMrr - currentMrr;
    const deltaPercent = currentMrr > 0 ? (deltaMrr / currentMrr) * 100 : 0;
    // Confidence interval: ±1 std dev (ampliato per proiezioni più lontane)
    const confidenceMargin = stdError * (1 + monthsAhead * 0.1);
    const confidenceLow = Math.max(0, projectedMrr - confidenceMargin);
    const confidenceHigh = projectedMrr + confidenceMargin;

    return {
      days,
      projectedMrr: Math.round(projectedMrr * 100) / 100,
      deltaMrr: Math.round(deltaMrr * 100) / 100,
      deltaPercent: Math.round(deltaPercent * 10) / 10,
      confidenceLow: Math.round(confidenceLow * 100) / 100,
      confidenceHigh: Math.round(confidenceHigh * 100) / 100,
    };
  });

  return forecasts;
}

/**
 * Prepara i dati per il grafico Recharts:
 * unisce dati storici + proiezioni in una singola serie.
 */
export interface ChartDataPoint {
  label: string;
  mrr?: number; // dati storici
  forecast?: number; // proiezione
  confidenceLow?: number;
  confidenceHigh?: number;
}

export function buildChartData(
  historicalData: MrrDataPoint[],
  forecastResults: ForecastResult[]
): ChartDataPoint[] {
  const historical: ChartDataPoint[] = historicalData.map((d) => ({
    label: formatYearMonth(d.yearMonth),
    mrr: d.mrrEur,
  }));

  const months = ["", "+30gg", "+60gg", "+90gg"];
  const forecasted: ChartDataPoint[] = forecastResults.map((f, i) => ({
    label: months[i + 1],
    forecast: f.projectedMrr,
    confidenceLow: f.confidenceLow,
    confidenceHigh: f.confidenceHigh,
  }));

  return [...historical, ...forecasted];
}

function formatYearMonth(yearMonth: string): string {
  // yearMonth = "YYYY-MM"
  const [year, month] = yearMonth.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  return date.toLocaleDateString("it-IT", { month: "short", year: "2-digit" });
}
