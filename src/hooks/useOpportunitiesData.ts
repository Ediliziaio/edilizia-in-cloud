import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";

export function usePipelines() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: queryKeys.pipelines.list(companyId),
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
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useOpportunities(pipelineId: string | null) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: queryKeys.opportunities.list(companyId, pipelineId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_opportunities")
        .select("*, marketing_contacts(id, first_name, last_name, email, phone, city, source, company_name, tags)")
        .eq("company_id", companyId!)
        .eq("pipeline_id", pipelineId!)
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) throw error;

      // Enrich with assigned profile names
      const assignedIds = [...new Set(data.filter((o: any) => o.assigned_to).map((o: any) => o.assigned_to))];
      let profilesMap: Record<string, { first_name: string; last_name: string }> = {};
      if (assignedIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", assignedIds);
        if (profiles) {
          profiles.forEach((p: any) => { profilesMap[p.id] = p; });
        }
      }

      // Fetch notes counts, docs counts, and next appointments
      const oppIds = data.map((o: any) => o.id);
      const contactIds = [...new Set(data.filter((o: any) => o.contact_id).map((o: any) => o.contact_id))];
      let notesCountMap: Record<string, number> = {};
      let docsCountMap: Record<string, number> = {};
      let appointmentMap: Record<string, { date: string; time: string | null }> = {};

      const today = new Date().toISOString().split("T")[0];

      if (oppIds.length > 0) {
        const [notesRes, docsRes] = await Promise.all([
          supabase
            .from("marketing_contact_notes")
            .select("opportunity_id")
            .in("opportunity_id", oppIds)
            .limit(5000),
          supabase
            .from("marketing_documents")
            .select("opportunity_id")
            .in("opportunity_id", oppIds)
            .limit(5000),
        ]);

        let apptRes: any = null;
        if (contactIds.length > 0) {
          apptRes = await supabase
            .from("appointments")
            .select("contact_id, appointment_date, appointment_time")
            .in("contact_id", contactIds)
            .gte("appointment_date", today)
            .neq("status", "annullato")
            .order("appointment_date", { ascending: true })
            .order("appointment_time", { ascending: true, nullsFirst: false })
            .limit(5000);
        }

        if (notesRes.data) {
          notesRes.data.forEach((n: any) => {
            if (n.opportunity_id) notesCountMap[n.opportunity_id] = (notesCountMap[n.opportunity_id] || 0) + 1;
          });
        }
        if (docsRes.data) {
          docsRes.data.forEach((d: any) => {
            if (d.opportunity_id) docsCountMap[d.opportunity_id] = (docsCountMap[d.opportunity_id] || 0) + 1;
          });
        }
        if (apptRes?.data) {
          apptRes.data.forEach((a: any) => {
            // Keep only the first (nearest) appointment per contact
            if (a.contact_id && !appointmentMap[a.contact_id]) {
              appointmentMap[a.contact_id] = { date: a.appointment_date, time: a.appointment_time };
            }
          });
        }
      }

      return data.map((o: any) => ({
        ...o,
        assigned_profile: o.assigned_to ? profilesMap[o.assigned_to] || null : null,
        notes_count: notesCountMap[o.id] || 0,
        documents_count: docsCountMap[o.id] || 0,
        next_appointment: o.contact_id ? appointmentMap[o.contact_id] || null : null,
      }));
    },
    enabled: !!companyId && !!pipelineId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
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
      call_center_id?: string;
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
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketing.all });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketing.all });
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
      await queryClient.cancelQueries({ queryKey: queryKeys.opportunities.all });

      const previousData = queryClient.getQueriesData({ queryKey: queryKeys.opportunities.all });

      queryClient.setQueriesData(
        { queryKey: queryKeys.opportunities.all },
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
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketing.all });
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
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketing.all });
      toast.success("Opportunità eliminata");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useCompanyStaff() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: queryKeys.staff.roles(companyId),
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
        ?.filter((r) => ["company_admin", "company_staff", "salesperson", "call_center"].includes(r.role))
        .map((r) => r.user_id) || [];

      return profiles
        .filter((p) => validUserIds.includes(p.id))
        .map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}` }));
    },
    enabled: !!companyId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useCompanySalespeople() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: queryKeys.staff.salespeople(companyId),
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
        ?.filter((r) => r.role === "salesperson" || r.role === "company_admin")
        .map((r) => r.user_id) || [];

      return profiles
        .filter((p) => validUserIds.includes(p.id))
        .map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}` }));
    },
    enabled: !!companyId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useCompanyCallCenterUsers() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: queryKeys.staff.callCenter(companyId),
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
        ?.filter((r) => r.role === "call_center")
        .map((r) => r.user_id) || [];

      return profiles
        .filter((p) => validUserIds.includes(p.id))
        .map((p) => ({ id: p.id, name: `${p.first_name} ${p.last_name}` }));
    },
    enabled: !!companyId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

export function useOpportunityNotes(opportunityId: string | null, contactId?: string | null) {
  return useQuery({
    queryKey: queryKeys.marketingContacts.notes(contactId, opportunityId),
    queryFn: async () => {
      if (!contactId) {
        // Fallback: only notes linked to this opportunity
        const { data, error } = await supabase
          .from("marketing_contact_notes")
          .select("*")
          .eq("opportunity_id", opportunityId!)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data;
      }
      // Get all notes for the contact (both generic and opportunity-specific)
      const { data, error } = await supabase
        .from("marketing_contact_notes")
        .select("*")
        .eq("contact_id", contactId)
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
    mutationFn: async ({ opportunityId, contactId, content }: { opportunityId: string; contactId: string; content: string }) => {
      const { error } = await supabase.from("marketing_contact_notes").insert({
        contact_id: contactId,
        opportunity_id: opportunityId,
        company_id: effectiveCompany!.id,
        content,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      toast.success("Nota aggiunta");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useBulkUpdateOpportunities() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ids, data }: { ids: string[]; data: Record<string, any> }) => {
      const promises = ids.map((id) =>
        supabase.from("marketing_opportunities").update(data).eq("id", id).then(({ error }) => {
          if (error) throw error;
        })
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketing.all });
      toast.success("Opportunità aggiornate");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useBulkDeleteOpportunities() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      const promises = ids.map((id) =>
        supabase.from("marketing_opportunities").delete().eq("id", id).then(({ error }) => {
          if (error) throw error;
        })
      );
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketing.all });
      toast.success("Opportunità eliminate");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
