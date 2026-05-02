import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { ADMIN_PLATFORM_ROLES, PLATFORM_ROLE_PRESETS, PLATFORM_ROLES, type PlatformRole } from "@/types/auth";

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

const ALL_FALSE: SuperAdminPermissions = {
  can_manage_companies: false,
  can_manage_plans: false,
  can_manage_tickets: false,
  can_manage_referrals: false,
  can_manage_admins: false,
  can_view_platform_stats: false,
  can_manage_marketing: false,
  allowed_company_ids: [],
  billing_read: false,
  billing_write: false,
  impersonation: false,
  user_management: false,
  pricing_override: false,
  feature_flags: false,
  audit_log_access: false,
  bulk_actions: false,
  data_export: false,
  support_tickets: false,
};

function permissionsFromPlatformPreset(role: string | null): SuperAdminPermissions {
  if (!role || !PLATFORM_ROLES.includes(role as PlatformRole)) {
    return ALL_FALSE;
  }

  const preset = PLATFORM_ROLE_PRESETS[role as PlatformRole];
  return {
    ...ALL_FALSE,
    ...preset,
    allowed_company_ids: null,
    billing_read: preset.can_manage_plans,
    billing_write: preset.can_manage_plans,
    impersonation: false,
    user_management: preset.can_manage_admins,
    pricing_override: preset.can_manage_plans,
    feature_flags: preset.can_manage_companies,
    audit_log_access: preset.can_view_platform_stats,
    bulk_actions: preset.can_manage_companies,
    data_export: preset.can_view_platform_stats,
    support_tickets: preset.can_manage_tickets,
  };
}


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

  // SAFETY NET: se il ruolo è `super_admin`, diamo SEMPRE ALL_TRUE.
  // Questo previene che un record malformato o con tutti i flag a false
  // (es. glitch di migrazione, rollback parziale, race nel bootstrap)
  // blocchi l'accesso del super_admin alla dashboard. Gli altri ruoli
  // admin-platform (company_admin, support, etc.) rispettano invece la riga.
  if (role === "super_admin") {
    return { permissions: ALL_TRUE, isLoading: false };
  }

  // If record exists → use its explicit values.
  // If a platform_* user has no row yet, fall back to the role preset. Never
  // grant ALL_TRUE to non-super_admin users: direct URL access would otherwise
  // bypass sidebar filtering for billing, audit and platform settings.
  const row = data as Partial<SuperAdminPermissions> | null;
  const permissions: SuperAdminPermissions = row
    ? {
        can_manage_companies: row.can_manage_companies ?? false,
        can_manage_plans: row.can_manage_plans ?? false,
        can_manage_tickets: row.can_manage_tickets ?? false,
        can_manage_referrals: row.can_manage_referrals ?? false,
        can_manage_admins: row.can_manage_admins ?? false,
        can_view_platform_stats: row.can_view_platform_stats ?? false,
        can_manage_marketing: row.can_manage_marketing ?? false,
        allowed_company_ids: row.allowed_company_ids ?? null,
        // Granular permissions — fallback to legacy values if not yet migrated
        billing_read: row.billing_read ?? row.can_manage_plans ?? false,
        billing_write: row.billing_write ?? row.can_manage_plans ?? false,
        impersonation: row.impersonation ?? row.can_manage_companies ?? false,
        user_management: row.user_management ?? row.can_manage_admins ?? false,
        pricing_override: row.pricing_override ?? row.can_manage_plans ?? false,
        feature_flags: row.feature_flags ?? row.can_manage_companies ?? false,
        audit_log_access: row.audit_log_access ?? row.can_view_platform_stats ?? false,
        bulk_actions: row.bulk_actions ?? row.can_manage_companies ?? false,
        data_export: row.data_export ?? row.can_view_platform_stats ?? false,
        support_tickets: row.support_tickets ?? row.can_manage_tickets ?? false,
      }
    : permissionsFromPlatformPreset(role);

  return { permissions, isLoading };
}
