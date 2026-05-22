/**
 * useMetaInsights — legge meta_insights_cache per una campagna.
 *
 * Restituisce serie temporale dei dati performance (spend, lead, CPL nel tempo).
 * Permette anche di triggerare un sync manuale via meta-ads-sync-insights.
 */

import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface MetaInsightDay {
  date_start: string;
  date_stop: string;
  spend_cents: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpm_cents: number;
  cpc_cents: number;
  reach: number;
  frequency: number;
  leads: number;
  cost_per_lead_cents: number;
}

export interface MetaInsightsSummary {
  total_spend_cents: number;
  total_impressions: number;
  total_clicks: number;
  total_leads: number;
  avg_cpl_cents: number;
  avg_ctr: number;
  days_count: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cacheTable = () => (supabase as any).from("meta_insights_cache");

export function useMetaInsights(opts: {
  companyId: string | undefined;
  campaignId?: string;
  daysBack?: number;
}) {
  const { companyId, campaignId, daysBack = 30 } = opts;
  const qc = useQueryClient();

  const fromDate = useMemo(() => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - daysBack);
    return d.toISOString().split("T")[0];
  }, [daysBack]);

  const query = useQuery({
    queryKey: ["meta-insights", companyId, campaignId, daysBack],
    queryFn: async (): Promise<MetaInsightDay[]> => {
      if (!companyId) return [];
      try {
        let q = cacheTable()
          .select(
            "date_start, date_stop, spend_cents, impressions, clicks, ctr, cpm_cents, cpc_cents, reach, frequency, leads, cost_per_lead_cents",
          )
          .eq("company_id", companyId)
          .gte("date_start", fromDate)
          .order("date_start", { ascending: true });

        if (campaignId) q = q.eq("campaign_id", campaignId);
        const { data, error } = await q;
        if (error) {
          const msg = String(error.message ?? "");
          if (msg.includes("does not exist") || msg.includes("schema cache")) return [];
          throw error;
        }
        return (data ?? []) as MetaInsightDay[];
      } catch {
        return [];
      }
    },
    enabled: !!companyId,
    staleTime: 60_000,
  });

  const summary = useMemo<MetaInsightsSummary>(() => {
    const rows = query.data ?? [];
    if (rows.length === 0) {
      return {
        total_spend_cents: 0,
        total_impressions: 0,
        total_clicks: 0,
        total_leads: 0,
        avg_cpl_cents: 0,
        avg_ctr: 0,
        days_count: 0,
      };
    }
    const total_spend = rows.reduce((s, r) => s + r.spend_cents, 0);
    const total_leads = rows.reduce((s, r) => s + r.leads, 0);
    return {
      total_spend_cents: total_spend,
      total_impressions: rows.reduce((s, r) => s + r.impressions, 0),
      total_clicks: rows.reduce((s, r) => s + r.clicks, 0),
      total_leads,
      avg_cpl_cents: total_leads > 0 ? Math.round(total_spend / total_leads) : 0,
      avg_ctr: rows.reduce((s, r) => s + r.ctr, 0) / rows.length,
      days_count: rows.length,
    };
  }, [query.data]);

  const syncMutation = useMutation({
    mutationFn: async () => {
      if (!companyId) throw new Error("no_company_id");
      const { data, error } = await supabase.functions.invoke<{
        companies_processed: number;
        campaigns_synced: number;
        insights_rows_written: number;
        errors: string[];
      }>("meta-ads-sync-insights", {
        body: { company_id: companyId, force: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["meta-insights", companyId] });
      if (data) {
        const errs = data.errors?.length ?? 0;
        if (errs > 0) {
          toast.warning(`Sync parziale: ${data.insights_rows_written} righe (${errs} errori)`);
        } else {
          toast.success(`Sync completato: ${data.insights_rows_written} righe`);
        }
      } else {
        toast.success("Sync avviato");
      }
    },
    onError: (err) => {
      toast.error("Sync fallito", { description: String((err as Error).message ?? err) });
    },
  });

  return {
    insights: query.data ?? [],
    summary,
    isLoading: query.isLoading,
    syncNow: () => syncMutation.mutate(),
    isSyncing: syncMutation.isPending,
  };
}
