/**
 * Credit cost calculator for AI agent minutes.
 */

export function calculateBilledCost(
  minutesUsed: number,
  costPerMinutePlatform: number,
  markupMultiplier: number
): number {
  return minutesUsed * costPerMinutePlatform * markupMultiplier;
}

export function calculatePlatformCost(
  minutesUsed: number,
  costPerMinutePlatform: number
): number {
  return minutesUsed * costPerMinutePlatform;
}

export function calculateMargin(
  minutesUsed: number,
  costPerMinutePlatform: number,
  costPerMinuteBilled: number
): number {
  return minutesUsed * (costPerMinuteBilled - costPerMinutePlatform);
}

export function formatMinutes(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)}s`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs === 0) return `${mins}min`;
  return `${hrs}h ${mins}min`;
}
