import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const emptyStateSource = readFileSync(
  resolve(process.cwd(), "src/components/ui/empty-state.tsx"),
  "utf8",
);
const platformTeamSource = readFileSync(
  resolve(process.cwd(), "src/components/admin/settings/PlatformTeamTab.tsx"),
  "utf8",
);
const multiCompanySource = readFileSync(
  resolve(process.cwd(), "src/components/admin/settings/MultiCompanyUsersTab.tsx"),
  "utf8",
);
const companyLayoutSource = readFileSync(
  resolve(process.cwd(), "src/components/layouts/CompanyLayout.tsx"),
  "utf8",
);
const paletteSource = readFileSync(
  resolve(process.cwd(), "src/components/admin/AdminCommandPalette.tsx"),
  "utf8",
);
const bottomNavSource = readFileSync(
  resolve(process.cwd(), "src/components/admin/AdminBottomNav.tsx"),
  "utf8",
);

describe("Admin QoL improvements — round 1", () => {
  describe("EmptyState component v2", () => {
    it("espone prop tone, size, action.icon, className", () => {
      expect(emptyStateSource).toContain('tone?: "neutral" | "warning" | "error" | "success"');
      expect(emptyStateSource).toContain('size?: "sm" | "md" | "lg"');
      expect(emptyStateSource).toContain("icon?: LucideIcon");
      expect(emptyStateSource).toContain("className?: string");
    });

    it("aggiunge aria-live='polite' per screen reader", () => {
      expect(emptyStateSource).toContain('aria-live="polite"');
    });

    it("backward-compat: `inline` ancora supportato", () => {
      expect(emptyStateSource).toContain("inline?: boolean");
      expect(emptyStateSource).toContain("inline = false");
    });

    it("PlatformTeamTab usa EmptyState per la search vuota", () => {
      expect(platformTeamSource).toContain('import { EmptyState }');
      expect(platformTeamSource).toContain("Pulisci ricerca");
      // No più div+button manuale
      expect(platformTeamSource).not.toContain(
        '<div className="flex flex-col items-center gap-2 py-8 text-center">',
      );
    });

    it("MultiCompanyUsersTab usa EmptyState per la search vuota", () => {
      expect(multiCompanySource).toContain('import { EmptyState }');
      expect(multiCompanySource).not.toContain(
        '<div className="flex flex-col items-center gap-2 py-6 text-center">',
      );
    });
  });

  describe("Impersonation banner persistente", () => {
    it("ImpersonationBanner è sticky top-0", () => {
      expect(companyLayoutSource).toMatch(
        /ImpersonationBanner = memo[\s\S]+?className="sticky top-0 z-50/,
      );
    });

    it("usa AlertTriangle con animate-pulse per attirare l'attenzione", () => {
      const bannerBlock =
        companyLayoutSource.match(/ImpersonationBanner = memo[\s\S]+?return null;[\s\S]+?<\/div>\s*\)/)?.[0] ?? "";
      expect(bannerBlock).toContain("animate-pulse");
    });
  });

  describe("Command Palette aggiornata agli hub", () => {
    it("punta a /admin/fatturato (hub) invece di route legacy", () => {
      expect(paletteSource).toContain('"/admin/fatturato"');
      expect(paletteSource).toContain('"/admin/fatturato?tab=piani"');
      expect(paletteSource).toContain('"/admin/fatturato?tab=fatture"');
    });

    it("punta a /admin/ai (hub) per tutte le sub-section AI", () => {
      expect(paletteSource).toContain('"/admin/ai"');
      expect(paletteSource).toContain('"/admin/ai?section=monitor"');
      expect(paletteSource).toContain('"/admin/ai?section=config"');
      expect(paletteSource).toContain('"/admin/ai?section=memoria"');
    });

    it("punta a /admin/cs hub per assistenza/lifecycle/onboarding/playbook", () => {
      expect(paletteSource).toContain('"/admin/cs"');
      expect(paletteSource).toContain('"/admin/cs?tab=assistenza"');
      expect(paletteSource).toContain('"/admin/cs?tab=lifecycle"');
    });

    it("ha la voce Portale Formazione", () => {
      expect(paletteSource).toContain('"/admin/portale-formazione"');
    });

    it("permission filter aggiornato agli hub URL", () => {
      // Vecchio filter "action.href === '/admin/ticket'" sostituito con startsWith
      expect(paletteSource).not.toContain("'/admin/ticket'");
      expect(paletteSource).toContain('action.href.startsWith("/admin/fatturato"');
      expect(paletteSource).toContain('action.href.startsWith("/admin/ai"');
      expect(paletteSource).toContain('action.href.startsWith("/admin/operazioni"');
    });
  });

  describe("Bottom nav mobile aggiornata", () => {
    it('non punta più a "/admin/ticket" legacy', () => {
      expect(bottomNavSource).not.toContain('href: "/admin/ticket"');
    });

    it("usa /admin/cs?tab=assistenza per la voce Assistenza", () => {
      expect(bottomNavSource).toContain('href: "/admin/cs?tab=assistenza"');
    });

    it("ha la voce AI come voce primary mobile", () => {
      expect(bottomNavSource).toContain('label: "AI"');
      expect(bottomNavSource).toContain('href: "/admin/ai"');
    });

    it("supporta matchPrefixes per active state su URL con query string", () => {
      expect(bottomNavSource).toContain("matchPrefixes");
      // Per Assistenza accetta sia /admin/cs che legacy /admin/ticket
      expect(bottomNavSource).toMatch(/matchPrefixes:\s*\["\/admin\/cs",\s*"\/admin\/ticket"\]/);
    });

    it("isActive() gestisce query string correttamente", () => {
      expect(bottomNavSource).toContain("item.href.split(\"?\")[0]");
    });
  });
});
