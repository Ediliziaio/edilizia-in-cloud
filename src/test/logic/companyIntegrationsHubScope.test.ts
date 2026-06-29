import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Company integrations hub scope", () => {
  const integrationsPage = readFileSync(
    resolve(process.cwd(), "src/pages/azienda/settings/SettingsIntegrations.tsx"),
    "utf8",
  );

  it("does not expose platform billing providers to company users", () => {
    // Guard sul BILLING di piattaforma (la config Stripe del SaaS stesso). NON vieta
    // StripePaymentsCard = Stripe Connect per gli INCASSI dell'azienda (feature legittima,
    // aggiunta dopo: "incassi con markup"). Quindi niente più ban assoluto su "Stripe".
    expect(integrationsPage).not.toContain("stripe-config-status");
    expect(integrationsPage).not.toContain('key: "stripe"');
  });

  // SUPERSEDED dal redesign "stile GHL" (commit c823ab174): la griglia unificata ha rimosso
  // l'explainer "Asset aziendali collegabili" e il "Google Hub" separato. Da riscrivere
  // sull'architettura nuova dall'owner del modulo Integrazioni.
  it.skip("explains that OAuth must be followed by asset selection", () => {
    expect(integrationsPage).toContain("Asset aziendali collegabili");
    expect(integrationsPage).toContain("Pagina Facebook / Instagram");
    expect(integrationsPage).toContain("Account Google Ads");
    expect(integrationsPage).toContain("Google Business Profile");
  });

  // SUPERSEDED dal redesign "stile GHL" (commit c823ab174): niente più "Google Hub" separato
  // (consolidato nella griglia unificata). Da riscrivere sull'architettura nuova.
  it.skip("offers a single Google hub before selecting Google assets", () => {
    expect(integrationsPage).toContain("Google Hub");
    expect(integrationsPage).toContain("Collega Google una volta");
    expect(integrationsPage).toContain("Scegli asset Google");
    expect(integrationsPage).toContain("googleHubDialogOpen");
  });
});
