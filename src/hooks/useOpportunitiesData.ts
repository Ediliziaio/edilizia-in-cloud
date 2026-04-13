import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import { useEffect, useMemo } from "react";
import { usePermissions } from "@/hooks/usePermissions";

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

const PAGE_SIZE = 500;
const MAX_AUTO_PAGES = typeof window !== "undefined" && window.innerWidth < 768 ? 1 : 3;

async function enrichPage(data: any[]) {
  // Enrich with assigned profile names
  const assignedIds = [...new Set(data.filter((o) => o.assigned_to).map((o) => o.assigned_to))];
  const profilesMap: Record<string, { first_name: string; last_name: string }> = {};
  if (assignedIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name")
      .in("id", assignedIds);
    if (profiles) {
      profiles.forEach((p: any) => { profilesMap[p.id] = p; });
    }
  }

  const oppIds = data.map((o) => o.id);
  const contactIds = [...new Set(data.filter((o) => o.contact_id).map((o) => o.contact_id))];
  const notesCountMap: Record<string, number> = {};
  const docsCountMap: Record<string, number> = {};
  const appointmentMap: Record<string, { date: string; time: string | null }> = {};
  const today = new Date().toISOString().split("T")[0];

  if (oppIds.length > 0) {
    // Run all enrichment queries in parallel
    const enrichPromises: Promise<any>[] = [
      supabase.from("marketing_contact_notes").select("opportunity_id").in("opportunity_id", oppIds).limit(1000),
      supabase.from("marketing_documents").select("opportunity_id").in("opportunity_id", oppIds).limit(1000),
    ];
    if (contactIds.length > 0) {
      enrichPromises.push(
        supabase
          .from("appointments")
          .select("contact_id, appointment_date, appointment_time")
          .in("contact_id", contactIds)
          .gte("appointment_date", today)
          .neq("status", "annullato")
          .order("appointment_date", { ascending: true })
          .order("appointment_time", { ascending: true, nullsFirst: false })
          .limit(1000)
      );
    }

    const results = await Promise.all(enrichPromises);
    const notesRes = results[0];
    const docsRes = results[1];
    const apptRes = results[2];

    if (notesRes?.data) {
      notesRes.data.forEach((n: any) => {
        if (n.opportunity_id) notesCountMap[n.opportunity_id] = (notesCountMap[n.opportunity_id] || 0) + 1;
      });
    }
    if (docsRes?.data) {
      docsRes.data.forEach((d: any) => {
        if (d.opportunity_id) docsCountMap[d.opportunity_id] = (docsCountMap[d.opportunity_id] || 0) + 1;
      });
    }
    if (apptRes?.data) {
      apptRes.data.forEach((a: any) => {
        if (a.contact_id && !appointmentMap[a.contact_id]) {
          appointmentMap[a.contact_id] = { date: a.appointment_date, time: a.appointment_time };
        }
      });
    }
  }

  return data.map((o) => ({
    ...o,
    assigned_profile: o.assigned_to ? profilesMap[o.assigned_to] || null : null,
    notes_count: notesCountMap[o.id] || 0,
    documents_count: docsCountMap[o.id] || 0,
    next_appointment: o.contact_id ? appointmentMap[o.contact_id] || null : null,
  }));
}

export function useOpportunities(pipelineId: string | null) {
  const { effectiveCompany, user } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();

  const infiniteQuery = useInfiniteQuery({
    queryKey: queryKeys.opportunities.list(companyId, pipelineId),
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let query = supabase
        .from("marketing_opportunities")
        .select("*, marketing_contacts(id, first_name, last_name, email, phone, city, source, company_name, tags)")
        .eq("company_id", companyId!)
        .eq("pipeline_id", pipelineId!)
        .order("created_at", { ascending: false })
        .range(from, to);
      // Permission enforcement: restrict to assigned opportunities only
      if (permissions.onlyAssigned && user?.id) {
        query = query.eq("assigned_to", user.id);
      }
      const { data, error } = await query;
      if (error) throw error;
      const enriched = await enrichPage(data);
      return enriched;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      return lastPage.length === PAGE_SIZE ? lastPageParam + 1 : undefined;
    },
    enabled: !!companyId && !!pipelineId,
    staleTime: 2 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  // Auto-fetch capped: mobile loads 1 extra page (1000 total), desktop loads 3 (1500 total)
  useEffect(() => {
    const pageCount = infiniteQuery.data?.pages.length ?? 0;
    if (pageCount < MAX_AUTO_PAGES && infiniteQuery.hasNextPage && !infiniteQuery.isFetchingNextPage) {
      infiniteQuery.fetchNextPage();
    }
  }, [infiniteQuery.hasNextPage, infiniteQuery.isFetchingNextPage, infiniteQuery.data?.pages.length]);

  const opportunities = useMemo(
    () => infiniteQuery.data?.pages.flat() ?? [],
    [infiniteQuery.data?.pages]
  );

  return {
    data: opportunities,
    isLoading: infiniteQuery.isLoading,
    isFetchingNextPage: infiniteQuery.isFetchingNextPage,
    hasNextPage: infiniteQuery.hasNextPage,
    totalLoaded: opportunities.length,
  };
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
        (old: any) => {
          if (!old) return old;
          // Handle infinite query data structure { pages, pageParams }
          if (old.pages && Array.isArray(old.pages)) {
            return {
              ...old,
              pages: old.pages.map((page: any[]) =>
                page.map((o: any) =>
                  o.id === id
                    ? { ...o, stage_id, ...(auto_status ? { status: auto_status } : {}) }
                    : o
                )
              ),
            };
          }
          // Fallback for flat array
          if (Array.isArray(old)) {
            return old.map((o: any) =>
              o.id === id
                ? { ...o, stage_id, ...(auto_status ? { status: auto_status } : {}) }
                : o
            );
          }
          return old;
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
      // Use staff_permissions (company-level RLS) instead of user_roles (user-level RLS)
      const { data: perms } = await supabase
        .from("staff_permissions")
        .select("user_id")
        .eq("company_id", companyId);
      const validIds = (perms || []).map((p) => p.user_id);
      if (!validIds.length) return [];

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", validIds);

      return (profiles || [])
        .filter((p) => p.first_name || p.last_name)
        .map((p) => ({ id: p.id, name: `${p.first_name || ""} ${p.last_name || ""}`.trim() }));
    },
    enabled: !!companyId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Helper: fetch profiles for a set of user IDs.
 * Returns array of { id, name, source } — source indicates where the match came from.
 */
async function fetchProfilesByIds(ids: string[], source: string) {
  if (!ids.length) return [];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", ids);
  return (profiles || [])
    .filter((p) => p.first_name || p.last_name)
    .map((p) => ({ id: p.id, name: `${p.first_name || ""} ${p.last_name || ""}`.trim(), source }));
}

/**
 * Returns salespeople for the company.
 * Strategy (cascade):
 *  1. Users with role='salesperson' in user_roles
 *  2. Fallback: employees with area='commerciale' who have a user_id (user account)
 *  3. Fallback: all company staff (so dropdown is never empty)
 */
export function useCompanySalespeople() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: queryKeys.staff.salespeople(companyId),
    queryFn: async () => {
      if (!companyId) return [];

      // Get all company user IDs
      const { data: perms } = await supabase
        .from("staff_permissions")
        .select("user_id")
        .eq("company_id", companyId);
      const companyUserIds = (perms || []).map((p) => p.user_id);
      if (!companyUserIds.length) return [];

      // Strategy 1: user_roles → salesperson
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("user_id", companyUserIds)
        .eq("role", "salesperson");
      const salesIds = (roleData || []).map((r) => r.user_id);
      if (salesIds.length) return fetchProfilesByIds(salesIds, "role");

      // Strategy 2: employees with area='commerciale' and a linked user account
      const { data: empData } = await supabase
        .from("employees")
        .select("user_id")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .eq("area", "commerciale")
        .not("user_id", "is", null);
      const empUserIds = (empData || []).map((e: any) => e.user_id as string).filter(Boolean);
      if (empUserIds.length) return fetchProfilesByIds(empUserIds, "area");

      // Strategy 3: all company staff (never leave dropdown empty)
      return fetchProfilesByIds(companyUserIds, "all");
    },
    enabled: !!companyId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/**
 * Returns call center users for the company.
 * Same cascade strategy as salespeople but for role='call_center'.
 */
export function useCompanyCallCenterUsers() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: queryKeys.staff.callCenter(companyId),
    queryFn: async () => {
      if (!companyId) return [];

      const { data: perms } = await supabase
        .from("staff_permissions")
        .select("user_id")
        .eq("company_id", companyId);
      const companyUserIds = (perms || []).map((p) => p.user_id);
      if (!companyUserIds.length) return [];

      // Strategy 1: user_roles → call_center
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("user_id", companyUserIds)
        .eq("role", "call_center");
      const ccIds = (roleData || []).map((r) => r.user_id);
      if (ccIds.length) return fetchProfilesByIds(ccIds, "role");

      // Strategy 2: all company staff (call center is rarely a separate area)
      return fetchProfilesByIds(companyUserIds, "all");
    },
    enabled: !!companyId,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

/** Returns company staff filtered by area (cantiere, commerciale, amministrazione, tecnico) */
export function useCompanyStaffByArea(area?: string | string[]) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const areas = area ? (Array.isArray(area) ? area : [area]) : null;

  return useQuery({
    queryKey: ["company-staff-by-area", companyId, areas],
    queryFn: async () => {
      if (!companyId) return [];
      let query = supabase
        .from("employees")
        .select("id, first_name, last_name, role_type, area")
        .eq("company_id", companyId)
        .eq("is_active", true);

      if (areas && areas.length > 0) {
        query = query.in("area", areas);
      }

      const { data, error } = await query.order("last_name");
      if (error) {
        // Fallback if area column doesn't exist yet
        const { data: fallback } = await supabase
          .from("employees")
          .select("id, first_name, last_name, role_type")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("last_name");
        return (fallback || []).map((e: any) => ({
          id: e.id,
          firstName: e.first_name,
          lastName: e.last_name,
          name: `${e.first_name || ""} ${e.last_name || ""}`.trim(),
          area: e.role_type === "staff_interno" ? "amministrazione" : "cantiere",
          roleType: e.role_type,
        }));
      }

      return (data || []).map((e: any) => ({
        id: e.id,
        firstName: e.first_name,
        lastName: e.last_name,
        name: `${e.first_name || ""} ${e.last_name || ""}`.trim(),
        area: e.area || (e.role_type === "staff_interno" ? "amministrazione" : "cantiere"),
        roleType: e.role_type,
      }));
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
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
      // Batch update: use .in() instead of N individual requests
      const { error } = await supabase
        .from("marketing_opportunities")
        .update(data)
        .in("id", ids);
      if (error) throw error;
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
      // Batch delete: use .in() instead of N individual requests
      const { error } = await supabase
        .from("marketing_opportunities")
        .delete()
        .in("id", ids);
      if (error) throw error;
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
