import React, { useContext, useMemo } from "react";
import { AuthContext } from "@/contexts/AuthContext";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";
import type { Company } from "@/types/auth";

const PLATFORM_COMPANY: Company = {
  id: PLATFORM_ADMIN_COMPANY_ID,
  name: "Platform Admin CRM",
  email: "admin@platform.internal",
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
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  enforce_2fa: false,
  allowed_ips: null,
  password_expiry_days: 0,
  max_failed_attempts: 10,
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
};

/**
 * Wraps children with an AuthContext override where effectiveCompany
 * points to the platform admin company. This allows reusing all existing
 * marketing page components without modification.
 */
export function PlatformCompanyProvider({ children }: { children: React.ReactNode }) {
  const parentAuth = useContext(AuthContext);
  if (!parentAuth) throw new Error("PlatformCompanyProvider must be inside AuthProvider");

  const overridden = useMemo(
    () => ({
      ...parentAuth,
      effectiveCompany: PLATFORM_COMPANY,
    }),
    [parentAuth]
  );

  return (
    <AuthContext.Provider value={overridden}>
      {children}
    </AuthContext.Provider>
  );
}
