import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useMarketingRoutePrefix } from "@/hooks/useMarketingRoutePrefix";
import { useIsMobile } from "@/hooks/use-mobile";
import { withClientTimeout, retryListQuery } from "@/lib/query-timeout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import {
  Zap, Plus, ExternalLink, MoreHorizontal, Pencil, Copy, Archive, Trash2,
  ChevronLeft, ChevronRight, ChevronDown, Folder, FolderOpen,
  List, Grid3X3, Play, Pause, Clock, AlertTriangle,
  Users, Megaphone, ClipboardList, Coins, Package, HardHat,
  Headphones, Warehouse, UserCog, CheckSquare, Bell, Settings, RefreshCw,
} from "lucide-react";
import { Fragment, useEffect, useState, useMemo, type ReactNode } from "react";
import type { AutomationFlow } from "@/types/automationBuilder";

import { ConfermaQuantita, useConfermaQuantita } from "@/components/shared/ConfermaQuantita";
import { AutomazioniCestinoDialog } from "./AutomazioniCestinoDialog";
type AutomationNodeRow = {
  flow_id?: string;
  node_type: string;
  config_json: Record<string, unknown> | null;
};

const PUBLISHABLE_NODE_TYPES = new Set(["action", "condition", "delay", "goal", "split"]);

function hasDelayDuration(config: Record<string, unknown> | null | undefined): boolean {
  const c = config ?? {};
  // "Fino alle HH:MM" (builder, delay_tipo=fino_a): la durata non serve.
  if (c.delay_tipo === "fino_a" && typeof c.delay_orario === "string" && /^\d{1,2}:\d{2}$/.test(c.delay_orario)) {
    return true;
  }
  // Schema builder (delay_durata) / legacy (delay_value): invalida SOLO se
  // impostata esplicitamente a un valore non valido.
  const value = c.delay_durata ?? c.delay_value;
  if (value != null && value !== "") {
    const numericValue = Number(value);
    return Number.isFinite(numericValue) && numericValue > 0;
  }
  // Schema catalogo/template (giorni/ore/minuti): il motore lo supporta, ma
  // PRIMA questa validazione bloccava il publish di TUTTI i template con
  // attese ("Deal perso", "Solleciti fattura scaduta", ecc.).
  // Nessuna durata configurata = ok: il motore applica il default sicuro (1h).
  return true;
}

function validateAutomationForPublish(nodes: AutomationNodeRow[] | null | undefined): string[] {
  const rows = nodes ?? [];
  const errors: string[] = [];
  const hasTrigger = rows.some(n => n.node_type === "trigger");
  const hasPublishableStep = rows.some(n => PUBLISHABLE_NODE_TYPES.has(n.node_type));

  // Senza trigger il flusso è "ricevente": si pubblica se ha almeno uno step
  // (ci si entra dall'azione "Passa a un'altra automazione").
  if (!hasTrigger && !hasPublishableStep) errors.push("Aggiungi un trigger o almeno un'azione: il flusso è vuoto.");
  if (hasTrigger && !hasPublishableStep) errors.push("Aggiungi almeno un'azione dopo il trigger.");

  const incompleteAction = rows.find(n => {
    if (n.node_type !== "action") return false;
    const config = n.config_json ?? {};
    return !config.itemId && !config.item_id && !config.action_type;
  });
  if (incompleteAction) errors.push("Completa tutte le azioni prima di pubblicare.");

  const incompleteDelay = rows.find(n => n.node_type === "delay" && !hasDelayDuration(n.config_json));
  if (incompleteDelay) errors.push("Imposta una durata valida per tutte le attese.");

  return errors;
}

function summarizeNodes(nodes: AutomationNodeRow[] | undefined) {
  const rows = nodes ?? [];
  const errors = validateAutomationForPublish(rows);
  return {
    triggerCount: rows.filter(n => n.node_type === "trigger").length,
    actionCount: rows.filter(n => PUBLISHABLE_NODE_TYPES.has(n.node_type)).length,
    issueCount: errors.length,
    firstIssue: errors[0] ?? null,
  };
}

// --- Lucide icons instead of emojis ---
const CATEGORY_ICON_MAP: Record<string, { label: string; icon: ReactNode }> = {
  crm: { label: "CRM & Vendite", icon: <Users className="h-3.5 w-3.5" /> },
  marketing: { label: "Marketing", icon: <Megaphone className="h-3.5 w-3.5" /> },
  preventivi: { label: "Preventivi", icon: <ClipboardList className="h-3.5 w-3.5" /> },
  fatturazione: { label: "Fatturazione", icon: <Coins className="h-3.5 w-3.5" /> },
  ordini: { label: "Ordini", icon: <Package className="h-3.5 w-3.5" /> },
  cantieri: { label: "Cantieri", icon: <HardHat className="h-3.5 w-3.5" /> },
  assistenza: { label: "Assistenza", icon: <Headphones className="h-3.5 w-3.5" /> },
  magazzino: { label: "Magazzino", icon: <Warehouse className="h-3.5 w-3.5" /> },
  hr: { label: "HR", icon: <UserCog className="h-3.5 w-3.5" /> },
  task: { label: "Task", icon: <CheckSquare className="h-3.5 w-3.5" /> },
  notifiche: { label: "Notifiche", icon: <Bell className="h-3.5 w-3.5" /> },
  generale: { label: "Generale", icon: <Settings className="h-3.5 w-3.5" /> },
};

// --- Status filter chips config ---
type StatusChip = "all" | "draft" | "published" | "archived" | "needs_review";
const STATUS_CHIPS: { key: StatusChip; label: string; icon: ReactNode; colorClass: string; activeBg: string }[] = [
  { key: "all", label: "Tutti", icon: <Zap className="h-3.5 w-3.5" />, colorClass: "text-muted-foreground", activeBg: "bg-muted" },
  { key: "draft", label: "Bozza", icon: <Clock className="h-3.5 w-3.5" />, colorClass: "text-yellow-700", activeBg: "bg-yellow-100" },
  { key: "published", label: "Pubblicato", icon: <Play className="h-3.5 w-3.5" />, colorClass: "text-green-700", activeBg: "bg-green-100" },
  { key: "archived", label: "Archiviato", icon: <Archive className="h-3.5 w-3.5" />, colorClass: "text-muted-foreground", activeBg: "bg-muted" },
  { key: "needs_review", label: "Necessita revisione", icon: <AlertTriangle className="h-3.5 w-3.5" />, colorClass: "text-orange-700", activeBg: "bg-orange-100" },
];

const STATUS_BADGE: Record<string, { label: string; className: string }> = {
  draft: { label: "Bozza", className: "bg-muted text-muted-foreground border-border" },
  published: { label: "Pubblicata", className: "bg-green-100 text-green-700 border-green-200 hover:bg-green-100" },
  archived: { label: "Archiviata", className: "border text-muted-foreground" },
};

interface Props {
  statusFilter?: string;
  searchQuery?: string;
  folderId?: string | null;
  onNavigateFolder?: (folderId: string | null) => void;
  categoryFilter?: string | null;
}

export function AutomationFlowsList({ statusFilter: externalStatus, searchQuery = "", folderId = null, onNavigateFolder, categoryFilter = null }: Props) {
  const { effectiveCompany, user, role } = useAuth();
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const routePrefix = useMarketingRoutePrefix();
  const queryClient = useQueryClient();

  // Internal state
  const [internalStatusFilter, setInternalStatusFilter] = useState<StatusChip>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [cestinoOpen, setCestinoOpen] = useState(false);
  const confermaBulk = useConfermaQuantita(selectedIds.size, bulkDeleteOpen);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  // Su mobile la tabella a 11 colonne è inservibile → parti dalla vista card.
  const [viewMode, setViewMode] = useState<"list" | "grid">(isMobile ? "grid" : "list");

  // Use internal filter chips (ignore external sub-tab status)
  const activeStatusFilter = externalStatus && externalStatus !== "all" ? externalStatus : (internalStatusFilter === "all" ? "all" : internalStatusFilter);

  // Load ALL folders (not just current level — we show flat with accordion)
  const {
    data: allFolders,
    isError: foldersError,
    error: foldersQueryError,
    refetch: refetchFolders,
    isFetching: foldersFetching,
  } = useQuery({
    queryKey: ["automation-folders-all", effectiveCompany?.id],
    queryFn: async () => {
      const { data, error } = await withClientTimeout(
        supabase
        .from("automation_folders")
        .select("id, name, parent_id, created_at")
        .eq("company_id", effectiveCompany!.id)
        .order("name"),
        "Caricamento cartelle automazioni",
      );
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveCompany?.id,
    retry: retryListQuery,
  });

  // Load ALL flows (flat, we group client-side)
  const {
    data: allFlows,
    isLoading,
    isError: flowsError,
    error: flowsQueryError,
    refetch: refetchFlows,
    isFetching: flowsFetching,
  } = useQuery({
    queryKey: ["automation-flows", effectiveCompany?.id, categoryFilter],
    queryFn: async () => {
      let query = supabase
        .from("automation_flows")
        // config_json + bulk_trigger_config servono a "Duplica" (prima la
        // copia li perdeva sempre: flow.config_json era undefined) e alla
        // publish-guard dei flussi bulk (0 nodi by-design).
        .select("id, name, description, status, folder_id, company_id, created_at, updated_at, created_by, category, config_json, bulk_trigger_config")
        .eq("company_id", effectiveCompany!.id)
        // Quelle nel cestino si vedono solo dal Cestino.
        .is("deleted_at", null)
        .order("updated_at", { ascending: false });

      if (categoryFilter) {
        query = query.eq("category", categoryFilter);
      }

      const { data, error } = await withClientTimeout(query, "Caricamento flussi automazione");
      if (error) throw error;
      return data as unknown as AutomationFlow[];
    },
    enabled: !!effectiveCompany?.id,
    retry: retryListQuery,
  });

  // Enrollment counts
  const { data: enrollmentCounts } = useQuery({
    queryKey: ["automation-enrollment-counts", effectiveCompany?.id],
    queryFn: async () => {
      const { data, error } = await withClientTimeout(
        supabase
        .from("automation_enrollments")
        .select("flow_id, status")
        .eq("company_id", effectiveCompany!.id)
        .limit(5000),
        "Caricamento iscritti automazioni",
      );
      if (error) throw error;
      const counts: Record<string, { total: number; active: number }> = {};
      for (const e of data || []) {
        if (!counts[e.flow_id]) counts[e.flow_id] = { total: 0, active: 0 };
        counts[e.flow_id].total++;
        if (e.status === "active") counts[e.flow_id].active++;
      }
      return counts;
    },
    enabled: !!effectiveCompany?.id,
    retry: retryListQuery,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  const { data: nodeSummaries } = useQuery({
    queryKey: ["automation-node-summaries", effectiveCompany?.id],
    queryFn: async () => {
      const { data, error } = await withClientTimeout(
        supabase
          .from("automation_nodes")
          .select("flow_id, node_type, config_json")
          .eq("company_id", effectiveCompany!.id)
          .limit(10000),
        "Caricamento struttura automazioni",
      );
      if (error) throw error;
      const grouped: Record<string, AutomationNodeRow[]> = {};
      for (const node of (data ?? []) as AutomationNodeRow[]) {
        if (!node.flow_id) continue;
        if (!grouped[node.flow_id]) grouped[node.flow_id] = [];
        grouped[node.flow_id].push(node);
      }
      return Object.fromEntries(Object.entries(grouped).map(([flowId, nodes]) => [flowId, summarizeNodes(nodes)]));
    },
    enabled: !!effectiveCompany?.id,
    retry: retryListQuery,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  // Invalidation unica per tutte le mutation: prima ogni mutation invalidava
  // solo "automation-flows" e i KPI (automation-overview-stats), la struttura
  // e gli iscritti restavano stale — es. "Flussi totali" fermo al valore
  // precedente dopo un'eliminazione.
  const invalidateAutomationData = () => {
    void queryClient.invalidateQueries({ queryKey: ["automation-flows"] });
    void queryClient.invalidateQueries({ queryKey: ["automation-overview-stats"] });
    void queryClient.invalidateQueries({ queryKey: ["automation-node-summaries"] });
    void queryClient.invalidateQueries({ queryKey: ["automation-enrollment-counts"] });
  };

  // --- Mutations (kept from original) ---
  const deleteMutation = useMutation({
    mutationFn: async (flowId: string) => {
      const { data: flow } = await supabase
        .from("automation_flows")
        .select("name")
        .eq("id", flowId)
        .eq("company_id", effectiveCompany!.id)
        .maybeSingle();
      // Nel cestino, non via per sempre (19/09/2026: 20 automazioni cancellate
      // per sbaglio, senza copia). Il database mette in pausa coda e iscrizioni.
      const { error } = await supabase
        .from("automation_flows")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", flowId)
        .eq("company_id", effectiveCompany!.id);
      if (error) throw error;
      if (role === "super_admin" && user?.id) {
        await supabase.from("admin_audit_log").insert({
          user_id: user.id, action: "delete_automation", target_type: "automation_flow",
          target_id: flowId, details: { flow_name: flow?.name, company_id: effectiveCompany?.id },
        });
      }
    },
    onSuccess: () => {
      invalidateAutomationData();
      toast({ title: "Spostata nel cestino", description: "La ritrovi in Cestino: da lì si ripristina con un clic." });
      setDeleteId(null);
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error: detachError } = await supabase
        .from("automation_flows")
        .update({ folder_id: null })
        .eq("folder_id", id)
        .eq("company_id", effectiveCompany!.id);
      if (detachError) throw detachError;
      const { error } = await supabase
        .from("automation_folders")
        .delete()
        .eq("id", id)
        .eq("company_id", effectiveCompany!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-folders-all"] });
      queryClient.invalidateQueries({ queryKey: ["automation-flows"] });
      toast({ title: "Cartella eliminata" });
      setDeleteFolderId(null);
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (flow: AutomationFlow) => {
      const { data, error } = await supabase
        .from("automation_flows")
        .insert({
          company_id: effectiveCompany!.id,
          name: `${flow.name} (copia)`,
          description: flow.description,
          status: "draft",
          created_by: user!.id,
          folder_id: flow.folder_id,
          category: flow.category,
          config_json: flow.config_json ?? null,
          // Senza questa riga duplicare un "Messaggio programmato" produceva
          // un flusso inerte (0 nodi e nessuna config bulk).
          bulk_trigger_config: ((flow as unknown as { bulk_trigger_config?: unknown }).bulk_trigger_config ?? null) as never,
        })
        .select()
        .single();
      if (error) throw error;
      const { data: nodes } = await supabase
        .from("automation_nodes")
        .select("*")
        .eq("flow_id", flow.id)
        .eq("company_id", effectiveCompany!.id);
      if (nodes && nodes.length > 0) {
        const idMap: Record<string, string> = {};
        const newNodes = nodes.map(n => {
          const newId = crypto.randomUUID();
          idMap[n.id] = newId;
          return { id: newId, flow_id: data.id, company_id: effectiveCompany!.id, node_type: n.node_type, position_x: n.position_x, position_y: n.position_y, config_json: n.config_json, label: n.label };
        });
        const { error: nodesErr } = await supabase.from("automation_nodes").insert(newNodes);
        if (nodesErr) throw nodesErr;
        const { data: conns } = await supabase
          .from("automation_connections")
          .select("*")
          .eq("flow_id", flow.id)
          .eq("company_id", effectiveCompany!.id);
        if (conns && conns.length > 0) {
          const newConns = conns.map(c => ({
            flow_id: data.id,
            company_id: effectiveCompany!.id,
            from_node_id: idMap[c.from_node_id],
            to_node_id: idMap[c.to_node_id],
            label: c.label,
          })).filter(c => c.from_node_id && c.to_node_id);
          if (newConns.length > 0) {
            const { error: connErr } = await supabase.from("automation_connections").insert(newConns);
            if (connErr) throw connErr;
          }
        }
      }
      return data;
    },
    onSuccess: () => {
      invalidateAutomationData();
      toast({ title: "Automazione duplicata" });
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [searchQuery, categoryFilter, activeStatusFilter]);

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (status === "published") {
        // I flussi bulk ("Messaggio programmato") hanno 0 nodi BY-DESIGN
        // (il runner legge bulk_trigger_config): la validazione trigger+step
        // li bloccava per sempre una volta messi in bozza.
        const { data: flowRow } = await supabase
          .from("automation_flows")
          .select("bulk_trigger_config")
          .eq("id", id)
          .eq("company_id", effectiveCompany!.id)
          .maybeSingle();
        const isBulkFlow = !!flowRow?.bulk_trigger_config;
        if (!isBulkFlow) {
          const { data: nodeRows } = await supabase
            .from("automation_nodes")
            .select("node_type, config_json")
            .eq("flow_id", id)
            .eq("company_id", effectiveCompany!.id);
          const validationErrors = validateAutomationForPublish(nodeRows as AutomationNodeRow[]);
          if (validationErrors.length > 0) throw new Error(validationErrors[0]);
        }
      }
      const { data: flow } = await supabase
        .from("automation_flows")
        .select("name, status")
        .eq("id", id)
        .eq("company_id", effectiveCompany!.id)
        .maybeSingle();
      const { error } = await supabase
        .from("automation_flows")
        .update({ status })
        .eq("id", id)
        .eq("company_id", effectiveCompany!.id);
      if (error) throw error;
      if (role === "super_admin" && user?.id) {
        await supabase.from("admin_audit_log").insert({
          user_id: user.id, action: "change_automation_status", target_type: "automation_flow",
          target_id: id, details: { flow_name: flow?.name, old_status: flow?.status, new_status: status, company_id: effectiveCompany?.id },
        });
      }
    },
    onSuccess: () => invalidateAutomationData(),
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("automation_flows")
        .update({ deleted_at: new Date().toISOString() })
        .eq("company_id", effectiveCompany!.id)
        .in("id", ids);
      if (error) throw error;
      if (role === "super_admin" && user?.id) {
        await supabase.from("admin_audit_log").insert({
          user_id: user.id, action: "bulk_delete_automations", target_type: "automation_flow",
          target_id: null, details: { flow_ids: ids, count: ids.length, company_id: effectiveCompany?.id },
        });
      }
    },
    onSuccess: () => {
      invalidateAutomationData();
      toast({ title: "Spostate nel cestino", description: "Le ritrovi in Cestino: da lì si ripristinano con un clic." });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  // Folder lookup map
  const folderMap = useMemo(() => {
    const map: Record<string, string> = {};
    allFolders?.forEach(f => { map[f.id] = f.name; });
    return map;
  }, [allFolders]);

  // "Necessita revisione" = flussi con problemi REALI di struttura (prima era
  // un duplicato esatto del chip "Bozza"). I flussi bulk (0 nodi by-design)
  // sono esclusi: per loro la validazione a nodi non ha senso.
  const flowNeedsReview = useMemo(() => {
    return (f: AutomationFlow) => {
      if (f.status === "archived") return false;
      if ((f as unknown as { bulk_trigger_config?: unknown }).bulk_trigger_config) return false;
      const summary = nodeSummaries?.[f.id];
      return !!summary && summary.issueCount > 0;
    };
  }, [nodeSummaries]);

  // --- Filtering ---
  const filtered = useMemo(() => {
    if (!allFlows) return [];
    let result = allFlows;
    if (activeStatusFilter !== "all") {
      if (activeStatusFilter === "needs_review") {
        result = result.filter(flowNeedsReview);
      } else {
        result = result.filter(f => f.status === activeStatusFilter);
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(f => {
        const folderName = f.folder_id ? folderMap[f.folder_id] : "";
        return (
          f.name.toLowerCase().includes(q) ||
          (f.description ?? "").toLowerCase().includes(q) ||
          (f.category ?? "").toLowerCase().includes(q) ||
          folderName.toLowerCase().includes(q)
        );
      });
    }
    return result;
  }, [allFlows, activeStatusFilter, searchQuery, folderMap, flowNeedsReview]);

  // Status counts for chips
  const statusCounts = useMemo(() => {
    if (!allFlows) return {} as Record<StatusChip, number>;
    return {
      all: allFlows.length,
      draft: allFlows.filter(f => f.status === "draft").length,
      published: allFlows.filter(f => f.status === "published").length,
      archived: allFlows.filter(f => f.status === "archived").length,
      needs_review: allFlows.filter(flowNeedsReview).length,
    };
  }, [allFlows, flowNeedsReview]);

  // Group flows by folder for accordion view
  const { folderedGroups, unfolderedFlows } = useMemo(() => {
    const byFolder: Record<string, AutomationFlow[]> = {};
    const noFolder: AutomationFlow[] = [];
    filtered.forEach(f => {
      if (f.folder_id && folderMap[f.folder_id]) {
        if (!byFolder[f.folder_id]) byFolder[f.folder_id] = [];
        byFolder[f.folder_id].push(f);
      } else {
        noFolder.push(f);
      }
    });
    return { folderedGroups: byFolder, unfolderedFlows: noFolder };
  }, [filtered, folderMap]);

  // Pagination for unfoldered (flat list below folders)
  const totalPages = Math.max(1, Math.ceil(unfolderedFlows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paginatedUnfoldered = unfolderedFlows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleFolder = (id: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Select helpers
  const allVisibleFlows = useMemo(() => {
    const inFolders = Object.values(folderedGroups).flat().filter(f => expandedFolders.has(f.folder_id!));
    return [...inFolders, ...paginatedUnfoldered];
  }, [folderedGroups, expandedFolders, paginatedUnfoldered]);

  const allSelected = allVisibleFlows.length > 0 && allVisibleFlows.every(f => selectedIds.has(f.id));
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(allVisibleFlows.map(f => f.id)));
  };
  const toggleOne = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const formatDate = (d: string) => {
    const date = new Date(d);
    return date.toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
  };

  if (isLoading) {
    return <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  if (flowsError || foldersError) {
    const message = (flowsQueryError as Error | null)?.message || (foldersQueryError as Error | null)?.message || "Impossibile caricare le automazioni.";
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-destructive" />
        <h3 className="font-semibold">Automazioni non caricate</h3>
        <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
          {message}
        </p>
        <Button
          variant="outline"
          className="mt-4"
          disabled={flowsFetching || foldersFetching}
          onClick={() => {
            void refetchFlows();
            void refetchFolders();
            // Anche struttura e iscritti: se erano in errore, senza questo il
            // retry lasciava tutte le righe a "0 trigger · 0 step".
            void queryClient.invalidateQueries({ queryKey: ["automation-node-summaries"] });
            void queryClient.invalidateQueries({ queryKey: ["automation-enrollment-counts"] });
          }}
        >
          {flowsFetching || foldersFetching ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          Riprova
        </Button>
      </div>
    );
  }

  const hasContent = (allFolders && allFolders.length > 0) || (allFlows && allFlows.length > 0);

  if (!hasContent) {
    return (
      <div className="text-center py-16">
        <Zap className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-medium mb-1">Nessuna automazione</h3>
        <p className="text-sm text-muted-foreground mb-4">Crea la tua prima automazione visuale.</p>
        <div className="flex items-center justify-center gap-2">
          <Button onClick={() => navigate(`${routePrefix}/automazioni/nuova`)}>
            <Plus className="h-4 w-4 mr-2" /> Crea Automazione
          </Button>
          <Button variant="outline" onClick={() => setCestinoOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" /> Cestino
          </Button>
        </div>
        <AutomazioniCestinoDialog open={cestinoOpen} onOpenChange={setCestinoOpen} companyId={effectiveCompany?.id} />
      </div>
    );
  }

  // --- Render a single flow row ---
  const renderFlowRow = (flow: AutomationFlow, indented = false) => {
    const badge = STATUS_BADGE[flow.status] || STATUS_BADGE.draft;
    const counts = enrollmentCounts?.[flow.id] || { total: 0, active: 0 };
    // null = dati struttura non (ancora) disponibili → "—", non un falso
    // "0 trigger · 0 step". Se la query è risolta ma il flusso non ha nodi,
    // summarizeNodes([]) dà il vero stato ("Aggiungi almeno un trigger…").
    const summary = nodeSummaries ? (nodeSummaries[flow.id] ?? summarizeNodes([])) : null;
    const cat = CATEGORY_ICON_MAP[flow.category] || CATEGORY_ICON_MAP.generale;
    const folderName = flow.folder_id ? folderMap[flow.folder_id] : null;

    return (
      <TableRow
        key={flow.id}
        className="cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={() => navigate(`${routePrefix}/automazioni/${flow.id}`)}
      >
        <TableCell onClick={e => e.stopPropagation()}>
          <Checkbox checked={selectedIds.has(flow.id)} onCheckedChange={() => toggleOne(flow.id)} />
        </TableCell>
        <TableCell>
          <div className={cn("flex items-center gap-2", indented && "pl-6")}>
            <Zap className="h-4 w-4 text-primary shrink-0" />
            <span className="font-medium">{flow.name}</span>
            <ExternalLink className="h-3 w-3 text-muted-foreground/40 shrink-0" />
          </div>
        </TableCell>
        <TableCell>
          <Badge className={cn("text-xs", badge.className)}>{badge.label}</Badge>
        </TableCell>
        <TableCell>
          {!summary ? (
            <span className="text-xs text-muted-foreground/50">—</span>
          ) : summary.issueCount > 0 ? (
            <span className="inline-flex max-w-[220px] items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800" title={summary.firstIssue || undefined}>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{summary.firstIssue}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
              <Play className="h-3.5 w-3.5" />
              Pronta
            </span>
          )}
        </TableCell>
        <TableCell>
          <span className="text-xs text-muted-foreground">
            {summary ? `${summary.triggerCount} trigger · ${summary.actionCount} step` : "—"}
          </span>
        </TableCell>
        <TableCell>
          {folderName ? (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Folder className="h-3 w-3" /> {folderName}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground/50">—</span>
          )}
        </TableCell>
        <TableCell>
          <Badge variant="outline" className="text-xs font-normal gap-1">
            {cat.icon} {cat.label}
          </Badge>
        </TableCell>
        <TableCell className="text-right tabular-nums">{counts.total.toLocaleString("it-IT")}</TableCell>
        <TableCell className="text-right tabular-nums">{counts.active.toLocaleString("it-IT")}</TableCell>
        <TableCell className="text-muted-foreground text-sm">{formatDate(flow.updated_at)}</TableCell>
        <TableCell onClick={e => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => navigate(`${routePrefix}/automazioni/${flow.id}`)}>
                <Pencil className="h-3.5 w-3.5 mr-2" /> Modifica
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => duplicateMutation.mutate(flow)}>
                <Copy className="h-3.5 w-3.5 mr-2" /> Duplica
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleStatusMutation.mutate({
                id: flow.id,
                status: flow.status === "published" ? "draft" : "published"
              })}>
                {flow.status === "published" ? <Pause className="h-3.5 w-3.5 mr-2" /> : <Play className="h-3.5 w-3.5 mr-2" />}
                {flow.status === "published" ? "Metti in Bozza" : "Pubblica"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleStatusMutation.mutate({ id: flow.id, status: "archived" })}>
                <Archive className="h-3.5 w-3.5 mr-2" /> Archivia
              </DropdownMenuItem>
              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteId(flow.id)}>
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Elimina
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      </TableRow>
    );
  };

  // --- Grid card ---
  const renderFlowCard = (flow: AutomationFlow) => {
    const badge = STATUS_BADGE[flow.status] || STATUS_BADGE.draft;
    const counts = enrollmentCounts?.[flow.id] || { total: 0, active: 0 };
    // Stessa semantica della riga tabella: null = struttura non disponibile.
    const summary = nodeSummaries ? (nodeSummaries[flow.id] ?? summarizeNodes([])) : null;
    return (
      <div
        key={flow.id}
        onClick={() => navigate(`${routePrefix}/automazioni/${flow.id}`)}
        className="border rounded-lg p-4 cursor-pointer hover:shadow-md hover:border-primary/30 transition-all bg-card"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center">
              <Zap className="h-4 w-4 text-primary" />
            </div>
          </div>
          <Badge className={cn("text-xs", badge.className)}>{badge.label}</Badge>
        </div>
        <h3 className="font-medium text-sm mb-2 line-clamp-2">{flow.name}</h3>
        {summary && (
          <div className={cn(
            "mb-3 rounded-md border px-2 py-1.5 text-xs",
            summary.issueCount > 0 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-700"
          )}>
            {summary.issueCount > 0 ? summary.firstIssue : "Pronta per la pubblicazione"}
          </div>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{counts.total.toLocaleString("it-IT")} iscritti</span>
          <span>{summary ? `${summary.triggerCount} trigger · ${summary.actionCount} step` : "—"}</span>
          <span>{formatDate(flow.updated_at)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Filter chips toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {STATUS_CHIPS.map(chip => {
            const isActive = internalStatusFilter === chip.key;
            const count = statusCounts[chip.key] ?? 0;
            return (
              <button
                key={chip.key}
                onClick={() => { setInternalStatusFilter(chip.key); setPage(1); }}
                className={cn(
                  "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border",
                  isActive
                    ? `${chip.activeBg} ${chip.colorClass} border-current/20`
                    : "text-muted-foreground border-transparent hover:bg-muted"
                )}
              >
                {chip.icon}
                {chip.label}
                {isActive && count > 0 && (
                  <span className="ml-0.5 tabular-nums">{count}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => setCestinoOpen(true)}>
          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Cestino
        </Button>
        {/* View toggle */}
        <div className="flex items-center border rounded-md overflow-hidden">
          <button
            onClick={() => setViewMode("list")}
            className={cn("p-1.5 transition-colors", viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("grid")}
            className={cn("p-1.5 transition-colors", viewMode === "grid" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
          >
            <Grid3X3 className="h-4 w-4" />
          </button>
        </div>
        </div>
      </div>

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 border rounded-lg bg-muted/30">
          <span className="text-sm font-medium">{selectedIds.size} selezionat{selectedIds.size === 1 ? "o" : "i"}</span>
          <Button variant="destructive" size="sm" className="h-7 text-xs" onClick={() => setBulkDeleteOpen(true)}>
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Elimina selezionati
          </Button>
        </div>
      )}

      {/* TABLE VIEW */}
      {viewMode === "list" && (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead className="w-28">Stato</TableHead>
                  <TableHead className="w-56">Controlli</TableHead>
                  <TableHead className="w-28">Struttura</TableHead>
                  <TableHead className="w-32">Cartella</TableHead>
                  <TableHead className="w-32">Categoria</TableHead>
                  <TableHead className="w-28 text-right">Iscritti</TableHead>
                  <TableHead className="w-28 text-right">Attivi</TableHead>
                  <TableHead className="w-32">Aggiornato</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Folder accordion rows */}
                {allFolders?.filter(f => folderedGroups[f.id] && folderedGroups[f.id].length > 0).map(folder => {
                  const isExpanded = expandedFolders.has(folder.id);
                  const folderFlows = folderedGroups[folder.id] || [];
                  return (
                    <Fragment key={`folder-group-${folder.id}`}>
                      <TableRow
                        key={`folder-${folder.id}`}
                        className="cursor-pointer hover:bg-muted/40 bg-muted/10"
                        onClick={() => toggleFolder(folder.id)}
                      >
                        <TableCell onClick={e => e.stopPropagation()} />
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            {isExpanded ? <FolderOpen className="h-4 w-4 text-primary" /> : <Folder className="h-4 w-4 text-primary" />}
                            <span className="font-medium">{folder.name}</span>
                            <span className="text-xs text-muted-foreground">({folderFlows.length})</span>
                          </div>
                        </TableCell>
                        <TableCell />
                        <TableCell />
                        <TableCell />
                        <TableCell />
                        <TableCell />
                        <TableCell />
                        <TableCell />
                        <TableCell />
                        <TableCell onClick={e => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem className="text-destructive" onClick={() => setDeleteFolderId(folder.id)}>
                                <Trash2 className="h-3.5 w-3.5 mr-2" /> Elimina cartella
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                      {isExpanded && folderFlows.map(flow => renderFlowRow(flow, true))}
                    </Fragment>
                  );
                })}

                {/* Unfoldered flows */}
                {paginatedUnfoldered.map(flow => renderFlowRow(flow))}

                {/* Empty state */}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={11} className="text-center py-12">
                      <Zap className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">Nessun flusso di lavoro trovato</p>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {unfolderedFlows.length > pageSize && (
            <div className="flex items-center justify-end border-t px-4 py-2 bg-muted/10">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Prec
                  </Button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).slice(0, 5).map(p => (
                    <Button key={p} variant={safePage === p ? "default" : "outline"} size="sm" className="h-7 w-7 text-xs p-0" onClick={() => setPage(p)}>
                      {p}
                    </Button>
                  ))}
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={safePage >= totalPages} onClick={() => setPage(p => p + 1)}>
                    Succ <ChevronRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
                <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
                  <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="10">10 / pagina</SelectItem>
                    <SelectItem value="25">25 / pagina</SelectItem>
                    <SelectItem value="50">50 / pagina</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* GRID VIEW */}
      {viewMode === "grid" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {filtered.map(flow => renderFlowCard(flow))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12">
              <Zap className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Nessun flusso di lavoro trovato</p>
            </div>
          )}
        </div>
      )}

      {/* Dialogs */}
      <AutomazioniCestinoDialog open={cestinoOpen} onOpenChange={setCestinoOpen} companyId={effectiveCompany?.id} />
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina automazione</AlertDialogTitle>
            <AlertDialogDescription>Finisce nel cestino e si ferma. Da lì si ripristina com'era, passaggi e contatti compresi.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteId && deleteMutation.mutate(deleteId)}>Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteFolderId} onOpenChange={o => !o && setDeleteFolderId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina cartella</AlertDialogTitle>
            <AlertDialogDescription>
              Verrà eliminata solo la cartella. I flussi contenuti resteranno salvati e verranno spostati fuori cartella.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteFolderId && deleteFolderMutation.mutate(deleteFolderId)}>Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina {selectedIds.size} automazion{selectedIds.size === 1 ? "e" : "i"}</AlertDialogTitle>
            <AlertDialogDescription>Finiscono nel cestino e si fermano. Da lì si ripristinano com'erano.</AlertDialogDescription>
          </AlertDialogHeader>
          <ConfermaQuantita stato={confermaBulk} cosa="automazioni" />
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              disabled={!confermaBulk.valida}
              onClick={(e) => {
                if (!confermaBulk.valida) { e.preventDefault(); return; }
                bulkDeleteMutation.mutate(Array.from(selectedIds));
              }}
            >
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
