/**
 * Credit cost calculator for AI agent usage (Euro-based).
 */

export function calculateBilledCost(
  durationMin: number,
  costBilledPerMin: number
): number {
  return Number((durationMin * costBilledPerMin).toFixed(4));
}

export function calculateRealCost(
  durationMin: number,
  costRealPerMin: number
): number {
  return Number((durationMin * costRealPerMin).toFixed(4));
}

export function calculateMargin(
  costBilledTotal: number,
  costRealTotal: number
): number {
  return Number((costBilledTotal - costRealTotal).toFixed(4));
}

export function calculateMarginPercent(
  costBilledTotal: number,
  costRealTotal: number
): number {
  if (costBilledTotal <= 0) return 0;
  return Math.round(((costBilledTotal - costRealTotal) / costBilledTotal) * 100);
}

export function estimateMinutesRemaining(
  balanceEur: number,
  avgCostPerMin: number
): number {
  if (avgCostPerMin <= 0) return 0;
  return Math.floor(balanceEur / avgCostPerMin);
}

export function estimateConversationsRemaining(
  balanceEur: number,
  avgCostPerMin: number,
  avgDurationMin = 5
): number {
  if (avgCostPerMin <= 0) return 0;
  return Math.floor(balanceEur / (avgCostPerMin * avgDurationMin));
}

export function formatEur(amount: number, decimals = 2): string {
  return `€${amount.toFixed(decimals)}`;
}

export function formatMinutes(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs === 0) return `${mins}min`;
  return `${hrs}h ${mins}min`;
}
