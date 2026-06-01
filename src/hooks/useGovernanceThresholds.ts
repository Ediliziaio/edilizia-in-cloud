/**
 * #40 — Hook React Query per le soglie di governance per-azienda.
 *
 * Legge/scrive `company_governance_settings` (1 riga per company). La tabella
 * non è ancora nei tipi generati di Supabase finché la migration non viene
 * applicata in prod, quindi usiamo un cast localizzato (`sbAny`) e — punto
 * chiave — un fallback difensivo ai DEFAULT su qualsiasi errore, così la UI
 * resta sicura e funzionante anche PRIMA che lo schema sia applicato.
 *
 * La logica di mappatura/valutazione è pura e vive in
 * src/lib/governance/thresholds.ts (testata in isolamento).
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  DEFAULT_GOVERNANCE_THRESHOLDS,
  governanceFromRow,
  governanceToRow,
  normalizeGovernanceThresholds,
  type GovernanceThresholds,
  type GovernanceSettingsRow,
} from "@/lib/governance/thresholds";

// Tabella non ancora nei tipi generati (schema applicato a release #40): cast localizzato.
const sbAny = supabase as unknown as {
  from: (t: string) => ReturnType<typeof supabase.from>;
};

const GOVERNANCE_QUERY_KEY = (companyId: string | undefined) =>
  ["company-governance-settings", companyId] as const;

/**
 * Soglie di governance dell'azienda attiva. Fallback ai default su riga
 * mancante O su errore (es. tabella non ancora applicata): mai throw alla UI.
 */
export function useGovernanceThresholds(companyId: string | undefined) {
  return useQuery({
    queryKey: GOVERNANCE_QUERY_KEY(companyId),
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    queryFn: async (): Promise<GovernanceThresholds> => {
      if (!companyId) return { ...DEFAULT_GOVERNANCE_THRESHOLDS };
      try {
        const { data, error } = await sbAny
          .from("company_governance_settings")
          .select(
            "company_id, preventivo_doppia_firma_enabled, preventivo_soglia_importo, sal_scostamento_enabled, sal_tolleranza_perc, marginalita_alert_enabled, marginalita_soglia_perc",
          )
          .eq("company_id", companyId)
          .maybeSingle();
        if (error) throw error;
        return governanceFromRow((data as GovernanceSettingsRow | null) ?? null);
      } catch {
        // Tabella non ancora applicata o errore transitorio → default sicuri.
        return { ...DEFAULT_GOVERNANCE_THRESHOLDS };
      }
    },
  });
}

/**
 * Salva (upsert) le soglie per l'azienda attiva. Richiede company_admin
 * o super_admin (enforced via RLS lato DB).
 */
export function useSaveGovernanceThresholds(companyId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (cfg: GovernanceThresholds) => {
      if (!companyId) throw new Error("Azienda non disponibile");
      const row = governanceToRow(normalizeGovernanceThresholds(cfg));
      const { error } = await sbAny
        .from("company_governance_settings")
        .upsert(
          { company_id: companyId, ...row, updated_at: new Date().toISOString() } as never,
          { onConflict: "company_id" } as never,
        );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Soglie di governance salvate");
      void queryClient.invalidateQueries({ queryKey: GOVERNANCE_QUERY_KEY(companyId) });
    },
    onError: (e) =>
      toast.error("Errore nel salvataggio", {
        description: e instanceof Error ? e.message : String(e),
      }),
  });
}
