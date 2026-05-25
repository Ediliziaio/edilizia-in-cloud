import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const apiSource = readFileSync(
  resolve(process.cwd(), "src/lib/portalLearningApi.ts"),
  "utf8",
);

const migrationSource = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20270527000000_portal_admin_grants.sql",
  ),
  "utf8",
);

const adminUiSource = readFileSync(
  resolve(
    process.cwd(),
    "src/components/admin/portale/AdminPortaleDistributionBar.tsx",
  ),
  "utf8",
);

const portalPageSource = readFileSync(
  resolve(process.cwd(), "src/pages/azienda/personale/PortalePage.tsx"),
  "utf8",
);

describe("Portal Course Grants — contratto", () => {
  describe("API layer", () => {
    it("esporta le 3 funzioni grant CRUD", () => {
      expect(apiSource).toContain("export async function listPortalCourseGrants");
      expect(apiSource).toContain("export async function grantPortalCourseToCompanies");
      expect(apiSource).toContain("export async function revokePortalCourseFromCompanies");
    });

    it("PortalLearningCourse espone sourceType e ownerCompanyId", () => {
      expect(apiSource).toContain('sourceType?: "own" | "platform"');
      expect(apiSource).toContain("ownerCompanyId?: string");
    });

    it("mapCourse calcola sourceType confrontando company_id con viewer", () => {
      expect(apiSource).toContain('row.company_id === viewerCompanyId');
      expect(apiSource).toContain('"own"');
      expect(apiSource).toContain('"platform"');
    });

    it("listPortalCourses fa fallback a query stretta su company_id se RLS apre fallisce", () => {
      expect(apiSource).toContain('.eq("company_id", companyId)');
      // Pre-migration: RLS aperta non esiste ancora → fallback stretta
      expect(apiSource).toMatch(/fallback/i);
    });

    it("grantPortalCourseToCompanies chiama la RPC corretta", () => {
      expect(apiSource).toContain('"grant_admin_portal_course_to_companies"');
      expect(apiSource).toContain("p_source_course_id");
      expect(apiSource).toContain("p_target_company_ids");
    });

    it("revokePortalCourseFromCompanies chiama la RPC corretta", () => {
      expect(apiSource).toContain('"revoke_admin_portal_course_from_companies"');
    });
  });

  describe("Migration SQL", () => {
    it("crea la tabella portal_course_grants con UNIQUE per dedup", () => {
      expect(migrationSource).toContain("CREATE TABLE IF NOT EXISTS public.portal_course_grants");
      expect(migrationSource).toContain("UNIQUE (source_company_id, course_id, target_company_id)");
    });

    it("definisce status check (granted/revoked) per soft-delete", () => {
      expect(migrationSource).toMatch(/status\s+TEXT\s+NOT NULL DEFAULT 'granted'\s+CHECK \(status IN \('granted',\s*'revoked'\)\)/);
    });

    it("estende RLS dei portal_courses con clausola grant", () => {
      // La nuova policy USING include EXISTS su portal_course_grants
      expect(migrationSource).toContain("portal_courses_company_access");
      expect(migrationSource).toContain("portal_course_grants g");
      expect(migrationSource).toContain("g.status = 'granted'");
    });

    it("estende RLS anche per modules e assets", () => {
      expect(migrationSource).toContain("portal_modules_company_access");
      expect(migrationSource).toContain("portal_assets_company_access");
    });

    it("WITH CHECK rimane stretto (write block per corsi platform)", () => {
      // I corsi platform sono READ-ONLY per le aziende beneficiarie:
      // la WITH CHECK NON deve includere il grant, solo own + super_admin.
      const policyBlock = migrationSource.match(
        /CREATE POLICY "portal_courses_company_access"[\s\S]+?WITH CHECK[\s\S]+?\);/,
      )?.[0] ?? "";
      // Conta quante volte appare "portal_course_grants" nella USING vs nella WITH CHECK
      const usingPart = policyBlock.split("WITH CHECK")[0];
      const withCheckPart = policyBlock.split("WITH CHECK")[1] ?? "";
      expect(usingPart).toContain("portal_course_grants");
      expect(withCheckPart).not.toContain("portal_course_grants");
    });

    it("storage policy consente download dei materiali platform via grant", () => {
      expect(migrationSource).toContain("portal_materials_grant_read");
      expect(migrationSource).toContain("storage.foldername(name))[2]");
    });

    it("RPC grant è SECURITY DEFINER con check super_admin", () => {
      expect(migrationSource).toContain("CREATE OR REPLACE FUNCTION public.grant_admin_portal_course_to_companies");
      expect(migrationSource).toContain("SECURITY DEFINER");
      expect(migrationSource).toMatch(/has_role\(auth\.uid\(\),\s*'super_admin'/);
    });

    it("RPC grant usa upsert con riattivazione revoked → granted", () => {
      const grantBlock = migrationSource.match(
        /CREATE OR REPLACE FUNCTION public\.grant_admin_portal_course_to_companies[\s\S]+?\$\$;/,
      )?.[0] ?? "";
      expect(grantBlock).toContain("ON CONFLICT");
      expect(grantBlock).toContain("status = 'granted'");
      expect(grantBlock).toContain("revoked_at = NULL");
    });

    it("RPC revoke fa soft-delete (UPDATE status='revoked')", () => {
      const revokeBlock = migrationSource.match(
        /CREATE OR REPLACE FUNCTION public\.revoke_admin_portal_course_from_companies[\s\S]+?\$\$;/,
      )?.[0] ?? "";
      expect(revokeBlock).toContain("UPDATE public.portal_course_grants");
      expect(revokeBlock).toContain("status = 'revoked'");
    });

    it("VIEW portal_courses_available distingue own vs platform", () => {
      expect(migrationSource).toContain("CREATE OR REPLACE VIEW public.portal_courses_available");
      expect(migrationSource).toContain("'own'::text AS source_type");
      expect(migrationSource).toContain("'platform'::text AS source_type");
    });
  });

  describe("Admin UI", () => {
    it("ha tab 'Concedi accesso' + 'Già autorizzate'", () => {
      expect(adminUiSource).toContain('value="grant"');
      expect(adminUiSource).toContain('value="current"');
      expect(adminUiSource).toContain("Concedi accesso");
      expect(adminUiSource).toContain("Già autorizzate");
    });

    it("disabilita checkbox per aziende già autorizzate (no double-grant)", () => {
      expect(adminUiSource).toContain("alreadyGrantedIds");
      expect(adminUiSource).toContain("Già autorizzata");
    });

    it("ha bottone revoca per grants attivi", () => {
      expect(adminUiSource).toContain("revokeMutation");
      expect(adminUiSource).toContain("Revoca");
    });

    it("toast informativo se la migration RPC non è applicata", () => {
      expect(adminUiSource).toContain("grant_admin_portal_course");
      expect(adminUiSource).toContain("20270527000000_portal_admin_grants.sql");
    });
  });

  describe("Azienda UI — read-only enforcement", () => {
    it("PortalCourse espone sourceType propagato dall'API", () => {
      expect(portalPageSource).toContain('sourceType?: "own" | "platform"');
    });

    it("calcola isCourseReadOnly per gating UX", () => {
      expect(portalPageSource).toContain('selectedCourse?.sourceType === "platform"');
      expect(portalPageSource).toContain("isCourseReadOnly");
    });

    it("CourseCard mostra badge Piattaforma quando platform", () => {
      expect(portalPageSource).toContain('course.sourceType === "platform"');
      expect(portalPageSource).toContain("⚡ Piattaforma");
    });

    it("CourseBuilder disabilita Modulo/Materiale/Pubblica per platform", () => {
      // Tutti e 3 i bottoni hanno disabled={isPlatform}
      const builderBlock =
        portalPageSource.match(/function CourseBuilder\(\{[\s\S]+?^}\n/m)?.[0] ?? "";
      expect(builderBlock).toContain("isPlatform = course.sourceType ===");
      expect(builderBlock.match(/disabled={isPlatform}/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    });

    it("CourseDetailPanel disabilita Pubblica/Accessi per platform", () => {
      const detailBlock =
        portalPageSource.match(
          /function CourseDetailPanel\(\{[\s\S]+?^}\n/m,
        )?.[0] ?? "";
      expect(detailBlock).toContain("isPlatform = course?.sourceType ===");
      expect(detailBlock).toContain('disabled={isPlatform}');
    });

    it("persistCourse skippa il sync remoto per i corsi platform", () => {
      // Guardia client che blocca anche il network roundtrip
      expect(portalPageSource).toContain('if (course.sourceType === "platform") return;');
    });
  });
});
