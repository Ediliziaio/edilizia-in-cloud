import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("Talent Profile HR tab", () => {
  it("aggiunge Selezioni come tab nativa in Personale & HR", () => {
    const pageSource = readFileSync(
      resolve(process.cwd(), "src/pages/azienda/personale/PersonalePage.tsx"),
      "utf8",
    );

    expect(pageSource).toContain('const TabSelezioni = lazy(() => import("./tabs/TabSelezioni")');
    expect(pageSource).toContain('"selezioni"');
    expect(pageSource).toContain('TabsTrigger value="selezioni"');
    expect(pageSource).toContain("<TabSelezioni />");
  });

  it("espone una dashboard collegata alle tabelle hr_talent e al motore V5", () => {
    const tabPath = resolve(process.cwd(), "src/pages/azienda/personale/tabs/TabSelezioni.tsx");
    expect(existsSync(tabPath)).toBe(true);

    const tabSource = readFileSync(tabPath, "utf8");
    expect(tabSource).toContain('from("hr_talent_candidates")');
    expect(tabSource).toContain('from("hr_talent_reports")');
    expect(tabSource).toContain('from("hr_talent_answers")');
    expect(tabSource).toContain("DOMANDE.length");
    expect(tabSource).toContain("ROLE_PROFILES_V5");
    expect(tabSource).toContain("buildTalentReportPayload");
    expect(tabSource).toContain("Talent Assessment");
  });

  it("rende operativo il report HR con decisione, confronto e piano di inserimento", () => {
    const tabSource = readFileSync(
      resolve(process.cwd(), "src/pages/azienda/personale/tabs/TabSelezioni.tsx"),
      "utf8",
    );

    expect(tabSource).toContain("buildTalentReportPayload");
    expect(tabSource).toContain("buildTalentReportDecision");
    expect(tabSource).toContain("ReportDecisionDialog");
    expect(tabSource).toContain("autoGenerateMissingReports");
    expect(tabSource).toContain("buildTalentReportPrintHtml");
    expect(tabSource).toContain("openTalentReportPrintView");
    expect(tabSource).toContain("Stampa rapida");
    expect(tabSource).toContain("ReportInsightCard");
    expect(tabSource).toContain("Punti forti");
    expect(tabSource).toContain("Aree da allenare");
    expect(tabSource).toContain("Copia sintesi");
    expect(tabSource).toContain("ReportMacroAreas");
    expect(tabSource).toContain("Prossime azioni HR");
    expect(tabSource).toContain("Checklist operativa");
    expect(tabSource).toContain("Piano 30/60/90");
    expect(tabSource).toContain("Domande colloquio");
    expect(tabSource).toContain("Confronto ruoli");
  });

  it("salva le risposte prima di cambiare blocco nel questionario interno", () => {
    const tabSource = readFileSync(
      resolve(process.cwd(), "src/pages/azienda/personale/tabs/TabSelezioni.tsx"),
      "utf8",
    );

    expect(tabSource).toContain("const goToBlock = async (nextBlock: number)");
    expect(tabSource).toContain('await saveAnswers.mutateAsync("in_progress")');
    expect(tabSource).toContain("void goToBlock(item)");
    expect(tabSource).toContain("void goToBlock(blocks[Math.min(blocks.length - 1, blockIndex + 1)])");
  });
});
