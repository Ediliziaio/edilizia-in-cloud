type LeadScoringThresholdDraft = {
  tier_a_threshold: number;
  tier_b_threshold: number;
  tier_c_threshold: number;
};

export type ParsedLeadSourceScores = {
  scores: Record<string, number>;
  errors: string[];
};

export function clampLeadScoringNumber(value: string | number, max = 50) {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(max, Math.max(0, Math.round(numeric)));
}

export function parseLeadSourceScores(text: string, max = 50): ParsedLeadSourceScores {
  const scores: Record<string, number> = {};
  const errors: string[] = [];

  text.split("\n").forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line) return;

    const separatorIndex = line.indexOf(":");
    if (separatorIndex <= 0 || separatorIndex === line.length - 1) {
      errors.push(`Riga ${index + 1}: usa il formato fonte: punti.`);
      return;
    }

    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const rawValue = line.slice(separatorIndex + 1).trim();
    const numeric = Number(rawValue);

    if (!Number.isFinite(numeric)) {
      errors.push(`Riga ${index + 1}: ${key} deve essere un numero.`);
      return;
    }

    const points = Math.round(numeric);
    if (points < 0 || points > max) {
      errors.push(`Riga ${index + 1}: ${key} deve essere tra 0 e ${max}.`);
      return;
    }

    scores[key] = points;
  });

  return { scores, errors };
}

export function formatLeadSourceScores(scores: Record<string, number>) {
  return Object.entries(scores)
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

export function validateLeadScoringConfigDraft(
  draft: LeadScoringThresholdDraft,
  sourceErrors: string[] = [],
) {
  const errors = [...sourceErrors];
  const tierA = clampLeadScoringNumber(draft.tier_a_threshold);
  const tierB = clampLeadScoringNumber(draft.tier_b_threshold);
  const tierC = clampLeadScoringNumber(draft.tier_c_threshold);

  if (!(tierA >= tierB && tierB >= tierC)) {
    errors.push("Le soglie ICP devono essere in ordine: Tier A >= Tier B >= Tier C.");
  }

  return errors;
}
