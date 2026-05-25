import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  resolve(process.cwd(), "src/pages/admin/settings/AdminSettingsSuperAdmins.tsx"),
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
const invokerSource = readFileSync(
  resolve(process.cwd(), "src/lib/admin/invokeAdminFunction.ts"),
  "utf8",
);
const authTypes = readFileSync(
  resolve(process.cwd(), "src/types/auth.ts"),
  "utf8",
);

describe("AdminSettingsSuperAdmins — bugfix P0/P1", () => {
  describe("P0: tab state persisted in URL", () => {
    it("usa useSearchParams invece di defaultValue locale", () => {
      expect(pageSource).toContain('import { useSearchParams }');
      expect(pageSource).not.toContain('defaultValue="team"');
      expect(pageSource).toContain('searchParams.get("tab")');
    });

    it("definisce VALID_TABS per evitare accettazione di valori non validi", () => {
      expect(pageSource).toContain('VALID_TABS');
      expect(pageSource).toContain('"team"');
      expect(pageSource).toContain('"multi-company"');
    });

    it("usa AdminHeroHeader coerente con altri hub admin", () => {
      expect(pageSource).toContain("AdminHeroHeader");
      expect(pageSource).toContain('title="Gestione Utenti Piattaforma"');
    });
  });

  describe("P0: roleCounts mutually exclusive", () => {
    it("definisce getPrimaryRole con precedenza super_admin", () => {
      expect(platformTeamSource).toContain("function getPrimaryRole");
      // super_admin checkato prima di find su PLATFORM_ROLES
      const fn = platformTeamSource.match(/function getPrimaryRole[\s\S]+?^}\n/m)?.[0] ?? "";
      const superAdminIdx = fn.indexOf('"super_admin"');
      const platformRolesIdx = fn.indexOf("PLATFORM_ROLES");
      expect(superAdminIdx).toBeGreaterThan(-1);
      expect(platformRolesIdx).toBeGreaterThan(-1);
      expect(superAdminIdx).toBeLessThan(platformRolesIdx);
    });

    it("roleCounts usa tally con primary role (no double-count)", () => {
      expect(platformTeamSource).toContain("getPrimaryRole(u.roles)");
      // Non deve più usare il vecchio pattern .filter().length per stat card
      expect(platformTeamSource).not.toContain("rc.role === \"super_admin\"\n        ? u.roles.includes(\"super_admin\")");
    });
  });

  describe("P0: reset password con fallback a legacy edge fn", () => {
    it("PlatformTeamTab tenta manage-platform-users PRIMA della legacy", () => {
      const resetBlock = platformTeamSource.match(
        /resetMutation = useMutation\(\{[\s\S]+?onError:[\s\S]+?\}\);/,
      )?.[0] ?? "";
      const newIdx = resetBlock.indexOf("manage-platform-users");
      const legacyIdx = resetBlock.indexOf("manage-super-admins");
      expect(newIdx).toBeGreaterThan(-1);
      expect(legacyIdx).toBeGreaterThan(-1);
      expect(newIdx).toBeLessThan(legacyIdx);
    });

    it("MultiCompanyUsersTab applica lo stesso fallback", () => {
      const resetBlock = multiCompanySource.match(
        /resetMutation = useMutation\(\{[\s\S]+?onError:[\s\S]+?\}\);/,
      )?.[0] ?? "";
      expect(resetBlock).toContain("manage-platform-users");
      expect(resetBlock).toContain("manage-super-admins");
    });

    it("detecta correttamente l'errore 'unknown action' come fallback trigger", () => {
      // Sia in platformTeam che multiCompany
      [platformTeamSource, multiCompanySource].forEach((src) => {
        expect(src).toContain("isUnknownAction");
        expect(src).toContain("unknown action");
        expect(src).toContain("not implemented");
      });
    });
  });

  describe("P1: invokeAdminFunction helper centralizza l'errore handling", () => {
    it("esporta la funzione + AdminFunctionError class", () => {
      expect(invokerSource).toContain("export async function invokeAdminFunction");
      expect(invokerSource).toContain("export class AdminFunctionError");
    });

    it("usa safeJsonParse per evitare reject su body non-JSON", () => {
      expect(invokerSource).toContain("safeJsonParse");
      // try/catch sopra ctx.json() per non lanciare su parse fail
      const fn = invokerSource.match(/async function safeJsonParse[\s\S]+?^}/m)?.[0] ?? "";
      expect(fn).toContain("try {");
      expect(fn).toContain("catch");
    });

    it("gestisce sia res.error che res.data.error", () => {
      expect(invokerSource).toContain("if (res.error)");
      expect(invokerSource).toMatch(/"error" in[\s\S]+?res\.data/);
    });

    it("aggiunge automaticamente Authorization Bearer", () => {
      expect(invokerSource).toContain("Authorization: `Bearer");
      expect(invokerSource).toContain("supabase.auth.getSession");
    });

    it("PlatformTeamTab usa invokeAdminFunction (no più invoke diretto)", () => {
      expect(platformTeamSource).toContain('import { invokeAdminFunction }');
      // No più del pattern duplicato
      expect(platformTeamSource).not.toContain('supabase.functions.invoke("manage-platform-users"');
    });

    it("MultiCompanyUsersTab usa invokeAdminFunction (no più invoke diretto)", () => {
      expect(multiCompanySource).toContain('import { invokeAdminFunction }');
      expect(multiCompanySource).not.toContain('supabase.functions.invoke("manage-platform-users"');
    });
  });

  describe("P1: race condition removingCompanyIds (Set)", () => {
    it("removingCompanyIds è ora Set<string>, non string singola", () => {
      expect(multiCompanySource).toContain("removingCompanyIds, setRemovingCompanyIds] = useState<Set<string>>");
      expect(multiCompanySource).toContain("updatingRoleCompanyIds, setUpdatingRoleCompanyIds] = useState<Set<string>>");
    });

    it("ha helper trackBusy che muta il Set in modo immutabile", () => {
      expect(multiCompanySource).toContain("trackBusy");
      const fn = multiCompanySource.match(/const trackBusy =[\s\S]+?\}\);/)?.[0] ?? "";
      expect(fn).toContain("new Set(prev)");
    });

    it("celebrazione concorrente OK: ha.has(companyId) per per-row spinner", () => {
      expect(multiCompanySource).toContain("removingCompanyIds.has(a.company_id)");
      expect(multiCompanySource).toContain("updatingRoleCompanyIds.has(a.company_id)");
    });
  });

  describe("P1: super_admin color centralizzato", () => {
    it("auth.ts esporta SUPER_ADMIN_LABEL e SUPER_ADMIN_COLOR", () => {
      expect(authTypes).toContain("export const SUPER_ADMIN_LABEL");
      expect(authTypes).toContain("export const SUPER_ADMIN_COLOR");
    });

    it("PlatformTeamTab non hardcoda più bg-red-100 per super_admin", () => {
      // L'oggetto ROLE_STAT_CARDS adesso usa SUPER_ADMIN_COLOR/LABEL
      expect(platformTeamSource).toContain("SUPER_ADMIN_LABEL");
      expect(platformTeamSource).toContain("SUPER_ADMIN_COLOR");
      // Il badge inline nel render del ruolo NON ha più la classe hardcoded
      expect(platformTeamSource).not.toMatch(/className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">Super Admin</);
    });
  });

  describe("P1: empty state 'pulisci ricerca' coerente nei due tab", () => {
    it("PlatformTeamTab ha bottone 'Pulisci ricerca'", () => {
      const noResultsBlock =
        platformTeamSource.match(/filteredUsers\.length === 0 \? \([\s\S]+?\) : \(/)?.[0] ?? "";
      expect(noResultsBlock).toContain("Pulisci ricerca");
    });

    it("MultiCompanyUsersTab ha bottone 'Pulisci ricerca'", () => {
      // Il blocco filteredUsers.length === 0 ora è una <div> con Button
      expect(multiCompanySource).toMatch(/filteredUsers\.length === 0[\s\S]+?Pulisci ricerca/);
    });
  });

  describe("P2: search filter sui ruoli + aziende accessibili", () => {
    it("filteredUsers MultiCompany matcha anche su azienda accessibile", () => {
      const fn =
        multiCompanySource.match(/filteredUsers = useMemo\([\s\S]+?\}, \[users, userSearch\]\)/)?.[0] ?? "";
      expect(fn).toContain("u.accesses.some");
      expect(fn).toContain("a.companies?.name");
    });

    it("filteredAccesses MultiCompany matcha anche su role label", () => {
      const fn =
        multiCompanySource.match(/filteredAccesses = useMemo\([\s\S]+?\}, \[activeUser, accessSearch\]\)/)?.[0] ?? "";
      expect(fn).toContain("ACCESS_ROLE_LABELS");
    });

    it("threshold search aziende abbassata da > 5 a > 1", () => {
      expect(multiCompanySource).toContain("activeUser.accesses.length > 1");
      expect(multiCompanySource).not.toContain("activeUser.accesses.length > 5");
    });
  });

  describe("P2: DELETE invalida anche admin-companies-summary", () => {
    it("MultiCompanyUsersTab delete mutation invalida companies summary", () => {
      const deleteBlock =
        multiCompanySource.match(/deleteMutation = useMutation\([\s\S]+?onError:[\s\S]+?\}\);/)?.[0] ?? "";
      expect(deleteBlock).toContain('"admin-companies-summary"');
    });
  });
});
