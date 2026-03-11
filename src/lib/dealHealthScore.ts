/**
 * Deal Health Score — measures the health of an open opportunity (0-100).
 * Distinct from Lead Score which measures lead quality.
 */

export interface DealHealthInput {
  daysSinceLastActivity: number | null;   // days since last note/call/email
  daysSinceStageChange: number;           // days in current stage
  hasNextActionSet: boolean;              // next_action field filled
  hasExpectedCloseDate: boolean;          // expected close date set
  closeDate: Date | null;                 // if overdue
  probabilityPercent: number;             // 0-100
  numberOfActivities: number;            // notes + appointments total
  hasDecisionMaker: boolean;             // contact is decision maker?
  avgStageDays: number;                   // historical avg days in this stage
}

export interface DealHealth {
  score: number;            // 0-100
  status: 'healthy' | 'at_risk' | 'critical' | 'dead';
  badge: string;            // short label for UI
  color: string;            // tailwind class
  reasons: string[];        // human-readable reasons
}

export function calculateDealHealth(input: DealHealthInput): DealHealth {
  let score = 100;
  const reasons: string[] = [];

  // Recent activity (-30 if no activity in 14+ days)
  if (input.daysSinceLastActivity === null || input.daysSinceLastActivity > 14) {
    score -= 30;
    reasons.push('Nessuna attività recente');
  } else if (input.daysSinceLastActivity > 7) {
    score -= 15;
    reasons.push('Attività scarsa (ultima > 7gg)');
  }

  // Stage stagnation (compare with historical average)
  if (input.avgStageDays > 0 && input.daysSinceStageChange > input.avgStageDays * 1.5) {
    score -= 20;
    reasons.push(
      `Bloccato in stage ${Math.round(input.daysSinceStageChange)}gg (media: ${Math.round(input.avgStageDays)}gg)`
    );
  }

  // No next action set
  if (!input.hasNextActionSet) {
    score -= 15;
    reasons.push('Nessuna azione pianificata');
  }

  // No expected close date
  if (!input.hasExpectedCloseDate) {
    score -= 10;
    reasons.push('Data chiusura non settata');
  }

  // Close date overdue
  if (input.closeDate && input.closeDate < new Date()) {
    score -= 20;
    reasons.push('Data chiusura scaduta!');
  }

  // Few activities (deal not worked)
  if (input.numberOfActivities < 2) {
    score -= 10;
    reasons.push('Meno di 2 contatti registrati');
  }

  score = Math.max(0, score);

  const status: DealHealth['status'] =
    score >= 70 ? 'healthy'
    : score >= 40 ? 'at_risk'
    : score >= 20 ? 'critical'
    : 'dead';

  const badge =
    status === 'healthy' ? 'In salute'
    : status === 'at_risk' ? 'A rischio'
    : status === 'critical' ? 'Critico'
    : 'Da recuperare';

  const color =
    status === 'healthy' ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400'
    : status === 'at_risk' ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400'
    : 'text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400';

  return { score, status, badge, color, reasons };
}

/** Helper to build DealHealthInput from a raw opportunity object */
export function buildDealHealthInput(opp: {
  updated_at?: string | null;
  next_action?: string | null;
  expected_close_date?: string | null;
  probability?: number | null;
  notes_count?: number | null;
  created_at?: string | null;
}, avgStageDays = 14): DealHealthInput {
  const now = new Date();

  // Use updated_at as proxy for last activity
  // TODO: use a dedicated last_activity_at field when available
  const lastActivity = opp.updated_at ? new Date(opp.updated_at) : null;
  const daysSinceLastActivity = lastActivity
    ? Math.floor((now.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Use updated_at as proxy for stage change date
  // TODO: use stage_changed_at field when available in DB
  const stageChangeDate = opp.updated_at ? new Date(opp.updated_at) : (opp.created_at ? new Date(opp.created_at) : now);
  const daysSinceStageChange = Math.floor(
    (now.getTime() - stageChangeDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  const closeDate = opp.expected_close_date ? new Date(opp.expected_close_date) : null;

  return {
    daysSinceLastActivity,
    daysSinceStageChange,
    hasNextActionSet: !!opp.next_action,
    hasExpectedCloseDate: !!opp.expected_close_date,
    closeDate,
    probabilityPercent: opp.probability ?? 50,
    numberOfActivities: opp.notes_count ?? 0,
    hasDecisionMaker: true, // TODO: not available in DB yet — default true
    avgStageDays,
  };
}
