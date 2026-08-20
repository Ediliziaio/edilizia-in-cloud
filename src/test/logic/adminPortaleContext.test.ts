import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const portalPageSource = readFileSync(
  resolve(process.cwd(), "src/pages/azienda/personale/PortalePage.tsx"),
  "utf8",
);
const adminWrapperSource = readFileSync(
  resolve(process.cwd(), "src/pages/admin/AdminPortalePage.tsx"),
  "utf8",
);

describe("AdminPortalePage / PortalePage admin context", () => {
  describe("portalContext prop", () => {
    it("PortalePage espone portalContext prop con default 'azienda'", () => {
      expect(portalPageSource).toContain("portalContext?: \"azienda\" | \"admin\"");
      expect(portalPageSource).toContain('portalContext = "azienda"');
    });

    it("calcola isAdminContext derivato dal prop", () => {
      expect(portalPageSource).toContain('isAdminContext = portalContext === "admin"');
    });

    it("AdminPortalePage passa portalContext='admin' al child", () => {
      expect(adminWrapperSource).toContain('portalContext="admin"');
    });
  });

  describe("seed cantiere disabilitato in admin", () => {
    it("useState courses parte da [] in admin (no defaultCourses)", () => {
      expect(portalPageSource).toMatch(
        /useState<PortalCourse\[\]>\([\s\S]+?isAdminContext \? \[\] : loadCourses/,
      );
    });

    it("effetto fetch remote skippa seed quando DB vuoto in admin", () => {
      expect(portalPageSource).toContain("if (isAdminContext) return;");
      // Il commento spiega esplicitamente il bug fix
      expect(portalPageSource).toContain("NON seediamo i corsi cantiere");
    });

    it("effetto localStorage skippa scrittura in admin", () => {
      // Single source of truth: DB Supabase
      const ls = portalPageSource.match(
        /if \(isAdminContext\) return;[\s\S]+?localStorage\.setItem/m,
      );
      expect(ls).not.toBeNull();
    });
  });

  describe("hero header non duplicato", () => {
    it("hero PortalePage condizionale via !isAdminContext", () => {
      // Il blocco hero "Portale · Beta operativa · Sync Supabase" è wrapped
      // in {!isAdminContext && (...)}
      expect(portalPageSource).toContain("{!isAdminContext && (");
      // Sotto deve esserci il GraduationCap dell'hero
      const heroBlock =
        portalPageSource.match(/\{!isAdminContext && \(\s*<div className="flex items-start gap-4">[\s\S]+?Sync Supabase/)?.[0] ?? "";
      expect(heroBlock).toContain("Sync Supabase");
    });
  });

  describe("tab azienda-edile nascoste in admin", () => {
    // 2026-08: la condizione inline {!isAdminContext && (...)} e' diventata la
    // variabile showAuthoringMgmt (commit "Formazione: ri-allocazione tab").
    // La protezione non e' sparita, si e' spostata — ed e' anche piu' stretta,
    // perche' ora richiede pure mode === "builder". Il test verifica la
    // sostanza (i tab d'azienda restano fuori dall'admin) invece della forma.
    it("showAuthoringMgmt esclude l'admin", () => {
      expect(portalPageSource).toContain("showAuthoringMgmt = !isAdminContext");
    });

    it("tab Procedure/Accessi/Persone gated da showAuthoringMgmt", () => {
      const tabsBlock =
        portalPageSource.match(/\{showAuthoringMgmt && \(\s*<>\s*<TabsTrigger value="procedure"[\s\S]+?Persone[\s\S]+?<\/>\s*\)\}/)?.[0] ?? "";
      expect(tabsBlock).not.toBe("");
      expect(tabsBlock).toContain('value="procedure"');
      expect(tabsBlock).toContain('value="accessi"');
      expect(tabsBlock).toContain('value="persone"');
    });

    it("tab Corsi / Builder / Pagina utente restano sempre visibili", () => {
      // Questi 3 tab vengono renderizzati fuori dal blocco condizionale
      // {!isAdminContext && (...)} dei tab azienda-edile.
      // Il TabsList contiene tutti i tab in ordine: corsi → builder →
      // (cond: procedure, accessi, persone) → preview.
      const tabsListBlock =
        portalPageSource.match(/<TabsList[\s\S]+?<\/TabsList>/)?.[0] ?? "";
      expect(tabsListBlock).toContain('value="corsi"');
      expect(tabsListBlock).toContain('value="builder"');
      expect(tabsListBlock).toContain('value="preview"');
      // I tab condizionali sono dentro la TabsList, dietro showAuthoringMgmt
      expect(tabsListBlock).toContain("{showAuthoringMgmt && (");
    });
  });

  describe("AdminPortaleDistributionBar gated su has-courses", () => {
    it("la barra grants è mostrata solo se hasCourses=true", () => {
      expect(adminWrapperSource).toContain("hasCourses");
      expect(adminWrapperSource).toContain("{hasCourses && <AdminPortaleDistributionBar");
    });

    it("query counts portal_courses scopata su PLATFORM_ADMIN", () => {
      expect(adminWrapperSource).toContain("PLATFORM_ADMIN_COMPANY_ID");
      expect(adminWrapperSource).toContain('queryKey: ["admin-portale-has-courses"]');
    });
  });

  describe("subtitle non azienda-edile", () => {
    it("AdminHeroHeader subtitle non menziona cantiere/serramenti", () => {
      const heroBlock =
        adminWrapperSource.match(/AdminHeroHeader[\s\S]+?\/>/)?.[0] ?? "";
      expect(heroBlock.toLowerCase()).not.toContain("cantiere");
      expect(heroBlock.toLowerCase()).not.toContain("dpi");
      // OK menzionare "aziende clienti" come destinatari
      expect(heroBlock).toContain("aziende clienti");
    });
  });
});
