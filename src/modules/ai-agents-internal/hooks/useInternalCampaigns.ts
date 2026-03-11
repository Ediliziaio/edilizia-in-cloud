import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import type { InternalCampaign, InternalCampaignInsert, CampaignStatus } from "../types/internalAgent.types";

async function getCompanyId(): Promise<{ companyId: string; userId: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Non autenticato");
  const { data: profile } = await supabase
    .from("profiles" as never)
    .select("company_id")
    .eq("id", user.id)
    .single();
  const companyId = (profile as any)?.company_id;
  if (!companyId) throw new Error("Nessuna azienda associata");
  return { companyId, userId: user.id };
}

export function useInternalCampaigns() {
  const qc = useQueryClient();
  const key = queryKeys.internalCampaigns.all;

  const campaignsQuery = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { companyId } = await getCompanyId();
      const { data, error } = await supabase
        .from("internal_outbound_campaigns" as never)
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as InternalCampaign[];
    },
  });

  const statsQuery = useQuery({
    queryKey: [...key, "stats"],
    queryFn: async () => {
      const { companyId } = await getCompanyId();
      const { data, error } = await supabase
        .from("internal_outbound_campaigns" as never)
        .select("status, total_calls, calls_answered, calls_failed")
        .eq("company_id", companyId);
      if (error) throw error;
      const rows = (data || []) as any[];
      return {
        active: rows.filter((r) => r.status === "running" || r.status === "scheduled").length,
        completed: rows.filter((r) => r.status === "completed").length,
        totalCalls: rows.reduce((s: number, r: any) => s + (r.total_calls || 0), 0),
        totalAnswered: rows.reduce((s: number, r: any) => s + (r.calls_answered || 0), 0),
      };
    },
  });

  const createCampaign = useMutation({
    mutationFn: async (input: InternalCampaignInsert) => {
      const { companyId, userId } = await getCompanyId();
      const { data, error } = await supabase
        .from("internal_outbound_campaigns" as never)
        .insert({
          ...input,
          company_id: companyId,
          created_by: userId,
        } as never)
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
        .from("internal_outbound_campaigns" as never)
        .update(updates as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast.success("Stato aggiornato");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteCampaign = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("internal_outbound_campaigns" as never)
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
      await supabase
        .from("internal_outbound_campaigns" as never)
        .update({ status: "running", started_at: new Date().toISOString() } as never)
        .eq("id", campaignId);
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
