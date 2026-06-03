import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getAdminRevenueBreakdown } from "@/lib/adminRevenue";

export interface SaasMetrics {
  arpu: number; // €/mese
  churnRate: number; // percentuale 0-100
  ltv: number; // €
  cac: number; // €
  paybackPeriod: number; // mesi
  activeCompanies: number;
  mrrStripe: number; // €
}

export interface CacInput {
  id: string;
  anno: number;
  mese: number;
  spesa_marketing_cents: number;
  nuove_aziende: number;
  note: string | null;
  created_at: string;
}

export function useSaasMetrics() {
  const queryClient = useQueryClient();

  const { data: cacInputs, isLoading: isLoadingCac } = useQuery({
    queryKey: ["cac-inputs"],
    staleTime: 5 * 60 * 1_000, // dati finanziari: 5 min di cache — cambiano raramente
    queryFn: async (): Promise<CacInput[]> => {
      const { data, error } = await supabase
        .from("cac_input")
        .select("id, anno, mese, spesa_marketing_cents, nuove_aziende, note, created_at")
        .order("anno", { ascending: false })
        .order("mese", { ascending: false })
        .limit(12);
      if (error) throw new Error(error.message);
      return (data ?? []) as CacInput[];
    },
  });

  // MRR + churn calcolati dalla fonte reale (companies + piani).
  // NB: la vecchia tabella `mrr_snapshots` non esiste → la query falliva sempre e
  // MRR/ARPU finivano a 0. Ora usiamo getAdminRevenueBreakdown (stessa fonte della
  // Revenue Dashboard) sui dati companies+piani già caricati qui.
  const { data: churnData, isLoading: isLoadingChurn } = useQuery({
    queryKey: ["saas-churn-mrr"],
    staleTime: 5 * 60 * 1_000,
    queryFn: async () => {
      // Cancellazioni ultimi 30 giorni (webhook Stripe + varianti legacy).
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const { count: cancellazioni } = await supabase
        .from("subscription_logs")
        .select("id", { count: "exact", head: true })
        .in("event_type", ["cancelled", "canceled", "subscription_canceled"])
        .gte("created_at", thirtyDaysAgo.toISOString());
      const { data: companies } = await supabase
        .from("companies")
        .select("id, status, payment_method, stripe_customer_id, stripe_subscription_status, is_platform_admin_company, subscription_plans:subscription_plan_id(price_monthly, price_yearly)")
        .eq("is_platform_admin_company", false);
      const breakdown = getAdminRevenueBreakdown(companies ?? []);
      return {
        cancellazioni: cancellazioni ?? 0,
        payingCount: breakdown.payingCompanies,
        mrr: breakdown.mrr,
      };
    },
  });

  // Calcolo metriche derivate
  const metrics: SaasMetrics = (() => {
    const mrrStripe = churnData?.mrr ?? 0;
    const activeCompanies = churnData?.payingCount ?? 0;
    const arpu = activeCompanies > 0 ? mrrStripe / activeCompanies : 0;
    // Churn mensile CORRETTO: persi nel periodo / attivi a INIZIO periodo.
    // Gli attivi a inizio ≈ ancora-attivi-ora + quelli persi nel periodo.
    // (Usare gli attivi attuali come denominatore gonfiava il churn.)
    const persi = churnData?.cancellazioni ?? 0;
    const churnBase = activeCompanies + persi;
    const churnRate = churnBase > 0 ? (persi / churnBase) * 100 : 0;
    const ltv = churnRate > 0 ? arpu / (churnRate / 100) : arpu * 24;
    // CAC: media degli ultimi 3 mesi
    const recentCac = (cacInputs ?? []).slice(0, 3);
    const totalSpesa = recentCac.reduce((s, c) => s + c.spesa_marketing_cents, 0) / 100;
    const totalNuove = recentCac.reduce((s, c) => s + c.nuove_aziende, 0);
    const cac = totalNuove > 0 ? totalSpesa / totalNuove : 0;
    const paybackPeriod = arpu > 0 ? cac / arpu : 0;
    return { arpu, churnRate, ltv, cac, paybackPeriod, activeCompanies, mrrStripe };
  })();

  const salvaInputCac = useMutation({
    mutationFn: async (payload: { anno: number; mese: number; spesa_marketing_cents: number; nuove_aziende: number; note?: string }) => {
      const { error } = await supabase.from("cac_input").upsert(
        { ...payload, note: payload.note ?? null },
        { onConflict: "anno,mese" }
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Dati CAC salvati");
      queryClient.invalidateQueries({ queryKey: ["cac-inputs"] });
    },
    onError: (err: Error) => toast.error("Errore salvataggio CAC", { description: err.message }),
  });

  return {
    metrics,
    cacInputs: cacInputs ?? [],
    isLoading: isLoadingCac || isLoadingChurn,
    salvaInputCac,
  };
}
