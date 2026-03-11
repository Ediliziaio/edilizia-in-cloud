/**
 * Lead Temperature — real-time decay-based temperature indicator.
 * Unlike static lead score, temperature decays automatically over time
 * based on last activity / last contact date.
 */
import { differenceInDays } from "date-fns";

export type LeadTemperature = 'hot' | 'warm' | 'cold' | 'frozen';

export interface LeadTemperatureResult {
  temperature: LeadTemperature;
  label: string;
  colorClass: string;
  decayDays: number;
  reason: string;
}

export function getLeadTemperature(
  lastActivityDate: Date | null,
  lastContactedDate: Date | null,
  hasOpenOpportunity: boolean,
  recentAppointment: boolean, // appointment in last 48h
): LeadTemperatureResult {
  const now = new Date();

  // Recent appointment or activity within 48h → HOT
  if (recentAppointment) {
    return {
      temperature: 'hot',
      label: 'Caldo 🔥',
      colorClass: 'text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400',
      decayDays: 0,
      reason: 'Appuntamento recente',
    };
  }

  // Use the most recent date between activity and contacted
  const lastDate = [lastActivityDate, lastContactedDate]
    .filter((d): d is Date => d !== null)
    .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;

  const daysSinceActivity = lastDate
    ? differenceInDays(now, lastDate)
    : 999;

  if (daysSinceActivity <= 3) {
    return {
      temperature: 'hot',
      label: 'Caldo 🔥',
      colorClass: 'text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400',
      decayDays: daysSinceActivity,
      reason: `Attivo ${daysSinceActivity}gg fa`,
    };
  }

  if (daysSinceActivity <= 14) {
    return {
      temperature: 'warm',
      label: 'Tiepido',
      colorClass: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400',
      decayDays: daysSinceActivity,
      reason: `Attivo ${daysSinceActivity}gg fa`,
    };
  }

  if (daysSinceActivity <= 30) {
    return {
      temperature: 'cold',
      label: 'Freddo',
      colorClass: 'text-blue-600 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400',
      decayDays: daysSinceActivity,
      reason: `Inattivo da ${daysSinceActivity}gg`,
    };
  }

  return {
    temperature: 'frozen',
    label: 'Inattivo ❄️',
    colorClass: 'text-slate-500 bg-slate-100 dark:bg-slate-800/40 dark:text-slate-400',
    decayDays: daysSinceActivity,
    reason: `Fermo da ${daysSinceActivity}gg`,
  };
}
