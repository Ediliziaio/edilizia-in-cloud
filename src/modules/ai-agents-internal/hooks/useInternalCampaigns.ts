import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyId } from "@/hooks/useCompanyId";
import { toast } from "sonner";
import type { InternalCampaign, InternalCampaignInsert, CampaignStatus } from "../types/internalAgent.types";

export function useInternalCampaigns() {
  const { companyId } = useCompanyId();
  const qc = useQueryClient();
  const key = ["internal-campaigns", companyId];

  const campaignsQuery = useQuery({
    queryKey: key,
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internal_outbound_campaigns")
        .select("*")
        .eq("company_id", companyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as unknown as InternalCampaign[];
    },
  });

  const statsQuery = useQuery({
    queryKey: [...key, "stats"],
    enabled: !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("internal_outbound_campaigns")
        .select("status, total_calls, calls_answered, calls_failed")
        .eq("company_id", companyId!);
      if (error) throw error;
      const rows = data || [];
      return {
        active: rows.filter((r) => r.status === "running" || r.status === "scheduled").length,
        completed: rows.filter((r) => r.status === "completed").length,
        totalCalls: rows.reduce((s, r) => s + (r.total_calls || 0), 0),
        totalAnswered: rows.reduce((s, r) => s + (r.calls_answered || 0), 0),
      };
    },
  });

  const createCampaign = useMutation({
    mutationFn: async (input: InternalCampaignInsert) => {
      const { data: profile } = await supabase.from("profiles").select("id").limit(1).single();
      const { data, error } = await supabase
        .from("internal_outbound_campaigns")
        .insert({
          ...input,
          company_id: companyId!,
          created_by: profile!.id,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Campagna creata");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: CampaignStatus }) => {
      const updates: Record<string, unknown> = { status };
      if (status === "running") updates.started_at = new Date().toISOString();
      if (status === "completed") updates.completed_at = new Date().toISOString();

      const { error } = await supabase
        .from("internal_outbound_campaigns")
        .update(updates as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Stato campagna aggiornato");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("internal_outbound_campaigns")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Campagna eliminata");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startCampaign = useMutation({
    mutationFn: async (campaignId: string) => {
      // Update status first
      await supabase
        .from("internal_outbound_campaigns")
        .update({ status: "running", started_at: new Date().toISOString() } as any)
        .eq("id", campaignId);

      // Invoke the campaign manager edge function
      const { error } = await supabase.functions.invoke("internal-campaign-manager", {
        body: { campaign_id: campaignId },
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Campagna avviata");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return {
    campaigns: campaignsQuery.data || [],
    isLoading: campaignsQuery.isLoading,
    stats: statsQuery.data,
    createCampaign,
    updateStatus,
    deleteCampaign,
    startCampaign,
  };
}
