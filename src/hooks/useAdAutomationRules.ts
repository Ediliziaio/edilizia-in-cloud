/**
 * useAdAutomationRules — CRUD su ad_automation_rules.
 *
 * Regole if-then per autopilota campagne:
 *   • Trigger: metric + operator + value + window_days
 *   • Action: pause | scale | notify | duplicate
 *   • Gated da requires_confirmation
 */

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AdAutomationRuleRow, AdAutomationTrigger, AdAutomationAction } from "@/types/metaAds";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rulesTable = () => (supabase as any).from("ad_automation_rules");

export interface CreateRuleInput {
  name: string;
  description?: string;
  scope_type: "campaign" | "adset" | "account";
  scope_filter?: Record<string, unknown>;
  trigger: AdAutomationTrigger;
  action: AdAutomationAction;
  requires_confirmation?: boolean;
  is_enabled?: boolean;
}

export function useAdAutomationRules(companyId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["ad-automation-rules", companyId],
    queryFn: async (): Promise<AdAutomationRuleRow[]> => {
      if (!companyId) return [];
      try {
        const { data, error } = await rulesTable()
          .select("*")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false });
        if (error) {
          const msg = String(error.message ?? "");
          if (msg.includes("does not exist") || msg.includes("schema cache")) return [];
          throw error;
        }
        return (data ?? []) as AdAutomationRuleRow[];
      } catch {
        return [];
      }
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async (input: CreateRuleInput): Promise<AdAutomationRuleRow | null> => {
      if (!companyId) throw new Error("no_company_id");
      try {
        const { data, error } = await rulesTable()
          .insert({
            company_id: companyId,
            name: input.name,
            description: input.description ?? null,
            scope_type: input.scope_type,
            scope_filter: input.scope_filter ?? {},
            trigger: input.trigger,
            action: input.action,
            requires_confirmation: input.requires_confirmation ?? true,
            is_enabled: input.is_enabled ?? false,
          })
          .select("*")
          .single();
        if (error) throw error;
        return data as AdAutomationRuleRow;
      } catch (err) {
        const msg = String((err as Error).message ?? err);
        if (msg.includes("does not exist") || msg.includes("schema cache")) {
          toast.warning("Database non aggiornato", {
            description: "Migration ad_automation_rules non ancora applicata sul remoto.",
          });
          return null;
        }
        throw err;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ad-automation-rules", companyId] });
      toast.success("Regola automazione creata");
    },
    onError: (err) => toast.error("Errore creazione", { description: String((err as Error).message ?? err) }),
  });

  const updateMutation = useMutation({
    mutationFn: async (input: { id: string; patch: Partial<CreateRuleInput> & { is_enabled?: boolean } }) => {
      if (!companyId) throw new Error("no_company_id");
      const { data, error } = await rulesTable()
        .update(input.patch)
        .eq("id", input.id)
        .eq("company_id", companyId)
        .select("*")
        .single();
      if (error) throw error;
      return data as AdAutomationRuleRow;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ad-automation-rules", companyId] });
    },
    onError: (err) => toast.error("Errore aggiornamento", { description: String((err as Error).message ?? err) }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("no_company_id");
      const { error } = await rulesTable().delete().eq("id", id).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ad-automation-rules", companyId] });
      toast.success("Regola eliminata");
    },
    onError: (err) => toast.error("Errore eliminazione", { description: String((err as Error).message ?? err) }),
  });

  return useMemo(
    () => ({
      rules: query.data ?? [],
      isLoading: query.isLoading,
      create: createMutation.mutateAsync,
      update: updateMutation.mutateAsync,
      remove: deleteMutation.mutateAsync,
      toggleEnabled: (id: string, enabled: boolean) => updateMutation.mutateAsync({ id, patch: { is_enabled: enabled } }),
      isMutating: createMutation.isPending || updateMutation.isPending || deleteMutation.isPending,
    }),
    [query.data, query.isLoading, createMutation, updateMutation, deleteMutation],
  );
}
