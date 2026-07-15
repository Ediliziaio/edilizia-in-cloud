import { useQuery, useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
import { useEffect, useMemo } from "react";
import { usePermissions } from "@/hooks/usePermissions";
import { useCompanyStaffUsers } from "@/hooks/useCompanyStaffUsers";
import { withClientTimeout, retryListQuery } from "@/lib/query-timeout";

export function usePipelines() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: queryKeys.pipelines.list(companyId),
    queryFn: async () => {
      const { data, error } = await withClientTimeout(
        supabase
          .from("marketing_pipelines")
          .select("*, marketing_pipeline_stages(id, name, position, auto_status)")
          .eq("company_id", companyId!)
          .order("position"),
        "Caricamento pipeline opportunità",
      );
      if (error) throw error;
      return data.map((p: any) => ({
        ...p,
        marketing_pipeline_stages: (p.marketing_pipeline_stages || []).sort((a: any, b: any) => a.position - b.position),
      }));
    },
    enabled: !!companyId,
    // Timeout transitorio al primo load → 1 retry (era retry:false: il
    // kanban restava in errore al primo colpo freddo).
    retry: retryListQuery,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

const PAGE_SIZE = 500;
const MAX_AUTO_PAGES = typeof window !== "undefined" && window.innerWidth < 768 ? 1 : 3;

function canEditOpportunities(permissions: ReturnType<typeof usePermissions>) {
  return permissions.canEditMarketingOpportunities || permissions.canEditMarketing;
}

function validateOpportunityPayload(data: Record<string, any>) {
  if ("contact_id" in data && !data.contact_id) throw new Error("Seleziona un contatto");
  if ("pipeline_id" in data && !data.pipeline_id) throw new Error("Seleziona una pipeline");
  if ("stage_id" in data && !data.stage_id) throw new Error("Seleziona una fase");
  if ("name" in data && !String(data.name || "").trim()) throw new Error("Inserisci il nome dell'opportunità");
  if ("value" in data && data.value !== null && data.value !== undefined && data.value !== "") {
    const numericValue = Number(data.value);
    if (!Number.isFinite(numericValue) || numericValue < 0) throw new Error("Il valore economico deve essere un numero positivo");
  }
  if ("status" in data && data.status === "lost" && !data.lost_reason_category && !data.lost_reason && !data.loss_reason) {
    throw new Error("Indica il motivo prima di segnare l'opportunità come persa");
  }
}

async function countOpportunityLinks(opportunityId: string, companyId: string) {
  const linkedTables = [
    "marketing_contact_notes",
    "marketing_documents",
    "marketing_opportunity_notes",
    "quotes",
    "render_bagno_sessions",
    "render_facciata_sessions",
    "render_pavimento_sessions",
    "render_pergole_sessions",
    "render_persiane_sessions",
    "render_piscine_sessions",
    "render_sessions",
    "render_stanza_sessions",
    "render_technical_sessions",
    "render_tetto_sessions",
    "tasks",
  ];

  const counts = await Promise.all(linkedTables.map(async (table) => {
    const { count, error } = await supabase
      .from(table as any)
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)
      .eq("opportunity_id", opportunityId);
    if (error) throw error;
    return count || 0;
  }));

  return counts.reduce((sum, count) => sum + count, 0);
}

async function enrichPage(data: any[], companyId: string) {
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
  // Giorno ITALIANO, non UTC (convenzione anti UTC-drift del progetto).
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Rome" });

  if (oppIds.length > 0) {
    // Chunk da 100 id: PostgREST tronca comunque a max_rows (1000) per
    // chiamata — con 500 opportunità in un colpo solo i badge note/documenti
    // si azzeravano in silenzio oltre le 1000 righe totali.
    const chunk = <T,>(arr: T[], size: number): T[][] => {
      const out: T[][] = [];
      for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
      return out;
    };
    const oppChunks = chunk(oppIds, 100);
    const contactChunks = chunk(contactIds, 100);

    const [notesResults, docsResults, apptResults] = await Promise.all([
      Promise.all(oppChunks.map((ids) =>
        supabase.from("marketing_contact_notes").select("opportunity_id").eq("company_id", companyId).in("opportunity_id", ids).limit(1000),
      )),
      Promise.all(oppChunks.map((ids) =>
        supabase.from("marketing_documents").select("opportunity_id").eq("company_id", companyId).in("opportunity_id", ids).limit(1000),
      )),
      Promise.all(contactChunks.map((ids) =>
        supabase
          .from("appointments")
          .select("contact_id, appointment_date, appointment_time")
          .eq("company_id", companyId)
          .in("contact_id", ids)
          .gte("appointment_date", today)
          .neq("status", "annullato")
          .order("appointment_date", { ascending: true })
          .order("appointment_time", { ascending: true, nullsFirst: false })
          .limit(1000),
      )),
    ]);

    for (const res of notesResults) {
      res?.data?.forEach((n: any) => {
        if (n.opportunity_id) notesCountMap[n.opportunity_id] = (notesCountMap[n.opportunity_id] || 0) + 1;
      });
    }
    for (const res of docsResults) {
      res?.data?.forEach((d: any) => {
        if (d.opportunity_id) docsCountMap[d.opportunity_id] = (docsCountMap[d.opportunity_id] || 0) + 1;
      });
    }
    for (const res of apptResults) {
      res?.data?.forEach((a: any) => {
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
    // Scope permessi nella key: con onlyAssigned la query filtra assigned_to,
    // ma la cache era condivisa → "Visualizza come" serviva il dataset pieno.
    queryKey: [...queryKeys.opportunities.list(companyId, pipelineId), permissions.onlyAssigned ? user?.id ?? "me" : "all"],
    queryFn: async ({ pageParam = 0 }) => {
      const from = pageParam * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      let query = supabase
        .from("marketing_opportunities")
        .select("*, marketing_contacts(id, first_name, last_name, email, phone, city, address, province, region, postal_code, source, company_name, tags, last_activity_at, created_at)")
        .eq("company_id", companyId!)
        .eq("pipeline_id", pipelineId!)
        // Soft-delete (migration 20260506200000): la colonna esiste con indice
        // partial ma nessuna query la filtrava — righe soft-deleted sarebbero
        // riapparse nel kanban.
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(from, to);
      // Permission enforcement: restrict to assigned opportunities only
      if (permissions.onlyAssigned && user?.id) {
        query = query.eq("assigned_to", user.id);
      }
      const { data, error } = await withClientTimeout(query, "Caricamento opportunità", 15_000);
      if (error) throw error;
      const enriched = await withClientTimeout(enrichPage(data, companyId!), "Arricchimento opportunità", 15_000);
      return enriched;
    },
    initialPageParam: 0,
    getNextPageParam: (lastPage, _allPages, lastPageParam) => {
      return lastPage.length === PAGE_SIZE ? lastPageParam + 1 : undefined;
    },
    enabled: !!companyId && !!pipelineId,
    retry: retryListQuery,
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
    error: infiniteQuery.error,
    refetch: infiniteQuery.refetch,
    isFetchingNextPage: infiniteQuery.isFetchingNextPage,
    hasNextPage: infiniteQuery.hasNextPage,
    fetchNextPage: infiniteQuery.fetchNextPage,
    totalLoaded: opportunities.length,
  };
}

export function useCreateOpportunity() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();
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
      if (!companyId) throw new Error("Azienda non selezionata");
      if (!canEditOpportunities(permissions)) throw new Error("Non hai i permessi per creare opportunità");
      validateOpportunityPayload(data);
      const { data: result, error } = await supabase.from("marketing_opportunities").insert({
        ...data,
        name: data.name.trim(),
        company_id: companyId,
        value: Number(data.value || 0),
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
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();

  return useMutation({
    mutationFn: async ({ id, ...data }: { id: string; [key: string]: any }) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      if (!canEditOpportunities(permissions)) throw new Error("Non hai i permessi per modificare opportunità");
      validateOpportunityPayload(data);
      const { error } = await supabase
        .from("marketing_opportunities")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("company_id", companyId);
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
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();

  return useMutation({
    mutationFn: async ({ id, stage_id, auto_status }: { id: string; stage_id: string; auto_status?: string }) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      if (!canEditOpportunities(permissions)) throw new Error("Non hai i permessi per spostare opportunità");
      validateOpportunityPayload({ stage_id });
      const updateData: any = { stage_id };
      if (auto_status) {
        updateData.status = auto_status;
      }

      const { error } = await supabase
        .from("marketing_opportunities")
        .update({ ...updateData, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onMutate: async ({ id, stage_id, auto_status }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.opportunities.all });

      const previousData = queryClient.getQueriesData({ queryKey: queryKeys.opportunities.all });
      const now = new Date().toISOString();

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
                    ? { ...o, stage_id, stage_changed_at: now, updated_at: now, ...(auto_status ? { status: auto_status } : {}) }
                    : o
                )
              ),
            };
          }
          // Fallback for flat array
          if (Array.isArray(old)) {
            return old.map((o: any) =>
              o.id === id
                ? { ...o, stage_id, stage_changed_at: now, updated_at: now, ...(auto_status ? { status: auto_status } : {}) }
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
    onSuccess: (_data, vars) => {
      // Il drag verso una fase "persa" imposta lo status senza chiedere il
      // motivo (gli altri percorsi lo esigono): non inventiamo dati, ma
      // ricordiamo all'utente di completarlo — i report motivi-perdita
      // dipendono da lost_reason_category.
      if (vars.auto_status === "lost") {
        toast.info("Opportunità segnata come persa: aggiungi il motivo dal dettaglio", { duration: 6000 });
      }
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
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();

  return useMutation({
    mutationFn: async (id: string) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      if (!canEditOpportunities(permissions)) throw new Error("Non hai i permessi per eliminare opportunità");
      const linkedRecords = await countOpportunityLinks(id, companyId);
      if (linkedRecords > 0) {
        const { error } = await supabase
          .from("marketing_opportunities")
          .update({ status: "abandoned", updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("company_id", companyId);
        if (error) throw error;
        return { archived: true };
      }

      const { error } = await supabase
        .from("marketing_opportunities")
        .delete()
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
      return { archived: false };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketing.all });
      toast.success(result?.archived ? "Opportunità archiviata: aveva dati collegati" : "Opportunità eliminata");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useCompanyStaff() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const staffQuery = useCompanyStaffUsers(companyId, "all");

  const data = useMemo(
    () => (staffQuery.data || []).map((p) => ({
      id: p.id,
      name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
      roles: p.roles || [],
    })),
    [staffQuery.data]
  );

  return { ...staffQuery, data };
}

/**
 * Returns i VENDITORI assegnabili alle opportunità (campo "Venditore").
 * Sono i ruoli commerciali — super_admin / company_admin / salesperson — così
 * che anche un titolare/admin che vende (tipico nelle PMI) sia assegnabile e
 * finisca nelle statistiche venditori (la RPC raggruppa per assigned_to).
 * ESCLUDE chi è SOLO call center: il CC resta selezionabile nel suo campo
 * dedicato (useCompanyCallCenterUsers), ma non è un "venditore che chiude".
 */
export function useCompanySalespeople() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const staffQuery = useCompanyStaffUsers(companyId, "sales");

  const data = useMemo(
    () =>
      (staffQuery.data || [])
        // tieni admin/titolari e venditori; escludi chi ha SOLO il ruolo call_center
        .filter((p) => {
          const roles = p.roles ?? [];
          return roles.length === 0 || roles.some((r) => r !== "call_center");
        })
        .map((p) => ({
          id: p.id,
          name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
          source: p.roles?.includes("salesperson") ? "role" : "area",
        })),
    [staffQuery.data]
  );

  return { ...staffQuery, data };
}

/**
 * Returns call center users for the company.
 * Same cascade strategy as salespeople but for role='call_center'.
 */
export function useCompanyCallCenterUsers() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const staffQuery = useCompanyStaffUsers(companyId, "sales");

  const data = useMemo(
    () => (staffQuery.data || [])
      .filter((p) => !p.roles?.length || p.roles.includes("call_center") || p.roles.includes("company_admin") || p.roles.includes("super_admin"))
      .map((p) => ({
        id: p.id,
        name: `${p.first_name || ""} ${p.last_name || ""}`.trim(),
        source: p.roles?.includes("call_center") ? "role" : "area",
      })),
    [staffQuery.data]
  );

  return { ...staffQuery, data };
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
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;

  return useQuery({
    queryKey: queryKeys.marketingContacts.notes(contactId, opportunityId),
    queryFn: async () => {
      if (!contactId) {
        // Fallback: only notes linked to this opportunity
        const { data, error } = await supabase
          .from("marketing_contact_notes")
          .select("*")
          .eq("company_id", companyId!)
          .eq("opportunity_id", opportunityId!)
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data;
      }
      // Get all notes for the contact (both generic and opportunity-specific)
      const { data, error } = await supabase
        .from("marketing_contact_notes")
        .select("*")
        .eq("company_id", companyId!)
        .eq("contact_id", contactId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!opportunityId && !!companyId,
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
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();

  return useMutation({
    mutationFn: async ({ ids, data }: { ids: string[]; data: Record<string, any> }) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      if (!canEditOpportunities(permissions)) throw new Error("Non hai i permessi per modificare opportunità");
      if (ids.length === 0) return;
      validateOpportunityPayload(data);
      // Batch update: use .in() instead of N individual requests
      const { error } = await supabase
        .from("marketing_opportunities")
        .update({ ...data, updated_at: new Date().toISOString() })
        .eq("company_id", companyId)
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

/** Aggiunge o rimuove etichette in blocco senza sovrascrivere quelle esistenti
 *  (append/remove atomico lato DB via RPC company-scoped). */
export function useBulkTagOpportunities() {
  const queryClient = useQueryClient();
  const permissions = usePermissions();

  return useMutation({
    mutationFn: async ({ ids, tags, mode }: { ids: string[]; tags: string[]; mode: "add" | "remove" }) => {
      if (!canEditOpportunities(permissions)) throw new Error("Non hai i permessi per modificare opportunità");
      if (ids.length === 0 || tags.length === 0) return;
      const { error } = await (supabase as any).rpc("bulk_tag_opportunities", {
        p_ids: ids,
        p_tags: tags,
        p_mode: mode,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketing.all });
      toast.success(vars.mode === "add" ? "Etichette aggiunte" : "Etichette rimosse");
    },
    onError: (e: any) => toast.error(e.message),
  });
}

export function useBulkDeleteOpportunities() {
  const queryClient = useQueryClient();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const permissions = usePermissions();

  return useMutation({
    mutationFn: async (ids: string[]) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      if (!canEditOpportunities(permissions)) throw new Error("Non hai i permessi per eliminare opportunità");
      if (ids.length === 0) return;
      const linkedCounts = await Promise.all(ids.map(async (id) => ({
        id,
        links: await countOpportunityLinks(id, companyId),
      })));
      const archiveIds = linkedCounts.filter((item) => item.links > 0).map((item) => item.id);
      const deleteIds = linkedCounts.filter((item) => item.links === 0).map((item) => item.id);

      if (archiveIds.length > 0) {
        const { error } = await supabase
          .from("marketing_opportunities")
          .update({ status: "abandoned", updated_at: new Date().toISOString() })
          .eq("company_id", companyId)
          .in("id", archiveIds);
        if (error) throw error;
      }

      if (deleteIds.length > 0) {
        const { error } = await supabase
          .from("marketing_opportunities")
          .delete()
          .eq("company_id", companyId)
          .in("id", deleteIds);
        if (error) throw error;
      }

      return { archived: archiveIds.length, deleted: deleteIds.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketingContacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.marketing.all });
      const archived = result?.archived || 0;
      const deleted = result?.deleted || 0;
      if (archived && deleted) toast.success(`${deleted} eliminate, ${archived} archiviate perché avevano dati collegati`);
      else if (archived) toast.success(`${archived} opportunità archiviate perché avevano dati collegati`);
      else toast.success("Opportunità eliminate");
    },
    onError: (e: any) => toast.error(e.message),
  });
}
