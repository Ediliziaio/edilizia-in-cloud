import { useMemo } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { useImpersonationClientView } from "@/hooks/useImpersonationView";
import { isDemoCompanyId } from "@/lib/constants/demoCompany";
import type { StatoPiano } from "@/lib/impostazioni/pianoImpostazioni";

// FULL_PLAN_SLUGS: fallback hardcoded usato se `subscription_plans.is_full_plan`
// non è ancora popolato (backward compat per ambienti pre-migration).
// Fonte di verità preferita: `currentPlan.is_full_plan === true`.
const FULL_PLAN_SLUGS = new Set(["starter", "pro", "enterprise"]);

/**
 * Cosa del piano vede l'utente: le regole del menu principale, in un posto
 * solo. Le usano il menu principale (CompanySidebar) e le impostazioni (menu,
 * ricerca, griglia mobile, Cmd+K, pagina aperta dall'indirizzo): prima le
 * impostazioni non guardavano il piano, e un'azienda col piano Marketing
 * trovava banche, stati ordine e fatturazione.
 */
export function useStatoPiano() {
  const { effectiveCompany, role, isImpersonating, viewAsRole } = useAuth();
  const { isModuleEnabled, isScopriPlan, currentPlan, isLoading: limitsLoading } = useSubscriptionLimits({ includeUsageCounts: false });
  const { isFeaturePreview, getFeatureAccessLevel, isLoading: flagsLoading } = useFeatureFlags();

  // v8.6.102 — Super-admin bypass per badge DEMO.
  // Bug fix: durante il bootstrap impersonation, il super_admin vedeva per
  // 1-3 sec badge "DEMO" sulla sidebar perché isImpersonationReady arrivava
  // dopo. Per super_admin il bypass dei badge è SEMPRE attivo:
  // — non opera mai realmente come "limited user" sulla UI
  // — bypass effettivo a livello DB resta gestito da useFeatureFlags.bypass
  //   che richiede isImpersonationReady, quindi nessun leak privilege
  // ECCEZIONE "Vista cliente" (toggle nel banner impersonation, default ON):
  // il super admin vuole verificare COSA VEDE il piano del cliente → in quel
  // caso la sidebar deve rendere badge/moduli esattamente come per il cliente.
  // Con "Visualizza come utente" (viewAsRole) la vista cliente è FORZATA:
  // "loggato come Daniela" = pixel-perfect ciò che vede Daniela.
  const impersonationClientView = useImpersonationClientView() || !!viewAsRole;
  const isSuperAdminViewer = role === "super_admin" && !(isImpersonating && impersonationClientView);

  // Demo Azienda S.r.l. = company-vetrina interna. Bypassa DEMO badges così
  // la sidebar appare full-feature anche se il piano DB è parziale (è il caso
  // reference che support/onboarding usano come "come dovrebbe apparire").
  const isDemoBaseline = isDemoCompanyId(effectiveCompany?.id);

  // "Piano full": fonte di verità è la colonna DB `subscription_plans.is_full_plan`.
  // Fallback su `FULL_PLAN_SLUGS` hardcoded se il campo DB non è popolato
  // (ambienti pre-migration). Aggiungere un nuovo piano "premium" ora richiede
  // solo `UPDATE subscription_plans SET is_full_plan=true WHERE slug='premium'`
  // → nessun deploy frontend.
  const planIsFullFlag = (currentPlan as { is_full_plan?: boolean } | null | undefined)?.is_full_plan === true;
  const isFullBySlug = !!currentPlan?.slug && FULL_PLAN_SLUGS.has(currentPlan.slug);
  const isFullPlan = planIsFullFlag || isFullBySlug;

  // "Piano limitato": ha un piano attivo che NON è full.
  // - Trial / no plan → fail-open in filterNavItems (gestito separatamente)
  // - Demo Azienda / super_admin → bypass dedicato
  // - Full plan → tutto abilitato
  // - Tutti gli altri (free/scopri/custom/team/etc.) → limited → DEMO badge
  const isLimitedPlan = !isSuperAdminViewer && !isDemoBaseline && !!currentPlan && !isFullPlan;

  // Per le impostazioni: le stesse regole, dette una volta.
  const stato = useMemo<StatoPiano>(
    () => ({
      tuttoVisibile: isDemoBaseline || limitsLoading || flagsLoading || !currentPlan,
      pianoLimitato: isLimitedPlan,
      moduloIncluso: (modulo) => isModuleEnabled(modulo),
      livelloFunzione: (funzione) => getFeatureAccessLevel(funzione),
    }),
    [isDemoBaseline, limitsLoading, flagsLoading, currentPlan, isLimitedPlan, isModuleEnabled, getFeatureAccessLevel],
  );

  return {
    stato,
    isModuleEnabled,
    isScopriPlan,
    currentPlan,
    limitsLoading,
    isFeaturePreview,
    getFeatureAccessLevel,
    flagsLoading,
    isSuperAdminViewer,
    isDemoBaseline,
    isFullPlan,
    isLimitedPlan,
  };
}
