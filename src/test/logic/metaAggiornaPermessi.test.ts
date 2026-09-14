/**
 * Da collegati si deve poter rifare il login con Facebook.
 *
 * 14/09/2026: il titolare ha «ricollegato» Meta su BeMade per concedere i
 * permessi nuovi, ma il wizard da connessi parte dalla scelta delle pagine: il
 * login non è mai partito e i permessi non sono cambiati. L'unica via era
 * disconnettere, che ferma i lead.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "../../..");
const wizard = readFileSync(join(ROOT, "src/components/integrations/MetaIntegrationWizard.tsx"), "utf8");

describe("wizard Meta da collegati", () => {
  it("offre «Aggiorna permessi», che riporta al login con Facebook", () => {
    expect(wizard).toMatch(/Aggiorna permessi/);
    expect(wizard).toMatch(/onClick=\{\(\) => setStep\("oauth"\)\}/);
  });

  it("il passo del login è montato anche nella vista da collegati", () => {
    const vistaCollegati = wizard.slice(wizard.indexOf("isConnected && integration ?"), wizard.indexOf('TabsContent value="logs"'));
    expect(vistaCollegati).toMatch(/step === "oauth" && <OAuthStep/);
  });
});
