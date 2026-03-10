import React, { useContext, useMemo } from "react";
import { AuthContext } from "@/contexts/AuthContext";
import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";
import type { Company } from "@/types/auth";

const PLATFORM_COMPANY: Company = {
  id: PLATFORM_ADMIN_COMPANY_ID,
  name: "Platform Admin CRM",
  email: "admin@platform.internal",
  sector: "saas",
  status: "active",
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
