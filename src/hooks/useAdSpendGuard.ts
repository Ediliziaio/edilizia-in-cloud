/**
 * useAdSpendGuard — legge/scrive ad_spend_guard table.
 *
 * Fornisce defaults safe se la migration non è applicata:
 *   • monthly_cap_cents: 750000 (7500€)
 *   • daily_cap_cents: 30000 (300€)
 *   • campaign_approval_threshold_cents: 3000 (30€)
 *   • alert_threshold_pct: 80
 *
 * Pattern: prova DB → fallback in-memory state se schema_not_applied.
 */

import { useState, useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface AdSpendGuardConfig {
  id?: string;
  monthly_cap_cents: number;
  daily_cap_cents: number;
  campaign_approval_threshold_cents: number;
  alert_threshold_pct: number;
  autopause_on_daily_cap: boolean;
  autopause_on_monthly_cap: boolean;
  alert_email: string | null;
  is_active: boolean;
  last_autopause_at: string | null;
  last_autopause_reason: string | null;
}

const DEFAULTS: AdSpendGuardConfig = {
  monthly_cap_cents: 750000,
  daily_cap_cents: 30000,
  campaign_approval_threshold_cents: 3000,
  alert_threshold_pct: 80,
  autopause_on_daily_cap: true,
  autopause_on_monthly_cap: true,
  alert_email: null,
  is_active: true,
  last_autopause_at: null,
  last_autopause_reason: null,
};

const STORAGE_KEY = "eic_ad_spend_guard_local_";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const fromTable = (name: string) => (supabase as any).from(name);

export function useAdSpendGuard(companyId: string | undefined) {
  const qc = useQueryClient();
  const [localConfig, setLocalConfig] = useState<AdSpendGuardConfig>(DEFAULTS);

  // Carica fallback localStorage
  useEffect(() => {
    if (!companyId) return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY + companyId);
      if (raw) setLocalConfig({ ...DEFAULTS, ...(JSON.parse(raw) as AdSpendGuardConfig) });
    } catch {
      // ignore
    }
  }, [companyId]);

  // Query DB
  const query = useQuery({
    queryKey: ["ad-spend-guard", companyId],
    queryFn: async (): Promise<AdSpendGuardConfig | null> => {
      if (!companyId) return null;
      try {
        const { data, error } = await fromTable("ad_spend_guard")
          .select("*")
          .eq("company_id", companyId)
          .is("ad_account_id", null) // guard globale company
          .maybeSingle();
        if (error) {
          const msg = String(error.message ?? "");
          if (msg.includes("does not exist") || msg.includes("schema cache")) return null;
          throw error;
        }
        return data ?? null;
      } catch {
        return null;
      }
    },
    enabled: !!companyId,
    placeholderData: null,
    staleTime: 30_000,
  });

  const config: AdSpendGuardConfig = query.data ?? localConfig;

  // Mutation
  const updateMutation = useMutation({
    mutationFn: async (patch: Partial<AdSpendGuardConfig>): Promise<AdSpendGuardConfig> => {
      if (!companyId) throw new Error("no_company_id");

      const next = { ...config, ...patch };

      // Prova DB
      try {
        if (config.id) {
          const { data, error } = await fromTable("ad_spend_guard")
            .update(patch)
            .eq("id", config.id)
            .eq("company_id", companyId)
            .select("*")
            .single();
          if (!error && data) return data as AdSpendGuardConfig;
          throw error;
        } else {
          const { data, error } = await fromTable("ad_spend_guard")
            .insert({
              company_id: companyId,
              ad_account_id: null,
              ...next,
            })
            .select("*")
            .single();
          if (!error && data) return data as AdSpendGuardConfig;
          throw error;
        }
      } catch (err) {
        const msg = String((err as Error).message ?? err);
        if (msg.includes("does not exist") || msg.includes("schema cache")) {
          // Fallback localStorage
          setLocalConfig(next);
          try {
            window.localStorage.setItem(STORAGE_KEY + companyId, JSON.stringify(next));
          } catch {
            // ignore
          }
          return next;
        }
        throw err;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ad-spend-guard", companyId] });
      toast.success("Cap di spesa aggiornato");
    },
    onError: (err) => {
      toast.error("Errore salvataggio", { description: String((err as Error).message ?? err) });
    },
  });

  const update = useCallback(
    (patch: Partial<AdSpendGuardConfig>) => updateMutation.mutateAsync(patch),
    [updateMutation],
  );

  return {
    config,
    isLoading: query.isLoading && query.data === undefined,
    update,
    isUpdating: updateMutation.isPending,
  };
}
