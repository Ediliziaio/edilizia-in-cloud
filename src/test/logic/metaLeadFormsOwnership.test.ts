import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Meta lead forms ownership", () => {
  const integrationsPage = readFileSync(
    resolve(process.cwd(), "src/pages/azienda/settings/SettingsIntegrations.tsx"),
    "utf8",
  );
  const leadFormsPage = readFileSync(
    resolve(process.cwd(), "src/pages/azienda/marketing/FacebookFormsPage.tsx"),
    "utf8",
  );

  // SUPERSEDED dal redesign "stile GHL" (commit c823ab174 + ce0fc49c1 "consolida card
  // duplicate ... Meta, Google"): Meta è ora una card del hub integrazioni unificato.
  // Premessa architetturale invertita di proposito — da riscrivere dall'owner.
  it.skip("keeps Meta Lead Ads setup out of the generic integrations hub", () => {
    expect(integrationsPage).not.toContain("MetaIntegrationWizard");
    expect(integrationsPage).not.toContain("integration-meta-stats");
    expect(integrationsPage).not.toContain("Meta (Facebook & Instagram Lead Ads)");
    expect(integrationsPage).not.toContain("Lead Meta processati");
    expect(integrationsPage).not.toContain("Configura Meta");
  });

  it("makes lead-forms the single place for Meta setup and management", () => {
    expect(leadFormsPage).toContain("MetaIntegrationWizard");
    expect(leadFormsPage).toContain("checkMetaCredentials");
    expect(leadFormsPage).toContain("setWizardOpen(true)");
    expect(leadFormsPage).not.toContain('navigate("/azienda/impostazioni/integrazioni")');
  });
});
