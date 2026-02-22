import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Upload, Plus, Download, Filter, ArrowUpDown, Settings2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ContactsTable, type MarketingContact, type SortField, type SortDirection, type ColumnKey, loadVisibleColumns, saveVisibleColumns } from "@/components/marketing/ContactsTable";
import { ContactDialog, type ContactFormData } from "@/components/marketing/ContactDialog";
import { ContactListsView } from "@/components/marketing/ContactListsView";
import { AddToListDropdown } from "@/components/marketing/AddToListDropdown";
import { ImportWizard } from "@/components/shared/ImportWizard";
import type { ImportField } from "@/components/shared/CSVImportDialog";
import { syncTagsToOpportunities, removeTagFromOpportunities } from "@/hooks/useTagSync";
import { exportToCSV } from "@/lib/csvExport";
import { useContactCustomFields } from "@/hooks/useOpportunityDetailData";
import { ContactFieldsSheet } from "@/components/marketing/ContactFieldsSheet";
import { ContactFiltersSheet, type ContactFilters, type FilterCondition, EMPTY_CONTACT_FILTERS, countActiveContactFilters, type PipelineWithStages } from "@/components/marketing/ContactFiltersSheet";

// Helper to apply a FilterCondition to a Supabase query for a given column
function applyFilterCondition(query: any, column: string, condition: FilterCondition | null, isNameField = false) {
  if (!condition) return query;
  switch (condition.operator) {
    case "is":
      if (isNameField) {
        const n = `%${condition.value}%`;
        return query.or(`first_name.ilike.${n},last_name.ilike.${n}`);
      }
      return query.ilike(column, `%${condition.value}%`);
    case "is_not":
      if (isNameField) {
        const n = `%${condition.value}%`;
        return query.not("first_name", "ilike", n).not("last_name", "ilike", n);
      }
      return query.not(column, "ilike", `%${condition.value}%`);
    case "is_empty":
      return query.or(`${column}.is.null,${column}.eq.`);
    case "is_not_empty":
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

  const [activeTab, setActiveTab] = useState<"all" | "lists">("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<MarketingContact | null>(null);
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnKey>>(loadVisibleColumns);
  const [fieldsSheetOpen, setFieldsSheetOpen] = useState(false);
  const [filtersSheetOpen, setFiltersSheetOpen] = useState(false);
  const [filters, setFilters] = useState<ContactFilters>(EMPTY_CONTACT_FILTERS);

  const activeFilterCount = countActiveContactFilters(filters);

  // Pipelines with stages for opportunity filters
  const { data: pipelines = [] } = useQuery({
    queryKey: ["marketing_pipelines_for_filters", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_pipelines")
        .select("id, name, marketing_pipeline_stages(id, name, position)")
        .eq("company_id", companyId)
        .order("position");
      if (error) throw error;
      return (data || []) as PipelineWithStages[];
    },
    enabled: !!companyId,
  });

  // Available tags for filter
  const { data: availableTags = [] } = useQuery({
    queryKey: ["marketing-tags-list", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("marketing_tags")
        .select("name")
        .eq("company_id", companyId)
        .order("name");
      if (error) throw error;
      return (data || []).map((t) => t.name);
    },
    enabled: !!companyId,
  });

  // List count for tab badge
  const { data: listCount = 0 } = useQuery({
    queryKey: ["marketing-contact-lists-count", companyId],
    queryFn: async () => {
      if (!companyId) return 0;
      const { count, error } = await supabase
        .from("marketing_contact_lists")
        .select("id", { count: "exact", head: true })
        .eq("company_id", companyId);
      if (error) throw error;
      return count || 0;
    },
    enabled: !!companyId,
  });

  // Fetch contacts with opportunity + custom field filtering
  const { data, isLoading } = useQuery({
    queryKey: ["marketing-contacts", companyId, search, page, pageSize, sortField, sortDirection, filters],
    queryFn: async () => {
      if (!companyId) return { contacts: [] as MarketingContact[], count: 0 };

      // Step 1: Opportunity filter → get matching contact_ids
      const hasOppFilter = !!(filters.pipelineId || filters.stageId || filters.oppStatuses.length);
      let oppContactIds: string[] | null = null;
      if (hasOppFilter) {
        let oppQuery = supabase
          .from("marketing_opportunities")
          .select("contact_id")
          .eq("company_id", companyId);
        if (filters.pipelineId) oppQuery = oppQuery.eq("pipeline_id", filters.pipelineId);
        if (filters.stageId) oppQuery = oppQuery.eq("stage_id", filters.stageId);
        if (filters.oppStatuses.length) oppQuery = oppQuery.in("status", filters.oppStatuses);
        const { data: oppData } = await oppQuery;
        oppContactIds = [...new Set((oppData || []).map((o) => o.contact_id))];
        if (oppContactIds.length === 0) return { contacts: [] as MarketingContact[], count: 0 };
      }

      // Step 2: Custom field filter → get matching contact_ids
      const activeCFs = Object.entries(filters.customFields).filter(([, v]) => v);
      let cfContactIds: string[] | null = null;
      if (activeCFs.length > 0) {
        const sets: Set<string>[] = [];
        for (const [fieldId, condition] of activeCFs) {
          const cond = condition as FilterCondition;
          let cfQuery = supabase
            .from("marketing_contact_field_values")
            .select("contact_id")
            .eq("field_id", fieldId);
          
          switch (cond.operator) {
            case "is":
              cfQuery = cfQuery.ilike("value", `%${cond.value}%`);
              break;
            case "is_not":
              cfQuery = cfQuery.not("value", "ilike", `%${cond.value}%`);
              break;
            case "is_empty":
              cfQuery = cfQuery.or("value.is.null,value.eq.");
              break;
            case "is_not_empty":
              cfQuery = cfQuery.not("value", "is", null).neq("value", "");
              break;
          }

          const { data: cfData } = await cfQuery;
          sets.push(new Set((cfData || []).map((r) => r.contact_id)));
        }
        let result = sets[0];
        for (let i = 1; i < sets.length; i++) {
          result = new Set([...result].filter((id) => sets[i].has(id)));
        }
        cfContactIds = [...result];
        if (cfContactIds.length === 0) return { contacts: [] as MarketingContact[], count: 0 };
      }

      // Step 3: Intersect opp + cf ids
      let filterIds: string[] | null = null;
      if (oppContactIds && cfContactIds) {
        const cfSet = new Set(cfContactIds);
        filterIds = oppContactIds.filter((id) => cfSet.has(id));
        if (filterIds.length === 0) return { contacts: [] as MarketingContact[], count: 0 };
      } else {
        filterIds = oppContactIds || cfContactIds;
      }

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("marketing_contacts")
        .select("*", { count: "exact" })
        .eq("company_id", companyId)
        .order(sortField, { ascending: sortDirection === "asc" })
        .range(from, to);

      if (filterIds) {
        query = query.in("id", filterIds);
      }

      if (search.trim()) {
        const s = `%${search.trim()}%`;
        query = query.or(`first_name.ilike.${s},last_name.ilike.${s},phone.ilike.${s},email.ilike.${s},company_name.ilike.${s}`);
      }

      // Standard filters with operators
      query = applyFilterCondition(query, "first_name", filters.name, true);
      query = applyFilterCondition(query, "email", filters.email);
      query = applyFilterCondition(query, "phone", filters.phone);
      query = applyFilterCondition(query, "source", filters.source);
      query = applyFilterCondition(query, "company_name", filters.company);
      query = applyFilterCondition(query, "city", filters.city);
      query = applyFilterCondition(query, "province", filters.province);

      // Date filters
      if (filters.dateFrom) query = query.gte("created_at", filters.dateFrom);
      if (filters.dateTo) query = query.lte("created_at", `${filters.dateTo}T23:59:59`);
      if (filters.activityFrom) query = query.gte("last_activity_at", filters.activityFrom);
      if (filters.activityTo) query = query.lte("last_activity_at", `${filters.activityTo}T23:59:59`);
      if (filters.tags.length > 0) query = query.overlaps("tags", filters.tags);

      const { data: contacts, count, error } = await query;
      if (error) throw error;
      return { contacts: (contacts || []) as MarketingContact[], count: count || 0 };
    },
    enabled: !!companyId,
  });

  const contacts = data?.contacts || [];
  const totalCount = data?.count || 0;

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

  const handleApplyColumns = (cols: Set<ColumnKey>) => {
    setVisibleColumns(cols);
    saveVisibleColumns(cols);
  };

  const handleApplyFilters = (f: ContactFilters) => {
    setFilters(f);
    setPage(1);
  };

  const handleImport = async (rows: Record<string, string>[]) => {
    if (!companyId) return { success: 0, errors: ["Nessuna azienda selezionata"] };
    const customKeys = contactCustomFields.map(f => `custom_${f.id}`);
    const toInsert = rows.map((r) => {
      let firstName = r.first_name?.trim() || "";
      let lastName = r.last_name?.trim() || "";
      if (!firstName && r.fullname?.trim()) {
        const parts = r.fullname.trim().split(/\s+/);
        firstName = parts[0];
        lastName = parts.slice(1).join(" ");
      }
      return {
        company_id: companyId,
        first_name: firstName || "Senza nome",
        last_name: lastName || null,
        phone: r.phone?.trim() || null,
        email: r.email?.trim() || null,
        company_name: r.company_name?.trim() || null,
        city: r.city?.trim() || null,
        province: r.province?.trim() || null,
        tags: r.tags ? r.tags.split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean) : [],
        notes: r.notes?.trim() || null,
        source: r.source?.trim() || "importazione",
      };
    });

    const { error, data } = await supabase.from("marketing_contacts").insert(toInsert).select("id");
    if (error) return { success: 0, errors: [error.message] };

    if (data && customKeys.length > 0) {
      const fieldValues: { contact_id: string; field_id: string; value: string | null }[] = [];
      data.forEach((contact, idx) => {
        const row = rows[idx];
        customKeys.forEach(key => {
          const val = row[key]?.trim();
          if (val) {
            fieldValues.push({
              contact_id: contact.id,
              field_id: key.replace("custom_", ""),
              value: val,
            });
          }
        });
      });
      if (fieldValues.length > 0) {
        await supabase.from("marketing_contact_field_values").insert(fieldValues);
      }
    }

    invalidate();
    return { success: data?.length || 0, errors: [] };
  };

  if (importOpen) {
    return (
      <ImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        defaultObjectType="contacts"
        contactFields={importFields}
        opportunityFields={[]}
        onImportContacts={async (rows, options) => handleImport(rows)}
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
          <Button variant="outline" onClick={async () => {
            if (!companyId) return;
            try {
              const { data: all, error } = await supabase
                .from("marketing_contacts")
                .select("*")
                .eq("company_id", companyId)
                .order("created_at", { ascending: false });
              if (error) throw error;
              const rows = (all || []).map((c: any) => ({
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
                created_at: c.created_at ? new Date(c.created_at).toLocaleDateString("it-IT") : "",
              }));
              const today = new Date().toISOString().slice(0, 10);
              exportToCSV(rows, [
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
                { key: "created_at", label: "Data Creazione" },
              ], `contatti_${today}.csv`);
              toast.success(`${rows.length} contatti esportati`);
            } catch {
              toast.error("Errore durante l'esportazione");
            }
          }}>
            <Download className="h-4 w-4 mr-2" /> Esporta
          </Button>
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
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
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
            bulkActions={<AddToListDropdown selectedIds={selectedIds} />}
            visibleColumns={visibleColumns}
          />
        </>
      )}

      {/* Sheets */}
      <ContactFieldsSheet
        open={fieldsSheetOpen}
        onOpenChange={setFieldsSheetOpen}
        visibleColumns={visibleColumns}
        onApply={handleApplyColumns}
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
