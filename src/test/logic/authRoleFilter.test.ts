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
import { computeEffectiveRole as computeEffectiveRoleFromRoles, ROLE_PRIORITY } from "@/lib/roleHierarchy";

// ──────────────────────────────────────────────────────────────────────
// Repro della logica in src/contexts/AuthContext.tsx (fetchUserData)
// ──────────────────────────────────────────────────────────────────────
function computeEffectiveRole(
  dbRoles: AppRole[],
  userEmail: string | null | undefined,
): AppRole | null {
  // La classifica NON viene piu' ricopiata qui: si importa da @/lib/roleHierarchy.
  // Prima esistevano due copie e avevano gia' divergenza reale (nei test mancava
  // "accountant"), quindi il test non proteggeva davvero il comportamento vero.
  let userRoles = [...dbRoles];

  // Defense-in-depth layer (AuthContext.fetchUserData)
  if (userRoles.includes("super_admin") && !isSuperAdminEmailAllowed(userEmail)) {
    userRoles = userRoles.filter((r) => r !== "super_admin");
  }

  return computeEffectiveRoleFromRoles(userRoles);
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

// ──────────────────────────────────────────────────────────────────────
// Regola "chi amministra viene prima di chi opera".
// Nata da un disservizio reale: l'amministratrice di un'azienda cliente
// aveva anche il ruolo venditrice, veniva risolta come venditrice e — senza
// riga in staff_permissions — le sparivano sidebar e impostazioni.
// ──────────────────────────────────────────────────────────────────────
describe("AuthContext — un amministratore non viene mai declassato", () => {
  const OPERATIVI: AppRole[] = [
    "salesperson",
    "call_center",
    "employee",
    "subcontractor",
    "company_staff",
    "accountant",
    "referrer",
    "customer",
  ];

  for (const operativo of OPERATIVI) {
    it(`company_admin + ${operativo} → company_admin`, () => {
      expect(computeEffectiveRole(["company_admin", operativo], null)).toBe("company_admin");
      // anche con l'ordine invertito: non deve dipendere da come il DB li restituisce
      expect(computeEffectiveRole([operativo, "company_admin"], null)).toBe("company_admin");
    });

    it(`produttore_admin + ${operativo} → produttore_admin`, () => {
      expect(computeEffectiveRole(["produttore_admin", operativo], null)).toBe("produttore_admin");
      expect(computeEffectiveRole([operativo, "produttore_admin"], null)).toBe("produttore_admin");
    });
  }

  it("il caso concreto: company_admin + salesperson NON è salesperson", () => {
    expect(computeEffectiveRole(["salesperson", "company_admin"], null)).not.toBe("salesperson");
  });

  it("super_admin resta sopra a company_admin", () => {
    expect(computeEffectiveRole(["company_admin", "super_admin"], "flo.andriciuc@gmail.com")).toBe("super_admin");
  });

  it("ogni ruolo amministrativo precede ogni ruolo operativo nella classifica", () => {
    const ultimoAdmin = Math.max(
      ROLE_PRIORITY.indexOf("company_admin"),
      ROLE_PRIORITY.indexOf("produttore_admin"),
    );
    for (const operativo of ["salesperson", "call_center", "employee", "subcontractor", "company_staff"] as AppRole[]) {
      expect(ROLE_PRIORITY.indexOf(operativo)).toBeGreaterThan(ultimoAdmin);
    }
  });

  it("nessun ruolo di AppRole resta fuori dalla classifica", () => {
    // Un ruolo assente vince solo se è l'unico posseduto: in combinazione
    // perderebbe da qualunque altro, in silenzio.
    const attesi: AppRole[] = [
      "super_admin", "company_admin", "company_staff", "customer", "employee",
      "subcontractor", "salesperson", "call_center", "referrer", "accountant",
      "platform_manager", "platform_sales", "platform_support", "platform_marketing",
      "platform_implementation", "multi_company_user", "produttore_admin",
    ];
    for (const r of attesi) expect(ROLE_PRIORITY).toContain(r);
  });
});
