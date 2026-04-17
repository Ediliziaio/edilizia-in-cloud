import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { differenceInDays } from "date-fns";
import type { CompanyStatus } from "@/types/auth";
import { queryKeys } from "@/lib/queryKeys";

const ALL_MODULES = ["orders", "warehouse", "calendar", "customers", "employees", "tickets", "forecast"] as const;
export type ModuleKey = (typeof ALL_MODULES)[number];

export function useSubscriptionLimits() {
  const { effectiveCompany, isImpersonating, role, impersonatedCompanyId, impersonationToken } = useAuth();

  const companyId = effectiveCompany?.id;
  const planId = effectiveCompany?.subscription_plan_id;
  const companyStatus = (effectiveCompany?.status as CompanyStatus) || "trial";

  // Fetch plan
  const { data: currentPlan, isLoading: planLoading, isFetched: planFetched } = useQuery({
    queryKey: queryKeys.subscriptionLimits.plan(planId),
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
    staleTime: 5 * 60 * 1000,
  });

  // Count orders
  const { data: orderCount = 0, isLoading: ordersLoading } = useQuery({
    queryKey: queryKeys.subscriptionLimits.orderCount(companyId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("orders")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId!);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // Count users
  const { data: userCount = 0, isLoading: usersLoading } = useQuery({
    queryKey: queryKeys.subscriptionLimits.userCount(companyId),
    queryFn: async () => {
      const { count, error } = await supabase
        .from("profiles")
        .select("*", { count: "exact", head: true })
        .eq("company_id", companyId!);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });

  // Trial days
  const trialDaysLeft = companyStatus === "trial" && effectiveCompany?.trial_ends_at
    ? Math.max(0, differenceInDays(new Date(effectiveCompany.trial_ends_at), new Date()))
    : null;

  const trialExpired = companyStatus === "trial" && trialDaysLeft !== null && trialDaysLeft <= 0;

  // Modules from plan.
  // SICUREZZA: evitiamo il fail-open precedente, in cui un modulo non dichiarato
  // in `included_modules` veniva comunque abilitato se il piano era malformato.
  // Nuova semantica:
  //   - plan caricato + `included_modules` è array → usa l'array
  //   - plan caricato ma `included_modules` è malformato / null → array VUOTO
  //     (chiuso di default; l'eventuale apertura passa sempre dal bypass/override)
  //   - plan non ancora risolto → `null` (vedi isModuleEnabled: ritorniamo false
  //     finché non abbiamo dati, così la UI non mostra moduli che l'utente non ha)
  const rawModules = currentPlan?.included_modules;
  const moduleListResolved: boolean = !!currentPlan && planFetched;
  const includedModules: string[] = moduleListResolved
    ? (Array.isArray(rawModules) ? (rawModules as string[]) : [])
    : [];

  // Super admin bypass: also active when impersonation session exists but role
  // has not yet been resolved (e.g. fetchUserData racing setSession on page load).
  const isSuperAdmin = role === "super_admin";
  const bypass = isSuperAdmin && (isImpersonating || (!!impersonatedCompanyId && !!impersonationToken));

  const maxOrders = currentPlan?.max_orders ?? -1;
  const maxUsers = currentPlan?.max_users ?? -1;

  // Determina se siamo nel piano Scopri
  const isScopriPlan = currentPlan?.slug === "scopri";

  // Limite operai campo: 2 nel piano Scopri, illimitati negli altri
  const maxCampoOperai = isScopriPlan ? 2 : -1;

  const canCreateOrder = bypass || (maxOrders === -1 || orderCount < maxOrders);
  const canAddUser = bypass || (maxUsers === -1 || userCount < maxUsers);

  const remainingOrders = maxOrders === -1 ? -1 : Math.max(0, maxOrders - orderCount);
  const remainingUsers = maxUsers === -1 ? -1 : Math.max(0, maxUsers - userCount);

  const isModuleEnabled = (moduleKey: ModuleKey): boolean => {
    if (bypass) return true;
    // Finché il plan non è stato risolto definitivamente restituiamo false
    // (fail-closed): è la controparte del fix al fail-open sopra. Le UI che
    // chiamano questo hook devono guardare `isLoading` per distinguere
    // "disabilitato" da "in caricamento".
    if (!moduleListResolved) return false;
    return includedModules.includes(moduleKey);
  };

  const isFullyOperational = bypass || companyStatus === "active" || companyStatus === "free" || (companyStatus === "trial" && !trialExpired);

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
    isScopriPlan,
    maxCampoOperai,
    isLoading: planLoading || ordersLoading || usersLoading,
  };
}
