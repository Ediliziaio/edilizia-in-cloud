import React, { createContext, useContext } from "react";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Context that overrides effectiveCompany from AuthContext.
 * Used by admin marketing pages to reuse existing company marketing
 * components with the platform admin company ID.
 */
const EffectiveCompanyOverrideContext = createContext<{
  companyId: string;
} | null>(null);

export function PlatformCompanyProvider({ children }: { children: React.ReactNode }) {
  return (
    <EffectiveCompanyOverrideContext.Provider value={{ companyId: PLATFORM_ADMIN_COMPANY_ID }}>
      {children}
    </EffectiveCompanyOverrideContext.Provider>
  );
}

/**
 * Returns the effective company ID, respecting any override from PlatformCompanyProvider.
 * Use this in shared marketing components instead of directly accessing useAuth().effectiveCompany.id
 */
export function useEffectiveCompanyId(): string | undefined {
  const override = useContext(EffectiveCompanyOverrideContext);
  const { effectiveCompany } = useAuth();
  return override?.companyId || effectiveCompany?.id;
}
