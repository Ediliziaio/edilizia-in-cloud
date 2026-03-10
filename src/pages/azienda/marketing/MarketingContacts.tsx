import { useState, useCallback, useMemo } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { useURLFilters } from "@/hooks/useURLFilters";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Upload, Plus, Download, Filter, ArrowUpDown, Settings2, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ContactsTable, type MarketingContact, type SortField, type SortDirection, loadVisibleColumns, saveVisibleColumns, getStorageKey } from "@/components/marketing/ContactsTable";
import { cleanPhone } from "@/lib/contactUtils";
import { ContactDialog, type ContactFormData } from "@/components/marketing/ContactDialog";
import { ContactListsView } from "@/components/marketing/ContactListsView";
import { AddToListDropdown } from "@/components/marketing/AddToListDropdown";
import { BulkEnrollAutomationDropdown } from "@/components/marketing/BulkEnrollAutomationDropdown";
import { ImportWizard } from "@/components/shared/ImportWizard";
import type { ImportField } from "@/components/shared/CSVImportDialog";
import { syncTagsToOpportunities, removeTagFromOpportunities } from "@/hooks/useTagSync";
import { exportToCSV, exportToXLSX } from "@/lib/csvExport";
import { useContactCustomFields } from "@/hooks/useOpportunityDetailData";
import { ContactFieldsSheet } from "@/components/marketing/ContactFieldsSheet";
import { ContactFiltersSheet, type ContactFilters, type FilterRule, type FilterGroup, EMPTY_CONTACT_FILTERS, countActiveContactFilters, type PipelineWithStages } from "@/components/marketing/ContactFiltersSheet";

// Map filter field keys to actual DB columns
const FIELD_TO_COLUMN: Record<string, string> = {
  name: "first_name", // special handling
  email: "email",
  phone: "phone",
  company_name: "company_name",
  source: "source",
  city: "city",
  province: "province",
  created_at: "created_at",
  last_activity_at: "last_activity_at",
  attr_source: "attr_source",
  attr_campaign: "attr_campaign",
};

function applyRuleToQuery(query: any, rule: FilterRule) {
  const column = FIELD_TO_COLUMN[rule.field];
  if (!column) return query;

  const isName = rule.field === "name";
  const isDate = rule.field === "created_at" || rule.field === "last_activity_at";

  switch (rule.operator) {
    case "is":
      if (isName) {
        const n = `%${rule.value}%`;
        return query.or(`first_name.ilike.${n},last_name.ilike.${n}`);
      }
      if (isDate) return query.eq(column, rule.value);
      return query.ilike(column, `%${rule.value}%`);
    case "is_not":
      if (isName) {
        const n = `%${rule.value}%`;
        return query.not("first_name", "ilike", n).not("last_name", "ilike", n);
      }
      if (isDate) return query.neq(column, rule.value);
      return query.not(column, "ilike", `%${rule.value}%`);
    case "is_empty":
      if (isDate) return query.is(column, null);
      return query.or(`${column}.is.null,${column}.eq.`);
    case "is_not_empty":
      if (isDate) return query.not(column, "is", null);
      return query.not(column, "is", null).neq(column, "");
    default:
      return query;
  }
}

const CSV_FIELDS: ImportField[] = [
  { key: "first_name", label: "Nome", required: true },
  { key: "last_name", label: "Cognome", required: false },
  { key: "fullname", label: "Nome Completo", required: false },
  { key: "phone", label: "Telefono", required: false },
  { key: "email", label: "Email", required: false, type: "email" },
  { key: "company_name", label: "Azienda", required: false },
  { key: "city", label: "Città", required: false },
  { key: "province", label: "Provincia", required: false },
  { key: "tags", label: "Tag", required: false },
  { key: "notes", label: "Note", required: false },
  { key: "source", label: "Fonte", required: false },
];

export default function MarketingContacts() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const { data: contactCustomFields = [] } = useContactCustomFields();

  const importFields = useMemo(() => {
    const customImportFields = contactCustomFields.map(f => ({
      key: `custom_${f.id}`,
      label: f.name,
      required: false,
      type: "text" as const,
    }));
    return [...CSV_FIELDS, ...customImportFields];
  }, [contactCustomFields]);

  const { params: urlFilters, setParam: setURLParam } = useURLFilters({
    activeTab: { key: "tab", defaultValue: "all" },
    searchInput: { key: "q", defaultValue: "" },
    page: { key: "pagina", defaultValue: 1, serialize: String, deserialize: Number },
    pageSize: { key: "per_pagina", defaultValue: 25, serialize: String, deserialize: Number },
    sortField: { key: "ordina", defaultValue: "created_at" },
    sortDirection: { key: "dir", defaultValue: "desc" },
  });

  const activeTab = urlFilters.activeTab as "all" | "lists";
  const setActiveTab = useCallback((v: "all" | "lists") => setURLParam("activeTab", v), [setURLParam]);
  const [searchInput, setSearchInput] = useState(urlFilters.searchInput);
  const search = useDebounce(searchInput, 350);
  const page = urlFilters.page;
  const setPage = useCallback((v: number) => setURLParam("page", v), [setURLParam]);
  const pageSize = urlFilters.pageSize;
  const setPageSize = useCallback((v: number) => setURLParam("pageSize", v), [setURLParam]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<MarketingContact | null>(null);
  const sortField = urlFilters.sortField as SortField;
  const setSortField = useCallback((v: SortField) => setURLParam("sortField", v), [setURLParam]);
  const sortDirection = urlFilters.sortDirection as SortDirection;
  const setSortDirection = useCallback((v: SortDirection) => setURLParam("sortDirection", v), [setURLParam]);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(loadVisibleColumns);
  const [fieldsSheetOpen, setFieldsSheetOpen] = useState(false);
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
  const [filters, setFilters] = useState<ContactFilters>(EMPTY_CONTACT_FILTERS);
  const [exporting, setExporting] = useState(false);

  const activeFilterCount = countActiveContactFilters(filters);

  const doExport = useCallback(async (format: "csv" | "xlsx") => {
    if (!companyId || exporting) return;
    setExporting(true);
    try {
      // If selected, export only those; otherwise apply active filters
      let finalIds: string[] | null = null;

      if (selectedIds.size > 0) {
        finalIds = [...selectedIds];
      } else {
        // Apply active filters to get IDs (same logic as the main query)
        const activeGroups = filters.groups.filter((g) => g.rules.length > 0);
        if (activeGroups.length > 0) {
          if (activeGroups.length === 1) {
            const ids = await applyGroupRules(activeGroups[0], companyId);
            if (ids !== null) {
              if (ids.length === 0) { setExporting(false); toast.info("Nessun contatto corrisponde ai filtri"); return; }
              finalIds = ids;
            }
          } else {
            const allIds = new Set<string>();
            for (const group of activeGroups) {
              const ids = await applyGroupRules(group, companyId);
              if (ids !== null) ids.forEach((id) => allIds.add(id));
            }
            if (allIds.size === 0) { setExporting(false); toast.info("Nessun contatto corrisponde ai filtri"); return; }
            finalIds = [...allIds];
          }
        }
      }

      // Paginated fetch to handle >1000 rows
      const PAGE_SIZE = 1000;
      let allRows: any[] = [];
      let page = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from("marketing_contacts")
          .select("id, first_name, last_name, email, phone, source, tags, assigned_to, company_id, created_at, updated_at, lead_score, last_activity_at, lifecycle_stage, call_center_status, call_center_assigned_to, call_center_last_call_at, call_center_next_call_at, call_center_call_count, call_center_notes")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        // Apply search filter if active
        if (search && search.trim()) {
          const s = `%${search.trim()}%`;
          query = query.or(`first_name.ilike.${s},last_name.ilike.${s},email.ilike.${s},phone.ilike.${s}`);
        }

        if (finalIds) query = query.in("id", finalIds);

        const { data, error } = await query;
        if (error) throw error;

        allRows = allRows.concat(data || []);
        hasMore = (data?.length || 0) === PAGE_SIZE;
        page++;
      }

      const all = allRows;

      // Build columns including custom fields
      const baseColumns = [
        { key: "first_name", label: "Nome" },
        { key: "last_name", label: "Cognome" },
        { key: "phone", label: "Telefono" },
        { key: "email", label: "Email" },
        { key: "company_name", label: "Azienda" },
        { key: "city", label: "Città" },
        { key: "province", label: "Provincia" },
        { key: "tags", label: "Tag" },
        { key: "notes", label: "Note" },
        { key: "source", label: "Fonte" },
        { key: "contact_type", label: "Tipo" },
        { key: "created_at", label: "Data Creazione" },
      ];

      // Add custom field columns
      const cfColumns = contactCustomFields.map(f => ({ key: `cf_${f.id}`, label: f.name }));

      // Fetch custom field values for exported contacts if any
      let cfMap: Record<string, Record<string, string>> = {};
      if (cfColumns.length > 0 && all && all.length > 0) {
        const ids = all.map((c: any) => c.id);
        // Chunk .in() queries to avoid Supabase limits
        const CHUNK_SIZE = 2000;
        let allVals: any[] = [];
        for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
          const chunk = ids.slice(i, i + CHUNK_SIZE);
          const { data: vals } = await supabase
            .from("marketing_contact_field_values")
            .select("contact_id, field_id, value")
            .in("contact_id", chunk);
          allVals = allVals.concat(vals || []);
        }
        for (const v of allVals) {
          if (!cfMap[v.contact_id]) cfMap[v.contact_id] = {};
          if (v.value) cfMap[v.contact_id][v.field_id] = v.value;
        }
      }

      const rows = (all || []).map((c: any) => {
        const row: Record<string, string> = {
          first_name: c.first_name || "",
          last_name: c.last_name || "",
          phone: c.phone || "",
          email: c.email || "",
          company_name: c.company_name || "",
          city: c.city || "",
          province: c.province || "",
          tags: (c.tags || []).join(", "),
          notes: c.notes || "",
          source: c.source || "",
          contact_type: c.contact_type || "",
          created_at: c.created_at ? new Date(c.created_at).toLocaleDateString("it-IT") : "",
        };
        // Add custom field values
        for (const cf of contactCustomFields) {
          row[`cf_${cf.id}`] = cfMap[c.id]?.[cf.id] || "";
        }
        return row;
      });

      const allColumns = [...baseColumns, ...cfColumns];
      const today = new Date().toISOString().slice(0, 10);
      const suffix = selectedIds.size > 0 ? `_selezionati_${selectedIds.size}` : "";

      if (format === "xlsx") {
        exportToXLSX(rows, allColumns, `contatti${suffix}_${today}.xlsx`);
      } else {
        exportToCSV(rows, allColumns, `contatti${suffix}_${today}.csv`);
      }
      toast.success(`${rows.length} contatti esportati in ${format.toUpperCase()}`);
    } catch {
      toast.error("Errore durante l'esportazione");
    } finally {
      setExporting(false);
    }
  }, [companyId, exporting, selectedIds, contactCustomFields, filters, search]);

  // Consolidated filter data query (pipelines, tags, list count)
  const { data: filterData } = useQuery({
    queryKey: ["marketing-filter-data", companyId],
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    queryFn: async () => {
      const [pipelinesRes, tagsRes, countRes] = await Promise.all([
        supabase
          .from("marketing_pipelines")
          .select("id, name, marketing_pipeline_stages(id, name, position)")
          .eq("company_id", companyId!)
          .order("position"),
        supabase
          .from("marketing_tags")
          .select("name")
          .eq("company_id", companyId!)
          .order("name"),
        supabase
          .from("marketing_contact_lists")
          .select("id", { count: "exact", head: true })
          .eq("company_id", companyId!),
      ]);
      if (pipelinesRes.error) throw pipelinesRes.error;
      if (tagsRes.error) throw tagsRes.error;
      return {
        pipelines: (pipelinesRes.data || []) as PipelineWithStages[],
        availableTags: (tagsRes.data || []).map((t) => t.name),
        listCount: countRes.count || 0,
      };
    },
    enabled: !!companyId,
  });
  const pipelines = filterData?.pipelines ?? [];
  const availableTags = filterData?.availableTags ?? [];
  const listCount = filterData?.listCount ?? 0;

  // Helper: apply a single group's rules to get matching contact IDs
  async function applyGroupRules(group: FilterGroup, companyId: string): Promise<string[] | null> {
    const rules = group.rules.filter((r) => {
      if (r.operator === "is_empty" || r.operator === "is_not_empty") return true;
      return r.value.trim().length > 0;
    });
    if (rules.length === 0) return null;

    const standardRules: FilterRule[] = [];
    const tagRules: FilterRule[] = [];
    const oppRules: FilterRule[] = [];
    const cfRules: FilterRule[] = [];

    for (const rule of rules) {
      if (rule.field === "tags") tagRules.push(rule);
      else if (rule.field.startsWith("opp_")) oppRules.push(rule);
      else if (rule.field.startsWith("cf_")) cfRules.push(rule);
      else if (FIELD_TO_COLUMN[rule.field]) standardRules.push(rule);
    }

    // Opp filter → contact_ids
    let oppContactIds: string[] | null = null;
    if (oppRules.length > 0) {
      let oppQuery = supabase.from("marketing_opportunities").select("contact_id").eq("company_id", companyId);
      for (const rule of oppRules) {
        if (rule.field === "opp_status") {
          if (rule.operator === "is") oppQuery = oppQuery.eq("status", rule.value);
          else if (rule.operator === "is_not") oppQuery = oppQuery.neq("status", rule.value);
        } else if (rule.field === "opp_stage") {
          if (rule.operator === "is") oppQuery = oppQuery.eq("stage_id", rule.value);
          else if (rule.operator === "is_not") oppQuery = oppQuery.neq("stage_id", rule.value);
        } else if (rule.field.startsWith("opp_pipeline_")) {
          const pipelineId = rule.field.replace("opp_pipeline_", "");
          if (rule.operator === "is") oppQuery = oppQuery.eq("pipeline_id", pipelineId);
          else if (rule.operator === "is_not") oppQuery = oppQuery.neq("pipeline_id", pipelineId);
        }
      }
      const { data: oppData } = await oppQuery;
      oppContactIds = [...new Set((oppData || []).map((o) => o.contact_id))];
      if (oppContactIds.length === 0) return [];
    }

    // CF filter → contact_ids (AND within group)
    let cfContactIds: string[] | null = null;
    if (cfRules.length > 0) {
      const sets: Set<string>[] = [];
      for (const rule of cfRules) {
        const fieldId = rule.field.replace("cf_", "");
        let cfQuery = supabase.from("marketing_contact_field_values").select("contact_id").eq("field_id", fieldId);
        switch (rule.operator) {
          case "is": cfQuery = cfQuery.ilike("value", `%${rule.value}%`); break;
          case "is_not": cfQuery = cfQuery.not("value", "ilike", `%${rule.value}%`); break;
          case "is_empty": cfQuery = cfQuery.or("value.is.null,value.eq."); break;
          case "is_not_empty": cfQuery = cfQuery.not("value", "is", null).neq("value", ""); break;
        }
        const { data: cfData } = await cfQuery;
        sets.push(new Set((cfData || []).map((r) => r.contact_id)));
      }
      // AND: intersect all sets
      let result = sets[0];
      for (let i = 1; i < sets.length; i++) {
        result = new Set([...result].filter((id) => sets[i].has(id)));
      }
      cfContactIds = [...result];
      if (cfContactIds.length === 0) return [];
    }

    // Intersect opp + cf (AND)
    let filterIds: string[] | null = null;
    if (oppContactIds && cfContactIds) {
      const cfSet = new Set(cfContactIds);
      filterIds = oppContactIds.filter((id) => cfSet.has(id));
      if (filterIds.length === 0) return [];
    } else {
      filterIds = oppContactIds || cfContactIds;
    }

    // Now query contacts with standard + tag rules
    let query = supabase.from("marketing_contacts").select("id").eq("company_id", companyId);
    if (filterIds) query = query.in("id", filterIds);
    for (const rule of standardRules) query = applyRuleToQuery(query, rule);
    for (const rule of tagRules) {
      if (rule.operator === "is") query = query.overlaps("tags", [rule.value]);
      else if (rule.operator === "is_not") query = query.not("tags", "cs", `{${rule.value}}`);
      else if (rule.operator === "is_empty") query = query.or("tags.is.null,tags.eq.{}");
      else if (rule.operator === "is_not_empty") query = query.not("tags", "is", null).not("tags", "eq", "{}");
    }
    const { data } = await query;
    return (data || []).map((r) => r.id);
  }

  // Fetch contacts with grouped filter rules
  const { data, isLoading } = useQuery({
    queryKey: ["marketing-contacts", companyId, search, page, pageSize, sortField, sortDirection, filters],
    queryFn: async () => {
      if (!companyId) return { contacts: [] as MarketingContact[], count: 0 };

      const activeGroups = filters.groups.filter((g) => g.rules.length > 0);

      // Determine filtered IDs if we have groups
      let finalIds: string[] | null = null;
      if (activeGroups.length > 0) {
        if (activeGroups.length === 1) {
          // Single group: just apply AND rules
          const ids = await applyGroupRules(activeGroups[0], companyId);
          if (ids !== null) {
            if (ids.length === 0) return { contacts: [] as MarketingContact[], count: 0 };
            finalIds = ids;
          }
        } else {
          // Multiple groups: OR (union) the results
          const allIds = new Set<string>();
          for (const group of activeGroups) {
            const ids = await applyGroupRules(group, companyId);
            if (ids !== null) ids.forEach((id) => allIds.add(id));
          }
          if (allIds.size === 0) return { contacts: [] as MarketingContact[], count: 0 };
          finalIds = [...allIds];
        }
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("marketing_contacts")
        .select("*", { count: "exact" })
        .eq("company_id", companyId)
        .order(sortField, { ascending: sortDirection === "asc" })
        .range(from, to);

      if (finalIds) query = query.in("id", finalIds);

      if (search.trim()) {
        const s = `%${search.trim()}%`;
        query = query.or(`first_name.ilike.${s},last_name.ilike.${s},phone.ilike.${s},email.ilike.${s},company_name.ilike.${s}`);
      }

      const { data: contactsRaw, count, error } = await query;
      if (error) throw error;

      const contactIds = (contactsRaw || []).map((c: any) => c.id);

      // Fetch first opportunity per contact
      let oppMap: Record<string, { name: string; value: number; status: string; pipeline_name: string; stage_name: string }> = {};
      if (contactIds.length > 0) {
        const { data: opps } = await supabase
          .from("marketing_opportunities")
          .select("contact_id, name, value, status, marketing_pipelines(name), marketing_pipeline_stages(name)")
          .in("contact_id", contactIds)
          .eq("company_id", companyId)
          .order("created_at", { ascending: false });

        if (opps) {
          for (const opp of opps) {
            if (!oppMap[opp.contact_id]) {
              oppMap[opp.contact_id] = {
                name: opp.name,
                value: opp.value,
                status: opp.status,
                pipeline_name: (opp.marketing_pipelines as any)?.name || "",
                stage_name: (opp.marketing_pipeline_stages as any)?.name || "",
              };
            }
          }
        }
      }

      // Fetch call_center names
      const callCenterIds = [...new Set((contactsRaw || []).map((c: any) => c.call_center_id).filter(Boolean))];
      let callCenterMap: Record<string, string> = {};
      if (callCenterIds.length > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, first_name, last_name")
          .in("id", callCenterIds);
        if (profiles) {
          for (const p of profiles) {
            callCenterMap[p.id] = `${p.first_name} ${p.last_name || ""}`.trim();
          }
        }
      }

      const contacts: MarketingContact[] = (contactsRaw || []).map((c: any) => {
        const opp = oppMap[c.id];
        return {
          ...c,
          call_center_name: callCenterMap[c.call_center_id] || null,
          opp_name: opp?.name || null,
          opp_value: opp?.value ?? null,
          opp_status: opp?.status || null,
          opp_pipeline: opp?.pipeline_name || null,
          opp_stage: opp?.stage_name || null,
        };
      });

      return { contacts, count: count || 0 };
    },
    enabled: !!companyId,
  });
  const contacts = data?.contacts || [];
  const totalCount = data?.count || 0;
  const contactIds = contacts.map(c => c.id);

  // Fetch custom field values for visible contacts
  const { data: customFieldValues = {} } = useQuery({
    queryKey: ["marketing-contact-field-values", contactIds],
    queryFn: async () => {
      if (contactIds.length === 0) return {} as Record<string, Record<string, string>>;
      const { data: vals, error } = await supabase
        .from("marketing_contact_field_values")
        .select("contact_id, field_id, value")
        .in("contact_id", contactIds);
      if (error) throw error;
      const map: Record<string, Record<string, string>> = {};
      for (const v of vals || []) {
        if (!map[v.contact_id]) map[v.contact_id] = {};
        if (v.value) map[v.contact_id][v.field_id] = v.value;
      }
      return map;
    },
    enabled: contactIds.length > 0,
  });

  // Mutations
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["marketing-contacts"] });

  const saveMutation = useMutation({
    mutationFn: async (formData: ContactFormData) => {
      if (!companyId) throw new Error("No company");
      if (editingContact) {
        const { error } = await supabase
          .from("marketing_contacts")
          .update({ ...formData, updated_at: new Date().toISOString() })
          .eq("id", editingContact.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("marketing_contacts")
          .insert({ ...formData, company_id: companyId });
        if (error) throw error;
      }
    },
    onSuccess: async (_, formData) => {
      toast.success(editingContact ? "Contatto aggiornato" : "Contatto aggiunto");
      if (editingContact) {
        const originalTags = editingContact.tags || [];
        const addedTags = formData.tags.filter(t => !originalTags.includes(t));
        const removedTags = originalTags.filter(t => !formData.tags.includes(t));
        if (addedTags.length > 0) {
          await syncTagsToOpportunities(editingContact.id, addedTags);
        }
        for (const tag of removedTags) {
          await removeTagFromOpportunities(editingContact.id, tag);
        }
        if (addedTags.length > 0 || removedTags.length > 0) {
          queryClient.invalidateQueries({ queryKey: ["marketing-opportunities"] });
        }
      }
      invalidate();
      setEditingContact(null);
    },
    onError: () => toast.error("Errore nel salvataggio"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("marketing_contacts").delete().in("id", ids);
      if (error) throw error;
    },
    onSuccess: (_, ids) => {
      toast.success(`${ids.length} contatt${ids.length === 1 ? "o eliminato" : "i eliminati"}`);
      setSelectedIds(new Set());
      invalidate();
    },
    onError: () => toast.error("Errore nell'eliminazione"),
  });

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleToggleAll = useCallback(() => {
    setSelectedIds((prev) =>
      prev.size === contacts.length ? new Set() : new Set(contacts.map((c) => c.id))
    );
  }, [contacts]);

  const handleEdit = (contact: MarketingContact) => {
    setEditingContact(contact);
    setDialogOpen(true);
  };

  const handleApplyColumns = (cols: Set<string>) => {
    setVisibleColumns(cols);
    saveVisibleColumns(cols);
  };

  const handleApplyFilters = (f: ContactFilters) => {
    setFilters(f);
    setPage(1);
  };

  const handleImport = async (rows: Record<string, string>[], options: { mode: string }) => {
    if (!companyId) return { success: 0, errors: ["Nessuna azienda selezionata"] };
    const customKeys = contactCustomFields.map(f => `custom_${f.id}`);
    const mode = options?.mode || "create";

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const errors: string[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    // Parse all rows
    const parsed = rows.map((r, idx) => {
      let firstName = r.first_name?.trim() || "";
      let lastName = r.last_name?.trim() || "";
      if (!firstName && r.fullname?.trim()) {
        const parts = r.fullname.trim().split(/\s+/);
        firstName = parts[0];
        lastName = parts.slice(1).join(" ");
      }
      const email = r.email?.trim() || null;
      const phone = r.phone?.trim() || null;

      // Email validation
      if (email && !emailRegex.test(email)) {
        errors.push(`Riga ${idx + 2}: email "${email}" non valida`);
        return null;
      }

      return {
        rowIdx: idx,
        row: r,
        data: {
          company_id: companyId,
          first_name: firstName || "Senza nome",
          last_name: lastName || null,
          phone: phone ? cleanPhone(phone) : null,
          email: email,
          company_name: r.company_name?.trim() || null,
          city: r.city?.trim() || null,
          province: r.province?.trim() || null,
          tags: r.tags ? r.tags.split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean) : [],
          notes: r.notes?.trim() || null,
          source: r.source?.trim() || "importazione",
        },
      };
    }).filter(Boolean) as { rowIdx: number; row: Record<string, string>; data: any }[];

    // Detect internal duplicates by email
    const seenEmails = new Map<string, number>();
    for (const p of parsed) {
      if (p.data.email) {
        const key = p.data.email.toLowerCase();
        if (seenEmails.has(key)) {
          errors.push(`Riga ${p.rowIdx + 2}: email duplicata nel file ("${p.data.email}")`);
        }
        seenEmails.set(key, p.rowIdx);
      }
    }

    // Remove internal duplicates from parsed (keep first occurrence)
    const seenEmailsForDedup = new Set<string>();
    const finalParsed = parsed.filter(p => {
      if (!p.data.email) return true;
      const key = p.data.email.toLowerCase();
      if (seenEmailsForDedup.has(key)) return false;
      seenEmailsForDedup.add(key);
      return true;
    });

    if (mode === "create") {
      // Simple insert
      const toInsert = finalParsed.map(p => p.data);
      const { error, data } = await supabase.from("marketing_contacts").insert(toInsert).select("id");
      if (error) return { success: 0, errors: [...errors, error.message] };
      created = data?.length || 0;

      // Custom fields
      if (data && customKeys.length > 0) {
        const fieldValues: { contact_id: string; field_id: string; value: string | null }[] = [];
        data.forEach((contact, idx) => {
          const row = finalParsed[idx]?.row;
          if (!row) return;
          customKeys.forEach(key => {
            const val = row[key]?.trim();
            if (val) {
              fieldValues.push({ contact_id: contact.id, field_id: key.replace("custom_", ""), value: val });
            }
          });
        });
        if (fieldValues.length > 0) {
          await supabase.from("marketing_contact_field_values").insert(fieldValues);
        }
      }
    } else {
      // update or create_and_update: match by email or phone
      const existingEmails = new Set<string>();
      const existingPhones = new Set<string>();
      const existingMap = new Map<string, string>(); // matchKey -> contact id

      // Fetch existing contacts by email/phone
      const emails = finalParsed.map(p => p.data.email).filter(Boolean);
      const phones = finalParsed.map(p => p.data.phone).filter(Boolean);

      if (emails.length > 0) {
        // Batch in chunks of 100 for .in()
        for (let i = 0; i < emails.length; i += 100) {
          const batch = emails.slice(i, i + 100);
          const { data: existing } = await supabase
            .from("marketing_contacts")
            .select("id, email")
            .eq("company_id", companyId)
            .in("email", batch);
          for (const e of existing || []) {
            if (e.email) {
              existingEmails.add(e.email.toLowerCase());
              existingMap.set(`email:${e.email.toLowerCase()}`, e.id);
            }
          }
        }
      }

      if (phones.length > 0) {
        for (let i = 0; i < phones.length; i += 100) {
          const batch = phones.slice(i, i + 100);
          const { data: existing } = await supabase
            .from("marketing_contacts")
            .select("id, phone")
            .eq("company_id", companyId)
            .in("phone", batch);
          for (const e of existing || []) {
            if (e.phone) {
              existingPhones.add(e.phone);
              existingMap.set(`phone:${e.phone}`, e.id);
            }
          }
        }
      }

      const toCreate: any[] = [];
      const toCreateRows: Record<string, string>[] = [];

      for (const p of finalParsed) {
        const matchKey = p.data.email
          ? `email:${p.data.email.toLowerCase()}`
          : p.data.phone
          ? `phone:${p.data.phone}`
          : null;

        const existingId = matchKey ? existingMap.get(matchKey) : null;

        if (existingId) {
          // Update existing
          const updateData = { ...p.data };
          delete updateData.company_id;
          updateData.updated_at = new Date().toISOString();
          const { error: updateError } = await supabase
            .from("marketing_contacts")
            .update(updateData)
            .eq("id", existingId);
          if (updateError) {
            errors.push(`Riga ${p.rowIdx + 2}: errore aggiornamento - ${updateError.message}`);
          } else {
            updated++;
            // Update custom fields
            if (customKeys.length > 0) {
              for (const key of customKeys) {
                const val = p.row[key]?.trim();
                if (val) {
                  await supabase
                    .from("marketing_contact_field_values")
                    .upsert({ contact_id: existingId, field_id: key.replace("custom_", ""), value: val }, { onConflict: "contact_id,field_id" });
                }
              }
            }
          }
        } else if (mode === "create_and_update") {
          toCreate.push(p.data);
          toCreateRows.push(p.row);
        } else {
          skipped++;
        }
      }

      // Bulk create new ones
      if (toCreate.length > 0) {
        const { error, data } = await supabase.from("marketing_contacts").insert(toCreate).select("id");
        if (error) {
          errors.push(`Errore creazione: ${error.message}`);
        } else {
          created = data?.length || 0;
          if (data && customKeys.length > 0) {
            const fieldValues: { contact_id: string; field_id: string; value: string | null }[] = [];
            data.forEach((contact, idx) => {
              const row = toCreateRows[idx];
              if (!row) return;
              customKeys.forEach(key => {
                const val = row[key]?.trim();
                if (val) {
                  fieldValues.push({ contact_id: contact.id, field_id: key.replace("custom_", ""), value: val });
                }
              });
            });
            if (fieldValues.length > 0) {
              await supabase.from("marketing_contact_field_values").insert(fieldValues);
            }
          }
        }
      }
    }

    invalidate();
    const successCount = created + updated;
    const details: string[] = [];
    if (created > 0) details.push(`${created} creati`);
    if (updated > 0) details.push(`${updated} aggiornati`);
    if (skipped > 0) details.push(`${skipped} saltati (non trovati)`);
    if (details.length > 0) errors.unshift(`Riepilogo: ${details.join(", ")}`);
    return { success: successCount, errors };
  };

  if (importOpen) {
    return (
      <ImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        defaultObjectType="contacts"
        contactFields={importFields}
        opportunityFields={[]}
        onImportContacts={async (rows, opts) => handleImport(rows, opts)}
        onImportOpportunities={async () => ({ success: 0, errors: [] })}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Contatti</h1>
          {!isLoading && activeTab === "all" && (
            <Badge variant="secondary" className="text-sm">{totalCount}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" disabled={exporting}>
                <Download className="h-4 w-4 mr-2" />
                {exporting ? "Esportando..." : selectedIds.size > 0 ? `Esporta (${selectedIds.size})` : "Esporta"}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => doExport("csv")}>
                <Download className="h-4 w-4 mr-2" /> Esporta CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => doExport("xlsx")}>
                <Download className="h-4 w-4 mr-2" /> Esporta XLSX
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-2" /> Importa
          </Button>
          <Button onClick={() => { setEditingContact(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Aggiungi Contatto
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "all" | "lists")}>
        <TabsList>
          <TabsTrigger value="all">Tutti</TabsTrigger>
          <TabsTrigger value="lists" className="gap-1.5">
            Liste
            {listCount > 0 && <Badge variant="secondary" className="text-xs h-5 px-1.5">{listCount}</Badge>}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === "lists" ? (
        <ContactListsView />
      ) : (
        <>
          {/* Filter bar */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => setFiltersSheetOpen(true)}
              >
                <Filter className="h-3.5 w-3.5" />
                Filtri avanzati
                {activeFilterCount > 0 && (
                  <Badge className="h-4 w-4 p-0 flex items-center justify-center text-[9px] rounded-full">
                    {activeFilterCount}
                  </Badge>
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 text-xs"
                onClick={() => {
                  setSortDirection(sortDirection === "asc" ? "desc" : "asc");
                  setPage(1);
                }}
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                Ordina
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Cerca contatti..."
                  className="pl-8 h-8 w-[220px] text-xs"
                  value={searchInput}
                  onChange={(e) => { setSearchInput(e.target.value); setPage(1); }}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-xs text-muted-foreground"
                onClick={() => setFieldsSheetOpen(true)}
              >
                <Settings2 className="h-3.5 w-3.5" />
                Gestisci campi
              </Button>
            </div>
          </div>

          {/* Table */}
          <ContactsTable
            contacts={contacts}
            totalCount={totalCount}
            selectedIds={selectedIds}
            onToggleSelect={handleToggleSelect}
            onToggleAll={handleToggleAll}
            onEdit={handleEdit}
            onDelete={(ids) => deleteMutation.mutate(ids)}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
            sortField={sortField}
            sortDirection={sortDirection}
            onSort={(f, d) => { setSortField(f); setSortDirection(d); setPage(1); }}
            bulkActions={<div className="flex items-center gap-2"><AddToListDropdown selectedIds={selectedIds} /><BulkEnrollAutomationDropdown selectedIds={selectedIds} /></div>}
            visibleColumns={visibleColumns}
            customFields={contactCustomFields}
            customFieldValues={customFieldValues}
          />
        </>
      )}

      {/* Sheets */}
      <ContactFieldsSheet
        open={fieldsSheetOpen}
        onOpenChange={setFieldsSheetOpen}
        visibleColumns={visibleColumns}
        onApply={handleApplyColumns}
        customFields={contactCustomFields}
      />
      <ContactFiltersSheet
        open={filtersSheetOpen}
        onOpenChange={setFiltersSheetOpen}
        filters={filters}
        onApply={handleApplyFilters}
        availableTags={availableTags}
        pipelines={pipelines}
        customFields={contactCustomFields}
      />

      {/* Dialogs */}
      <ContactDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={(data) => saveMutation.mutateAsync(data)}
        initialData={editingContact ? {
          first_name: editingContact.first_name,
          last_name: editingContact.last_name || "",
          phone: editingContact.phone || "",
          email: editingContact.email || "",
          company_name: editingContact.company_name || "",
          city: (editingContact as any).city || "",
          province: (editingContact as any).province || "",
          tags: editingContact.tags,
          notes: editingContact.notes || "",
          source: editingContact.source || "",
        } : undefined}
        isEditing={!!editingContact}
        companyId={companyId}
        editingContactId={editingContact?.id}
      />
    </div>
  );
}
