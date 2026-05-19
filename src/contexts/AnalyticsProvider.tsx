/**
 * AnalyticsProvider — v8.6.89
 *
 * Provider React che:
 *  1. Carica la config PostHog da platform_settings (chiavi: posthog_api_key,
 *     posthog_host, analytics_enabled). Se mancanti → no-op.
 *  2. Inizializza PostHog client al primo render.
 *  3. Identifica l'utente quando l'auth si stabilizza.
 *  4. Tracks pageview ad ogni cambio rotta.
 *  5. Reset su logout.
 *
 * Zero impatto se PostHog non è configurato (le chiamate sono guard-protected).
 */
import { useEffect, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscriptionLimits } from "@/hooks/useSubscriptionLimits";
import {
  initAnalytics,
  identifyUser,
  resetAnalytics,
  trackPageview,
} from "@/lib/analytics/posthog";

interface AnalyticsConfig {
  apiKey: string;
  host: string;
  enabled: boolean;
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const { user, effectiveCompany, role } = useAuth();
  // v8.6.94 — usa currentPlan.slug (presente) invece di subscription_plan_id (uuid)
  const { currentPlan } = useSubscriptionLimits({ includeUsageCounts: false });
  const location = useLocation();

  // 1. Carica config (cache lunga).
  // v8.6.96 — enabled solo se utente autenticato: evita query inutili su
  // pagine pubbliche / SEO (landing, /blog, /prezzi) che causano 401 spam.
  const { data: config } = useQuery({
    queryKey: ["analytics-config"],
    enabled: !!user?.id,
    queryFn: async (): Promise<AnalyticsConfig | null> => {
      const { data, error } = await supabase
        .from("platform_settings")
        .select("key, value")
        .in("key", ["posthog_api_key", "posthog_host", "analytics_enabled"]);
      if (error) {
        return null;
      }
      const map = new Map((data ?? []).map((r) => [r.key, r.value]));
      const apiKey = map.get("posthog_api_key");
      if (!apiKey) return null;
      const enabled = (map.get("analytics_enabled") ?? "true") !== "false";
      return {
        apiKey,
        host: map.get("posthog_host") ?? "https://eu.i.posthog.com",
        enabled,
      };
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: false,
  });

  // 2. Init PostHog quando arriva la config
  useEffect(() => {
    if (!config) return;
    initAnalytics(config);
  }, [config]);

  // 3. Identify quando user è stabile (su login + sul cambio company)
  useEffect(() => {
    if (!config) return;
    if (!user?.id) {
      resetAnalytics();
      return;
    }
    identifyUser({
      userId: user.id,
      email: user.email ?? undefined,
      companyId: effectiveCompany?.id,
      companyName: effectiveCompany?.name,
      role: role ?? undefined,
      planSlug: currentPlan?.slug ?? undefined,
    });
    // v8.6.103 — deps con primitivi soltanto (profile escluso: oggetto
    // ricreato spesso da AuthContext → identify spam PostHog inutile)
  }, [config, user?.id, user?.email, effectiveCompany?.id, effectiveCompany?.name, role, currentPlan?.slug]);

  // 4. Track pageview ad ogni cambio rotta
  useEffect(() => {
    if (!config) return;
    trackPageview(location.pathname + location.search);
  }, [config, location.pathname, location.search]);

  return <>{children}</>;
}
