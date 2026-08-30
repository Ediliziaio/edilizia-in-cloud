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
 *   has_company_profile   → companies.vat_number NOT NULL AND name NOT NULL
 *   has_first_customer    → COUNT(customers) > 0        (alias: has_customers)
 *   has_first_order       → COUNT(orders) > 0           (alias: has_orders)
 *   has_team_member       → COUNT(profiles) > 1          (alias: has_staff)
 *   has_first_quote       → COUNT(quotes) > 0            (alias: has_quote)
 *   has_billing_config    → companies.billing_mode_set_at NOT NULL
 *   has_logo              → companies.logo_url NOT NULL
 *   has_subscription      → companies.status = 'active'
 *   has_payment_method    → companies.stripe_customer_id NOT NULL
 *   has_invoice           → COUNT(invoices) > 0
 *   has_supplier          → COUNT(suppliers) > 0
 *   has_appointment       → COUNT(appointments) > 0
 *
 * BUGFIX storici: (1) la select usava `companies.piva` che NON esiste
 * (colonna reale: vat_number) → l'intera query falliva e profilo/fatturazione
 * non si auto-completavano mai; (2) le chiavi del catalogo admin
 * (has_customers, has_orders, …) non erano riconosciute dal motore → gli step
 * "auto" configurati dall'admin restavano manuali per sempre. Ora ogni chiave
 * del catalogo ha un check reale, e le chiavi legacy sono alias.
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
  has_logo: boolean;
  has_subscription: boolean;
  has_payment_method: boolean;
  has_invoice: boolean;
  has_supplier: boolean;
  has_appointment: boolean;
}

// Chiavi legacy del catalogo admin → chiave canonica del motore.
const KEY_ALIASES: Record<string, keyof CheckResults> = {
  has_customers: "has_first_customer",
  has_orders: "has_first_order",
  has_staff: "has_team_member",
  has_quote: "has_first_quote",
};

export function resolveAutoCheckKey(raw: string): keyof CheckResults | null {
  const key = (KEY_ALIASES[raw] ?? raw) as keyof CheckResults;
  const KNOWN: ReadonlySet<string> = new Set([
    "has_company_profile", "has_first_customer", "has_first_order", "has_team_member",
    "has_first_quote", "has_billing_config", "has_logo", "has_subscription",
    "has_payment_method", "has_invoice", "has_supplier", "has_appointment",
  ]);
  return KNOWN.has(key) ? key : null;
}

export function useOnboardingAutoComplete(
  steps: OnboardingStepLite[],
  completedIds: Set<string>,
) {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  // Carica i check 1 volta + ogni 60s (rate-limit conservative).
  // v8.6.96 — disabilita polling se TUTTI gli step con auto_check_key sono già
  // marcati completati (no senso ri-controllare quello che è OK).
  const allAutoStepsCompleted = steps
    .filter((s) => s.auto_check_key)
    .every((s) => completedIds.has(s.id));
  const stillPending = !allAutoStepsCompleted;

  const { data: checks } = useQuery({
    queryKey: ["onboarding-auto-checks", companyId],
    enabled: !!companyId && steps.length > 0 && stillPending,
    staleTime: 60 * 1000,
    refetchInterval: stillPending ? 5 * 60 * 1000 : false,
    queryFn: async (): Promise<CheckResults> => {
      const [profileRes, custRes, ordRes, teamRes, quoteRes, invRes, suppRes, apptRes] = await Promise.all([
        // 1. Profilo azienda (vat_number, NON piva: colonna inesistente → query intera in errore)
        supabase
          .from("companies")
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .select("vat_number, name, billing_mode_set_at, logo_url, status, stripe_customer_id" as any)
          .eq("id", companyId!)
          .maybeSingle(),
        // 2. Clienti — la tabella "customers" non esiste: l'errore veniva
        // ingoiato e has_first_customer restava FALSO per sempre, quindi lo
        // step "primo cliente" non si completava mai da solo. Il conteggio
        // buono (profiles con ruolo 'customer') e' nella RPC get_customer_stats.
        supabase.rpc("get_customer_stats" as never, { p_company_id: companyId! } as never),
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
        // 6. Fatture
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId!),
        // 7. Fornitori
        supabase
          .from("suppliers")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId!),
        // 8. Appuntamenti
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId!),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const profile = profileRes.data as any;
      return {
        has_company_profile: !!(profile?.vat_number && profile?.name),
        has_first_customer: (((custRes.data as { total?: number } | null)?.total) ?? 0) > 0,
        has_first_order: (ordRes.count ?? 0) > 0,
        has_team_member: (teamRes.count ?? 0) > 1,
        has_first_quote: (quoteRes.count ?? 0) > 0,
        has_billing_config: !!profile?.billing_mode_set_at,
        has_logo: !!profile?.logo_url,
        has_subscription: profile?.status === "active",
        has_payment_method: !!profile?.stripe_customer_id,
        has_invoice: (invRes.count ?? 0) > 0,
        has_supplier: (suppRes.count ?? 0) > 0,
        has_appointment: (apptRes.count ?? 0) > 0,
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
      const key = resolveAutoCheckKey(step.auto_check_key);
      if (key && checks[key] === true) {
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
