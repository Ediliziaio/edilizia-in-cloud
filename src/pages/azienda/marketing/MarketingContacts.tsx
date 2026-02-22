import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Upload, Plus, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ContactsTable, type MarketingContact, type SortField, type SortDirection } from "@/components/marketing/ContactsTable";
import { ContactDialog, type ContactFormData } from "@/components/marketing/ContactDialog";
import { ContactListsView } from "@/components/marketing/ContactListsView";
import { AddToListDropdown } from "@/components/marketing/AddToListDropdown";
import { ImportWizard } from "@/components/shared/ImportWizard";
import type { ImportField } from "@/components/shared/CSVImportDialog";
import { syncTagsToOpportunities, removeTagFromOpportunities } from "@/hooks/useTagSync";
import { exportToCSV } from "@/lib/csvExport";
import { useContactCustomFields } from "@/hooks/useOpportunityDetailData";

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

  // Fetch contacts
  const { data, isLoading } = useQuery({
    queryKey: ["marketing-contacts", companyId, search, page, pageSize, sortField, sortDirection],
    queryFn: async () => {
      if (!companyId) return { contacts: [] as MarketingContact[], count: 0 };

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("marketing_contacts")
        .select("*", { count: "exact" })
        .eq("company_id", companyId)
        .order(sortField, { ascending: sortDirection === "asc" })
        .range(from, to);

      if (search.trim()) {
        const s = `%${search.trim()}%`;
        query = query.or(`first_name.ilike.${s},last_name.ilike.${s},phone.ilike.${s},email.ilike.${s},company_name.ilike.${s}`);
      }

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
    <div className="space-y-6">
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
          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca contatti..."
              className="pl-9"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            />
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
          />
        </>
      )}

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
