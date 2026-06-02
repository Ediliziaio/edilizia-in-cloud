/**
 * useGoogleAdsCampaigns — data layer per le campagne Google Ads.
 *
 * Stesso pattern di useMetaCampaigns: prova DB, fallback graceful.
 * Per ora è scaffold: le edge function Google sono stub (return not_implemented).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { GoogleAdsBiddingStrategy, GoogleAdsCampaignRow, GoogleAdsCampaignStatus } from "@/types/googleAds";

const STORAGE_KEY_PREFIX = "eic_google_ads_campaign_drafts_";

export const googleAdsCampaignKeys = {
  all: ["google-ads-campaigns"] as const,
  byCompany: (companyId: string | undefined) =>
    [...googleAdsCampaignKeys.all, "company", companyId] as const,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const gTable = (name: string) => (supabase as any).from(name);

function isSchemaFallbackError(err: unknown) {
  const msg = String((err as Error)?.message ?? err);
  return (
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("relation") ||
    msg.includes("permission denied") ||
    msg.includes("No rows")
  );
}

export function useGoogleAdsCampaigns(companyId: string | undefined) {
  const qc = useQueryClient();
  const [legacyCampaigns, setLegacyCampaigns] = useState<GoogleAdsCampaignRow[]>([]);
  const storageKey = companyId ? `${STORAGE_KEY_PREFIX}${companyId}` : null;

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      setLegacyCampaigns(raw ? (JSON.parse(raw) as GoogleAdsCampaignRow[]) : []);
    } catch {
      setLegacyCampaigns([]);
    }
  }, [storageKey]);

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

  const persistLegacy = useCallback(
    (next: GoogleAdsCampaignRow[]) => {
      setLegacyCampaigns(next);
      if (!storageKey) return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next.slice(0, 30)));
      } catch {
        // ignore localStorage quota/security failures
      }
    },
    [storageKey],
  );

  const allCampaigns = useMemo(() => {
    const dbCampaigns = query.data ?? [];
    const dbIds = new Set(dbCampaigns.map((campaign) => campaign.id));
    return [...dbCampaigns, ...legacyCampaigns.filter((campaign) => !dbIds.has(campaign.id))];
  }, [query.data, legacyCampaigns]);

  const saveDraftMutation = useMutation({
    mutationFn: async (input: {
      name: string;
      advertising_channel: string;
      daily_budget_cents: number;
      builder_state: Record<string, unknown>;
    }): Promise<GoogleAdsCampaignRow> => {
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
        if (isSchemaFallbackError(err)) {
          const now = new Date().toISOString();
          const row = buildLegacyGoogleCampaign({
            companyId,
            name: input.name,
            advertisingChannel: input.advertising_channel,
            dailyBudgetCents: input.daily_budget_cents,
            builderState: input.builder_state,
            now,
          });
          persistLegacy([row, ...legacyCampaigns]);
          return row;
        }
        throw err;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: googleAdsCampaignKeys.byCompany(companyId) });
    },
  });

  const updateDraftMutation = useMutation({
    mutationFn: async (input: {
      id: string;
      name: string;
      advertising_channel: string;
      daily_budget_cents: number;
      builder_state: Record<string, unknown>;
    }): Promise<GoogleAdsCampaignRow> => {
      if (!companyId) throw new Error("no_company_id");
      try {
        const { data, error } = await gTable("google_ads_campaigns")
          .update({
            name: input.name,
            advertising_channel: input.advertising_channel,
            daily_budget_cents: input.daily_budget_cents,
            builder_state: input.builder_state,
          })
          .eq("id", input.id)
          .eq("company_id", companyId)
          .select("*")
          .single();
        if (error) throw error;
        return data as GoogleAdsCampaignRow;
      } catch (err) {
        if (!isSchemaFallbackError(err)) throw err;
        const updatedAt = new Date().toISOString();
        const next = legacyCampaigns.map((campaign) =>
          campaign.id === input.id
            ? {
                ...campaign,
                name: input.name,
                advertising_channel: input.advertising_channel as GoogleAdsCampaignRow["advertising_channel"],
                daily_budget_cents: input.daily_budget_cents,
                builder_state: input.builder_state,
                updated_at: updatedAt,
              }
            : campaign,
        );
        persistLegacy(next);
        const updated = next.find((campaign) => campaign.id === input.id);
        if (!updated) throw new Error("draft_not_found", { cause: err });
        return updated;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: googleAdsCampaignKeys.byCompany(companyId) });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (input: {
      id: string;
      status: GoogleAdsCampaignStatus;
      publish_error?: string | null;
    }): Promise<GoogleAdsCampaignRow> => {
      if (!companyId) throw new Error("no_company_id");
      try {
        const { data, error } = await gTable("google_ads_campaigns")
          .update({
            status: input.status,
            publish_error: input.publish_error ?? null,
          })
          .eq("id", input.id)
          .eq("company_id", companyId)
          .select("*")
          .single();
        if (error) throw error;
        return data as GoogleAdsCampaignRow;
      } catch (err) {
        if (!isSchemaFallbackError(err)) throw err;
        const updatedAt = new Date().toISOString();
        const next = legacyCampaigns.map((campaign) =>
          campaign.id === input.id
            ? {
                ...campaign,
                status: input.status,
                publish_error: input.publish_error ?? null,
                updated_at: updatedAt,
              }
            : campaign,
        );
        persistLegacy(next);
        const updated = next.find((campaign) => campaign.id === input.id);
        if (!updated) throw new Error("draft_not_found", { cause: err });
        return updated;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: googleAdsCampaignKeys.byCompany(companyId) });
    },
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!companyId) throw new Error("no_company_id");
      try {
        const { error } = await gTable("google_ads_campaigns")
          .update({ status: "archived" })
          .eq("id", id)
          .eq("company_id", companyId);
        if (error) throw error;
      } catch (err) {
        if (!isSchemaFallbackError(err)) throw err;
        persistLegacy(legacyCampaigns.filter((campaign) => campaign.id !== id));
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: googleAdsCampaignKeys.byCompany(companyId) });
    },
  });

  const findCampaign = useCallback(
    (id: string): GoogleAdsCampaignRow | null => allCampaigns.find((campaign) => campaign.id === id) ?? null,
    [allCampaigns],
  );

  return useMemo(
    () => ({
      campaigns: allCampaigns,
      isLoading: query.isLoading,
      saveDraft: saveDraftMutation.mutateAsync,
      updateDraft: updateDraftMutation.mutateAsync,
      updateStatus: updateStatusMutation.mutateAsync,
      deleteDraft: deleteDraftMutation.mutateAsync,
      isSaving: saveDraftMutation.isPending,
      isUpdating: updateDraftMutation.isPending,
      isDeleting: deleteDraftMutation.isPending,
      findCampaign,
    }),
    [
      allCampaigns,
      query.isLoading,
      saveDraftMutation.mutateAsync,
      updateDraftMutation.mutateAsync,
      updateStatusMutation.mutateAsync,
      deleteDraftMutation.mutateAsync,
      saveDraftMutation.isPending,
      updateDraftMutation.isPending,
      deleteDraftMutation.isPending,
      findCampaign,
    ],
  );
}

function buildLegacyGoogleCampaign(input: {
  companyId: string;
  name: string;
  advertisingChannel: string;
  dailyBudgetCents: number;
  builderState: Record<string, unknown>;
  now: string;
}): GoogleAdsCampaignRow {
  const targetCpl = Number(input.builderState.targetCpl ?? 0);
  return {
    id: `google-draft-${Date.now()}`,
    company_id: input.companyId,
    integration_id: null,
    google_account_id: null,
    google_campaign_id: null,
    name: input.name,
    advertising_channel: input.advertisingChannel as GoogleAdsCampaignRow["advertising_channel"],
    status: "draft",
    daily_budget_cents: input.dailyBudgetCents,
    shared_budget_id: null,
    bidding_strategy_type: (targetCpl > 0 ? "TARGET_CPA" : "MAXIMIZE_CONVERSIONS") as GoogleAdsBiddingStrategy,
    target_cpa_micros: targetCpl > 0 ? Math.round(targetCpl * 1_000_000) : null,
    target_roas: null,
    start_date: null,
    end_date: null,
    geo_targets: [],
    language_targets: ["it"],
    target_google_search: true,
    target_search_network: true,
    target_content_network: input.advertisingChannel === "DISPLAY" || input.advertisingChannel === "PERFORMANCE_MAX",
    target_partner_search_network: false,
    builder_state: input.builderState,
    raw: null,
    last_published_at: null,
    last_synced_at: null,
    publish_error: null,
    created_at: input.now,
    updated_at: input.now,
    created_by: null,
  };
}
