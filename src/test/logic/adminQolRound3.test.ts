import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const auditLogSource = readFileSync(
  resolve(process.cwd(), "src/lib/admin/auditLog.ts"),
  "utf8",
);
const adminRoutesSource = readFileSync(
  resolve(process.cwd(), "src/routes/adminRoutes.tsx"),
  "utf8",
);
const approvalsSource = readFileSync(
  resolve(process.cwd(), "src/components/admin/silvio-hub/ApprovalsTab.tsx"),
  "utf8",
);

describe("Admin QoL — round 3 (non-invasive polish)", () => {
  describe("audit log detection refinement", () => {
    it("non matcha più 'non-2xx status code' generico (era over-matching)", () => {
      // Controllo l'arr di pattern: rimosso "non-2xx" che catturava anche 500/503 reali
      const detectorBlock =
        auditLogSource.match(/function isEdgeFunctionMissing[\s\S]+?^}/m)?.[0] ?? "";
      expect(detectorBlock).not.toContain('"non-2xx status code"');
    });

    it("usa status code numerico quando disponibile (404 only)", () => {
      const detectorBlock =
        auditLogSource.match(/function isEdgeFunctionMissing[\s\S]+?^}/m)?.[0] ?? "";
      expect(detectorBlock).toContain("status === 404");
    });

    it("estrae status da err.context.status (FunctionsHttpError)", () => {
      expect(auditLogSource).toContain("function extractStatus");
      expect(auditLogSource).toContain("context");
    });

    it("usa extractStatus sia in error branch che in catch branch", () => {
      // Due chiamate a extractStatus
      const calls = auditLogSource.match(/extractStatus\(/g) ?? [];
      expect(calls.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("404 catch-all admin", () => {
    it("adminRoutes registra path='*' come catch-all per NotFound stilizzato", () => {
      expect(adminRoutesSource).toContain('<Route path="*" element={<NotFound />} />');
    });

    it("NotFound lazy-loaded per non penalizzare il bundle admin", () => {
      expect(adminRoutesSource).toMatch(
        /const NotFound = lazy\(\(\) => import\("@\/pages\/NotFound"\)\)/,
      );
    });

    it("catch-all è L'ULTIMA route (dopo dunning-templates)", () => {
      const dunningIdx = adminRoutesSource.indexOf('path="dunning-templates"');
      const catchAllIdx = adminRoutesSource.indexOf('path="*" element={<NotFound');
      expect(dunningIdx).toBeGreaterThan(-1);
      expect(catchAllIdx).toBeGreaterThan(-1);
      expect(catchAllIdx).toBeGreaterThan(dunningIdx);
    });
  });

  describe("ApprovalsTab: `as never` cleanup nella RPC call", () => {
    it("rpc('silvio_admin_resolve_approval') no più 'as never' wrappers", () => {
      const rpcBlock = approvalsSource.match(
        /supabase\.rpc\("silvio_admin_resolve_approval"[\s\S]+?\);/,
      )?.[0] ?? "";
      expect(rpcBlock).not.toContain('as never');
    });

    it("RPC chiamata type-safe usa il nome funzione come literal string", () => {
      expect(approvalsSource).toContain('supabase.rpc("silvio_admin_resolve_approval"');
    });
  });
});
