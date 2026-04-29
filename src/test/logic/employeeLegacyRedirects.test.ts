import { describe, expect, it } from "vitest";
import { EMPLOYEE_LEGACY_REDIRECTS } from "@/routes/employeeLegacyRedirects";

describe("employee legacy redirects", () => {
  it("mantiene i deep link /dipendente verso il portale campo", () => {
    expect(EMPLOYEE_LEGACY_REDIRECTS).toEqual({
      root: "/campo",
      ore: "/campo/timbratura",
      rapportini: "/campo",
      profilo: "/campo/profilo",
      ferie: "/campo/ferie",
      fallback: "/campo",
    });
  });
});
