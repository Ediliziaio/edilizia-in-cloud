export interface ReferralCommissionPolicy {
  attributionWindowDays: number;
  clawbackDays: number;
  minPayoutAmount: number;
  qualityThreshold: number;
  qualityPenaltyPct: number;
  errorThresholdPct: number;
  errorPenaltyPct: number;
  volumeBonusMinDeals: number;
  volumeBonusPct: number;
  autoBlockFraud: boolean;
  requireAcceptedTerms: boolean;
  requirePayoutDetails: boolean;
}

export interface ReferralCommissionSimulationInput {
  baseAmount: number;
  qualityScore: number;
  errorRate: number;
  volumeDeals: number;
  monthsActive: number;
  hasFraud: boolean;
  policy: ReferralCommissionPolicy;
}

export interface ReferralCommissionSimulationResult {
  baseAmount: number;
  finalAmount: number;
  hold: boolean;
  blocked: boolean;
  adjustments: string[];
}

export interface ReferralPayoutReferrerSnapshot {
  has_accepted_terms?: boolean | null;
  payout_method?: string | null;
  payout_details?: unknown;
}

export interface ReferralPayoutEligibilityInput {
  amount: number;
  referrer?: ReferralPayoutReferrerSnapshot | null;
  fraudLogCount?: number;
  policy: ReferralCommissionPolicy;
}

export interface ReferralPayoutEligibilityResult {
  eligible: boolean;
  blockers: string[];
  warnings: string[];
}

export const REFERRAL_COMMISSION_POLICY_KEY = "referral_commission_policy";

export const DEFAULT_REFERRAL_COMMISSION_POLICY: ReferralCommissionPolicy = {
  attributionWindowDays: 90,
  clawbackDays: 30,
  minPayoutAmount: 50,
  qualityThreshold: 70,
  qualityPenaltyPct: 25,
  errorThresholdPct: 10,
  errorPenaltyPct: 20,
  volumeBonusMinDeals: 5,
  volumeBonusPct: 10,
  autoBlockFraud: true,
  requireAcceptedTerms: true,
  requirePayoutDetails: true,
};

function finiteNumber(value: unknown, fallback: number) {
  const parsed = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function finiteBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeReferralCommissionPolicy(input: unknown): ReferralCommissionPolicy {
  const source = typeof input === "object" && input !== null
    ? input as Partial<Record<keyof ReferralCommissionPolicy, unknown>>
    : {};

  return {
    attributionWindowDays: clamp(
      Math.round(finiteNumber(source.attributionWindowDays, DEFAULT_REFERRAL_COMMISSION_POLICY.attributionWindowDays)),
      1,
      365,
    ),
    clawbackDays: clamp(
      Math.round(finiteNumber(source.clawbackDays, DEFAULT_REFERRAL_COMMISSION_POLICY.clawbackDays)),
      0,
      365,
    ),
    minPayoutAmount: clamp(
      finiteNumber(source.minPayoutAmount, DEFAULT_REFERRAL_COMMISSION_POLICY.minPayoutAmount),
      0,
      100000,
    ),
    qualityThreshold: clamp(
      finiteNumber(source.qualityThreshold, DEFAULT_REFERRAL_COMMISSION_POLICY.qualityThreshold),
      0,
      100,
    ),
    qualityPenaltyPct: clamp(
      finiteNumber(source.qualityPenaltyPct, DEFAULT_REFERRAL_COMMISSION_POLICY.qualityPenaltyPct),
      0,
      100,
    ),
    errorThresholdPct: clamp(
      finiteNumber(source.errorThresholdPct, DEFAULT_REFERRAL_COMMISSION_POLICY.errorThresholdPct),
      0,
      100,
    ),
    errorPenaltyPct: clamp(
      finiteNumber(source.errorPenaltyPct, DEFAULT_REFERRAL_COMMISSION_POLICY.errorPenaltyPct),
      0,
      100,
    ),
    volumeBonusMinDeals: clamp(
      Math.round(finiteNumber(source.volumeBonusMinDeals, DEFAULT_REFERRAL_COMMISSION_POLICY.volumeBonusMinDeals)),
      1,
      10000,
    ),
    volumeBonusPct: clamp(
      finiteNumber(source.volumeBonusPct, DEFAULT_REFERRAL_COMMISSION_POLICY.volumeBonusPct),
      0,
      300,
    ),
    autoBlockFraud: finiteBoolean(source.autoBlockFraud, DEFAULT_REFERRAL_COMMISSION_POLICY.autoBlockFraud),
    requireAcceptedTerms: finiteBoolean(source.requireAcceptedTerms, DEFAULT_REFERRAL_COMMISSION_POLICY.requireAcceptedTerms),
    requirePayoutDetails: finiteBoolean(source.requirePayoutDetails, DEFAULT_REFERRAL_COMMISSION_POLICY.requirePayoutDetails),
  };
}

export function parseReferralCommissionPolicy(rawValue: string | null | undefined): ReferralCommissionPolicy {
  if (!rawValue?.trim()) return DEFAULT_REFERRAL_COMMISSION_POLICY;

  try {
    return normalizeReferralCommissionPolicy(JSON.parse(rawValue));
  } catch {
    return DEFAULT_REFERRAL_COMMISSION_POLICY;
  }
}

export function simulateReferralCommission({
  baseAmount,
  qualityScore,
  errorRate,
  volumeDeals,
  monthsActive,
  hasFraud,
  policy,
}: ReferralCommissionSimulationInput): ReferralCommissionSimulationResult {
  const normalizedPolicy = normalizeReferralCommissionPolicy(policy);
  const safeBase = Math.max(0, finiteNumber(baseAmount, 0));
  const safeQuality = clamp(finiteNumber(qualityScore, 100), 0, 100);
  const safeErrors = clamp(finiteNumber(errorRate, 0), 0, 100);
  const safeVolume = Math.max(0, Math.round(finiteNumber(volumeDeals, 0)));
  const safeMonths = Math.max(0, finiteNumber(monthsActive, 0));
  const hold = safeMonths * 30 < normalizedPolicy.clawbackDays;
  const blocked = normalizedPolicy.autoBlockFraud && hasFraud;
  const adjustments: string[] = [];

  let finalAmount = safeBase;

  if (blocked) {
    return {
      baseAmount: safeBase,
      finalAmount: 0,
      hold: false,
      blocked: true,
      adjustments: ["Anomalia/frode: payout bloccato"],
    };
  }

  if (safeQuality < normalizedPolicy.qualityThreshold) {
    finalAmount *= 1 - normalizedPolicy.qualityPenaltyPct / 100;
    adjustments.push(`Qualita sotto ${normalizedPolicy.qualityThreshold}: -${normalizedPolicy.qualityPenaltyPct}%`);
  }

  if (safeErrors > normalizedPolicy.errorThresholdPct) {
    finalAmount *= 1 - normalizedPolicy.errorPenaltyPct / 100;
    adjustments.push(`Errori sopra ${normalizedPolicy.errorThresholdPct}%: -${normalizedPolicy.errorPenaltyPct}%`);
  }

  if (safeVolume >= normalizedPolicy.volumeBonusMinDeals) {
    finalAmount *= 1 + normalizedPolicy.volumeBonusPct / 100;
    adjustments.push(`Volume da ${normalizedPolicy.volumeBonusMinDeals}+ vendite: +${normalizedPolicy.volumeBonusPct}%`);
  }

  if (hold) {
    adjustments.push(`Finestra clawback ${normalizedPolicy.clawbackDays} giorni: payout in sospeso`);
  }

  return {
    baseAmount: safeBase,
    finalAmount: hold ? 0 : Math.round(finalAmount * 100) / 100,
    hold,
    blocked: false,
    adjustments,
  };
}

function hasStructuredPayoutDetails(details: unknown): boolean {
  if (!details || typeof details !== "object" || Array.isArray(details)) return false;
  return Object.values(details as Record<string, unknown>).some((value) => String(value ?? "").trim().length > 0);
}

export function hasReferralPayoutDetails(referrer?: ReferralPayoutReferrerSnapshot | null): boolean {
  if (!referrer?.payout_method?.trim()) return false;
  if (referrer.payout_method === "bank_transfer") {
    const details = referrer.payout_details as Record<string, unknown> | null | undefined;
    return Boolean(
      details
      && String(details.iban ?? "").trim()
      && String(details.account_holder ?? "").trim()
    );
  }
  return hasStructuredPayoutDetails(referrer.payout_details);
}

export function evaluateReferralPayoutEligibility({
  amount,
  referrer,
  fraudLogCount = 0,
  policy,
}: ReferralPayoutEligibilityInput): ReferralPayoutEligibilityResult {
  const normalizedPolicy = normalizeReferralCommissionPolicy(policy);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const safeAmount = finiteNumber(amount, 0);

  if (safeAmount <= 0) blockers.push("Importo payout non valido");

  if (safeAmount < normalizedPolicy.minPayoutAmount) {
    blockers.push(`Importo sotto soglia minima ${normalizedPolicy.minPayoutAmount.toLocaleString("it-IT", { style: "currency", currency: "EUR", useGrouping: "always" })}`);
  }

  if (normalizedPolicy.requireAcceptedTerms && !referrer?.has_accepted_terms) {
    blockers.push("Termini partner non accettati");
  }

  if (normalizedPolicy.requirePayoutDetails && !hasReferralPayoutDetails(referrer)) {
    blockers.push("Dati pagamento incompleti");
  }

  if (normalizedPolicy.autoBlockFraud && fraudLogCount > 0) {
    blockers.push(`${fraudLogCount} anomalia/e frode recenti`);
  } else if (fraudLogCount > 0) {
    warnings.push(`${fraudLogCount} anomalia/e frode recenti`);
  }

  if (!referrer?.payout_method?.trim()) {
    warnings.push("Metodo pagamento assente");
  }

  return {
    eligible: blockers.length === 0,
    blockers,
    warnings,
  };
}
