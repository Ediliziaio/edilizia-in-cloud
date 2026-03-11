/**
 * Lead Scoring Engine
 * ICP Score (0-50): quanto il contatto è il cliente ideale
 * Behavioral Score (0-50): quanto è attivo/pronto
 * Lead Score totale = ICP + Behavioral (0-100)
 */

export interface LeadScoringInput {
  // ICP factors
  hasCompanyName: boolean;
  hasPhone: boolean;
  hasAddress: boolean;
  source?: string | null;
  city?: string | null;
  icpOverride?: number | null;

  // Behavioral factors
  activitiesCount: number;
  hasOpenOpportunity: boolean;
  hasRecentActivity: boolean;
  opportunitiesCount: number;
}

const SOURCE_SCORES: Record<string, number> = {
  referral: 15,
  passaparola: 15,
  cliente_esistente: 12,
  fiera: 10,
  linkedin: 8,
  sito_web: 8,
  campagna: 7,
  email: 5,
  social: 5,
  chiamata_fredda: 3,
  cold_call: 3,
};

export function calculateLeadScore(input: LeadScoringInput): {
  leadScore: number;
  icpScore: number;
  behavioralScore: number;
  breakdown: Record<string, number>;
} {
  const breakdown: Record<string, number> = {};

  // --- ICP Score (0-50) ---
  let icpScore = 0;

  if (input.icpOverride !== null && input.icpOverride !== undefined) {
    icpScore = Math.min(50, Math.max(0, input.icpOverride));
    breakdown["ICP manuale"] = icpScore;
  } else {
    if (input.hasCompanyName) { icpScore += 5; breakdown["Azienda compilata"] = 5; }
    if (input.hasPhone) { icpScore += 5; breakdown["Telefono compilato"] = 5; }
    if (input.hasAddress) { icpScore += 3; breakdown["Indirizzo compilato"] = 3; }
    if (input.city) { icpScore += 5; breakdown["Città compilata"] = 5; }

    const sourceScore = SOURCE_SCORES[input.source?.toLowerCase() ?? ""] ?? 0;
    if (sourceScore > 0) {
      icpScore += sourceScore;
      breakdown[`Fonte: ${input.source}`] = sourceScore;
    }

    icpScore = Math.min(50, icpScore);
  }

  // --- Behavioral Score (0-50) ---
  let behavioralScore = 0;

  const activityPoints = Math.min(20, input.activitiesCount * 2);
  if (activityPoints > 0) {
    behavioralScore += activityPoints;
    breakdown[`Attività (${input.activitiesCount})`] = activityPoints;
  }

  if (input.hasOpenOpportunity) {
    behavioralScore += 15;
    breakdown["Opportunità aperta"] = 15;
  }

  if (input.hasRecentActivity) {
    behavioralScore += 10;
    breakdown["Attività recente (14gg)"] = 10;
  }

  const historyPoints = Math.min(5, input.opportunitiesCount);
  if (historyPoints > 0) {
    behavioralScore += historyPoints;
    breakdown[`Storico opportunità (${input.opportunitiesCount})`] = historyPoints;
  }

  behavioralScore = Math.min(50, behavioralScore);

  const leadScore = icpScore + behavioralScore;

  return { leadScore, icpScore, behavioralScore, breakdown };
}

export function getIcpTier(icpScore: number): "A" | "B" | "C" | "D" {
  if (icpScore >= 40) return "A";
  if (icpScore >= 25) return "B";
  if (icpScore >= 10) return "C";
  return "D";
}
