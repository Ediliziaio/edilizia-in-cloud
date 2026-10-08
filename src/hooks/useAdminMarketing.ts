import { PLATFORM_ADMIN_COMPANY_ID } from "@/lib/adminConstants";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";

/**
 * Hook base per le pagine marketing del superadmin.
 * Fornisce il companyId fisso della platform admin company
 * e verifica il permesso can_manage_marketing.
 *
 * `hasCrmAccess` è il permesso più stretto «CRM e chiamate» (contatti, opportunità, calendario): lo ha anche chi
 * ha il marketing completo, ma chi fa solo le chiamate (call center di piattaforma) ha solo questo.
 */
export function useAdminMarketing() {
  const { permissions, isLoading: permLoading } = useSuperAdminPermissions();

  return {
    companyId: PLATFORM_ADMIN_COMPANY_ID,
    hasAccess: permissions.can_manage_marketing,
    hasCrmAccess: permissions.crm_operatore,
    permLoading,
  };
}
