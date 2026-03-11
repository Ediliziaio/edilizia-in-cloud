import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";

export interface SuperAdminPermissions {
  can_manage_companies: boolean;
  can_manage_plans: boolean;
  can_manage_tickets: boolean;
  can_manage_referrals: boolean;
  can_manage_admins: boolean;
  can_view_platform_stats: boolean;
  can_manage_marketing: boolean;
  allowed_company_ids: string[] | null;
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
};

// Deny-by-default: used when no permission record exists yet
const NO_ACCESS: SuperAdminPermissions = {
  can_manage_companies: false,
  can_manage_plans: false,
  can_manage_tickets: false,
  can_manage_referrals: false,
  can_manage_admins: false,
  can_view_platform_stats: false,
  can_manage_marketing: false,
  allowed_company_ids: [],
};

export function useSuperAdminPermissions() {
  const { user, role } = useAuth();
  const isSuperAdmin = role === "super_admin";

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
    enabled: isSuperAdmin && !!user?.id,
    staleTime: 5 * 60 * 1000,
  });

  // Check if this is the only super_admin (bootstrap: first admin gets full access)
  const { data: adminCount } = useQuery({
    queryKey: queryKeys.admin.superAdminCount,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("user_roles")
        .select("*", { count: "exact", head: true })
        .eq("role", "super_admin");
      if (error) throw error;
      return count ?? 0;
    },
    enabled: isSuperAdmin && !!user?.id,
    staleTime: 10 * 60 * 1000,
  });

  // If record exists → use it. If no record AND only 1 super_admin → full access (bootstrap).
  // Otherwise deny by default for safety.
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
      }
    : adminCount === 1
      ? ALL_TRUE
      : NO_ACCESS;

  return { permissions, isLoading };
}
