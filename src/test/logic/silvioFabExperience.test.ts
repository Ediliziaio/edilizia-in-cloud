import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync("src/components/silvio/SilvioFAB.tsx", "utf8");

describe("Regia Silvio: pannello del tondo in basso a destra", () => {
  it("ha la casella in alto, le domande rapide e un solo caricamento documenti", () => {
    expect(source).toContain("Regia Silvio");
    expect(source).toContain("Scrivi a Silvio");
    expect(source).toContain("Contesto pagina");
    expect(source).toContain("domandeRapide(location.pathname, pageContext?.route_label, mode)");
    // La casella sta prima delle priorità e della card di caricamento.
    expect(source.indexOf('placeholder="Scrivi a Silvio..."')).toBeLessThan(source.indexOf('data-testid="silvio-priorita"'));
    expect(source.indexOf('placeholder="Scrivi a Silvio..."')).toBeLessThan(source.indexOf("content.uploadCard.title"));
    expect(source.match(/handleAction\("smart_doc"\)/g)).toHaveLength(1);
  });

  it("niente priorità finte: vengono solo dal briefing", () => {
    expect(source).toContain("prioritaDalBriefing(morningBrief)");
    expect(source).toContain("badge.conteggio > 0");
    expect(source).not.toContain("operationalPriorities");
    expect(source).not.toContain("Chiedi a Silvio cosa conta ora");
    expect(source).not.toContain("Chiedi a Silvio Superadmin");
    expect(source).not.toContain("Scopri cosa sa fare Silvio");
    expect(source).not.toContain("Carica documenti, foto o computi senza scegliere il modulo");
  });

  it("le rotte dell'admin sono rotte vere", () => {
    const rotte = readFileSync("src/routes/adminRoutes.tsx", "utf8");
    expect(rotte).toContain('<Route path="ai" ');
    expect(rotte).toContain('<Route path="aziende" ');
    const tabs = readFileSync("src/pages/admin/ai/AIOperatePage.tsx", "utf8");
    for (const t of ["approvals", "personas", "memory"]) {
      expect(source).toContain(`/admin/ai?tab=${t}`);
      expect(tabs).toContain(`value: "${t}"`);
    }
  });

  it("does not use purple/violet tones in the Silvio launcher panel", () => {
    expect(source).not.toMatch(/purple|violet/i);
  });
});
