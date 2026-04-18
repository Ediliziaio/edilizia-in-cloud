/**
 * Integration-style test — simula la pipeline di filtro ruolo di AuthContext.
 *
 * Riproduce il comportamento esatto di fetchUserData al passo "determina
 * effectiveRole" in AuthContext.tsx, senza dover montare il componente React
 * né mockare l'intero client Supabase.
 *
 * Se questi test passano, demo@azienda.srl NON può ottenere super_admin
 * anche se nel DB c'è la riga corrispondente.
 */
import { describe, it, expect } from "vitest";
import { isSuperAdminEmailAllowed } from "@/config/superAdmin";
import type { AppRole } from "@/types/auth";

// ──────────────────────────────────────────────────────────────────────
// Repro della logica in src/contexts/AuthContext.tsx (fetchUserData)
// ──────────────────────────────────────────────────────────────────────
function computeEffectiveRole(
  dbRoles: AppRole[],
  userEmail: string | null | undefined,
): AppRole | null {
  const rolePriority: AppRole[] = [
    "super_admin",
    "platform_manager",
    "platform_sales",
    "platform_support",
    "platform_marketing",
    "platform_implementation",
    "multi_company_user",
    "referrer",
    "salesperson",
    "call_center",
    "company_admin",
    "employee",
    "subcontractor",
    "company_staff",
    "customer",
  ];

  let userRoles = [...dbRoles];

  // Defense-in-depth layer (AuthContext.fetchUserData)
  if (userRoles.includes("super_admin") && !isSuperAdminEmailAllowed(userEmail)) {
    userRoles = userRoles.filter((r) => r !== "super_admin");
  }

  return rolePriority.find((r) => userRoles.includes(r)) || userRoles[0] || null;
}

describe("AuthContext — filtro super_admin allowlist (fetchUserData sim)", () => {
  it("flo.andriciuc@gmail.com con super_admin DB → resta super_admin", () => {
    expect(
      computeEffectiveRole(["super_admin"], "flo.andriciuc@gmail.com"),
    ).toBe("super_admin");
  });

  it("flo.andriciuc@gmail.com (uppercase) con super_admin DB → resta super_admin", () => {
    expect(
      computeEffectiveRole(["super_admin"], "FLO.ANDRICIUC@GMAIL.COM"),
    ).toBe("super_admin");
  });

  it("demo@azienda.srl con super_admin DB → rimosso, fallback company_admin", () => {
    expect(
      computeEffectiveRole(["super_admin", "company_admin"], "demo@azienda.srl"),
    ).toBe("company_admin");
  });

  it("demo@azienda.srl con SOLO super_admin DB → rimosso, role null (bloccato)", () => {
    expect(computeEffectiveRole(["super_admin"], "demo@azienda.srl")).toBe(null);
  });

  it("email con whitespace → non è bypass per super_admin spurio", () => {
    expect(
      computeEffectiveRole(["super_admin"], "  demo@azienda.srl  "),
    ).toBe(null);
  });

  it("email con whitespace per flo@ → consentita", () => {
    expect(
      computeEffectiveRole(["super_admin"], "  flo.andriciuc@gmail.com  "),
    ).toBe("super_admin");
  });

  it("email nulla/undefined con super_admin DB → rimosso", () => {
    expect(computeEffectiveRole(["super_admin"], null)).toBe(null);
    expect(computeEffectiveRole(["super_admin"], undefined)).toBe(null);
    expect(computeEffectiveRole(["super_admin"], "")).toBe(null);
  });

  it("utente con super_admin + platform_manager e email non allowed → platform_manager", () => {
    expect(
      computeEffectiveRole(
        ["super_admin", "platform_manager"],
        "attacker@malicious.com",
      ),
    ).toBe("platform_manager");
  });

  it("utente senza super_admin non è mai toccato", () => {
    expect(
      computeEffectiveRole(["company_admin", "company_staff"], "demo@azienda.srl"),
    ).toBe("company_admin");
  });

  it("utente customer rimane customer", () => {
    expect(computeEffectiveRole(["customer"], "any@customer.com")).toBe(
      "customer",
    );
  });

  it("priorità: super_admin > platform_manager > company_admin > customer (quando email allowed)", () => {
    expect(
      computeEffectiveRole(
        ["customer", "company_admin", "platform_manager", "super_admin"],
        "flo.andriciuc@gmail.com",
      ),
    ).toBe("super_admin");
  });

  it("priorità dopo filter: platform_manager > company_admin > customer (quando email NOT allowed)", () => {
    expect(
      computeEffectiveRole(
        ["customer", "company_admin", "platform_manager", "super_admin"],
        "attacker@example.com",
      ),
    ).toBe("platform_manager");
  });
});
