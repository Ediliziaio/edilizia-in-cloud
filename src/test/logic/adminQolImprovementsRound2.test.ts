import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const hubTabsSource = readFileSync(
  resolve(process.cwd(), "src/components/admin/AdminHubTabs.tsx"),
  "utf8",
);
const fatturatoSource = readFileSync(
  resolve(process.cwd(), "src/pages/admin/fatturato/AdminFatturatoHub.tsx"),
  "utf8",
);
const csHubSource = readFileSync(
  resolve(process.cwd(), "src/pages/admin/cs/AdminCustomerSuccessHub.tsx"),
  "utf8",
);
const aiHubSource = readFileSync(
  resolve(process.cwd(), "src/pages/admin/ai/AdminAIHub.tsx"),
  "utf8",
);
const opHubSource = readFileSync(
  resolve(process.cwd(), "src/pages/admin/operazioni/AdminOperazioniHub.tsx"),
  "utf8",
);
const superAdminsSource = readFileSync(
  resolve(process.cwd(), "src/pages/admin/settings/AdminSettingsSuperAdmins.tsx"),
  "utf8",
);
const notFoundSource = readFileSync(
  resolve(process.cwd(), "src/pages/NotFound.tsx"),
  "utf8",
);
const auditLogSource = readFileSync(
  resolve(process.cwd(), "src/lib/admin/auditLog.ts"),
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
const confirmDialogSource = readFileSync(
  resolve(process.cwd(), "src/components/admin/ConfirmWithPasswordDialog.tsx"),
  "utf8",
);
const distributionBarSource = readFileSync(
  resolve(
    process.cwd(),
    "src/components/admin/portale/AdminPortaleDistributionBar.tsx",
  ),
  "utf8",
);
const tourSource = readFileSync(
  resolve(process.cwd(), "src/components/admin/AdminFirstRunTour.tsx"),
  "utf8",
);
const adminLayoutSource = readFileSync(
  resolve(process.cwd(), "src/components/layouts/AdminLayout.tsx"),
  "utf8",
);

describe("Admin QoL improvements — round 2", () => {
  describe("AdminHubTabs riusato in 5 hub admin", () => {
    it("esporta componente generic + AdminHubTab type", () => {
      expect(hubTabsSource).toContain("export function AdminHubTabs<TId extends string>");
      expect(hubTabsSource).toContain("export interface AdminHubTab<TId");
    });

    it("ha a11y: role=tablist, aria-selected, tabIndex", () => {
      expect(hubTabsSource).toContain('role="tab"');
      expect(hubTabsSource).toContain('role="tablist"');
      expect(hubTabsSource).toContain("aria-selected");
      expect(hubTabsSource).toContain("tabIndex={isActive ? 0 : -1}");
    });

    it("supporta badge inline con tone", () => {
      expect(hubTabsSource).toContain("badge?: number | null");
      expect(hubTabsSource).toContain("badgeTone?:");
    });

    it("AdminFatturatoHub usa AdminHubTabs (DRY)", () => {
      expect(fatturatoSource).toContain('import { AdminHubTabs');
      // Niente più <nav role="tablist"> inline (è dentro il component ora)
      expect(fatturatoSource).not.toContain('aria-label="Sezioni fatturato"\n          >');
    });

    it("AdminCustomerSuccessHub usa AdminHubTabs", () => {
      expect(csHubSource).toContain('import { AdminHubTabs');
    });

    it("AdminAIHub usa AdminHubTabs", () => {
      expect(aiHubSource).toContain('import { AdminHubTabs');
    });

    it("AdminOperazioniHub usa AdminHubTabs", () => {
      expect(opHubSource).toContain('import { AdminHubTabs');
    });

    it("AdminSettingsSuperAdmins usa AdminHubTabs", () => {
      expect(superAdminsSource).toContain('import { AdminHubTabs');
    });
  });

  describe("NotFound stilizzato context-aware", () => {
    it("rileva area dall'URL (admin/azienda/campo/public)", () => {
      expect(notFoundSource).toContain('"admin" | "azienda" | "campo" | "public"');
      expect(notFoundSource).toContain('startsWith("/admin")');
    });

    it("mostra suggerimenti contestuali per area", () => {
      expect(notFoundSource).toContain('"Dashboard Admin"');
      expect(notFoundSource).toContain('"Dashboard Azienda"');
      expect(notFoundSource).toContain("Forse cercavi");
    });

    it("preserva noindex SEO fix v8.6.47", () => {
      expect(notFoundSource).toContain("noindex: true");
    });

    it("CTA 'Indietro' usa window.history.back", () => {
      expect(notFoundSource).toContain("window.history.back()");
    });
  });

  describe("Audit log helper + integrazione azioni distruttive", () => {
    it("logAdminAuditAction è fail-silent", () => {
      expect(auditLogSource).toContain("export async function logAdminAuditAction");
      // Try/catch wrapping + log warn invece di throw
      expect(auditLogSource).toMatch(/try\s*\{[\s\S]+?catch[\s\S]+?logger\.warn/);
    });

    it("PlatformTeamTab logga delete utente", () => {
      expect(platformTeamSource).toContain('"platform_user.delete"');
      expect(platformTeamSource).toContain("logAdminAuditAction");
    });

    it("PlatformTeamTab logga reset password", () => {
      expect(platformTeamSource).toContain('"platform_user.reset_password"');
    });

    it("MultiCompanyUsersTab logga delete + revoke access", () => {
      expect(multiCompanySource).toContain('"multi_company_user.delete"');
      expect(multiCompanySource).toContain('"multi_company_access.revoke"');
    });

    it("AdminPortaleDistributionBar logga grant.bulk e grant.revoke", () => {
      expect(distributionBarSource).toContain('"portal_course.grant.bulk"');
      expect(distributionBarSource).toContain('"portal_course.grant.revoke"');
    });
  });

  describe("Re-auth password prima di azioni distruttive", () => {
    it("ConfirmWithPasswordDialog esiste + usa signInWithPassword come re-validation", () => {
      expect(confirmDialogSource).toContain("export function ConfirmWithPasswordDialog");
      expect(confirmDialogSource).toContain("signInWithPassword");
    });

    it("PlatformTeamTab usa ConfirmWithPasswordDialog per delete", () => {
      expect(platformTeamSource).toContain("ConfirmWithPasswordDialog");
      // Niente più vecchio AlertDialog con "Rimuovere dal team?"
      expect(platformTeamSource).not.toContain('<AlertDialogTitle>Rimuovere dal team?</AlertDialogTitle>');
    });

    it("MultiCompanyUsersTab usa ConfirmWithPasswordDialog per delete utente", () => {
      expect(multiCompanySource).toContain("ConfirmWithPasswordDialog");
      // Il vecchio AlertDialog per delete (non quello del remove access) sostituito
      expect(multiCompanySource).not.toContain('<AlertDialogTitle>Rimuovere utente multi-azienda?</AlertDialogTitle>');
    });

    it("dialog ha autoFocus su password + Enter per submit", () => {
      expect(confirmDialogSource).toContain("autoFocus");
      expect(confirmDialogSource).toMatch(/onKeyDown[\s\S]+?Enter[\s\S]+?handleConfirm/);
    });
  });

  describe("First run tour platform_manager", () => {
    it("è scoped per user_id (localStorage key)", () => {
      expect(tourSource).toContain("TOUR_STORAGE_KEY_PREFIX");
      expect(tourSource).toContain("eic-admin-first-run-tour-done:");
    });

    it("filtra solo platform_* member (no super_admin)", () => {
      expect(tourSource).toContain('"platform_manager"');
      expect(tourSource).toContain('"platform_sales"');
      expect(tourSource).toContain('"platform_support"');
    });

    it("ha 4 step (Welcome, Aziende, AI, Cmd+K)", () => {
      expect(tourSource).toContain("Benvenuto nel team");
      expect(tourSource).toContain("Aziende — la tua lista clienti");
      expect(tourSource).toContain("AI — il cervello operativo");
      expect(tourSource).toContain("⌘K — la scorciatoia magica");
    });

    it("è mounted in AdminLayout (desktop)", () => {
      expect(adminLayoutSource).toContain("AdminFirstRunTour");
    });
  });
});
