import { describe, expect, it } from "vitest";
import {
  DEFAULT_REFERRAL_COMMISSION_POLICY,
  evaluateReferralPayoutEligibility,
  normalizeReferralCommissionPolicy,
  simulateReferralCommission,
} from "@/lib/referralRules";

describe("referral commission policy", () => {
  it("normalizes invalid values to safe bounds", () => {
    expect(normalizeReferralCommissionPolicy({
      attributionWindowDays: 999,
      qualityThreshold: -20,
      volumeBonusMinDeals: 0,
      autoBlockFraud: "yes",
    })).toMatchObject({
      attributionWindowDays: 365,
      qualityThreshold: 0,
      volumeBonusMinDeals: 1,
      autoBlockFraud: DEFAULT_REFERRAL_COMMISSION_POLICY.autoBlockFraud,
    });
  });

  it("applies quality penalty, error penalty and volume bonus", () => {
    const result = simulateReferralCommission({
      baseAmount: 100,
      qualityScore: 50,
      errorRate: 12,
      volumeDeals: 5,
      monthsActive: 2,
      hasFraud: false,
      policy: DEFAULT_REFERRAL_COMMISSION_POLICY,
    });

    expect(result.finalAmount).toBe(66);
    expect(result.adjustments).toHaveLength(3);
  });

  it("holds payout inside clawback window and blocks fraud when enabled", () => {
    expect(simulateReferralCommission({
      baseAmount: 100,
      qualityScore: 100,
      errorRate: 0,
      volumeDeals: 1,
      monthsActive: 0,
      hasFraud: false,
      policy: DEFAULT_REFERRAL_COMMISSION_POLICY,
    })).toMatchObject({ finalAmount: 0, hold: true, blocked: false });

    expect(simulateReferralCommission({
      baseAmount: 100,
      qualityScore: 100,
      errorRate: 0,
      volumeDeals: 1,
      monthsActive: 2,
      hasFraud: true,
      policy: DEFAULT_REFERRAL_COMMISSION_POLICY,
    })).toMatchObject({ finalAmount: 0, hold: false, blocked: true });
  });

  it("blocks payout requests that violate platform policy", () => {
    const result = evaluateReferralPayoutEligibility({
      amount: 25,
      referrer: {
        has_accepted_terms: false,
        payout_method: "bank_transfer",
        payout_details: { iban: "", account_holder: "" },
      },
      fraudLogCount: 1,
      policy: DEFAULT_REFERRAL_COMMISSION_POLICY,
    });

    expect(result.eligible).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.stringContaining("Importo sotto soglia minima"),
      "Termini partner non accettati",
      "Dati pagamento incompleti",
      "1 anomalia/e frode recenti",
    ]));
  });

  it("allows payout when terms, payment data and threshold are valid", () => {
    expect(evaluateReferralPayoutEligibility({
      amount: 100,
      referrer: {
        has_accepted_terms: true,
        payout_method: "bank_transfer",
        payout_details: { iban: "IT60X0542811101000000123456", account_holder: "Mario Rossi" },
      },
      fraudLogCount: 0,
      policy: DEFAULT_REFERRAL_COMMISSION_POLICY,
    })).toMatchObject({ eligible: true, blockers: [] });
  });
});
