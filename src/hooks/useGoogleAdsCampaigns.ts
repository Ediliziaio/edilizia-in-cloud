/**
 * useGoogleAdsCampaigns — data layer per le campagne Google Ads.
 *
 * Stesso pattern di useMetaCampaigns: prova DB, fallback graceful.
 * Per ora è scaffold: le edge function Google sono stub (return not_implemented).
 */

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { GoogleAdsCampaignRow, GoogleAdsCampaignStatus } from "@/types/googleAds";

export const googleAdsCampaignKeys = {
  all: ["google-ads-campaigns"] as const,
  byCompany: (companyId: string | undefined) =>
    [...googleAdsCampaignKeys.all, "company", companyId] as const,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gTable = (name: string) => (supabase as any).from(name);

export function useGoogleAdsCampaigns(companyId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: googleAdsCampaignKeys.byCompany(companyId),
    queryFn: async (): Promise<GoogleAdsCampaignRow[]> => {
      if (!companyId) return [];
      try {
        const { data, error } = await gTable("google_ads_campaigns")
          .select("*")
          .eq("company_id", companyId)
          .neq("status", "archived")
          .order("updated_at", { ascending: false });
        if (error) {
          const msg = String(error.message ?? error);
          if (msg.includes("does not exist") || msg.includes("schema cache")) return [];
          throw error;
        }
        return (data ?? []) as GoogleAdsCampaignRow[];
      } catch {
        return [];
      }
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  const saveDraftMutation = useMutation({
    mutationFn: async (input: {
      name: string;
      advertising_channel: string;
      daily_budget_cents: number;
      builder_state: Record<string, unknown>;
    }): Promise<GoogleAdsCampaignRow | null> => {
      if (!companyId) throw new Error("no_company_id");
      try {
        const { data, error } = await gTable("google_ads_campaigns")
          .insert({
            company_id: companyId,
            name: input.name,
            advertising_channel: input.advertising_channel,
            status: "draft" as GoogleAdsCampaignStatus,
            daily_budget_cents: input.daily_budget_cents,
            builder_state: input.builder_state,
          })
          .select("*")
          .single();
        if (error) throw error;
        return data as GoogleAdsCampaignRow;
      } catch (err) {
        const msg = String((err as Error).message ?? err);
        if (msg.includes("does not exist") || msg.includes("schema cache")) {
          // Fallback localStorage o no-op
          console.warn("[useGoogleAdsCampaigns] schema not applied, skip save");
          return null;
        }
        throw err;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: googleAdsCampaignKeys.byCompany(companyId) });
    },
  });

  const campaigns = query.data ?? [];

  return useMemo(
    () => ({
      campaigns,
      isLoading: query.isLoading,
      saveDraft: saveDraftMutation.mutateAsync,
      isSaving: saveDraftMutation.isPending,
    }),
    [campaigns, query.isLoading, saveDraftMutation.mutateAsync, saveDraftMutation.isPending],
  );
}
