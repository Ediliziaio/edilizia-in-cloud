import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useDebounce } from "@/hooks/useDebounce";
import { useURLFilters } from "@/hooks/useURLFilters";
import { Plus, Loader2, Target, Search, Filter, ArrowUpDown, LayoutGrid, List, Upload, MoreHorizontal, Settings2, Trash2, Pencil, Download, Check, X, Minimize2, Maximize2, AlertTriangle, RefreshCw } from "lucide-react";
import { CardCustomizeSheet } from "@/components/opportunities/CardCustomizeSheet";
import { useCardFieldPreferences, CardFieldPreferencesProvider } from "@/hooks/useCardFieldPreferences";
import type { FieldDefinition } from "@/hooks/useCardFieldPreferences";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { PipelineSelector } from "@/components/opportunities/PipelineSelector";
import { OpportunityKanbanView } from "@/components/opportunities/OpportunityKanbanView";
import { OpportunityListView } from "@/components/opportunities/OpportunityListView";
import { OpportunityDialog } from "@/components/opportunities/OpportunityDialog";
import { OpportunityFiltersSheet, OpportunityFilters, EMPTY_FILTERS, countActiveFilters } from "@/components/opportunities/OpportunityFiltersSheet";
import { BulkEditSheet } from "@/components/opportunities/BulkEditSheet";
import {
  usePipelines, useCompanyStaff, useBulkDeleteOpportunities, enrichPage, filtroSoloMiei,
  useOpportunitySummary, useOpportunityList, useOpportunityTags, useOpportunitiesLive, idsOpportunita, MASSIMO_ELIMINAZIONE,
} from "@/hooks/useOpportunitiesData";
import { OpportunityDetailDialog } from "@/components/opportunities/OpportunityDetailDialog";
import { OpportunitaCestinoDialog } from "@/components/opportunities/OpportunitaCestinoDialog";
import { useOpportunityCustomFields } from "@/hooks/useOpportunityDetailData";
import { ImportWizard } from "@/components/shared/ImportWizard";
import type { ImportField } from "@/components/shared/CSVImportDialog";
import { exportToCSV } from "@/lib/csvExport";
import { messaggioEsportazioneNonRiuscita, registraEsportazioneCrm } from "@/lib/export/esportazioniCrm";
import {
  filterAndSortOpportunities,
  filtriPerServer,
  normalizeOpportunityUrlState,
  resolveOpportunityPipelineId,
  sanitizeOpportunitySearchTerm,
} from "@/lib/marketingOpportunities";
import type { OpportunitySortDir, OpportunitySortField } from "@/lib/marketingOpportunities";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { useIsAdminMarketing } from "@/hooks/useMarketingRoutePrefix";
import { usePermissions } from "@/hooks/usePermissions";
import { OpportunityStatsStrip, type FiltroStrip } from "@/components/opportunities/OpportunityStatsStrip";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { formatCount } from "@/lib/formatters";
import { CercaConFiltri, PannelloFiltri, PilloleFiltro } from "@/components/mobile/FiltriMobile";
import { CreateListDialog } from "@/components/marketing/CreateListDialog";
import { cleanPhone } from "@/lib/contactUtils";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { normalizeTagList } from "@/lib/marketingTags";

export default function MarketingOpportunities() {
  return (
    <CardFieldPreferencesProvider>
      <MarketingOpportunitiesContent />
    </CardFieldPreferencesProvider>
  );
}

const NESSUN_ID_PER_FASE: Record<string, string[]> = {};

const ORDINAMENTI = [
  { field: "created_at" as const, dir: "desc" as const, label: "Più recenti" },
  { field: "created_at" as const, dir: "asc" as const, label: "Meno recenti" },
  { field: "updated_at" as const, dir: "desc" as const, label: "Modificate da poco" },
  { field: "updated_at" as const, dir: "asc" as const, label: "Ferme da più tempo" },
  { field: "value" as const, dir: "desc" as const, label: "Valore più alto" },
  { field: "value" as const, dir: "asc" as const, label: "Valore più basso" },
  { field: "name" as const, dir: "asc" as const, label: "Nome A-Z" },
  { field: "name" as const, dir: "desc" as const, label: "Nome Z-A" },
];

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
  const isAdminContext = useIsAdminMarketing();
  const { effectiveCompany, user, viewAsUserId } = useAuth();
  const companyId = effectiveCompany?.id;
  // In «Vista come» la sessione resta del super admin: «i miei» e «vede solo i
  // propri» valgono per l'utente SIMULATO.
  const currentUserId = viewAsUserId ?? user?.id ?? null;
  const permissions = usePermissions();
  const canEditOpportunities = permissions.canEditMarketingOpportunities;
  // «Esporta Clienti»: l'export porta con sé nome, email e telefono dei
  // contatti. Gli amministratori ce l'hanno sempre; il database lo ricontrolla.
  const canExportClients = permissions.canExportClients;
  const { data: pipelines = [], isLoading: loadingPipelines, error: pipelinesError, refetch: refetchPipelines } = usePipelines();

  const { params: urlFilters, setParam: setURLParam, setParams: setURLParams } = useURLFilters({
    selectedPipelineId: { key: "pipeline", defaultValue: "" },
    viewMode: { key: "view", defaultValue: "kanban" },
    searchInput: { key: "q", defaultValue: "" },
    sortField: { key: "ordina", defaultValue: "created_at" },
    sortDir: { key: "dir", defaultValue: "desc" },
  });

  const normalizedUrlState = useMemo(() => normalizeOpportunityUrlState({
    viewMode: urlFilters.viewMode,
    sortField: urlFilters.sortField,
    sortDir: urlFilters.sortDir,
    searchInput: urlFilters.searchInput,
  }), [urlFilters.searchInput, urlFilters.sortDir, urlFilters.sortField, urlFilters.viewMode]);
  const selectedPipelineId = useMemo(
    () => resolveOpportunityPipelineId(urlFilters.selectedPipelineId, pipelines),
    [pipelines, urlFilters.selectedPipelineId]
  );
  const setSelectedPipelineId = useCallback((v: string | null) => {
    setURLParam("selectedPipelineId", v || "");
  }, [setURLParam]);
  const [dialogOpen, setDialogOpen] = useState(false);
  // Quick-add "+" dalla colonna kanban: fase pre-selezionata nel dialog.
  const [quickAddStageId, setQuickAddStageId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [searchInput, setSearchInput] = useState(normalizedUrlState.searchInput);
  const searchQuery = useDebounce(searchInput, 350);
  const safeSearchQuery = useMemo(() => sanitizeOpportunitySearchTerm(searchQuery), [searchQuery]);
  const isMobile = useIsMobile();
  // Mobile: sempre la lista (fasi come pillole in alto, una riga per
  // opportunità). La kanban a colonne larghe si scorreva di lato con schede
  // da quattro righe: da telefono non si leggeva. Il desktop sceglie come prima.
  const viewMode = isMobile ? "list" : normalizedUrlState.viewMode;
  // Mobile: pannello dei filtri dal basso.
  const [filtriMobileAperti, setFiltriMobileAperti] = useState(false);
  const setViewMode = useCallback((v: "kanban" | "list") => setURLParam("viewMode", v), [setURLParam]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Sprint 2: seed filters from drill-down URL params (status, assigned_to, source)
  const [searchParamsRaw, setSearchParamsRaw] = useSearchParams();
  const initialDrillRef = useRef<OpportunityFilters | null>(null);
  if (initialDrillRef.current === null) {
    const seeded: OpportunityFilters = { ...EMPTY_FILTERS };
    const VALID_STATUSES = new Set(["open", "won", "lost", "abandoned"]);
    const qpStatusRaw = searchParamsRaw.get("status");
    const qpStatus = qpStatusRaw && VALID_STATUSES.has(qpStatusRaw) ? qpStatusRaw : null;
    const qpAssigned = searchParamsRaw.get("assigned_to");
    const qpSource = searchParamsRaw.get("source");
    if (qpStatus) seeded.statuses = [qpStatus];
    if (qpAssigned) seeded.assignedTo = qpAssigned;
    if (qpSource) seeded.source = qpSource;
    initialDrillRef.current = seeded;
  }
  const [filters, setFilters] = useState<OpportunityFilters>(initialDrillRef.current);

  // Deep-link dalla scheda contatto: ?apri=<oppId> apre il dettaglio,
  // ?nuova_contatto=<contactId> apre la creazione col contatto gia' scelto.
  // Letti UNA volta al mount (il cleanup sotto li toglie subito dall'URL).
  const [apriOppId, setApriOppId] = useState<string | null>(() => searchParamsRaw.get("apri"));
  const [nuovaDaContattoId, setNuovaDaContattoId] = useState<string | null>(() => searchParamsRaw.get("nuova_contatto"));

  // Clean up drill-down URL params once filters are seeded (keep URL tidy)
  useEffect(() => {
    const keysToStrip = ["status", "assigned_to", "source", "opportunity_id", "apri", "nuova_contatto"];
    if (keysToStrip.some((k) => searchParamsRaw.has(k))) {
      const next = new URLSearchParams(searchParamsRaw);
      keysToStrip.forEach((k) => next.delete(k));
      setSearchParamsRaw(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { data: staff = [] } = useCompanyStaff();
  const bulkDelete = useBulkDeleteOpportunities();
  const { activeFields, layout, setActiveFields, setLayout } = useCardFieldPreferences();
  const [cardCustomizeOpen, setCardCustomizeOpen] = useState(false);
  const queryClient = useQueryClient();
  const invalidPipelineNoticeRef = useRef<string | null>(null);

  // Sorting state
  const sortField = normalizedUrlState.sortField;
  const setSortField = useCallback((v: OpportunitySortField) => setURLParam("sortField", v), [setURLParam]);
  const sortDir = normalizedUrlState.sortDir;
  const setSortDir = useCallback((v: OpportunitySortDir) => setURLParam("sortDir", v), [setURLParam]);

  // List state
  const [createListOpen, setCreateListOpen] = useState(false);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [onlyMine, setOnlyMine] = useState(false);

  // Fetch saved lists for current pipeline
  const { data: savedLists = [] } = useQuery({
    queryKey: ["marketing-opportunity-lists", companyId, selectedPipelineId],
    queryFn: async () => {
      if (!companyId || !selectedPipelineId) return [];
      const { data, error } = await supabase
        .from("marketing_opportunity_lists")
        .select("*")
        .eq("company_id", companyId)
        .eq("pipeline_id", selectedPipelineId)
        .order("created_at");
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!companyId && !!selectedPipelineId,
  });

  const createListMutation = useMutation({
    mutationFn: async (listData: { name: string; description: string }) => {
      if (!companyId || !selectedPipelineId) throw new Error("Missing IDs");
      const { error } = await supabase.from("marketing_opportunity_lists").insert({
        company_id: companyId,
        pipeline_id: selectedPipelineId,
        name: listData.name,
        description: listData.description || "",
        filters: filters as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Elenco creato");
      queryClient.invalidateQueries({ queryKey: ["marketing-opportunity-lists"] });
    },
    onError: () => toast.error("Errore nella creazione dell'elenco"),
  });

  const deleteListMutation = useMutation({
    mutationFn: async (listId: string) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const { error } = await supabase.from("marketing_opportunity_lists").delete().eq("id", listId).eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Elenco eliminato");
      setActiveListId(null);
      setFilters(EMPTY_FILTERS);
      queryClient.invalidateQueries({ queryKey: ["marketing-opportunity-lists"] });
    },
    onError: () => toast.error("Errore nell'eliminazione"),
  });
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
  const [cestinoOpen, setCestinoOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const handleSelect = useCallback((id: string, sel: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (sel) next.add(id); else next.delete(id);
      return next;
    });
  }, []);

  // Select-all per fase (checkbox nell'header della colonna kanban): aggiunge o
  // rimuove in blocco tutti gli id passati.
  const handleSelectMany = useCallback((ids: string[], sel: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (sel) ids.forEach((id) => next.add(id)); else ids.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  // Id per fase chiesti al database quando si spunta una colonna intera,
  // insieme ai filtri con cui sono stati chiesti.
  const [idsColonne, setIdsColonne] = useState<{ chiave: string; ids: Record<string, string[]> }>({ chiave: "", ids: {} });
  const [selezionoTutti, setSelezionoTutti] = useState(false);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setIdsColonne({ chiave: "", ids: {} });
  }, []);

  // Fase scelta nelle schede in alto della lista su mobile (filtra sul database).
  const [mobileStageId, setMobileStageId] = useState<string | null>(null);

  useEffect(() => {
    setActiveListId(null);
    setMobileStageId(null);
    clearSelection();
  }, [clearSelection, selectedPipelineId]);

  useEffect(() => {
    if (urlFilters.viewMode !== normalizedUrlState.viewMode) setURLParam("viewMode", normalizedUrlState.viewMode);
    if (urlFilters.sortField !== normalizedUrlState.sortField) setURLParam("sortField", normalizedUrlState.sortField);
    if (urlFilters.sortDir !== normalizedUrlState.sortDir) setURLParam("sortDir", normalizedUrlState.sortDir);
    if (urlFilters.searchInput !== normalizedUrlState.searchInput) setURLParam("searchInput", normalizedUrlState.searchInput);
  }, [normalizedUrlState, setURLParam, urlFilters.searchInput, urlFilters.sortDir, urlFilters.sortField, urlFilters.viewMode]);

  useEffect(() => {
    if (!loadingPipelines && selectedPipelineId && selectedPipelineId !== urlFilters.selectedPipelineId) {
      const requestedPipelineId = (urlFilters.selectedPipelineId || "").trim();
      if (requestedPipelineId && invalidPipelineNoticeRef.current !== requestedPipelineId) {
        invalidPipelineNoticeRef.current = requestedPipelineId;
        toast.warning("Pipeline non trovata: ho aperto la prima pipeline disponibile.");
      }
      setURLParam("selectedPipelineId", selectedPipelineId);
    }
  }, [loadingPipelines, selectedPipelineId, setURLParam, urlFilters.selectedPipelineId]);

  useEffect(() => {
    setSearchInput(normalizedUrlState.searchInput);
  }, [normalizedUrlState.searchInput]);

  useEffect(() => {
    if (safeSearchQuery !== normalizedUrlState.searchInput) {
      setURLParam("searchInput", safeSearchQuery);
    }
  }, [normalizedUrlState.searchInput, safeSearchQuery, setURLParam]);

  const selectedPipeline = useMemo(
    () => pipelines.find((p: any) => p.id === selectedPipelineId),
    [pipelines, selectedPipelineId]
  );
  const stages = useMemo(() => selectedPipeline?.marketing_pipeline_stages || [], [selectedPipeline]);
  // Filtro azionabile della strip: "Da fare" (prossime azioni scadute) o
  // "In stallo" (ferme oltre la soglia della fase). Un click sul KPI.
  const [filtroStrip, setFiltroStrip] = useState<FiltroStrip>(null);

  // Filtri, ricerca, «I miei deal» e striscia nella forma del database: li
  // applica lui, su tutte le opportunità della pipeline.
  const filtriServer = useMemo(() => filtriPerServer({
    searchQuery: safeSearchQuery,
    filters,
    onlyMine,
    currentUserId,
    visibiliA: permissions.onlyAssigned ? currentUserId : null,
    striscia: filtroStrip,
  }), [safeSearchQuery, filters, onlyMine, currentUserId, permissions.onlyAssigned, filtroStrip]);

  // Cambiati i filtri (o la pipeline), gli id di colonna chiesti prima non
  // valgono più.
  const chiaveIdsColonne = `${selectedPipelineId}|${JSON.stringify(filtriServer)}`;
  const idsPerFase = idsColonne.chiave === chiaveIdsColonne ? idsColonne.ids : NESSUN_ID_PER_FASE;

  const {
    data: riepilogo,
    error: riepilogoError,
    isFetching: aggiornoRiepilogo,
  } = useOpportunitySummary(selectedPipelineId, filtriServer);

  // Lead nuovi e schede spostate da altri compaiono da soli, senza F5.
  useOpportunitiesLive(selectedPipelineId);

  const lista = useOpportunityList({
    pipelineId: selectedPipelineId,
    stageId: isMobile ? mobileStageId : null,
    filtri: filtriServer,
    sortField,
    sortDir,
    enabled: viewMode === "list",
  });

  const totaleFiltrate = riepilogo?.totale ?? 0;
  // Nella lista su mobile, con una fase scelta in alto, «tutte» sono quelle
  // della fase.
  const faseLista = viewMode === "list" && isMobile ? mobileStageId : null;
  const totaleSelezionabile = faseLista ? (riepilogo?.per_fase[faseLista]?.n ?? 0) : totaleFiltrate;

  const { fetchNextPage: paginaSuccessivaLista } = lista;
  const caricaAltreLista = useCallback(() => { paginaSuccessivaLista(); }, [paginaSuccessivaLista]);

  const riprovaCaricamento = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.opportunities.all });
  }, [queryClient]);

  // Fetch dedicato per il deep-link ?apri=: l'opportunità potrebbe non stare
  // nelle pagine già caricate della lista paginata, quindi niente find sull'array.
  const { data: oppDaAprire } = useQuery({
    queryKey: ["opportunita-deep-link", companyId, apriOppId],
    enabled: !!apriOppId && !!companyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("marketing_opportunities")
        .select("*, marketing_contacts(id, first_name, last_name, email, phone, city, address, province, region, postal_code, source, company_name, tags, last_activity_at, created_at)")
        .eq("id", apriOppId!)
        .eq("company_id", companyId!)
        .is("deleted_at", null)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const [arricchita] = await enrichPage([data], companyId!);
      return arricchita ?? null;
    },
  });

  // Le etichette della pipeline servono solo al pannello Filtri: si chiedono
  // quando lo si apre.
  const { data: availableTags = [] } = useOpportunityTags(selectedPipelineId, filtersOpen);

  const applyOpportunityFiltersAndSort = useCallback((source: any[]) => {
    return filterAndSortOpportunities({
      opportunities: source,
      searchQuery: safeSearchQuery,
      filters,
      onlyMine,
      currentUserId,
      sortField,
      sortDir,
    });
  }, [safeSearchQuery, filters, sortField, sortDir, onlyMine, currentUserId]);

  /** «Seleziona tutti»: gli id di TUTTE le opportunità filtrate, dal database. */
  const selezionaTutti = useCallback(async () => {
    if (!selectedPipelineId) return;
    setSelezionoTutti(true);
    try {
      const ids = await idsOpportunita(selectedPipelineId, filtriServer, faseLista);
      setSelectedIds(new Set(ids));
    } catch {
      toast.error("Non sono riuscito a selezionarle tutte: riprova tra qualche secondo.");
    } finally {
      setSelezionoTutti(false);
    }
  }, [selectedPipelineId, filtriServer, faseLista]);

  /** Spunta (o togli) un'intera colonna, anche le schede non ancora caricate. */
  const selezionaFase = useCallback(async (stageId: string, sel: boolean) => {
    if (!selectedPipelineId) return;
    try {
      // Per spuntare si chiede sempre la lista aggiornata; per togliere basta
      // quella già avuta.
      const ids = !sel && idsPerFase[stageId]
        ? idsPerFase[stageId]
        : await idsOpportunita(selectedPipelineId, filtriServer, stageId);
      setIdsColonne((prec) => ({
        chiave: chiaveIdsColonne,
        ids: { ...(prec.chiave === chiaveIdsColonne ? prec.ids : {}), [stageId]: ids },
      }));
      handleSelectMany(ids, sel);
    } catch {
      toast.error("Non sono riuscito a selezionare la colonna: riprova tra qualche secondo.");
    }
  }, [selectedPipelineId, filtriServer, idsPerFase, chiaveIdsColonne, handleSelectMany]);

  const fetchAllOpportunitiesForExport = useCallback(async () => {
    if (!companyId || !selectedPipelineId) return [];
    const pageSize = 1000;
    let from = 0;
    let allRows: any[] = [];

    for (;;) {
      let query = supabase
        .from("marketing_opportunities")
        .select("*, marketing_contacts(id, first_name, last_name, email, phone, city, address, province, region, postal_code, source, company_name, tags)")
        .eq("company_id", companyId)
        .eq("pipeline_id", selectedPipelineId)
        // Coerente con la lista: mai esportare righe soft-deleted.
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);

      // «Vede solo i propri»: venditore, call center o follower (come la pagina).
      if (permissions.onlyAssigned && currentUserId) {
        query = query.or(filtroSoloMiei(currentUserId));
      }

      const { data, error } = await query;
      if (error) throw error;
      allRows = allRows.concat(data || []);
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }

    return applyOpportunityFiltersAndSort(allRows);
  }, [companyId, selectedPipelineId, permissions.onlyAssigned, currentUserId, applyOpportunityFiltersAndSort]);

  const handleExportOpportunities = useCallback(async () => {
    if (!canExportClients || !companyId) return;
    if (!selectedPipelineId) {
      toast.error("Seleziona una pipeline prima di esportare");
      return;
    }
    setIsExporting(true);
    try {
      const exportRows = await fetchAllOpportunitiesForExport();
      const stageMap = Object.fromEntries(stages.map((s: any) => [s.id, s.name]));
      const staffMap = Object.fromEntries(staff.map((s: any) => [s.id, s.name]));

      // v8.6.46 — C4: include custom fields nell'export opportunità.
      // Fetch definitions + values con chunking per evitare i limiti Supabase IN().
      const { data: cfDefs } = await supabase
        .from("marketing_custom_fields")
        .select("id, name")
        .eq("company_id", companyId!)
        .eq("object_type", "opportunity");
      const cfDefsArr = (cfDefs ?? []) as Array<{ id: string; name: string }>;

      const cfValueMap: Record<string, Record<string, string>> = {};
      if (cfDefsArr.length > 0 && exportRows.length > 0) {
        const oppIds = exportRows.map((o: any) => o.id);
        const CHUNK_SIZE = 2000;
        for (let i = 0; i < oppIds.length; i += CHUNK_SIZE) {
          const chunk = oppIds.slice(i, i + CHUNK_SIZE);
          const { data: vals } = await supabase
            .from("marketing_opportunity_field_values")
            .select("opportunity_id, field_id, value")
            .in("opportunity_id", chunk);
          for (const v of (vals ?? []) as Array<{ opportunity_id: string; field_id: string; value: string | null }>) {
            if (!cfValueMap[v.opportunity_id]) cfValueMap[v.opportunity_id] = {};
            if (v.value) cfValueMap[v.opportunity_id][v.field_id] = v.value;
          }
        }
      }

      const rows = exportRows.map((o: any) => {
        const c = o.marketing_contacts || {};
        // Ponderato coerente con la dashboard (OpportunityStatsStrip): la
        // probabilità pesa SOLO le aperte; vinte = valore pieno, perse = 0.
        // Prima ogni riga usciva a probabilità (default 50%) a prescindere
        // dallo stato: una vinta appariva dimezzata, una persa valeva 50%.
        const valueNum = Number(o.value || 0);
        const probClamped = Math.max(0, Math.min(100, Number(o.probability ?? 50)));
        const weighted =
          o.status === "won" ? valueNum : o.status === "open" ? valueNum * (probClamped / 100) : 0;
        const row: Record<string, string> = {
          name: o.name || "",
          contact: [c.first_name, c.last_name].filter(Boolean).join(" "),
          email: c.email || "",
          phone: c.phone || "",
          value: String(o.value || 0),
          probability: String(o.probability ?? ""),
          weighted_value: String(Math.round(weighted * 100) / 100),
          status: o.status || "",
          stage: stageMap[o.stage_id] || "",
          assigned_to: staffMap[o.assigned_to] || "",
          source: o.source || "",
          tags: (o.tags || []).join(", "),
          // Stessa formattazione it-IT delle altre colonne data (era ISO grezzo).
          expected_close_date: o.expected_close_date
            ? new Date(o.expected_close_date).toLocaleDateString("it-IT")
            : "",
          created_at: o.created_at ? new Date(o.created_at).toLocaleDateString("it-IT") : "",
          updated_at: o.updated_at ? new Date(o.updated_at).toLocaleDateString("it-IT") : "",
        };
        // Custom field values
        for (const cf of cfDefsArr) {
          row[`cf_${cf.id}`] = cfValueMap[o.id]?.[cf.id] ?? "";
        }
        return row;
      });
      const today = new Date().toISOString().slice(0, 10);
      const cfColumns = cfDefsArr.map((cf) => ({ key: `cf_${cf.id}`, label: cf.name }));
      // Prima il registro, poi il file: senza registrazione non parte.
      await registraEsportazioneCrm({
        companyId,
        oggetto: "opportunita",
        formato: "csv",
        righe: rows.length,
        filtri: {
          pipeline: selectedPipeline?.name ?? selectedPipelineId,
          ricerca: safeSearchQuery,
          filtri: filters,
          solo_mie: onlyMine,
          perimetro: permissions.onlyAssigned ? "solo i propri" : "tutta l'azienda",
        },
      });
      exportToCSV(rows, [
        { key: "name", label: "Nome Opportunità" },
        { key: "contact", label: "Contatto" },
        { key: "email", label: "Email" },
        { key: "phone", label: "Telefono" },
        { key: "value", label: "Valore" },
        { key: "probability", label: "Probabilità" },
        { key: "weighted_value", label: "Valore ponderato" },
        { key: "status", label: "Stato" },
        { key: "stage", label: "Fase" },
        { key: "assigned_to", label: "Venditore" },
        { key: "source", label: "Fonte" },
        { key: "tags", label: "Tag" },
        { key: "expected_close_date", label: "Chiusura prevista" },
        { key: "created_at", label: "Data Creazione" },
        { key: "updated_at", label: "Ultimo aggiornamento" },
        ...cfColumns,
      ], `opportunita_${today}.csv`);
      toast.success(`${rows.length} opportunità esportate${permissions.onlyAssigned ? " tra quelle assegnate a te" : ""}`);
    } catch (err) {
      toast.error(messaggioEsportazioneNonRiuscita(err));
    } finally {
      setIsExporting(false);
    }
  }, [canExportClients, fetchAllOpportunitiesForExport, selectedPipelineId, selectedPipeline, safeSearchQuery, filters, onlyMine, stages, staff, permissions.onlyAssigned, companyId]);

  const activeFilterCount = countActiveFilters(filters);
  // Mobile: il numero sul bottone dei filtri (Miei, Da fare/In stallo, filtri avanzati o elenco).
  const filtriMobileAttivi = (onlyMine ? 1 : 0) + (filtroStrip ? 1 : 0) + activeFilterCount;
  const ordineAttuale = `${sortField}:${sortDir}`;

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
          if (!canEditOpportunities) {
            return { success: 0, errors: ["Non hai i permessi per importare opportunità"] };
          }
          const customKeys = oppCustomFields.map(f => `custom_${f.id}`);
          const defaultStageId = [...stages].sort((a: any, b: any) => a.position - b.position)[0].id;
          let success = 0;
          const errors: string[] = [];
          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            try {
              const firstName = r.contact_first_name?.trim() || "Senza nome";
              const lastName = r.contact_last_name?.trim() || null;
              const email = r.contact_email?.trim().toLowerCase() || null;
              const phone = r.contact_phone?.trim() ? cleanPhone(r.contact_phone) : null;
              const value = r.value?.trim() ? Number(r.value) : 0;
              if (!Number.isFinite(value) || value < 0) {
                throw new Error("Valore economico non valido");
              }
              let contactId: string | null = null;
              if (email) {
                const { data: found } = await supabase.from("marketing_contacts").select("id").eq("company_id", companyId).eq("email", email).limit(1).maybeSingle();
                if (found) contactId = found.id;
              }
              if (!contactId && phone) {
                const { data: found } = await supabase.from("marketing_contacts").select("id").eq("company_id", companyId).eq("phone", phone).limit(1).maybeSingle();
                if (found) contactId = found.id;
              }
              if (!contactId) {
                const { data: newContact, error: cErr } = await supabase.from("marketing_contacts").insert({ company_id: companyId, first_name: firstName, last_name: lastName, email, phone }).select("id").single();
                if (cErr) throw cErr;
                contactId = newContact!.id;
              }
              const tags = r.tags ? normalizeTagList(r.tags.split(",")) : [];
              const { data: oppData, error: oErr } = await supabase.from("marketing_opportunities").insert({
                company_id: companyId, pipeline_id: selectedPipelineId, stage_id: defaultStageId,
                contact_id: contactId!, name: r.name?.trim() || `Opportunità ${i + 1}`,
                value, source: r.source?.trim() || "importazione", tags, notes: r.notes?.trim() || null,
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
      <div className="flex min-h-[420px] flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
              Caricamento opportunità...
            </div>
            <p className="mt-1 text-xs text-slate-500">Sto preparando pipeline, fasi e dati commerciali.</p>
          </div>
          <Skeleton className="h-9 w-36 rounded-xl" />
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20 rounded-2xl" />
          ))}
        </div>
        <div className="grid flex-1 gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
              <Skeleton className="mb-3 h-5 w-28 rounded-lg" />
              <div className="space-y-3">
                <Skeleton className="h-28 rounded-2xl bg-white" />
                <Skeleton className="h-28 rounded-2xl bg-white" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (pipelinesError) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-2xl border border-red-100 bg-red-50/60 p-6 text-center">
        <div className="max-w-md space-y-4">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-red-600 shadow-sm">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Opportunità non caricate</h2>
            <p className="mt-1 text-sm text-slate-600">
              Non sono riuscito a caricare le pipeline commerciali. Riprova: se la rete è lenta evitiamo un caricamento infinito.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => refetchPipelines()}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Riprova
          </Button>
        </div>
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
        {!isAdminContext && (
          <Button variant="outline" onClick={() => navigate("/azienda/impostazioni/sequenze")}>
            Vai alle Impostazioni
          </Button>
        )}
      </div>
    );
  }

  return (
    // Su desktop la pagina è alta quanto lo schermo, meno la barra in alto
    // (56px), i margini del contenuto (2×24) e la riga «Powered by» sotto
    // (33): le colonne riempiono lo spazio che resta e scorrono dentro di sé.
    // Prima avevano un'altezza fissa calcolata a occhio e, con striscia e
    // barre sopra, finivano sotto il bordo: si scorreva la pagina E la colonna.
    <div className="flex flex-col h-full min-h-0 gap-3 md:h-[calc(100vh-137px)] md:pb-0">
      {/* Mobile: testata senza riquadro (selettore pipeline, numero, «+»). */}
      <div className="flex shrink-0 flex-nowrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-gradient-to-br from-white via-white to-orange-50/50 p-3 shadow-sm sm:flex-wrap sm:gap-3 max-sm:rounded-none max-sm:border-0 max-sm:bg-none max-sm:p-0 max-sm:shadow-none">
        <div className="flex min-w-0 items-center gap-2">
          <PipelineSelector pipelines={pipelines} value={selectedPipelineId} onChange={setSelectedPipelineId} />
          {/* Il totale viene dal database: tutte le opportunità che passano i
              filtri, non solo quelle caricate nelle colonne. */}
          <Badge className="h-6 shrink-0 gap-1 bg-orange-100 px-2 text-xs tabular-nums text-orange-700 hover:bg-orange-100">
            {riepilogo ? formatCount(totaleFiltrate) : <Loader2 className="h-3 w-3 animate-spin" />}
            {/* Tablet: solo il numero, così la testata sta su una riga. */}
            <span className="hidden lg:inline">opportunità</span>
            {aggiornoRiepilogo && riepilogo && <Loader2 className="h-3 w-3 animate-spin opacity-60" aria-label="Aggiorno i conteggi" />}
          </Badge>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={viewMode === "kanban" ? "secondary" : "ghost"} size="icon" className="hidden md:inline-flex h-8 w-8" onClick={() => setViewMode("kanban")}>
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Vista griglia</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={viewMode === "list" ? "secondary" : "ghost"} size="icon" className="hidden md:inline-flex h-8 w-8" onClick={() => setViewMode("list")}>
                <List className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Vista lista</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={layout === "mini" ? "secondary" : "ghost"}
                size="icon"
                className="hidden lg:inline-flex h-8 w-8"
                onClick={() => setLayout(layout === "mini" ? "default" : "mini")}
              >
                {layout === "mini" ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{layout === "mini" ? "Vista estesa" : "Vista compatta"}</TooltipContent>
          </Tooltip>
          <Button variant="outline" size="sm" className="hidden md:inline-flex h-8 text-xs max-lg:w-8 max-lg:px-0" onClick={() => setImportOpen(true)} disabled={stages.length === 0 || !canEditOpportunities} aria-label="Importa">
            <Upload className="mr-1.5 h-3.5 w-3.5 max-lg:mr-0" /> <span className="max-lg:hidden">Importa</span>
          </Button>
          {/* Telefono e tablet: «+» quadrato, la testata sta su una riga. */}
          <Button size="sm" className="tap-compact h-8 w-8 shrink-0 p-0 lg:w-auto lg:px-3 bg-gradient-to-r from-orange-500 to-amber-500 text-xs text-white shadow-sm shadow-orange-200 hover:from-orange-600 hover:to-amber-600" onClick={() => setDialogOpen(true)} disabled={stages.length === 0 || !canEditOpportunities} aria-label="Aggiungi opportunità">
            <Plus className="h-4 w-4 lg:mr-1.5 lg:h-3.5 lg:w-3.5" />
            <span className="hidden lg:inline">Aggiungi opportunità</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              {/* Mobile no: importa, vista, campi, cestino e impostazioni sono da scrivania. */}
              <Button variant="ghost" size="icon" className="h-8 w-8 max-sm:hidden" aria-label="Altre azioni">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem className="md:hidden" onClick={() => setImportOpen(true)} disabled={stages.length === 0 || !canEditOpportunities}>
                <Upload className="mr-2 h-4 w-4" /> Importa CSV
              </DropdownMenuItem>
              <DropdownMenuItem className="md:hidden" onClick={() => setViewMode(viewMode === "kanban" ? "list" : "kanban")}>
                {viewMode === "kanban" ? <List className="mr-2 h-4 w-4" /> : <LayoutGrid className="mr-2 h-4 w-4" />}
                {viewMode === "kanban" ? "Vista lista" : "Vista Kanban"}
              </DropdownMenuItem>
              <DropdownMenuItem className="md:hidden" onClick={() => setCardCustomizeOpen(true)}>
                <Settings2 className="mr-2 h-4 w-4" /> Gestisci campi
              </DropdownMenuItem>
              {/* Niente export su telefono, né senza «Esporta Clienti». */}
              {!isMobile && canExportClients && (
                <DropdownMenuItem onClick={handleExportOpportunities} disabled={isExporting}>
                  {isExporting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Esporta CSV
                </DropdownMenuItem>
              )}
              {canEditOpportunities && (
                <DropdownMenuItem onClick={() => setCestinoOpen(true)}>
                  <Trash2 className="mr-2 h-4 w-4" /> Cestino
                </DropdownMenuItem>
              )}
              {!isAdminContext && <DropdownMenuItem onClick={() => navigate("/azienda/impostazioni/sequenze")}>Impostazioni pipeline</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {/* KPI pipeline. Su mobile in vista Kanban li nascondiamo: le colonne mostrano
          già i totali per fase e così la pipeline resta la vista principale (più
          spazio verticale). In vista lista restano visibili. I numeri vengono
          dal database e contano tutte le opportunità, non solo quelle caricate. */}
      {/* Mobile no: nove riquadri di numeri prima della lista. Le fasi hanno il
          loro numero nelle pillole, «Da fare» e «In stallo» stanno nel pannello dei filtri. */}
      {!isMobile && (
        <div className="shrink-0">
          <OpportunityStatsStrip riepilogo={riepilogo} filtroAttivo={filtroStrip} onFiltro={setFiltroStrip} />
        </div>
      )}
      {riepilogoError && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            <span>Caricamento opportunità interrotto: puoi riprovare senza ricaricare tutta la pagina.</span>
          </div>
          <Button type="button" size="sm" variant="outline" className="h-8 border-amber-200 bg-white text-amber-900 hover:bg-amber-100" onClick={riprovaCaricamento}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
            Riprova
          </Button>
        </div>
      )}

      {/* Una barra sola: a sinistra gli elenchi salvati, a destra ricerca,
          «Tutti/Miei», filtri, ordinamento e campi. Prima erano due riquadri
          uno sotto l'altro, e la ricerca da sola occupava una riga intera:
          tutto spazio tolto alle colonne. Su mobile va su due righe. */}
      <CercaConFiltri
        className="shrink-0 sm:hidden"
        valore={searchInput}
        onCambia={setSearchInput}
        segnaposto="Cerca nome, telefono, email"
        filtriAttivi={filtriMobileAttivi}
        onApriFiltri={() => setFiltriMobileAperti(true)}
      />
      <PannelloFiltri
        aperto={filtriMobileAperti}
        onAperto={setFiltriMobileAperti}
        attivi={filtriMobileAttivi}
        onAzzera={() => { setOnlyMine(false); setFiltroStrip(null); setActiveListId(null); setFilters(EMPTY_FILTERS); }}
        risultati={riepilogo ? totaleFiltrate : undefined}
      >
        <PilloleFiltro
          titolo="Mostra"
          valore={onlyMine ? "miei" : "tutti"}
          onScegli={(v) => setOnlyMine(v === "miei")}
          scelte={[
            { value: "tutti", label: "Tutte" },
            { value: "miei", label: "Le mie" },
          ]}
        />
        <PilloleFiltro
          titolo="Da lavorare"
          valore={filtroStrip ?? "nessuno"}
          onScegli={(v) => setFiltroStrip(v === "nessuno" ? null : v)}
          scelte={[
            { value: "nessuno", label: "Tutte" },
            { value: "azioni_scadute", label: "Da fare", n: riepilogo?.azioni_scadute },
            { value: "stallo", label: "In stallo", n: riepilogo?.in_stallo },
          ]}
        />
        <PilloleFiltro
          titolo="Ordine"
          valore={ordineAttuale}
          onScegli={(v) => {
            const [campo, verso] = v.split(":");
            // Un solo aggiornamento dell'indirizzo: due di fila si riscrivono.
            setURLParams({ sortField: campo, sortDir: verso });
          }}
          scelte={ORDINAMENTI.slice(0, 6).map((o) => ({ value: `${o.field}:${o.dir}`, label: o.label }))}
        />
        {savedLists.length > 0 && (
          <PilloleFiltro
            titolo="Elenco"
            valore={activeListId ?? "tutto"}
            onScegli={(v) => {
              if (v === "tutto") { setActiveListId(null); setFilters(EMPTY_FILTERS); return; }
              const list = savedLists.find((l: any) => l.id === v);
              setActiveListId(v);
              if (list?.filters && typeof list.filters === "object") setFilters({ ...EMPTY_FILTERS, ...list.filters });
            }}
            scelte={[{ value: "tutto", label: "Tutto" }, ...savedLists.map((l: any) => ({ value: l.id as string, label: l.name as string }))]}
          />
        )}
        {/* Filtri avanzati arrivati dal computer o da un elenco: solo il numero e il modo di toglierli. */}
        {activeFilterCount > 0 && !activeListId && (
          <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
            <span className="text-xs text-muted-foreground">
              {activeFilterCount === 1 ? "1 filtro avanzato" : `${activeFilterCount} filtri avanzati`}
            </span>
            <Button variant="ghost" size="sm" className="tap-compact h-7 px-2 text-xs" onClick={() => setFilters(EMPTY_FILTERS)}>
              Togli
            </Button>
          </div>
        )}
      </PannelloFiltri>

      <div className="flex shrink-0 flex-col gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm md:flex-row md:items-center md:gap-2 max-sm:hidden">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none" aria-label="Elenchi salvati">
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={!activeListId}
            className={cn("h-8 shrink-0 rounded-xl px-3 text-xs", !activeListId ? "bg-orange-50 font-semibold text-orange-700 hover:bg-orange-50" : "text-muted-foreground hover:bg-slate-50")}
            onClick={() => { setActiveListId(null); setFilters(EMPTY_FILTERS); }}
          >
            Tutto
          </Button>
          {savedLists.map((list: any) => (
            <div key={list.id} className="group flex shrink-0 items-center">
              <Button
                variant="ghost"
                size="sm"
                aria-pressed={activeListId === list.id}
                className={cn("h-8 shrink-0 rounded-xl px-3 text-xs", activeListId === list.id ? "bg-orange-50 font-semibold text-orange-700 hover:bg-orange-50" : "text-muted-foreground hover:bg-slate-50")}
                onClick={() => {
                  setActiveListId(list.id);
                  if (list.filters && typeof list.filters === "object") {
                    setFilters({ ...EMPTY_FILTERS, ...list.filters });
                  }
                }}
              >
                {list.name}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0 text-muted-foreground transition-opacity hover:text-destructive sm:h-5 sm:w-5 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  // Conferma: un misclick sulla X cancellava definitivamente il
                  // segmento salvato (le opportunità hanno conferma, le liste no).
                  if (confirm(`Eliminare l'elenco salvato "${list.name}"?`)) {
                    deleteListMutation.mutate(list.id);
                  }
                }}
                aria-label={`Elimina elenco ${list.name}`}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 shrink-0 rounded-xl px-2.5 text-xs text-muted-foreground hover:bg-slate-50 hover:text-foreground"
            onClick={() => setCreateListOpen(true)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Elenco
          </Button>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 md:border-l md:border-slate-100 md:pl-2">
          <div className="relative min-w-0 flex-1 md:w-56 md:flex-none lg:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Cerca nome, telefono, email…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="h-9 w-full rounded-xl border-slate-200 bg-slate-50/70 pl-8 pr-8 text-base transition-colors focus-visible:bg-white md:h-8 md:text-xs"
              aria-label="Cerca opportunità, contatto, azienda, email o telefono"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput("")}
                aria-label="Cancella la ricerca"
                className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-slate-200/70 hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Tutti / Miei: due etichette corte invece di un bottone che cambia
              nome — si vede subito quale dei due è acceso. «Miei» = venditore,
              call center o follower. */}
          <div className="flex h-9 shrink-0 items-center rounded-xl border border-slate-200 bg-slate-50/70 p-0.5 md:h-8" role="group" aria-label="Quali opportunità mostrare">
            {([
              { mie: false, etichetta: "Tutti", titolo: "Mostra tutte le opportunità" },
              { mie: true, etichetta: "Miei", titolo: "Solo quelle che segui tu: venditore, call center o follower" },
            ] as const).map(({ mie, etichetta, titolo }) => (
              <button
                key={etichetta}
                type="button"
                title={titolo}
                aria-pressed={onlyMine === mie}
                onClick={() => setOnlyMine(mie)}
                className={cn(
                  "h-full rounded-[10px] px-2.5 text-xs font-medium transition-colors",
                  onlyMine === mie ? "bg-white text-orange-700 shadow-sm ring-1 ring-slate-200" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {etichetta}
              </button>
            ))}
          </div>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={cn("relative h-9 shrink-0 rounded-xl px-2.5 text-xs md:h-8", activeFilterCount > 0 && "border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100")}
                onClick={() => setFiltersOpen(true)}
                aria-label={activeFilterCount > 0 ? `Filtri (${activeFilterCount} attivi)` : "Apri filtri"}
              >
                <Filter className="h-3.5 w-3.5 lg:mr-1.5" />
                <span className="hidden lg:inline">Filtri</span>
                {activeFilterCount > 0 && (
                  <span className="ml-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-semibold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent className="lg:hidden">Filtri</TooltipContent>
          </Tooltip>

          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9 shrink-0 rounded-xl px-2.5 text-xs md:h-8" aria-label={`Ordina: ${ORDINAMENTI.find((o) => o.field === sortField && o.dir === sortDir)?.label ?? "Più recenti"}`}>
                    <ArrowUpDown className="h-3.5 w-3.5 xl:mr-1.5" />
                    <span className="hidden xl:inline">{ORDINAMENTI.find((o) => o.field === sortField && o.dir === sortDir)?.label ?? "Ordina"}</span>
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent className="xl:hidden">
                Ordina: {ORDINAMENTI.find((o) => o.field === sortField && o.dir === sortDir)?.label ?? "Più recenti"}
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-52">
              {ORDINAMENTI.map((opt) => (
                <DropdownMenuItem
                  key={`${opt.field}-${opt.dir}`}
                  onClick={() => { setSortField(opt.field); setSortDir(opt.dir); }}
                  className="flex items-center justify-between text-xs"
                >
                  {opt.label}
                  {sortField === opt.field && sortDir === opt.dir && <Check className="ml-2 h-3.5 w-3.5 text-orange-600" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="hidden h-8 w-8 shrink-0 rounded-xl text-muted-foreground hover:text-foreground md:inline-flex"
                onClick={() => setCardCustomizeOpen(true)}
                aria-label="Gestisci campi delle schede"
              >
                <Settings2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Gestisci campi</TooltipContent>
          </Tooltip>
        </div>
      </div>

      {stages.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground gap-2">
          <p className="text-sm">Questa pipeline non ha fasi configurate.</p>
          {!isAdminContext && <Button variant="outline" size="sm" onClick={() => navigate("/azienda/impostazioni/sequenze")}>Configura fasi</Button>}
        </div>
      ) : (
        <>
           {selectedIds.size > 0 && canEditOpportunities && (
            <div className="flex items-center gap-2 sm:gap-3 flex-wrap px-3 sm:px-4 py-2 bg-primary/5 border rounded-lg shrink-0">
              <Badge variant="secondary" className="text-xs font-semibold tabular-nums">
                {formatCount(selectedIds.size)} selezionat{selectedIds.size === 1 ? "a" : "e"}
              </Badge>
              {selectedIds.size < totaleSelezionabile && (
                <Button variant="link" size="sm" className="h-auto gap-1 p-0 text-xs" disabled={selezionoTutti} onClick={selezionaTutti}>
                  {selezionoTutti && <Loader2 className="h-3 w-3 animate-spin" />}
                  Seleziona tutte le {formatCount(totaleSelezionabile)}
                </Button>
              )}
              <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={clearSelection}>Deseleziona</Button>
              <div className="ml-auto flex items-center gap-2">
                <Button variant="outline" size="sm" className="h-9 sm:h-7 text-xs gap-1" onClick={() => setBulkEditOpen(true)} aria-label="Modifica selezionati">
                  <Pencil className="h-3 w-3" /> <span className="hidden sm:inline">Modifica</span>
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="h-9 sm:h-7 text-xs gap-1"
                  disabled={selectedIds.size > MASSIMO_ELIMINAZIONE}
                  title={selectedIds.size > MASSIMO_ELIMINAZIONE ? `Si possono eliminare al massimo ${formatCount(MASSIMO_ELIMINAZIONE)} opportunità alla volta` : undefined}
                  onClick={() => setConfirmBulkDelete(true)}
                  aria-label="Elimina selezionati"
                >
                  <Trash2 className="h-3 w-3" /> <span className="hidden sm:inline">Elimina</span>
                </Button>
              </div>
            </div>
          )}
          {viewMode === "list" ? (
            <div className="flex-1 min-h-0 overflow-y-auto">
            <OpportunityListView
              stages={stages}
              opportunities={lista.opportunita}
              riepilogo={riepilogo}
              isLoading={lista.isLoading}
              hasMore={!!lista.hasNextPage}
              isLoadingMore={lista.isFetchingNextPage}
              onLoadMore={caricaAltreLista}
              mobileStageId={mobileStageId}
              onMobileStageChange={setMobileStageId}
              selectedIds={selectedIds}
              onSelect={handleSelect}
              onSelectMany={handleSelectMany}
              onSelectStage={selezionaFase}
              canEdit={canEditOpportunities}
            />
            </div>
          ) : (
            <div className="flex-1 min-h-0">
              <OpportunityKanbanView
                stages={stages}
                pipelineId={selectedPipelineId!}
                filtri={filtriServer}
                sortField={sortField}
                sortDir={sortDir}
                riepilogo={riepilogo}
                idsPerFase={idsPerFase}
                selectedIds={selectedIds}
                onSelect={handleSelect}
                onSelectStage={selezionaFase}
                canEdit={canEditOpportunities}
                onQuickAdd={(stageId) => { setQuickAddStageId(stageId); setDialogOpen(true); }}
              />
            </div>
          )}
        </>
      )}

      {selectedPipelineId && stages.length > 0 && (
        <>
        <OpportunityDialog open={dialogOpen || !!nuovaDaContattoId} onOpenChange={(o) => { setDialogOpen(o); if (!o) { setQuickAddStageId(null); setNuovaDaContattoId(null); } }} pipelineId={selectedPipelineId} pipelineName={selectedPipeline?.name} stages={stages} initialStageId={quickAddStageId} initialContactId={nuovaDaContattoId} />
        {oppDaAprire && (
          <OpportunityDetailDialog
            opportunity={oppDaAprire}
            open
            onOpenChange={(o) => { if (!o) setApriOppId(null); }}
            stages={stages}
            canEdit={canEditOpportunities}
          />
        )}
        </>
      )}

      <OpportunityFiltersSheet open={filtersOpen} onOpenChange={setFiltersOpen} filters={filters} onApply={(f) => { setFilters(f); setActiveListId(null); }} staff={staff} availableTags={availableTags} />

      <BulkEditSheet open={bulkEditOpen} onOpenChange={setBulkEditOpen} selectedIds={[...selectedIds]} stages={stages} onDone={clearSelection} canEdit={canEditOpportunities} />

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
            <AlertDialogDescription>Finiscono nel cestino: le puoi ripristinare da Altre azioni → Cestino.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => { bulkDelete.mutate([...selectedIds], { onSuccess: () => { clearSelection(); setConfirmBulkDelete(false); } }); }}>
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <OpportunitaCestinoDialog open={cestinoOpen} onOpenChange={setCestinoOpen} />
      <CreateListDialog
        open={createListOpen}
        onOpenChange={setCreateListOpen}
        onSave={(data) => createListMutation.mutateAsync(data)}
      />
    </div>
  );
}
