import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { differenceInDays } from "date-fns";
import type { CompanyStatus } from "@/types/auth";
import { queryKeys } from "@/lib/queryKeys";
import { createTimeoutSignal } from "@/lib/query-timeout";

const PLAN_QUERY_TIMEOUT_MS = 12_000;
const USAGE_COUNT_QUERY_TIMEOUT_MS = 8_000;
const BACKGROUND_PLAN_QUERY_META = { silent: true } as const;

// Lista moduli gestiti dal piano.
// Tenuta come tipo puro (nessuna const runtime) perché i consumer la usano
// solo come vincolo: la sorgente autoritativa dei moduli abilitati su
// un'azienda è `subscription_plans.included_modules`. L'array runtime lo
// abbiamo in `src/lib/adminConstants.ts` per l'UI admin (icone + label).
export type ModuleKey =
  | "orders"
  | "warehouse"
  | "calendar"
  | "customers"
  | "employees"
  | "tickets"
  | "forecast";

interface UseSubscriptionLimitsOptions {
  /**
   * I conteggi di ordini/utenti servono solo nelle pagine dove mostriamo
   * limiti o CTA di creazione. La shell del gestionale usa il piano solo per
   * abilitare i moduli, quindi può saltare i COUNT(*) e partire più veloce.
   */
  includeUsageCounts?: boolean;
}

export function useSubscriptionLimits(options: UseSubscriptionLimitsOptions = {}) {
  const includeUsageCounts = options.includeUsageCounts ?? true;
  const {
    effectiveCompany,
    isImpersonating,
    isImpersonationReady,
    role,
    impersonatedCompanyId,
    impersonationToken,
  } = useAuth();

  const companyId = effectiveCompany?.id;
  const planId = effectiveCompany?.subscription_plan_id;
  const companyStatus = (effectiveCompany?.status as CompanyStatus) || "trial";

  // Fetch plan
  const { data: currentPlan, isLoading: planLoading, isFetched: planFetched } = useQuery({
    queryKey: queryKeys.subscriptionLimits.plan(planId),
    queryFn: async () => {
      if (!planId) return null;
      const timeout = createTimeoutSignal(PLAN_QUERY_TIMEOUT_MS);
      try {
        const { data, error } = await supabase
          .from("subscription_plans")
          // is_full_plan è opzionale (DB pre-migration può non averla):
          // il SELECT non rompe — Postgrest restituisce undefined se manca.
          .select("id, name, slug, included_modules, max_orders, max_users, price_monthly, price_yearly, is_full_plan")
          .eq("id", planId)
          .abortSignal(timeout.signal)
          .maybeSingle();
        if (error) throw error;
        return data;
      } finally {
        timeout.dispose();
      }
    },
    enabled: !!planId,
    staleTime: 5 * 60 * 1000,
    meta: BACKGROUND_PLAN_QUERY_META,
  });

  // Count orders
  const { data: orderCount = 0, isLoading: ordersLoading } = useQuery({
    queryKey: queryKeys.subscriptionLimits.orderCount(companyId),
    queryFn: async () => {
      const timeout = createTimeoutSignal(USAGE_COUNT_QUERY_TIMEOUT_MS);
      try {
        const { count, error } = await supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .abortSignal(timeout.signal);
        if (error) throw error;
        return count || 0;
      } finally {
        timeout.dispose();
      }
    },
    enabled: !!companyId && includeUsageCounts,
    staleTime: 5 * 60 * 1000,
    meta: BACKGROUND_PLAN_QUERY_META,
  });

  // Count users
  const { data: userCount = 0, isLoading: usersLoading } = useQuery({
    queryKey: queryKeys.subscriptionLimits.userCount(companyId),
    queryFn: async () => {
      const timeout = createTimeoutSignal(USAGE_COUNT_QUERY_TIMEOUT_MS);
      try {
        const { count, error } = await supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId!)
          .abortSignal(timeout.signal);
        if (error) throw error;
        return count || 0;
      } finally {
        timeout.dispose();
      }
    },
    enabled: !!companyId && includeUsageCounts,
    staleTime: 5 * 60 * 1000,
    meta: BACKGROUND_PLAN_QUERY_META,
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

  // Super admin bypass hardened: serve `isImpersonationReady` (confermato server-side
  // via fetchUserData in AuthContext:567-572) oltre a tutti gli altri gate — così un
  // attaccante con scrittura in sessionStorage non ottiene l'unlock anticipato.
  const isSuperAdmin = role === "super_admin";
  const bypass =
    isSuperAdmin &&
    isImpersonationReady &&
    isImpersonating &&
    !!impersonatedCompanyId &&
    !!impersonationToken;

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
    isLoading: planLoading || (includeUsageCounts && (ordersLoading || usersLoading)),
  };
}
