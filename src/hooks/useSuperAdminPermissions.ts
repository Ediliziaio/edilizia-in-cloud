import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { ADMIN_PLATFORM_ROLES } from "@/types/auth";

export interface SuperAdminPermissions {
  // Legacy module-level permissions (maintained for backward compatibility)
  can_manage_companies: boolean;
  can_manage_plans: boolean;
  can_manage_tickets: boolean;
  can_manage_referrals: boolean;
  can_manage_admins: boolean;
  can_view_platform_stats: boolean;
  can_manage_marketing: boolean;
  allowed_company_ids: string[] | null;
  // Granular action-level permissions (fine-grained control)
  billing_read: boolean;
  billing_write: boolean;
  impersonation: boolean;
  user_management: boolean;
  pricing_override: boolean;
  feature_flags: boolean;
  audit_log_access: boolean;
  bulk_actions: boolean;
  data_export: boolean;
  support_tickets: boolean;
}

const ALL_TRUE: SuperAdminPermissions = {
  can_manage_companies: true,
  can_manage_plans: true,
  can_manage_tickets: true,
  can_manage_referrals: true,
  can_manage_admins: true,
  can_view_platform_stats: true,
  can_manage_marketing: true,
  allowed_company_ids: null,
  billing_read: true,
  billing_write: true,
  impersonation: true,
  user_management: true,
  pricing_override: true,
  feature_flags: true,
  audit_log_access: true,
  bulk_actions: true,
  data_export: true,
  support_tickets: true,
};


export function useSuperAdminPermissions() {
  const { user, role } = useAuth();
  const isAdminPlatformRole = !!role && ADMIN_PLATFORM_ROLES.includes(role);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.admin.superAdminPermissions(user?.id),
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("super_admin_permissions")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: isAdminPlatformRole && !!user?.id,
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  // If record exists → use its explicit values.
  // If no record → full access by default (super_admin bootstrap / no restrictions set yet).
  const permissions: SuperAdminPermissions = data
    ? {
        can_manage_companies: data.can_manage_companies,
        can_manage_plans: data.can_manage_plans,
        can_manage_tickets: data.can_manage_tickets,
        can_manage_referrals: data.can_manage_referrals,
        can_manage_admins: data.can_manage_admins,
        can_view_platform_stats: data.can_view_platform_stats,
        can_manage_marketing: data.can_manage_marketing,
        allowed_company_ids: data.allowed_company_ids as string[] | null,
        // Granular permissions — fallback to legacy values if not yet migrated
        billing_read: (data as any).billing_read ?? data.can_manage_plans,
        billing_write: (data as any).billing_write ?? data.can_manage_plans,
        impersonation: (data as any).impersonation ?? data.can_manage_companies,
        user_management: (data as any).user_management ?? data.can_manage_admins,
        pricing_override: (data as any).pricing_override ?? data.can_manage_plans,
        feature_flags: (data as any).feature_flags ?? data.can_manage_companies,
        audit_log_access: (data as any).audit_log_access ?? data.can_view_platform_stats,
        bulk_actions: (data as any).bulk_actions ?? data.can_manage_companies,
        data_export: (data as any).data_export ?? data.can_view_platform_stats,
        support_tickets: (data as any).support_tickets ?? data.can_manage_tickets,
      }
    : ALL_TRUE;

  return { permissions, isLoading };
}
