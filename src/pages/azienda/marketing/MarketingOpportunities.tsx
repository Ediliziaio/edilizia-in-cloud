import { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, Loader2, Target, Search, Filter, ArrowUpDown, LayoutGrid, List, Upload, MoreHorizontal, Settings2, Trash2, Pencil, Download } from "lucide-react";
import { CardCustomizeSheet } from "@/components/opportunities/CardCustomizeSheet";
import { useCardFieldPreferences, CardFieldPreferencesProvider } from "@/hooks/useCardFieldPreferences";
import type { FieldDefinition } from "@/hooks/useCardFieldPreferences";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { PipelineSelector } from "@/components/opportunities/PipelineSelector";
import { OpportunityKanbanView } from "@/components/opportunities/OpportunityKanbanView";
import { OpportunityListView } from "@/components/opportunities/OpportunityListView";
import { OpportunityDialog } from "@/components/opportunities/OpportunityDialog";
import { OpportunityFiltersSheet, OpportunityFilters, EMPTY_FILTERS, countActiveFilters } from "@/components/opportunities/OpportunityFiltersSheet";
import { BulkEditSheet } from "@/components/opportunities/BulkEditSheet";
import { usePipelines, useOpportunities, useCompanyStaff, useBulkDeleteOpportunities } from "@/hooks/useOpportunitiesData";
import { useOpportunityCustomFields } from "@/hooks/useOpportunityDetailData";
import { ImportWizard } from "@/components/shared/ImportWizard";
import type { ImportField } from "@/components/shared/CSVImportDialog";
import { exportToCSV } from "@/lib/csvExport";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function MarketingOpportunities() {
  return (
    <CardFieldPreferencesProvider>
      <MarketingOpportunitiesContent />
    </CardFieldPreferencesProvider>
  );
}

const OPP_IMPORT_FIELDS: ImportField[] = [
  { key: "name", label: "Nome Opportunità", required: true },
  { key: "contact_first_name", label: "Contatto Nome", required: true },
  { key: "contact_last_name", label: "Contatto Cognome", required: false },
  { key: "contact_email", label: "Email Contatto", required: false, type: "email" },
  { key: "contact_phone", label: "Telefono Contatto", required: false },
  { key: "value", label: "Valore", required: false, type: "number" },
  { key: "source", label: "Fonte", required: false },
  { key: "tags", label: "Tag", required: false },
  { key: "notes", label: "Note", required: false },
];

function MarketingOpportunitiesContent() {
  const navigate = useNavigate();
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const { data: pipelines = [], isLoading: loadingPipelines } = usePipelines();
  const [selectedPipelineId, setSelectedPipelineId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<OpportunityFilters>(EMPTY_FILTERS);
  const { data: staff = [] } = useCompanyStaff();
  const bulkDelete = useBulkDeleteOpportunities();
  const { activeFields, layout, setActiveFields, setLayout } = useCardFieldPreferences();
  const [cardCustomizeOpen, setCardCustomizeOpen] = useState(false);
  const { data: oppCustomFields = [] } = useOpportunityCustomFields();
  const customFieldDefs: FieldDefinition[] = useMemo(() =>
    oppCustomFields.map((f) => ({ key: `custom_${f.id}`, label: f.name, section: "opportunity" })),
    [oppCustomFields]
  );
  const oppImportFields = useMemo(() => {
    const customImportFields = oppCustomFields.map(f => ({
      key: `custom_${f.id}`,
      label: f.name,
      required: false,
      type: "text" as const,
    }));
    return [...OPP_IMPORT_FIELDS, ...customImportFields];
  }, [oppCustomFields]);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const handleSelect = useCallback((id: string, sel: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (sel) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  useEffect(() => {
    if (pipelines.length > 0 && !selectedPipelineId) {
      setSelectedPipelineId(pipelines[0].id);
    }
  }, [pipelines, selectedPipelineId]);

  const selectedPipeline = pipelines.find((p: any) => p.id === selectedPipelineId);
  const stages = selectedPipeline?.marketing_pipeline_stages || [];

  const { data: opportunities = [], isLoading: loadingOpps } = useOpportunities(selectedPipelineId);

  const availableTags = useMemo(() => {
    const tagSet = new Set<string>();
    opportunities.forEach((o: any) => (o.tags || []).forEach((t: string) => tagSet.add(t)));
    return Array.from(tagSet).sort();
  }, [opportunities]);

  const filteredOpportunities = useMemo(() => {
    let result = opportunities;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((o: any) => {
        const contact = o.marketing_contacts;
        return (
          o.name?.toLowerCase().includes(q) ||
          contact?.first_name?.toLowerCase().includes(q) ||
          contact?.last_name?.toLowerCase().includes(q) ||
          contact?.email?.toLowerCase().includes(q) ||
          contact?.phone?.toLowerCase().includes(q)
        );
      });
    }

    if (filters.statuses.length > 0) {
      result = result.filter((o: any) => filters.statuses.includes(o.status));
    }
    if (filters.assignedTo) {
      result = result.filter((o: any) => o.assigned_to === filters.assignedTo);
    }
    if (filters.followerId) {
      result = result.filter((o: any) => o.follower_id === filters.followerId);
    }
    if (filters.callCenterId) {
      result = result.filter((o: any) => o.call_center_id === filters.callCenterId);
    }
    if (filters.source) {
      const src = filters.source.toLowerCase();
      result = result.filter((o: any) => o.source?.toLowerCase().includes(src));
    }
    if (filters.valueMin) {
      const min = parseFloat(filters.valueMin);
      result = result.filter((o: any) => Number(o.value || 0) >= min);
    }
    if (filters.valueMax) {
      const max = parseFloat(filters.valueMax);
      result = result.filter((o: any) => Number(o.value || 0) <= max);
    }
    if (filters.dateFrom) {
      result = result.filter((o: any) => o.created_at >= filters.dateFrom);
    }
    if (filters.dateTo) {
      result = result.filter((o: any) => o.created_at <= filters.dateTo + "T23:59:59");
    }
    if (filters.tags.length > 0) {
      result = result.filter((o: any) => filters.tags.some((t) => (o.tags || []).includes(t)));
    }

    return result;
  }, [opportunities, searchQuery, filters]);

  const activeFilterCount = countActiveFilters(filters);

  if (importOpen) {
    return (
      <ImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        defaultObjectType="opportunities"
        contactFields={[]}
        opportunityFields={oppImportFields}
        onImportContacts={async () => ({ success: 0, errors: [] })}
        onImportOpportunities={async (rows) => {
          if (!companyId || !selectedPipelineId || stages.length === 0) {
            return { success: 0, errors: ["Seleziona una pipeline con almeno una fase"] };
          }
          const customKeys = oppCustomFields.map(f => `custom_${f.id}`);
          const defaultStageId = stages.sort((a: any, b: any) => a.position - b.position)[0].id;
          let success = 0;
          const errors: string[] = [];
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            try {
              const firstName = r.contact_first_name?.trim() || "Senza nome";
              const lastName = r.contact_last_name?.trim() || null;
              const email = r.contact_email?.trim() || null;
              const phone = r.contact_phone?.trim() || null;
              let contactId: string | null = null;
              if (email) {
                const { data: found } = await supabase.from("marketing_contacts").select("id").eq("company_id", companyId).eq("email", email).limit(1).single();
                if (found) contactId = found.id;
              }
              if (!contactId && phone) {
                const { data: found } = await supabase.from("marketing_contacts").select("id").eq("company_id", companyId).eq("phone", phone).limit(1).single();
                if (found) contactId = found.id;
              }
              if (!contactId) {
                const { data: newContact, error: cErr } = await supabase.from("marketing_contacts").insert({ company_id: companyId, first_name: firstName, last_name: lastName, email, phone }).select("id").single();
                if (cErr) throw cErr;
                contactId = newContact!.id;
              }
              const tags = r.tags ? r.tags.split(",").map((t: string) => t.trim().toLowerCase()).filter(Boolean) : [];
              const { data: oppData, error: oErr } = await supabase.from("marketing_opportunities").insert({
                company_id: companyId, pipeline_id: selectedPipelineId, stage_id: defaultStageId,
                contact_id: contactId!, name: r.name?.trim() || `Opportunità ${i + 1}`,
                value: parseFloat(r.value) || 0, source: r.source?.trim() || "importazione", tags, notes: r.notes?.trim() || null,
              }).select("id").single();
              if (oErr) throw oErr;
              // Save custom field values
              if (oppData && customKeys.length > 0) {
                const fieldValues = customKeys
                  .filter(key => r[key]?.trim())
                  .map(key => ({
                    opportunity_id: oppData.id,
                    field_id: key.replace("custom_", ""),
                    value: r[key].trim(),
                  }));
                if (fieldValues.length > 0) {
                  await supabase.from("marketing_opportunity_field_values").insert(fieldValues);
                }
              }
              success++;
            } catch (err: any) {
              errors.push(`Riga ${i + 2}: ${err?.message || "errore sconosciuto"}`);
            }
          }
          return { success, errors };
        }}
      />
    );
  }

  if (loadingPipelines) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (pipelines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-4">
        <Target className="h-16 w-16 text-muted-foreground/40" />
        <h1 className="text-2xl font-bold">Opportunità</h1>
        <p className="text-muted-foreground max-w-md">
          Per iniziare, crea una sequenza (pipeline) nelle impostazioni sotto "Marketing e Vendita" → "Sequenze".
        </p>
        <Button variant="outline" onClick={() => window.location.href = "/azienda/impostazioni/sequenze"}>
          Vai alle Impostazioni
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full gap-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <PipelineSelector pipelines={pipelines} value={selectedPipelineId} onChange={setSelectedPipelineId} />
          <Badge className="bg-primary text-primary-foreground hover:bg-primary/90 h-6 px-2 text-xs">
            {filteredOpportunities.length} lead
          </Badge>
        </div>
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={viewMode === "kanban" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("kanban")}>
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Vista griglia</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="h-8 w-8" onClick={() => setViewMode("list")}>
                <List className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Vista lista</TooltipContent>
          </Tooltip>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setImportOpen(true)} disabled={stages.length === 0}>
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Importa
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={() => setDialogOpen(true)} disabled={stages.length === 0}>
            <Plus className="mr-1.5 h-3.5 w-3.5" /> Aggiungi opportunità
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={async () => {
                try {
                  const stageMap = Object.fromEntries(stages.map((s: any) => [s.id, s.name]));
                  const rows = filteredOpportunities.map((o: any) => {
                    const c = o.marketing_contacts || {};
                    return {
                      name: o.name || "",
                      contact: [c.first_name, c.last_name].filter(Boolean).join(" "),
                      email: c.email || "",
                      phone: c.phone || "",
                      value: String(o.value || 0),
                      status: o.status || "",
                      stage: stageMap[o.stage_id] || "",
                      source: o.source || "",
                      tags: (o.tags || []).join(", "),
                      created_at: o.created_at ? new Date(o.created_at).toLocaleDateString("it-IT") : "",
                    };
                  });
                  const today = new Date().toISOString().slice(0, 10);
                  exportToCSV(rows, [
                    { key: "name", label: "Nome Opportunità" },
                    { key: "contact", label: "Contatto" },
                    { key: "email", label: "Email" },
                    { key: "phone", label: "Telefono" },
                    { key: "value", label: "Valore" },
                    { key: "status", label: "Stato" },
                    { key: "stage", label: "Fase" },
                    { key: "source", label: "Fonte" },
                    { key: "tags", label: "Tag" },
                    { key: "created_at", label: "Data Creazione" },
                  ], `opportunita_${today}.csv`);
                  toast.success(`${rows.length} opportunità esportate`);
                } catch {
                  toast.error("Errore durante l'esportazione");
                }
              }}>
                <Download className="mr-2 h-4 w-4" /> Esporta CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/azienda/impostazioni/sequenze")}>Impostazioni pipeline</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b">
        <Button variant="ghost" size="sm" className="h-8 text-xs rounded-none border-b-2 border-primary font-semibold">Tutto</Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <span>
              <Button variant="ghost" size="sm" className="h-8 text-xs rounded-none text-muted-foreground" disabled>+ Elenco</Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Funzionalità in arrivo</TooltipContent>
        </Tooltip>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-8 text-xs relative" onClick={() => setFiltersOpen(true)}>
            <Filter className="mr-1.5 h-3.5 w-3.5" /> Filtri avanzati
            {activeFilterCount > 0 && (
              <Badge className="ml-1.5 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-primary text-primary-foreground">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button variant="outline" size="sm" className="h-8 text-xs" disabled>
                  <ArrowUpDown className="mr-1.5 h-3.5 w-3.5" /> Ordina
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Funzionalità in arrivo</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Cerca Lead..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="h-8 w-48 pl-8 text-xs" />
          </div>
          <Button variant="link" size="sm" className="h-8 text-xs px-1" onClick={() => setCardCustomizeOpen(true)}>
            <Settings2 className="mr-1 h-3.5 w-3.5" /> Gestisci campi
          </Button>
        </div>
      </div>

      {loadingOpps ? (
        <div className="flex items-center justify-center flex-1">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : stages.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-2">
          <p className="text-sm">Questa pipeline non ha fasi configurate.</p>
          <Button variant="outline" size="sm" onClick={() => window.location.href = "/azienda/impostazioni/sequenze"}>Configura fasi</Button>
        </div>
      ) : (
        <>
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2 bg-primary/5 border rounded-lg">
              <Badge variant="secondary" className="text-xs font-semibold">
                {selectedIds.size} selezionat{selectedIds.size === 1 ? "o" : "i"}
              </Badge>
              {selectedIds.size < filteredOpportunities.length && (
                <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setSelectedIds(new Set(filteredOpportunities.map((o: any) => o.id)))}>
                  Seleziona tutti ({filteredOpportunities.length})
                </Button>
              )}
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={clearSelection}>Deseleziona</Button>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setBulkEditOpen(true)}>
                  <Pencil className="h-3 w-3" /> Modifica
                </Button>
                <Button variant="destructive" size="sm" className="h-7 text-xs gap-1" onClick={() => setConfirmBulkDelete(true)}>
                  <Trash2 className="h-3 w-3" /> Elimina
                </Button>
              </div>
            </div>
          )}
          {viewMode === "list" ? (
            <OpportunityListView stages={stages} opportunities={filteredOpportunities} selectedIds={selectedIds} onSelect={handleSelect} />
          ) : (
            <OpportunityKanbanView stages={stages} opportunities={filteredOpportunities} selectedIds={selectedIds} onSelect={handleSelect} />
          )}
        </>
      )}

      {selectedPipelineId && stages.length > 0 && (
        <OpportunityDialog open={dialogOpen} onOpenChange={setDialogOpen} pipelineId={selectedPipelineId} pipelineName={selectedPipeline?.name} stages={stages} />
      )}

      <OpportunityFiltersSheet open={filtersOpen} onOpenChange={setFiltersOpen} filters={filters} onApply={setFilters} staff={staff} availableTags={availableTags} />

      <BulkEditSheet open={bulkEditOpen} onOpenChange={setBulkEditOpen} selectedIds={[...selectedIds]} stages={stages} onDone={clearSelection} />

      <CardCustomizeSheet
        open={cardCustomizeOpen}
        onOpenChange={setCardCustomizeOpen}
        activeFields={activeFields}
        layout={layout}
        onApply={(fields, l) => { setActiveFields(fields); setLayout(l); toast.success("Personalizzazione applicata"); }}
        customFields={customFieldDefs}
      />

      <AlertDialog open={confirmBulkDelete} onOpenChange={setConfirmBulkDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare {selectedIds.size} opportunità?</AlertDialogTitle>
            <AlertDialogDescription>Questa azione non può essere annullata.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { bulkDelete.mutate([...selectedIds], { onSuccess: () => { clearSelection(); setConfirmBulkDelete(false); } }); }}>
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
