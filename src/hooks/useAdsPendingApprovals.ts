/**
 * useAdsPendingApprovals — lista campagne in stato 'review' (da approvare).
 *
 * Usato da:
 *   • Banner notifica nella home del modulo (titolare vede subito quante in coda)
 *   • Tab "Approvazioni" filtrata
 */
import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { MetaCampaignRow } from "@/types/metaAds";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const metaTable = (n: string) => (supabase as any).from(n);

export function useAdsPendingApprovals(companyId: string | undefined) {
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ["meta-pending-approvals", companyId],
    queryFn: async (): Promise<MetaCampaignRow[]> => {
      if (!companyId) return [];
      try {
        const { data, error } = await metaTable("meta_campaigns")
          .select("*")
          .eq("company_id", companyId)
          .eq("status", "review")
          .order("created_at", { ascending: false });
        if (error) {
          const msg = String(error.message ?? "");
          if (msg.includes("does not exist") || msg.includes("schema cache")) return [];
          throw error;
        }
        return (data ?? []) as MetaCampaignRow[];
      } catch {
        return [];
      }
    },
    enabled: !!companyId,
    staleTime: 20_000,
    refetchInterval: 30_000, // polling per i titolari
    refetchIntervalInBackground: false,
  });

  const decideMutation = useMutation({
    mutationFn: async (input: {
      campaign_id: string;
      decision: "approve" | "reject";
      reason?: string;
      publish_live?: boolean;
    }) => {
      if (!companyId) throw new Error("no_company_id");
      const { data, error } = await supabase.functions.invoke<{
        success: boolean;
        decision: string;
        new_status: string;
        reason?: string;
        error?: string;
        detail?: string;
        note?: string;
      }>("meta-ads-approval-decide", {
        body: {
          company_id: companyId,
          campaign_id: input.campaign_id,
          decision: input.decision,
          reason: input.reason,
          publish_live: input.publish_live ?? false,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.detail || data.error);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["meta-pending-approvals", companyId] });
      qc.invalidateQueries({ queryKey: ["meta-campaigns"] });
      if (data?.decision === "approve") {
        toast.success("Campagna approvata", {
          description: data.note ?? `Nuovo stato: ${data.new_status}`,
        });
      } else {
        toast.info("Campagna rifiutata", {
          description: data?.reason ?? "Tornata in bozza per modifiche.",
        });
      }
    },
    onError: (err) => {
      toast.error("Errore decisione", { description: String((err as Error).message ?? err) });
    },
  });

  return useMemo(
    () => ({
      pending: query.data ?? [],
      count: query.data?.length ?? 0,
      isLoading: query.isLoading,
      decide: decideMutation.mutateAsync,
      isDeciding: decideMutation.isPending,
    }),
    [query.data, query.isLoading, decideMutation.mutateAsync, decideMutation.isPending],
  );
}
