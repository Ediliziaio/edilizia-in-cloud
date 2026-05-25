import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const hubSource = readFileSync(
  resolve(process.cwd(), "src/pages/admin/ai/AdminAIHub.tsx"),
  "utf8",
);
const contextSource = readFileSync(
  resolve(
    process.cwd(),
    "src/components/admin/ai-shared/AIHubNestedContext.tsx",
  ),
  "utf8",
);
const operateSource = readFileSync(
  resolve(process.cwd(), "src/pages/admin/ai/AIOperatePage.tsx"),
  "utf8",
);
const monitorSource = readFileSync(
  resolve(process.cwd(), "src/pages/admin/ai/AIMonitorPage.tsx"),
  "utf8",
);
const configSource = readFileSync(
  resolve(process.cwd(), "src/pages/admin/ai/AIConfigPage.tsx"),
  "utf8",
);
const memorySource = readFileSync(
  resolve(process.cwd(), "src/pages/admin/ai/AdminAIMemoryPage.tsx"),
  "utf8",
);

describe("AdminAIHub — nested context fix", () => {
  describe("AIHubNestedContext", () => {
    it("esporta provider + hook", () => {
      expect(contextSource).toContain("export function AIHubNestedProvider");
      expect(contextSource).toContain("export function useAIHubNested");
    });

    it("expose isNested + navigateToSection", () => {
      expect(contextSource).toContain("isNested: boolean");
      expect(contextSource).toContain("navigateToSection?:");
    });

    it("default fuori dal provider → isNested=false", () => {
      expect(contextSource).toMatch(/createContext.*?\{\s*isNested: false/s);
    });
  });

  describe("AdminAIHub wraps sub-pages con provider", () => {
    it("wrappa il content con AIHubNestedProvider", () => {
      expect(hubSource).toContain("AIHubNestedProvider");
      expect(hubSource).toContain('navigateToSection={handleTabChange}');
    });

    it("disambigua le 3 'Memoria' nominandole diversamente", () => {
      // Outer section: "Memoria Clienti"
      expect(hubSource).toContain('label: "Memoria Clienti"');
      // Inner Operate sub-tab: "Memoria Admin"
      expect(operateSource).toContain('label: "Memoria Admin"');
    });
  });

  describe("Sub-pagine rispettano isNested", () => {
    it("AIOperatePage nasconde AIPageHeader quando nested", () => {
      expect(operateSource).toContain("const { isNested, navigateToSection } = useAIHubNested()");
      expect(operateSource).toContain("{!isNested && (\n        <AIPageHeader");
    });

    it("AIMonitorPage nasconde AIPageHeader quando nested", () => {
      expect(monitorSource).toContain("useAIHubNested");
      expect(monitorSource).toMatch(/!isNested && \(\s*<AIPageHeader/);
    });

    it("AIConfigPage nasconde AIPageHeader quando nested", () => {
      expect(configSource).toContain("useAIHubNested");
      expect(configSource).toMatch(/!isNested && \(\s*<AIPageHeader/);
    });

    it("AdminAIMemoryPage nasconde h1 + icon header quando nested", () => {
      expect(memorySource).toContain("useAIHubNested");
      expect(memorySource).toMatch(/!isNested && \(\s*<div className="flex items-start gap-3">/);
    });

    it("ogni sub-pagina rimuove padding outer quando nested", () => {
      // p-4 md:p-6 max-w-* viene applicato SOLO se !isNested
      [operateSource, monitorSource, configSource].forEach((src) => {
        expect(src).toMatch(/className=\{isNested \? "" : "p-4 md:p-6/);
      });
    });
  });

  describe("AIConfigPage tab state in URL", () => {
    it("usa useSearchParams invece di defaultValue", () => {
      expect(configSource).toContain("useSearchParams");
      // No più defaultValue="routing"
      expect(configSource).not.toContain('defaultValue="routing"');
      // Ora usa value + onValueChange
      expect(configSource).toContain("value={activeTab}");
      expect(configSource).toContain("onValueChange={handleTabChange}");
    });

    it("sync URL ↔ state via useEffect", () => {
      expect(configSource).toMatch(
        /useEffect\(\(\) => \{[\s\S]+?searchParams\.get\("tab"\)[\s\S]+?setActiveTab\(t\)/,
      );
    });
  });

  describe("Quick switch section senza redirect quando nested", () => {
    it("AIOperatePage espone bottoni navigateToSection invece di Link legacy", () => {
      expect(operateSource).toContain('onClick={() => navigateToSection("config")}');
      expect(operateSource).toContain('onClick={() => navigateToSection("monitor")}');
    });

    it("AIMonitorPage idem", () => {
      expect(monitorSource).toContain('onClick={() => navigateToSection("config")}');
      expect(monitorSource).toContain('onClick={() => navigateToSection("operate")}');
    });

    it("AIConfigPage idem", () => {
      expect(configSource).toContain('onClick={() => navigateToSection("monitor")}');
      expect(configSource).toContain('onClick={() => navigateToSection("operate")}');
    });
  });
});
