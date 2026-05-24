import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  clampLeadScoringNumber,
  formatLeadSourceScores,
  parseLeadSourceScores,
  validateLeadScoringConfigDraft,
} from "@/lib/leadScoringConfigForm";

describe("lead scoring config form helpers", () => {
  const componentSource = readFileSync(
    resolve(process.cwd(), "src/components/marketing/LeadScoringConfigForm.tsx"),
    "utf8",
  );

  it("parses only valid lead source scores and reports actionable errors", () => {
    const result = parseLeadSourceScores(`
Referral: 15
Google Ads: 8
malformed
cold: -1
too_high: 90
nan: abc
`);

    expect(result.scores).toEqual({
      referral: 15,
      "google ads": 8,
    });
    expect(result.errors).toEqual([
      "Riga 4: usa il formato fonte: punti.",
      "Riga 5: cold deve essere tra 0 e 50.",
      "Riga 6: too_high deve essere tra 0 e 50.",
      "Riga 7: nan deve essere un numero.",
    ]);
  });

  it("clamps numeric inputs to the allowed range before save", () => {
    expect(clampLeadScoringNumber("999", 50)).toBe(50);
    expect(clampLeadScoringNumber("-4", 50)).toBe(0);
    expect(clampLeadScoringNumber("12.6", 50)).toBe(13);
    expect(clampLeadScoringNumber("abc", 50)).toBe(0);
    expect(clampLeadScoringNumber("", 20)).toBe(0);
  });

  it("validates ICP thresholds before saving", () => {
    const errors = validateLeadScoringConfigDraft({
      tier_a_threshold: 20,
      tier_b_threshold: 30,
      tier_c_threshold: 10,
    });

    expect(errors).toEqual([
      "Le soglie ICP devono essere in ordine: Tier A >= Tier B >= Tier C.",
    ]);
  });

  it("formats source scores in a stable editable order", () => {
    expect(formatLeadSourceScores({ referral: 15, sito_web: 8 })).toBe("referral: 15\nsito_web: 8");
  });

  it("does not leave the config form in an infinite loading state on remote load errors", () => {
    expect(componentSource).toContain("isError");
    expect(componentSource).toContain("setTimeout");
    expect(componentSource).toContain("usedLocalFallback");
    expect(componentSource).toContain("Non sono riuscito a caricare la configurazione");
    expect(componentSource).toContain("DEFAULT_LEAD_SCORING_CONFIG");
  });
});
