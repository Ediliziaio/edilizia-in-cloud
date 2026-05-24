import { describe, expect, it } from "vitest";
import { COMPANY_APP_HOME, getRoleHomePath } from "@/lib/auth/appHome";

describe("company app home redirects", () => {
  it("porta gli accessi aziendali alla pagina Attivita", () => {
    expect(COMPANY_APP_HOME).toBe("/azienda/attivita");
    expect(getRoleHomePath("company_admin")).toBe("/azienda/attivita");
    expect(getRoleHomePath("company_staff")).toBe("/azienda/attivita");
    expect(getRoleHomePath("call_center")).toBe("/azienda/attivita");
    expect(getRoleHomePath("multi_company_user")).toBe("/azienda/attivita");
  });

  it("mantiene separate le altre aree operative", () => {
    expect(getRoleHomePath("super_admin")).toBe("/admin");
    expect(getRoleHomePath("platform_support")).toBe("/admin");
    expect(getRoleHomePath("customer")).toBe("/cliente");
    expect(getRoleHomePath("employee")).toBe("/campo");
    expect(getRoleHomePath("subcontractor")).toBe("/campo");
    expect(getRoleHomePath("salesperson")).toBe("/venditore");
    expect(getRoleHomePath("referrer")).toBe("/partner");
  });
});
