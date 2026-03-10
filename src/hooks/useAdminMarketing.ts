import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";

/**
 * Hook base per le pagine marketing del superadmin.
 * Fornisce il companyId fisso della platform admin company
 * e verifica il permesso can_manage_marketing.
 */
export function useAdminMarketing() {
  const { permissions, isLoading: permLoading } = useSuperAdminPermissions();

  return {
    companyId: PLATFORM_ADMIN_COMPANY_ID,
    hasAccess: permissions.can_manage_marketing,
    permLoading,
  };
}
