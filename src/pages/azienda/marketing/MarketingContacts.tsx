import { useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, Upload, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ContactsTable, type MarketingContact } from "@/components/marketing/ContactsTable";
import { ContactDialog, type ContactFormData } from "@/components/marketing/ContactDialog";
import { CSVImportDialog, type ImportField } from "@/components/shared/CSVImportDialog";
import { syncTagsToOpportunities } from "@/hooks/useTagSync";

const CSV_FIELDS: ImportField[] = [
  { key: "first_name", label: "Nome", required: true },
  { key: "last_name", label: "Cognome", required: false },
  { key: "phone", label: "Telefono", required: false },
  { key: "email", label: "Email", required: false, type: "email" },
  { key: "company_name", label: "Azienda", required: false },
  { key: "tags", label: "Tag", required: false },
  { key: "notes", label: "Note", required: false },
  { key: "source", label: "Fonte", required: false },
];

export default function MarketingContacts() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<MarketingContact | null>(null);

  // Fetch contacts
  const { data, isLoading } = useQuery({
    queryKey: ["marketing-contacts", companyId, search, page, pageSize],
    queryFn: async () => {
      if (!companyId) return { contacts: [] as MarketingContact[], count: 0 };
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("marketing_contacts")
        .select("*", { count: "exact" })
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
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
      // Sync tags to linked opportunities when editing
      if (editingContact && formData.tags.length > 0) {
        await syncTagsToOpportunities(editingContact.id, formData.tags);
        queryClient.invalidateQueries({ queryKey: ["marketing-opportunities"] });
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
    const toInsert = rows.map((r) => ({
      company_id: companyId,
      first_name: r.first_name?.trim() || "Senza nome",
      last_name: r.last_name?.trim() || null,
      phone: r.phone?.trim() || null,
      email: r.email?.trim() || null,
      company_name: r.company_name?.trim() || null,
      tags: r.tags ? r.tags.split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean) : [],
      notes: r.notes?.trim() || null,
      source: r.source?.trim() || "importazione",
    }));

    const { error, data } = await supabase.from("marketing_contacts").insert(toInsert).select("id");
    if (error) return { success: 0, errors: [error.message] };
    invalidate();
    return { success: data?.length || 0, errors: [] };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Contatti</h1>
          {!isLoading && (
            <Badge variant="secondary" className="text-sm">{totalCount}</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-2" /> Importa
          </Button>
          <Button onClick={() => { setEditingContact(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Aggiungi Contatto
          </Button>
        </div>
      </div>

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
          tags: editingContact.tags,
          notes: editingContact.notes || "",
          source: editingContact.source || "",
        } : undefined}
        isEditing={!!editingContact}
      />

      <CSVImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        title="Importa Contatti"
        fields={CSV_FIELDS}
        onImport={handleImport}
      />
    </div>
  );
}
