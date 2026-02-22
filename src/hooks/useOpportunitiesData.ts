import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export function usePipelines() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: ["marketing_pipelines", companyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_pipelines")
        .select("*, marketing_pipeline_stages(id, name, position)")
        .eq("company_id", companyId!)
        .order("position");
      if (error) throw error;
      // Sort stages by position
      return data.map((p: any) => ({
        ...p,
        marketing_pipeline_stages: (p.marketing_pipeline_stages || []).sort((a: any, b: any) => a.position - b.position),
      }));
    },
    enabled: !!companyId,
  });
}

export function useOpportunities(pipelineId: string | null) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: ["marketing_opportunities", companyId, pipelineId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_opportunities")
        .select("*, marketing_contacts(id, first_name, last_name, email, phone, city, source, company_name)")
        .eq("company_id", companyId!)
        .eq("pipeline_id", pipelineId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!companyId && !!pipelineId,
  });
}

export function useCreateOpportunity() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      contact_id: string;
      pipeline_id: string;
      stage_id: string;
      name: string;
      value?: number;
      status?: string;
      source?: string;
      assigned_to?: string;
      follower_id?: string;
      company_name?: string;
      notes?: string;
    }) => {
      const { error } = await supabase.from("marketing_opportunities").insert({
        ...data,
        company_id: companyId!,
        value: data.value || 0,
        status: data.status || "open",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_opportunities"] });
      toast.success("Opportunità creata");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateOpportunityStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, stage_id }: { id: string; stage_id: string }) => {
      const { error } = await supabase
        .from("marketing_opportunities")
        .update({ stage_id })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_opportunities"] });
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useDeleteOpportunity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("marketing_opportunities").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_opportunities"] });
      toast.success("Opportunità eliminata");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
