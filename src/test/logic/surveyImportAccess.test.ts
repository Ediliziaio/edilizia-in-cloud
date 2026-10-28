import { describe, it, expect, vi } from "vitest";
import { canImportSurvey } from "../../../supabase/functions/_shared/surveyImportAccess";
describe("Endpoint importazione: autorizzazione prima di scritture privilegiate", () => {
  it("richiede entrambi i permessi e non sola lettura", async () => {
    const rpc = vi.fn(async (name: string) => ({
      data: name === "has_permission_for_company",
      error: null,
    }));
    expect(await canImportSurvey({ rpc }, "user", "company")).toBe(true);
    expect(rpc).toHaveBeenCalledWith("has_permission_for_company", {
      _user_id: "user",
      _permission: "can_edit_preventivi",
      _company_id: "company",
    });
  });
  it.each(["operator", "readonly", "error", "unknown"])(
    "nega accesso %s",
    async (mode) => {
      const rpc = vi.fn(async (name: string) => ({
        data:
          mode === "unknown"
            ? null
            : name === "utente_sola_lettura"
              ? mode === "readonly"
              : mode !== "operator",
        error: mode === "error" ? new Error("network") : null,
      }));
      expect(await canImportSurvey({ rpc }, "user", "company")).toBe(false);
    },
  );
  it("non interroga privilegi senza identità o azienda", async () => {
    const rpc = vi.fn();
    expect(await canImportSurvey({ rpc }, "", "company")).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });
});
