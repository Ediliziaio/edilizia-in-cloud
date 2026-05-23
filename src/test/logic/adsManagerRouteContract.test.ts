import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("ads manager route contract", () => {
  const source = readFileSync(
    resolve(process.cwd(), "src/pages/azienda/marketing/AdsManagerBeta.tsx"),
    "utf8",
  );

  it("links the creative studio to the real pubblicita route", () => {
    expect(source).toContain("/azienda/marketing/pubblicita?tab=creativita");
    expect(source).not.toContain("/azienda/marketing/ads-manager?tab=creativita");
  });

  it("keeps a creative QA panel for Meta and Google asset readiness", () => {
    expect(source).toContain("QA creativo advertiser");
    expect(source).toContain("Google PMax");
    expect(source).toContain("Asset verticali Meta");
  });

  it("uses provider-specific conversion wording in the campaign wizard", () => {
    expect(source).toContain("Landing page con GCLID - migliore attribuzione");
    expect(source).toContain("Lead form Google - più volume");
    expect(source).toContain("Modulo Meta nativo - più fluido da mobile");
    expect(source).toContain('conversionPlace: initialPlatform === "google" ? "landing_page"');
    expect(source).toContain("conversionPlaceLabel(state.conversionPlace, state.platform)");
  });

  it("explains Meta audiences and Google intent targeting separately", () => {
    expect(source).toContain("Meta e Google: pubblici diversi");
    expect(source).toContain("Google: intento, keyword e segnali");
    expect(source).toContain("Advantage+ Audience con zona");
    expect(source).toContain("importa appuntamento fissato, vendita vinta e valore commessa dal CRM");
  });
});
