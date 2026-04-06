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
import { subMonths, format, startOfMonth } from "date-fns";

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

  // ─── Tenant list ──────────────────────────────────────────
  const { data: tenants = [], isLoading: isLoadingTenants } = useQuery({
    queryKey: [TENANTS_KEY],
    queryFn: async (): Promise<SmsTenantRow[]> => {
      const meseInizio = startOfMonth(new Date()).toISOString();

      const { data: accounts, error } = await supabase
        .from("sms_telnyx_accounts")
        .select(`
          company_id,
          stato,
          companies!inner(name),
          sms_wallet!left(crediti),
          sms_telnyx_numbers!left(numero_e164, stato)
        `)
        .eq("stato", "attivo");
      if (error) throw error;

      const tenantRows: SmsTenantRow[] = await Promise.all(
        (accounts ?? []).map(async (acc: Record<string, unknown>) => {
          const { count: smsMese } = await supabase
            .from("sms_log")
            .select("id", { count: "exact", head: true })
            .eq("company_id", acc.company_id as string)
            .gte("created_at", meseInizio);

          const wallet = (acc.sms_wallet as Record<string, unknown>[] | null)?.[0];
          const numObj = (acc["sms_telnyx_numbers"] as Record<string, unknown>[] | null)?.[0];
          const company = acc.companies as Record<string, unknown>;

          return {
            company_id: acc.company_id as string,
            company_name: (company?.name as string) ?? "—",
            numero_e164: (numObj?.numero_e164 as string) ?? null,
            numero_stato: (numObj?.stato as string) ?? null,
            crediti_wallet: Number(wallet?.crediti ?? 0),
            sms_mese: smsMese ?? 0,
            fatturato_mese: 0,
            costo_wholesale_mese: 0,
            margine_mese: 0,
            margine_percentuale: 0,
          };
        })
      );
      return tenantRows;
    },
    staleTime: 2 * 60 * 1000,
  });

  // ─── P&L Stats ────────────────────────────────────────────
  const { data: plStats, isLoading: isLoadingPL } = useQuery({
    queryKey: [PL_KEY],
    queryFn: async (): Promise<SmsSuperAdminStats> => {
      const meseInizio = startOfMonth(new Date()).toISOString();
      const seiMesiFa  = subMonths(new Date(), 5);

      const { count: smsMese } = await supabase
        .from("sms_log")
        .select("id", { count: "exact", head: true })
        .gte("created_at", meseInizio);

      const { data: transazioni } = await supabase
        .from("sms_wallet_transazioni")
        .select("importo, tipo, created_at")
        .in("tipo", ["ricarica"])
        .gte("created_at", seiMesiFa.toISOString());

      const trendMap = new Map<string, SmsPLTrendPoint>();
      for (let i = 5; i >= 0; i--) {
        const d = subMonths(new Date(), i);
        const key = format(d, "yyyy-MM");
        trendMap.set(key, { mese: key, fatturato: 0, costo_wholesale: 0, margine: 0 });
      }

      for (const t of transazioni ?? []) {
        const key = format(new Date(t.created_at as string), "yyyy-MM");
        const point = trendMap.get(key);
        if (point) {
          point.fatturato += Math.abs(Number(t.importo));
        }
      }

      const trend = Array.from(trendMap.values());
      const fatturato = trend.reduce((s, p) => s + p.fatturato, 0);

      return {
        periodo: format(new Date(), "MMMM yyyy"),
        fatturato_totale: fatturato,
        costo_wholesale_totale: 0,
        margine_totale: fatturato,
        margine_percentuale: 100,
        tenant_attivi: tenants.length,
        sms_totali: smsMese ?? 0,
        trend,
      };
    },
    enabled: tenants.length >= 0,
    staleTime: 5 * 60 * 1000,
  });

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
