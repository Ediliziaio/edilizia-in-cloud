import { describe, expect, it } from "vitest";
import {
  mergeProfileCompanyAccess,
  resolveRouteAccessRole,
  resolveMultiCompanySelection,
  resolveSelectedAccessRole,
} from "@/lib/auth/multiCompany";
import type { MultiCompanyAccess } from "@/types/auth";

function access(companyId: string, role = "company_staff", name = companyId): MultiCompanyAccess {
  return {
    id: `access-${companyId}`,
    user_id: "user-1",
    company_id: companyId,
    access_role: role,
    granted_by: null,
    created_at: "2026-05-24T00:00:00.000Z",
    company: {
      id: companyId,
      name,
      email: `${companyId}@example.test`,
      logo_url: null,
      sector: "altro",
      status: "active",
      trial_ends_at: null,
      subscription_plan_id: null,
      stripe_customer_id: null,
      business_name: null,
      vat_number: null,
      fiscal_code: null,
      phone: null,
      pec: null,
      sdi_code: null,
      legal_address: null,
      legal_city: null,
      legal_province: null,
      legal_postal_code: null,
      operational_address: null,
      operational_city: null,
      operational_province: null,
      operational_postal_code: null,
      website: null,
      notes: null,
      payment_method: "bonifico",
      bank_iban: null,
      bank_account_holder: null,
      bank_name: null,
      payment_notes: null,
      created_at: "2026-05-24T00:00:00.000Z",
      updated_at: "2026-05-24T00:00:00.000Z",
      enforce_2fa: false,
      allowed_ips: null,
      password_expiry_days: 0,
      max_failed_attempts: 5,
      white_label_enabled: false,
      brand_primary_color: null,
      brand_secondary_color: null,
      brand_accent_color: null,
      brand_text_on_primary: null,
      brand_platform_name: null,
      brand_favicon_url: null,
      brand_login_bg_url: null,
      brand_hide_powered_by: false,
      white_label_enabled_at: null,
      white_label_enabled_by: null,
      white_label_monthly_price: 0,
      fleet_track_enabled: false,
      vertical: null,
      verticals_secondari: [],
      onboarding_vertical_completed: true,
    },
  };
}

describe("multi-company access resolution", () => {
  it("usa l'ultima azienda selezionata se l'utente ha ancora accesso", () => {
    const selected = resolveMultiCompanySelection({
      accesses: [access("company-a"), access("company-b")],
      storedCompanyId: "company-b",
      profileCompanyId: "company-a",
    });

    expect(selected.selectedId).toBe("company-b");
    expect(selected.selectedCompany?.name).toBe("company-b");
  });

  it("se lo storage è stale torna all'azienda del profilo quando è tra gli accessi", () => {
    const selected = resolveMultiCompanySelection({
      accesses: [access("company-a"), access("company-b")],
      storedCompanyId: "company-old",
      profileCompanyId: "company-a",
    });

    expect(selected.selectedId).toBe("company-a");
  });

  it("se non ci sono storage/profilo validi sceglie il primo accesso disponibile", () => {
    const selected = resolveMultiCompanySelection({
      accesses: [access("company-a"), access("company-b")],
      storedCompanyId: null,
      profileCompanyId: null,
    });

    expect(selected.selectedId).toBe("company-a");
  });

  it("risolve il ruolo dalla company selezionata, non dal ruolo globale", () => {
    const role = resolveSelectedAccessRole({
      globalRole: "company_admin",
      accesses: [
        access("company-a", "company_admin"),
        access("company-b", "company_staff"),
      ],
      selectedCompanyId: "company-b",
    });

    expect(role).toBe("company_staff");
  });

  it("usa il ruolo selezionato anche per decidere l'area corretta tra azienda e campo", () => {
    const subcontractorRole = resolveRouteAccessRole({
      globalRole: "company_admin",
      accesses: [
        access("company-a", "company_admin"),
        access("company-b", "subcontractor"),
      ],
      selectedCompanyId: "company-b",
    });
    const adminRole = resolveRouteAccessRole({
      globalRole: "subcontractor",
      accesses: [
        access("company-a", "subcontractor"),
        access("company-b", "company_admin"),
      ],
      selectedCompanyId: "company-b",
    });

    expect(subcontractorRole).toBe("subcontractor");
    expect(adminRole).toBe("company_admin");
  });

  it("per un multi_company_user senza azienda selezionata non concede permessi impliciti", () => {
    const role = resolveSelectedAccessRole({
      globalRole: "multi_company_user",
      accesses: [access("company-a", "company_admin")],
      selectedCompanyId: null,
    });

    expect(role).toBeNull();
  });

  it("include l'azienda del profilo come accesso selezionabile anche se non ha una riga multi_company_access", () => {
    const profileCompany = access("company-a", "company_admin", "Azienda A").company!;
    const merged = mergeProfileCompanyAccess({
      accesses: [access("company-b", "company_staff", "Azienda B")],
      profileCompany,
      userId: "user-1",
      globalRole: "company_admin",
      createdAt: "2026-05-24T00:00:00.000Z",
    });

    expect(merged.map((item) => item.company_id)).toEqual(["company-a", "company-b"]);
    expect(merged[0].access_role).toBe("company_admin");
  });
});
