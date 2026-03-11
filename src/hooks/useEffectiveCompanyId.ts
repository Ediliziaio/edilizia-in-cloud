import { useAuth } from "@/contexts/AuthContext";

/**
 * Returns the effective company ID (impersonated or real).
 * Use this in all hooks that need the current tenant's company ID.
 */
export function useEffectiveCompanyId(): string | null {
  const { effectiveCompany } = useAuth();
  return effectiveCompany?.id ?? null;
}
