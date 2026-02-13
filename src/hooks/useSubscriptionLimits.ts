import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { differenceInDays } from "date-fns";
import type { CompanyStatus } from "@/types/auth";

const ALL_MODULES = ["orders", "warehouse", "calendar", "customers", "employees", "tickets", "forecast"] as const;
export type ModuleKey = (typeof ALL_MODULES)[number];

export function useSubscriptionLimits() {
  const { effectiveCompany, isImpersonating, role } = useAuth();

  const companyId = effectiveCompany?.id;
  const planId = effectiveCompany?.subscription_plan_id;
  const companyStatus = (effectiveCompany?.status as CompanyStatus) || "trial";

  // Fetch plan
  const { data: currentPlan, isLoading: planLoading } = useQuery({
    queryKey: ["subscription-plan", planId],
    queryFn: async () => {
      if (!planId) return null;
      const { data, error } = await supabase
        .from("subscription_plans")
        .select("*")
        .eq("id", planId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!planId,
  });

  // Count orders
  const { data: orderCount = 0, isLoading: ordersLoading } = useQuery({
    queryKey: ["order-count", companyId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId!);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!companyId,
  });

  // Count users
  const { data: userCount = 0, isLoading: usersLoading } = useQuery({
    queryKey: ["user-count", companyId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId!);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!companyId,
  });

  // Trial days
  const trialDaysLeft = companyStatus === "trial" && effectiveCompany?.trial_ends_at
    ? Math.max(0, differenceInDays(new Date(effectiveCompany.trial_ends_at), new Date()))
    : null;

  const trialExpired = companyStatus === "trial" && trialDaysLeft !== null && trialDaysLeft <= 0;

  // Modules from plan
  const includedModules: string[] = currentPlan
    ? (Array.isArray((currentPlan as any).included_modules) ? (currentPlan as any).included_modules : ALL_MODULES as unknown as string[])
    : ALL_MODULES as unknown as string[];

  // Super admin bypass
  const isSuperAdmin = role === "super_admin";
  const bypass = isSuperAdmin && isImpersonating;

  const maxOrders = currentPlan?.max_orders ?? -1;
  const maxUsers = currentPlan?.max_users ?? -1;

  const canCreateOrder = bypass || (maxOrders === -1 || orderCount < maxOrders);
  const canAddUser = bypass || (maxUsers === -1 || userCount < maxUsers);

  const remainingOrders = maxOrders === -1 ? -1 : Math.max(0, maxOrders - orderCount);
  const remainingUsers = maxUsers === -1 ? -1 : Math.max(0, maxUsers - userCount);

  const isModuleEnabled = (moduleKey: ModuleKey): boolean => {
    if (bypass) return true;
    return includedModules.includes(moduleKey);
  };

  const isFullyOperational = bypass || companyStatus === "active" || (companyStatus === "trial" && !trialExpired);

  return {
    companyStatus,
    trialDaysLeft,
    trialExpired,
    currentPlan,
    includedModules,
    canCreateOrder,
    canAddUser,
    isModuleEnabled,
    remainingOrders,
    remainingUsers,
    isFullyOperational,
    isLoading: planLoading || ordersLoading || usersLoading,
  };
}
