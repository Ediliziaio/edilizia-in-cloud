/**
 * useOnboardingAutoComplete — v8.6.86
 *
 * Auto-completion degli step di onboarding basata su condizioni REALI nel DB
 * (count clienti, ordini, profilo, ecc.) invece che toggle manuale.
 *
 * Si attiva quando OnboardingChecklist è montato: ogni 60s rileva quali step
 * sono soddisfatti e li scrive in `company_onboarding_completions`.
 *
 * Mappatura auto_check_key → query:
 *   has_company_profile   → companies.piva NOT NULL AND name NOT NULL
 *   has_first_customer    → COUNT(customers) > 0
 *   has_first_order       → COUNT(orders) > 0
 *   has_team_member       → COUNT(profiles WHERE company_id = X) > 1
 *   has_first_quote       → COUNT(quotes) > 0
 *   has_billing_config    → companies.billing_mode_set_at NOT NULL
 *
 * NB: un check positivo NON viene revertito se la condizione diventa falsa
 * in futuro (es. utente elimina tutti i clienti). Lo step resta completato
 * come "milestone raggiunta storicamente".
 */
import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface OnboardingStepLite {
  id: string;
  auto_check_key: string | null;
}

interface CheckResults {
  has_company_profile: boolean;
  has_first_customer: boolean;
  has_first_order: boolean;
  has_team_member: boolean;
  has_first_quote: boolean;
  has_billing_config: boolean;
}

export function useOnboardingAutoComplete(
  steps: OnboardingStepLite[],
  completedIds: Set<string>,
) {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  // Carica i check 1 volta + ogni 60s (rate-limit conservative)
  const { data: checks } = useQuery({
    queryKey: ["onboarding-auto-checks", companyId],
    enabled: !!companyId && steps.length > 0,
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000, // refetch ogni 5 min in background
    queryFn: async (): Promise<CheckResults> => {
      const [profileRes, custRes, ordRes, teamRes, quoteRes] = await Promise.all([
        // 1. Profilo: piva + name set
        supabase
          .from("companies")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select("piva, name, billing_mode_set_at" as any)
          .eq("id", companyId!)
          .maybeSingle(),
        // 2. Clienti
        supabase
          .from("customers")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId!),
        // 3. Ordini
        supabase
          .from("orders")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId!),
        // 4. Membri team (> 1 profilo per la company)
        supabase
          .from("profiles")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId!),
        // 5. Preventivi
        supabase
          .from("quotes")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId!),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profile = profileRes.data as any;
      return {
        has_company_profile: !!(profile?.piva && profile?.name),
        has_first_customer: (custRes.count ?? 0) > 0,
        has_first_order: (ordRes.count ?? 0) > 0,
        has_team_member: (teamRes.count ?? 0) > 1,
        has_first_quote: (quoteRes.count ?? 0) > 0,
        has_billing_config: !!profile?.billing_mode_set_at,
      };
    },
  });

  // v8.6.93 — Stabilizziamo le deps dell'effect:
  //   - completedKey: stringa join degli id completati (cambia solo se la SET cambia)
  //   - stepsKey:     stringa di step ids+autoCheck (cambia solo a content change)
  // Senza, il Set viene ricostruito ad ogni render → effect rifire all'infinito.
  const completedKey = useMemo(
    () => Array.from(completedIds).sort().join(","),
    [completedIds],
  );
  const stepsKey = useMemo(
    () => steps.map((s) => `${s.id}:${s.auto_check_key ?? ""}`).join("|"),
    [steps],
  );

  useEffect(() => {
    if (!checks || !companyId || !user) return;

    const toInsert: { company_id: string; step_id: string; completed_by: string }[] = [];

    for (const step of steps) {
      if (!step.auto_check_key) continue;
      if (completedIds.has(step.id)) continue;
      const key = step.auto_check_key as keyof CheckResults;
      if (checks[key] === true) {
        toInsert.push({ company_id: companyId, step_id: step.id, completed_by: user.id });
      }
    }

    if (toInsert.length === 0) return;

    void supabase
      .from("company_onboarding_completions")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(toInsert as any, { onConflict: "company_id,step_id", ignoreDuplicates: true })
      .then(({ error }) => {
        if (!error) {
          queryClient.invalidateQueries({ queryKey: ["onboarding-completions", companyId] });
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checks, stepsKey, completedKey, companyId, user?.id, queryClient]);
}
