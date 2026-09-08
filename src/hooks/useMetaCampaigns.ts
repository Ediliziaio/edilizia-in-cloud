/**
 * useMetaCampaigns — data layer per il modulo Pubblicità.
 *
 * Strategia di fallback:
 *   1. Prova a leggere dalla tabella `meta_campaigns` (DB)
 *   2. Se la tabella non esiste (migration non applicata), cade su localStorage
 *
 * Questo permette di lavorare in BETA locale prima che la migration sia
 * applicata al remoto, e di transitare in modo automatico quando lo sarà.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { testoTecnico } from "@/lib/userErrorMessage";
import type {
  MetaCampaignRow,
  MetaCampaignStatus,
  CampaignWithStats,
} from "@/types/metaAds";

const STORAGE_KEY_PREFIX = "eic_ads_manager_beta_drafts_";

export const metaCampaignKeys = {
  all: ["meta-campaigns"] as const,
  byCompany: (companyId: string | undefined) =>
    [...metaCampaignKeys.all, "company", companyId] as const,
  detail: (id: string) => [...metaCampaignKeys.all, "detail", id] as const,
};

/**
 * Cast del supabase client per accedere a tabelle non ancora generate nei tipi.
 * Quando la migration sarà applicata e i tipi rigenerati, questo cast diventerà
 * superfluo (ma resta safe).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const metaTable = (name: string) => (supabase as any).from(name);

interface LegacyDraft {
  id: string;
  name: string;
  objective: string;
  status?: MetaCampaignStatus;
  budgetCents: number;
  zone: string;
  adSets: number;
  ads: number;
  targetCplCents: number;
  createdAt: string;
  updatedAt?: string;
  copyVariants: string[];
  imagePrompt: string;
  builderState?: Record<string, unknown>;
  adAccountId?: string | null;
  integrationId?: string | null;
  metaCampaignId?: string | null;
  publishError?: string | null;
}

/* ----------------------- LIST ----------------------- */

export function useMetaCampaigns(companyId: string | undefined) {
  const queryClient = useQueryClient();
  const [legacyDrafts, setLegacyDrafts] = useState<LegacyDraft[]>([]);

  const storageKey = companyId ? `${STORAGE_KEY_PREFIX}${companyId}` : null;

  // Carica legacy drafts da localStorage (compatibilità v1)
  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) setLegacyDrafts(JSON.parse(raw) as LegacyDraft[]);
    } catch {
      setLegacyDrafts([]);
    }
  }, [storageKey]);

  const query = useQuery({
    queryKey: metaCampaignKeys.byCompany(companyId),
    queryFn: async (): Promise<MetaCampaignRow[]> => {
      if (!companyId) return [];
      try {
        const { data, error } = await metaTable("meta_campaigns")
          .select("*")
          .eq("company_id", companyId)
          .neq("status", "archived")
          .order("updated_at", { ascending: false });
        if (error) {
          // Tabella non esiste = migration non applicata → fallback graceful
          const msg = testoTecnico(error);
          if (
            msg.includes("does not exist") ||
            msg.includes("schema cache") ||
            msg.includes("relation")
          ) {
            console.warn(
              "[useMetaCampaigns] Tabella meta_campaigns non disponibile, uso localStorage fallback",
            );
            return [];
          }
          throw error;
        }
        return (data ?? []) as MetaCampaignRow[];
      } catch (err) {
        console.warn("[useMetaCampaigns] errore, fallback localStorage", err);
        return [];
      }
    },
    enabled: !!companyId,
    staleTime: 30_000,
  });

  // Bozze unificate: prima DB, poi legacy localStorage
  const allCampaigns = useMemo(() => {
    const dbCampaigns = query.data ?? [];
    const dbIds = new Set(dbCampaigns.map((c) => c.id));
    // Adatta legacy → shape MetaCampaignRow per uniformità di consumo
    const legacyAsRows: MetaCampaignRow[] = legacyDrafts
      .filter((d) => !dbIds.has(d.id))
      .map((d) => ({
        id: d.id,
        company_id: companyId ?? "",
        integration_id: d.integrationId ?? null,
        ad_account_id: d.adAccountId ?? null,
        meta_campaign_id: d.metaCampaignId ?? null,
        name: d.name,
        objective: (d.objective || "OUTCOME_LEADS") as MetaCampaignRow["objective"],
        status: (d.status ?? "draft") as MetaCampaignStatus,
        buying_type: "AUCTION",
        budget_mode: "adset",
        daily_budget_cents: d.budgetCents,
        lifetime_budget_cents: null,
        special_ad_categories: [],
        special_ad_category_country: null,
        start_time: null,
        stop_time: null,
        builder_state: d.builderState ?? null,
        raw: null,
        last_published_at: null,
        last_synced_at: null,
        publish_error: d.publishError ?? null,
        created_at: d.createdAt,
        updated_at: d.updatedAt ?? d.createdAt,
        created_by: null,
      }));
    return [...dbCampaigns, ...legacyAsRows];
  }, [query.data, legacyDrafts, companyId]);

  /* ----------------------- MUTATIONS ----------------------- */

  const saveDraftMutation = useMutation({
    mutationFn: async (input: {
      builder_state: Record<string, unknown>;
      name: string;
      objective: string;
      daily_budget_cents: number;
      ad_account_id?: string | null;
    }): Promise<MetaCampaignRow | LegacyDraft> => {
      if (!companyId) throw new Error("no_company_id");

      // Tenta DB
      const insertPayload = {
        company_id: companyId,
        ad_account_id: input.ad_account_id ?? null,
        name: input.name,
        objective: input.objective,
        status: "draft" as MetaCampaignStatus,
        budget_mode: "adset",
        daily_budget_cents: input.daily_budget_cents,
        builder_state: input.builder_state,
      };

      try {
        const { data, error } = await metaTable("meta_campaigns")
          .insert(insertPayload)
          .select("*")
          .single();
        if (!error && data) return data as MetaCampaignRow;
        // Se errore tabella, fallback storage
        throw error;
      } catch (err) {
        const msg = testoTecnico(err);
        if (
          msg.includes("does not exist") ||
          msg.includes("schema cache") ||
          msg.includes("relation") ||
          msg.includes("permission denied")
        ) {
          // Fallback localStorage
          const draft: LegacyDraft = {
            id: `draft-${Date.now()}`,
            name: input.name,
            objective: input.objective,
            status: "draft",
            budgetCents: input.daily_budget_cents,
            zone:
              ((input.builder_state as Record<string, unknown>)?.zone as string) ??
              "Zona non definita",
            adSets:
              ((input.builder_state as Record<string, unknown>)?.adSets as unknown[])?.length ?? 1,
            ads: 1,
            targetCplCents:
              (((input.builder_state as Record<string, unknown>)?.targetCpl as number) ?? 25) * 100,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            copyVariants:
              (((input.builder_state as Record<string, unknown>)?.copyVariants as string[]) ?? []),
            imagePrompt:
              (((input.builder_state as Record<string, unknown>)?.imagePrompt as string) ?? ""),
            builderState: input.builder_state,
            adAccountId: input.ad_account_id ?? null,
          };
          if (storageKey) {
            const next = [draft, ...legacyDrafts].slice(0, 30);
            window.localStorage.setItem(storageKey, JSON.stringify(next));
            setLegacyDrafts(next);
          }
          return draft;
        }
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: metaCampaignKeys.byCompany(companyId) });
    },
  });

  const updateDraftMutation = useMutation({
    mutationFn: async (input: {
      id: string;
      builder_state: Record<string, unknown>;
      name: string;
      objective: string;
      daily_budget_cents: number;
    }): Promise<MetaCampaignRow | LegacyDraft> => {
      if (!companyId) throw new Error("no_company_id");

      // Prova DB
      try {
        const { data, error } = await metaTable("meta_campaigns")
          .update({
            name: input.name,
            objective: input.objective,
            daily_budget_cents: input.daily_budget_cents,
            builder_state: input.builder_state,
          })
          .eq("id", input.id)
          .eq("company_id", companyId)
          .select("*")
          .single();
        if (!error && data) return data as MetaCampaignRow;
        throw error;
      } catch (err) {
        const msg = testoTecnico(err);
        if (
          msg.includes("does not exist") ||
          msg.includes("schema cache") ||
          msg.includes("relation") ||
          msg.includes("No rows")
        ) {
          // Fallback: cerca in legacy
          if (storageKey) {
            const next = legacyDrafts.map((d) =>
              d.id === input.id
                ? {
                    ...d,
                    name: input.name,
                    objective: input.objective,
                    budgetCents: input.daily_budget_cents,
                    builderState: input.builder_state,
                    updatedAt: new Date().toISOString(),
                  }
                : d,
            );
            window.localStorage.setItem(storageKey, JSON.stringify(next));
            setLegacyDrafts(next);
            const updated = next.find((d) => d.id === input.id);
            if (updated) return updated;
          }
          throw new Error("draft_not_found", { cause: err });
        }
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: metaCampaignKeys.byCompany(companyId) });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (input: {
      id: string;
      status: MetaCampaignStatus;
      publish_error?: string | null;
    }): Promise<MetaCampaignRow | LegacyDraft> => {
      if (!companyId) throw new Error("no_company_id");

      try {
        const { data, error } = await metaTable("meta_campaigns")
          .update({
            status: input.status,
            publish_error: input.publish_error ?? null,
          })
          .eq("id", input.id)
          .eq("company_id", companyId)
          .select("*")
          .single();
        if (!error && data) return data as MetaCampaignRow;
        throw error;
      } catch (err) {
        const msg = testoTecnico(err);
        if (
          msg.includes("does not exist") ||
          msg.includes("schema cache") ||
          msg.includes("relation") ||
          msg.includes("No rows") ||
          msg.includes("permission denied")
        ) {
          if (storageKey) {
            const next = legacyDrafts.map((d) =>
              d.id === input.id
                ? {
                    ...d,
                    status: input.status,
                    publishError: input.publish_error ?? null,
                    updatedAt: new Date().toISOString(),
                  }
                : d,
            );
            window.localStorage.setItem(storageKey, JSON.stringify(next));
            setLegacyDrafts(next);
            const updated = next.find((d) => d.id === input.id);
            if (updated) return updated;
          }
          throw new Error("draft_not_found", { cause: err });
        }
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: metaCampaignKeys.byCompany(companyId) });
      queryClient.invalidateQueries({ queryKey: ["meta-pending-approvals", companyId] });
    },
  });

  const deleteDraftMutation = useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!companyId) throw new Error("no_company_id");

      // Prova DB (soft delete via status='archived')
      try {
        const { error } = await metaTable("meta_campaigns")
          .update({ status: "archived" })
          .eq("id", id)
          .eq("company_id", companyId);
        if (!error) return;
        throw error;
      } catch (err) {
        const msg = testoTecnico(err);
        if (
          msg.includes("does not exist") ||
          msg.includes("schema cache") ||
          msg.includes("relation")
        ) {
          // Fallback legacy
          if (storageKey) {
            const next = legacyDrafts.filter((d) => d.id !== id);
            window.localStorage.setItem(storageKey, JSON.stringify(next));
            setLegacyDrafts(next);
          }
          return;
        }
        throw err;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: metaCampaignKeys.byCompany(companyId) });
    },
  });

  const findCampaign = useCallback(
    (id: string): MetaCampaignRow | null => {
      return allCampaigns.find((c) => c.id === id) ?? null;
    },
    [allCampaigns],
  );

  return {
    campaigns: allCampaigns,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
    saveDraft: saveDraftMutation.mutateAsync,
    updateDraft: updateDraftMutation.mutateAsync,
    updateStatus: updateStatusMutation.mutateAsync,
    deleteDraft: deleteDraftMutation.mutateAsync,
    isSaving: saveDraftMutation.isPending,
    isUpdating: updateDraftMutation.isPending,
    isDeleting: deleteDraftMutation.isPending,
    findCampaign,
  };
}

/* ----------------------- AGGREGATES ----------------------- */

/**
 * Aggrega statistiche per le campaigns (count ad_sets + ads + spend ultimi 30gg).
 * Per ora restituisce 0 finché meta_insights_cache non viene popolata da
 * meta-ads-sync-insights (FASE 5).
 */
export function useMetaCampaignStats(
  campaigns: MetaCampaignRow[],
): CampaignWithStats[] {
  return useMemo(
    () =>
      campaigns.map((c) => ({
        ...c,
        ad_set_count:
          ((c.builder_state as Record<string, unknown>)?.adSets as unknown[])?.length ?? 0,
        ad_count:
          ((c.builder_state as Record<string, unknown>)?.creatives as unknown[])?.length ?? 0,
        last_30d_spend_cents: 0,
        last_30d_leads: 0,
        last_30d_cpl_cents: null,
      })),
    [campaigns],
  );
}
