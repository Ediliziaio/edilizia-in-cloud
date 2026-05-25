import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Company integrations hub scope", () => {
  const integrationsPage = readFileSync(
    resolve(process.cwd(), "src/pages/azienda/settings/SettingsIntegrations.tsx"),
    "utf8",
  );

  it("does not expose platform billing providers to company users", () => {
    expect(integrationsPage).not.toContain("stripe-config-status");
    expect(integrationsPage).not.toContain('key: "stripe"');
    expect(integrationsPage).not.toContain("Stripe");
  });

  it("explains that OAuth must be followed by asset selection", () => {
    expect(integrationsPage).toContain("Asset aziendali collegabili");
    expect(integrationsPage).toContain("Pagina Facebook / Instagram");
    expect(integrationsPage).toContain("Account Google Ads");
    expect(integrationsPage).toContain("Google Business Profile");
  });

  it("offers a single Google hub before selecting Google assets", () => {
    expect(integrationsPage).toContain("Google Hub");
    expect(integrationsPage).toContain("Collega Google una volta");
    expect(integrationsPage).toContain("Scegli asset Google");
    expect(integrationsPage).toContain("googleHubDialogOpen");
  });
});
