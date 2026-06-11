/**
 * Hook per la gestione SuperAdmin del modulo SMS.
 * P&L, tenant attivi, pricing config, pacchetti.
 * Usato solo nelle pagine /admin/sms.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { SmsTenantRow, SmsSuperAdminStats, SmsPricingConfig, SmsPLTrendPoint } from "@/types/sms-superadmin";
import type { SmsPacchettoCrediti } from "@/types/sms-marketing";
import { subMonths, format } from "date-fns";

const PRICING_KEY   = "sms-pricing-config";
const PACCHETTI_KEY = "sms-admin-pacchetti";
const TENANTS_KEY   = "sms-admin-tenants";
const PL_KEY        = "sms-admin-pl";

export function useSmsSuperAdmin() {
  const queryClient = useQueryClient();

  // ─── Pricing Config ───────────────────────────────────────
  const { data: pricingConfig, isLoading: isLoadingPricing } = useQuery({
    queryKey: [PRICING_KEY],
    queryFn: async (): Promise<SmsPricingConfig | null> => {
      const { data, error } = await supabase
        .from("sms_pricing_config")
        .select("id, prezzo_numero_mensile, prezzo_per_sms, costo_wholesale_sms, soglia_crediti_minima, soglia_crediti_blocco, crediti_bonus_primo_acquisto, attivo, updated_at")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as SmsPricingConfig | null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const savePricingMutation = useMutation({
    mutationFn: async (data: Partial<SmsPricingConfig>): Promise<void> => {
      const { error } = await supabase
        .from("sms_pricing_config")
        .update({ ...data, updated_at: new Date().toISOString() })
        .gt("id", "00000000-0000-0000-0000-000000000000"); // aggiorna tutti (riga unica)
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PRICING_KEY] });
      toast.success("Configurazione prezzi aggiornata");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ─── Pacchetti ────────────────────────────────────────────
  const { data: pacchetti = [], isLoading: isLoadingPacchetti } = useQuery({
    queryKey: [PACCHETTI_KEY],
    queryFn: async (): Promise<SmsPacchettoCrediti[]> => {
      const { data, error } = await supabase
        .from("sms_pacchetti_crediti")
        .select("id, nome, importo_eur, crediti_eur, sms_stimati, bonus_percentuale, evidenziato, attivo, ordine")
        .order("ordine");
      if (error) throw error;
      return (data ?? []) as SmsPacchettoCrediti[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const savePacchettoMutation = useMutation({
    mutationFn: async (data: Omit<SmsPacchettoCrediti, "id"> & { id?: string }): Promise<SmsPacchettoCrediti> => {
      if (data.id) {
        const { data: updated, error } = await supabase
          .from("sms_pacchetti_crediti")
          .update(data)
          .eq("id", data.id)
          .select("id, nome, importo_eur, crediti_eur, sms_stimati, bonus_percentuale, evidenziato, attivo, ordine")
          .single();
        if (error) throw error;
        return updated as SmsPacchettoCrediti;
      } else {
        const { data: inserted, error } = await supabase
          .from("sms_pacchetti_crediti")
          .insert(data)
          .select("id, nome, importo_eur, crediti_eur, sms_stimati, bonus_percentuale, evidenziato, attivo, ordine")
          .single();
        if (error) throw error;
        return inserted as SmsPacchettoCrediti;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [PACCHETTI_KEY] });
      toast.success("Pacchetto salvato");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // ─── Overview unico (tenants + P&L) ──────────────────────
  // 2026-06-11: una sola RPC sms_admin_overview() al posto di N+1 query
  // client-side. Prima fatturato/costo/margine erano hardcoded a 0 — ora
  // arrivano i numeri VERI da sms_log (costo_cliente/costo_wholesale) +
  // transazionali. Guard super_admin lato DB (SECURITY DEFINER).
  const { data: overview, isLoading: isLoadingOverview } = useQuery({
    queryKey: [TENANTS_KEY, PL_KEY],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("sms_admin_overview" as never);
      if (error) throw error;
      return data as unknown as {
        tenants: Array<SmsTenantRow & { sms_totali: number; account_attivo: boolean }>;
        totals: {
          tenant_attivi: number;
          sms_mese: number;
          sms_totali: number;
          fatturato_mese: number;
          costo_wholesale_mese: number;
          margine_mese: number;
        };
        trend: SmsPLTrendPoint[];
      };
    },
    staleTime: 2 * 60 * 1000,
  });

  const tenants: SmsTenantRow[] = (overview?.tenants ?? []).map((t) => ({
    ...t,
    crediti_wallet: Number(t.crediti_wallet),
    fatturato_mese: Number(t.fatturato_mese),
    costo_wholesale_mese: Number(t.costo_wholesale_mese),
    margine_mese: Number(t.margine_mese),
    margine_percentuale: Number(t.margine_percentuale),
  }));
  const isLoadingTenants = isLoadingOverview;

  // Trend: riempi i mesi mancanti (la RPC restituisce solo mesi con dati)
  const trendMap = new Map<string, SmsPLTrendPoint>();
  for (let i = 5; i >= 0; i--) {
    const key = format(subMonths(new Date(), i), "yyyy-MM");
    trendMap.set(key, { mese: key, fatturato: 0, costo_wholesale: 0, margine: 0 });
  }
  for (const p of overview?.trend ?? []) {
    trendMap.set(p.mese, {
      mese: p.mese,
      fatturato: Number(p.fatturato),
      costo_wholesale: Number(p.costo_wholesale),
      margine: Number(p.margine),
    });
  }

  const totals = overview?.totals;
  const plStats: SmsSuperAdminStats | undefined = overview
    ? {
        periodo: format(new Date(), "MMMM yyyy"),
        fatturato_totale: Number(totals?.fatturato_mese ?? 0),
        costo_wholesale_totale: Number(totals?.costo_wholesale_mese ?? 0),
        margine_totale: Number(totals?.margine_mese ?? 0),
        margine_percentuale:
          Number(totals?.fatturato_mese ?? 0) > 0
            ? (Number(totals?.margine_mese ?? 0) / Number(totals?.fatturato_mese ?? 0)) * 100
            : 0,
        tenant_attivi: Number(totals?.tenant_attivi ?? 0),
        sms_totali: Number(totals?.sms_mese ?? 0),
        trend: Array.from(trendMap.values()),
      }
    : undefined;
  const isLoadingPL = isLoadingOverview;

  return {
    pricingConfig,
    pacchetti,
    tenants,
    plStats,
    isLoadingPricing,
    isLoadingPacchetti,
    isLoadingTenants,
    isLoadingPL,
    savePricing: (data: Partial<SmsPricingConfig>) => savePricingMutation.mutateAsync(data),
    isSavingPricing: savePricingMutation.isPending,
    savePacchetto: (data: Omit<SmsPacchettoCrediti, "id"> & { id?: string }) => savePacchettoMutation.mutateAsync(data),
    isSavingPacchetto: savePacchettoMutation.isPending,
  };
}
