import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { useMarketingRoutePrefix } from "@/hooks/useMarketingRoutePrefix";
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
  Headphones, Warehouse, UserCog, CheckSquare, Bell, Settings,
} from "lucide-react";
import { useState, useMemo, type ReactNode } from "react";
import type { AutomationFlow } from "@/types/automationBuilder";

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
  const navigate = useNavigate();
  const routePrefix = useMarketingRoutePrefix();
  const queryClient = useQueryClient();

  // Internal state
  const [internalStatusFilter, setInternalStatusFilter] = useState<StatusChip>("all");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleteFolderId, setDeleteFolderId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  // Use internal filter chips (ignore external sub-tab status)
  const activeStatusFilter = externalStatus && externalStatus !== "all" ? externalStatus : (internalStatusFilter === "all" ? "all" : internalStatusFilter);

  // Load ALL folders (not just current level — we show flat with accordion)
  const { data: allFolders } = useQuery({
    queryKey: ["automation-folders-all", effectiveCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_folders")
        .select("id, name, parent_id, created_at")
        .eq("company_id", effectiveCompany!.id)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: !!effectiveCompany?.id,
  });

  // Load ALL flows (flat, we group client-side)
  const { data: allFlows, isLoading } = useQuery({
    queryKey: ["automation-flows", effectiveCompany?.id, categoryFilter],
    queryFn: async () => {
      let query = supabase
        .from("automation_flows")
        .select("id, name, description, status, folder_id, company_id, created_at, updated_at, created_by, category")
        .eq("company_id", effectiveCompany!.id)
        .order("updated_at", { ascending: false });

      if (categoryFilter) {
        query = query.eq("category", categoryFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AutomationFlow[];
    },
    enabled: !!effectiveCompany?.id,
  });

  // Enrollment counts
  const { data: enrollmentCounts } = useQuery({
    queryKey: ["automation-enrollment-counts", effectiveCompany?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("automation_enrollments")
        .select("flow_id, status")
        .eq("company_id", effectiveCompany!.id)
        .limit(5000);
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
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
  });

  // --- Mutations (kept from original) ---
  const deleteMutation = useMutation({
    mutationFn: async (flowId: string) => {
      const { data: flow } = await supabase.from("automation_flows").select("name").eq("id", flowId).maybeSingle();
      const { error } = await supabase.from("automation_flows").delete().eq("id", flowId);
      if (error) throw error;
      if (role === "super_admin" && user?.id) {
        await supabase.from("admin_audit_log").insert({
          user_id: user.id, action: "delete_automation", target_type: "automation_flow",
          target_id: flowId, details: { flow_name: flow?.name, company_id: effectiveCompany?.id },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-flows"] });
      toast({ title: "Automazione eliminata" });
      setDeleteId(null);
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const deleteFolderMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("automation_folders").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-folders-all"] });
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
          company_id: flow.company_id,
          name: `${flow.name} (copia)`,
          description: flow.description,
          status: "draft",
          created_by: user!.id,
          folder_id: flow.folder_id,
        })
        .select()
        .single();
      if (error) throw error;
      const { data: nodes } = await supabase.from("automation_nodes").select("*").eq("flow_id", flow.id);
      if (nodes && nodes.length > 0) {
        const idMap: Record<string, string> = {};
        const newNodes = nodes.map(n => {
          const newId = crypto.randomUUID();
          idMap[n.id] = newId;
          return { id: newId, flow_id: data.id, company_id: n.company_id, node_type: n.node_type, position_x: n.position_x, position_y: n.position_y, config_json: n.config_json, label: n.label };
        });
        await supabase.from("automation_nodes").insert(newNodes);
        const { data: conns } = await supabase.from("automation_connections").select("*").eq("flow_id", flow.id);
        if (conns && conns.length > 0) {
          const newConns = conns.map(c => ({
            flow_id: data.id,
            company_id: c.company_id,
            from_node_id: idMap[c.from_node_id],
            to_node_id: idMap[c.to_node_id],
            label: c.label,
          })).filter(c => c.from_node_id && c.to_node_id);
          if (newConns.length > 0) await supabase.from("automation_connections").insert(newConns);
        }
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-flows"] });
      toast({ title: "Automazione duplicata" });
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (status === "published") {
        const { data: nodeRows } = await supabase
          .from("automation_nodes")
          .select("node_type")
          .eq("flow_id", id)
          .eq("company_id", effectiveCompany!.id);
        const hasTrigger = nodeRows?.some(n => n.node_type === "trigger");
        if (!hasTrigger) throw new Error("Aggiungi almeno un trigger prima di pubblicare.");
        if (!nodeRows || nodeRows.length < 2) throw new Error("Aggiungi almeno un'azione dopo il trigger.");
      }
      const { data: flow } = await supabase.from("automation_flows").select("name, status").eq("id", id).maybeSingle();
      const { error } = await supabase.from("automation_flows").update({ status }).eq("id", id);
      if (error) throw error;
      if (role === "super_admin" && user?.id) {
        await supabase.from("admin_audit_log").insert({
          user_id: user.id, action: "change_automation_status", target_type: "automation_flow",
          target_id: id, details: { flow_name: flow?.name, old_status: flow?.status, new_status: status, company_id: effectiveCompany?.id },
        });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automation-flows"] }),
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase.from("automation_flows").delete().in("id", ids);
      if (error) throw error;
      if (role === "super_admin" && user?.id) {
        await supabase.from("admin_audit_log").insert({
          user_id: user.id, action: "bulk_delete_automations", target_type: "automation_flow",
          target_id: null, details: { flow_ids: ids, count: ids.length, company_id: effectiveCompany?.id },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["automation-flows"] });
      toast({ title: "Automazioni eliminate" });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
    },
    onError: (err: any) => toast({ title: "Errore", description: err.message, variant: "destructive" }),
  });

  // --- Filtering ---
  const filtered = useMemo(() => {
    if (!allFlows) return [];
    let result = allFlows;
    if (activeStatusFilter !== "all") {
      if (activeStatusFilter === "needs_review") {
        result = result.filter(f => f.status === "draft");
      } else {
        result = result.filter(f => f.status === activeStatusFilter);
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(f => f.name.toLowerCase().includes(q));
    }
    return result;
  }, [allFlows, activeStatusFilter, searchQuery]);

  // Status counts for chips
  const statusCounts = useMemo(() => {
    if (!allFlows) return {} as Record<StatusChip, number>;
    return {
      all: allFlows.length,
      draft: allFlows.filter(f => f.status === "draft").length,
      published: allFlows.filter(f => f.status === "published").length,
      archived: allFlows.filter(f => f.status === "archived").length,
      needs_review: allFlows.filter(f => f.status === "draft").length,
    };
  }, [allFlows]);

  // Folder lookup map
  const folderMap = useMemo(() => {
    const map: Record<string, string> = {};
    allFolders?.forEach(f => { map[f.id] = f.name; });
    return map;
  }, [allFolders]);

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

  const hasContent = (allFolders && allFolders.length > 0) || (allFlows && allFlows.length > 0);

  if (!hasContent) {
    return (
      <div className="text-center py-16">
        <Zap className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-medium mb-1">Nessuna automazione</h3>
        <p className="text-sm text-muted-foreground mb-4">Crea la tua prima automazione visuale.</p>
        <Button onClick={() => navigate(`${routePrefix}/automazioni/nuova`)}>
          <Plus className="h-4 w-4 mr-2" /> Crea Automazione
        </Button>
      </div>
    );
  }

  // --- Render a single flow row ---
  const renderFlowRow = (flow: AutomationFlow, indented = false) => {
    const badge = STATUS_BADGE[flow.status] || STATUS_BADGE.draft;
    const counts = enrollmentCounts?.[flow.id] || { total: 0, active: 0 };
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
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>{counts.total.toLocaleString("it-IT")} iscritti</span>
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
                    <>{/* Fragment for folder + children */}
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
                    </>
                  );
                })}

                {/* Unfoldered flows */}
                {paginatedUnfoldered.map(flow => renderFlowRow(flow))}

                {/* Empty state */}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12">
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
      <AlertDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina automazione</AlertDialogTitle>
            <AlertDialogDescription>Questa azione è irreversibile. Tutti i nodi e le connessioni verranno eliminati.</AlertDialogDescription>
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
            <AlertDialogDescription>La cartella e tutti i contenuti verranno eliminati permanentemente.</AlertDialogDescription>
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
            <AlertDialogDescription>Questa azione è irreversibile.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}>Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
