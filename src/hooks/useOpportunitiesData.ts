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
        .select("*, marketing_pipeline_stages(id, name, position, auto_status)")
        .eq("company_id", companyId!)
        .order("position");
      if (error) throw error;
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
      const { data: result, error } = await supabase.from("marketing_opportunities").insert({
        ...data,
        company_id: companyId!,
        value: data.value || 0,
        status: data.status || "open",
      }).select("id").single();
      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_opportunities"] });
      toast.success("Opportunità creata");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateOpportunity() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: any }) => {
      const { error } = await supabase
        .from("marketing_opportunities")
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_opportunities"] });
      toast.success("Opportunità aggiornata");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useUpdateOpportunityStage() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, stage_id, auto_status }: { id: string; stage_id: string; auto_status?: string }) => {
      const updateData: any = { stage_id };
      if (auto_status) {
        updateData.status = auto_status;
      }

      const { error } = await supabase
        .from("marketing_opportunities")
        .update(updateData)
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, stage_id, auto_status }) => {
      await queryClient.cancelQueries({ queryKey: ["marketing_opportunities"] });

      const previousData = queryClient.getQueriesData({ queryKey: ["marketing_opportunities"] });

      queryClient.setQueriesData(
        { queryKey: ["marketing_opportunities"] },
        (old: any[] | undefined) => {
          if (!old) return old;
          return old.map((o: any) =>
            o.id === id
              ? { ...o, stage_id, ...(auto_status ? { status: auto_status } : {}) }
              : o
          );
        }
      );

      return { previousData };
    },
    onError: (e: any, _vars, context) => {
      if (context?.previousData) {
        context.previousData.forEach(([queryKey, data]: any) => {
          queryClient.setQueryData(queryKey, data);
        });
      }
      toast.error(e.message);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_opportunities"] });
    },
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

export function useCompanyStaff() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: ["company_staff_roles", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .eq("company_id", companyId);
      if (!profiles?.length) return [];

      const userIds = profiles.map((p) => p.id);
      const { data: roles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", userIds);

      const validUserIds = roles
        ?.filter((r) => r.role === "company_admin" || r.role === "company_staff")
        .map((r) => r.user_id) || [];

      return profiles
        .filter((p) => validUserIds.includes(p.id))
        .map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}` }));
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useOpportunityNotes(opportunityId: string | null) {
  return useQuery({
    queryKey: ["marketing_opportunity_notes", opportunityId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_opportunity_notes")
        .select("*")
        .eq("opportunity_id", opportunityId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!opportunityId,
  });
}

export function useAddOpportunityNote() {
  const queryClient = useQueryClient();
  const { effectiveCompany, user } = useAuth();

  return useMutation({
    mutationFn: async ({ opportunityId, content }: { opportunityId: string; content: string }) => {
      const { error } = await supabase.from("marketing_opportunity_notes").insert({
        opportunity_id: opportunityId,
        company_id: effectiveCompany!.id,
        content,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["marketing_opportunity_notes"] });
      toast.success("Nota aggiunta");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
