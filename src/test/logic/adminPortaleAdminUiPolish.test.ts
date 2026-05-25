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

describe("Admin Portale — UI polish round 3", () => {
  describe("hasCourses refresh più reattivo", () => {
    it("staleTime ridotto a 5s + refetchInterval 15s in background", () => {
      expect(adminWrapperSource).toContain("staleTime: 5_000");
      expect(adminWrapperSource).toContain("refetchInterval: 15_000");
    });

    it("refetchOnWindowFocus: true → torno sul tab e vedo subito", () => {
      expect(adminWrapperSource).toContain("refetchOnWindowFocus: true");
    });
  });

  describe("CourseDetailPanel: audience UI gated in admin", () => {
    it("CourseDetailPanel accetta hideAudienceUi prop", () => {
      expect(portalPageSource).toContain("hideAudienceUi?: boolean");
      expect(portalPageSource).toContain("hideAudienceUi = false");
    });

    it("passato true da AdminPortalePage via isAdminContext", () => {
      expect(portalPageSource).toMatch(/<CourseDetailPanel[\s\S]+?hideAudienceUi=\{isAdminContext\}/);
    });

    it("bottone 'Accessi' wrapped in {!hideAudienceUi}", () => {
      // Il button apre il dialog azienda audience — non senso in admin
      expect(portalPageSource).toMatch(
        /\{!hideAudienceUi && \(\s*<Button variant="outline" onClick=\{onOpenAccess\}/,
      );
    });

    it("InfoTile 'Accesso' wrapped in {!hideAudienceUi}", () => {
      expect(portalPageSource).toMatch(
        /\{!hideAudienceUi && \(\s*<InfoTile label="Accesso"/,
      );
    });

    it("grid cols ridotto a grid-cols-3 quando InfoTile Accesso nascosto", () => {
      expect(portalPageSource).toContain(
        'cn("mt-5 grid gap-3", hideAudienceUi ? "grid-cols-3" : "grid-cols-2")',
      );
    });
  });

  describe("Dialog 'Crea corso': Audience select nascosta in admin", () => {
    it("select audience wrapped in {!isAdminContext}", () => {
      expect(portalPageSource).toMatch(
        /\{!isAdminContext && \(\s*<div className="space-y-2">\s*<label className="text-sm font-medium text-slate-700">Accesso<\/label>/,
      );
    });
  });
});
