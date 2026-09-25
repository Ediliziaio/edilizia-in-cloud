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
  Zap, Plus, MoreHorizontal, Pencil, Copy, Archive, Trash2,
  ChevronLeft, ChevronRight, ChevronDown, Folder, FolderOpen,
  List, Grid3X3, Play, Pause, Clock, AlertTriangle, RefreshCw,
} from "lucide-react";
import { Fragment, useEffect, useState, useMemo, type ReactNode } from "react";
import type { AutomationFlow } from "@/types/automationBuilder";
// Il catalogo è già nel pacchetto della pagina (lo usa CreaAutomazioneAIDialog).
import { ACTION_MAP, TRIGGER_MAP } from "@/lib/flow-node-catalog";

import { ConfermaQuantita, useConfermaQuantita } from "@/components/shared/ConfermaQuantita";
import { AutomazioniCestinoDialog } from "./AutomazioniCestinoDialog";
type AutomationNodeRow = {
  flow_id?: string;
  node_type: string;
  label?: string | null;
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

function idVoce(config: Record<string, unknown> | null): string | null {
  const c = config ?? {};
  const id = c.item_id ?? c.itemId ?? c.action_type ?? c.trigger_event;
  return typeof id === "string" && id !== "" ? id : null;
}

// Da dove parte: il nome che il nodo ha nel builder («Form compilato — Vendita
// Edile»), altrimenti quello del catalogo.
function nomeTrigger(nodo: AutomationNodeRow): string {
  const id = idVoce(nodo.config_json);
  const nome = nodo.label
    ?? (typeof nodo.config_json?.label === "string" ? nodo.config_json.label : null)
    ?? (id ? TRIGGER_MAP[id]?.label : null);
  return nome?.trim() || "Trigger";
}

// Cosa fa un'azione, in una parola: [una, più di una]. Le altre azioni prendono
// il nome del catalogo.
const AZIONI_IN_BREVE: Record<string, [string, string]> = {
  invia_email: ["email", "email"],
  invia_email_admin_azienda: ["email", "email"],
  invia_whatsapp: ["WhatsApp", "WhatsApp"],
  invia_whatsapp_locale: ["WhatsApp", "WhatsApp"],
  invia_sms: ["SMS", "SMS"],
  chiama_ai: ["chiamata AI", "chiamate AI"],
  notifica_interna: ["notifica", "notifiche"],
  invia_notifica_inapp: ["notifica", "notifiche"],
  invia_notifica_team_admin: ["notifica", "notifiche"],
  crea_task: ["attività", "attività"],
  crea_cs_task: ["attività", "attività"],
  crea_opportunita: ["opportunità", "opportunità"],
  sposta_opportunita: ["cambio di fase", "cambi di fase"],
  aggiungi_tag: ["tag", "tag"],
  crea_appuntamento: ["appuntamento", "appuntamenti"],
};

// «4 email · opportunità · tag»: le azioni raggruppate, le più numerose prima,
// al massimo tre voci. Attese, condizioni e rami non sono azioni e non contano.
function riassumiAzioni(azioni: AutomationNodeRow[]): string | null {
  const gruppi = new Map<string, { una: string; tante: string | null; quante: number }>();
  for (const nodo of azioni) {
    const id = idVoce(nodo.config_json) ?? "";
    const breve = AZIONI_IN_BREVE[id];
    const chiave = breve ? breve[0] : id;
    const gruppo = gruppi.get(chiave) ?? {
      una: breve?.[0] ?? ACTION_MAP[id]?.label ?? nodo.label ?? "azione",
      tante: breve?.[1] ?? null,
      quante: 0,
    };
    gruppo.quante++;
    gruppi.set(chiave, gruppo);
  }
  if (gruppi.size === 0) return null;
  const voci = [...gruppi.values()]
    .sort((a, b) => b.quante - a.quante)
    .map(g => (g.quante === 1 ? g.una : g.tante ? `${g.quante} ${g.tante}` : `${g.una} (${g.quante})`));
  return voci.length > 3 ? `${voci.slice(0, 3).join(" · ")} · +${voci.length - 3}` : voci.join(" · ");
}

function summarizeNodes(nodes: AutomationNodeRow[] | undefined) {
  const rows = nodes ?? [];
  const errors = validateAutomationForPublish(rows);
  const triggers = rows.filter(n => n.node_type === "trigger");
  return {
    triggerCount: triggers.length,
    actionCount: rows.filter(n => PUBLISHABLE_NODE_TYPES.has(n.node_type)).length,
    issueCount: errors.length,
    firstIssue: errors[0] ?? null,
    // null = parte solo quando un'altra automazione ce la manda.
    avvio: triggers.length === 0
      ? null
      : `${nomeTrigger(triggers[0])}${triggers.length > 1 ? ` (+${triggers.length - 1})` : ""}`,
    azioni: riassumiAzioni(rows.filter(n => n.node_type === "action")),
  };
}

type NodeSummary = ReturnType<typeof summarizeNodes>;

/**
 * La riga sotto il nome: da dove parte e cosa fa («Lead da campagna Facebook →
 * 4 email · opportunità · tag»), oppure cosa manca per pubblicarla. Fino al
 * 19/09 diceva «1 trigger · 2 passaggi · Marketing», uguale su quasi ogni riga.
 * null = struttura non ancora caricata.
 */
function descriviFlusso(
  flow: AutomationFlow,
  summary: NodeSummary | null,
): { testo: string; problema: boolean } | null {
  // «Messaggio programmato»: niente nodi per costruzione, non è un flusso vuoto.
  if ((flow as unknown as { bulk_trigger_config?: unknown }).bulk_trigger_config) {
    return { testo: "Messaggio programmato", problema: false };
  }
  if (!summary) return null;
  if (summary.issueCount > 0 && flow.status !== "archived") {
    return { testo: summary.firstIssue ?? "Da completare prima di pubblicare", problema: true };
  }
  const avvio = summary.avvio ?? "Da un'altra automazione";
  const cosaFa = summary.azioni
    ?? `${summary.actionCount} passagg${summary.actionCount === 1 ? "io" : "i"}`;
  return { testo: `${avvio} → ${cosaFa}`, problema: false };
}

// «oggi, 13:06», «ieri, 18:40», «12 set», «12 set 2025»: si legge prima di
// «19 set 2026» ripetuto su ogni riga. La data completa va nel title.
function quando(iso: string, adessoMs: number): string {
  const d = new Date(iso);
  const adesso = new Date(adessoMs);
  const ieri = new Date(adessoMs);
  ieri.setDate(ieri.getDate() - 1);
  const ora = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === adesso.toDateString()) return `oggi, ${ora}`;
  if (d.toDateString() === ieri.toDateString()) return `ieri, ${ora}`;
  return d.toLocaleDateString("it-IT", d.getFullYear() === adesso.getFullYear()
    ? { day: "numeric", month: "short" }
    : { day: "numeric", month: "short", year: "numeric" });
}

function dataCompleta(iso: string): string {
  return new Date(iso).toLocaleString("it-IT", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

// Una riga di automazioni_attivita (la funzione non è nei tipi generati).
type RigaAttivita = {
  flow_id: string;
  ultima_esecuzione: string | null;
  esecuzioni_7gg: number | null;
  errori_7gg: number | null;
  ultimo_errore: string | null;
};

type AttivitaFlusso = {
  ultima: string | null;
  esecuzioni7: number;
  errori7: number;
  ultimoErrore: string | null;
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
  // 25 per pagina: con 10 una ventina di automazioni finiva su tre pagine.
  const [pageSize, setPageSize] = useState(25);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  // Su mobile la tabella a 11 colonne è inservibile → parti dalla vista card.
  const [viewMode, setViewMode] = useState<"list" | "grid">(isMobile ? "grid" : "list");
  // Telefono: le automazioni si guardano, non si modificano (regola dell'utente,
  // 25/09/2026): sempre a schede, senza aprire il builder, senza cestino né selezione.
  const vista = isMobile ? "grid" : viewMode;

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
    // Vedi la query dei flussi qui sotto.
    refetchOnMount: "always",
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
    // Si ricarica a ogni apertura, e intanto resta a schermo la copia salvata
    // nel browser (queryPersister). Con i 5 minuti di staleTime dell'app, chi
    // pubblicava o rinominava nel builder e tornava all'elenco vedeva la copia
    // vecchia: il builder invalida ["automations"], non queste chiavi.
    refetchOnMount: "always",
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
    // «descrizione»: dal 19/09 il riepilogo dice anche da dove parte e cosa fa.
    // La copia salvata nel browser può sopravvivere a un rilascio: con la chiave
    // nuova quella della forma vecchia non si legge.
    queryKey: ["automation-node-summaries", effectiveCompany?.id, "descrizione"],
    queryFn: async () => {
      const { data, error } = await withClientTimeout(
        supabase
          .from("automation_nodes")
          .select("flow_id, node_type, label, config_json")
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

  // Quando ha lavorato l'ultima volta ogni automazione, e gli errori della
  // settimana. automazioni_attivita legge con i permessi di chi chiama, come il
  // registro. Senza, una pubblicata mai partita sembrava uguale a una che gira.
  const { data: attivita } = useQuery({
    queryKey: ["automation-activity", effectiveCompany?.id],
    queryFn: async () => {
      const { data, error } = await withClientTimeout(
        supabase.rpc("automazioni_attivita" as never, { p_company_id: effectiveCompany!.id } as never),
        "Caricamento esecuzioni automazioni",
      );
      if (error) throw error;
      const perFlusso: Record<string, AttivitaFlusso> = {};
      for (const r of ((data ?? []) as unknown as RigaAttivita[])) {
        perFlusso[r.flow_id] = {
          ultima: r.ultima_esecuzione,
          esecuzioni7: r.esecuzioni_7gg ?? 0,
          errori7: r.errori_7gg ?? 0,
          ultimoErrore: r.ultimo_errore,
        };
      }
      return perFlusso;
    },
    enabled: !!effectiveCompany?.id,
    retry: retryListQuery,
    staleTime: 60 * 1000,
    refetchOnMount: "always",
  });

  // L'ora di riferimento per «oggi» e «ieri»: letta una volta, non a ogni render.
  const [adessoMs] = useState(() => Date.now());

  // Invalidation unica per tutte le mutation: prima ogni mutation invalidava
  // solo "automation-flows" e i KPI (automation-overview-stats), la struttura
  // e gli iscritti restavano stale — es. "Flussi totali" fermo al valore
  // precedente dopo un'eliminazione.
  const invalidateAutomationData = () => {
    void queryClient.invalidateQueries({ queryKey: ["automation-flows"] });
    void queryClient.invalidateQueries({ queryKey: ["automation-overview-stats"] });
    void queryClient.invalidateQueries({ queryKey: ["automation-node-summaries"] });
    void queryClient.invalidateQueries({ queryKey: ["automation-enrollment-counts"] });
    void queryClient.invalidateQueries({ queryKey: ["automation-activity"] });
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
  const primoDellaPagina = unfolderedFlows.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const ultimoDellaPagina = Math.min(safePage * pageSize, unfolderedFlows.length);
  // Al massimo 5 numeri, intorno alla pagina corrente: prima erano sempre i primi
  // 5, e dalla sesta pagina in poi non si vedeva più dove si era.
  const primaPaginaVisibile = Math.max(1, Math.min(safePage - 2, totalPages - 4));
  const pagineVisibili = Array.from(
    { length: Math.min(5, totalPages) },
    (_, i) => primaPaginaVisibile + i,
  );

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

  // Ultima esecuzione: la data; «Mai» per una pubblicata che non ha ancora
  // eseguito un passaggio; «—» per bozze e archiviate mai partite.
  // null = dati non ancora arrivati.
  const esecuzioneDi = (flow: AutomationFlow) => {
    if (!attivita) return null;
    const a = attivita[flow.id];
    const passaggi = a ? `${a.esecuzioni7} passagg${a.esecuzioni7 === 1 ? "io" : "i"} in 7 giorni` : "";
    return {
      testo: a?.ultima ? quando(a.ultima, adessoMs) : flow.status === "published" ? "Mai" : "—",
      titolo: a?.ultima
        ? `${dataCompleta(a.ultima)} · ${passaggi}`
        : flow.status === "published" ? "Pubblicata, ma non ha ancora eseguito nessun passaggio" : undefined,
      mai: !a?.ultima,
      errori: a?.errori7 ?? 0,
      ultimoErrore: a?.ultimoErrore ?? null,
    };
  };

  if (isLoading) {
    return <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  const hasContent = (allFolders && allFolders.length > 0) || (allFlows && allFlows.length > 0);
  const inErrore = flowsError || foldersError;
  const messaggioErrore = (flowsQueryError as Error | null)?.message || (foldersQueryError as Error | null)?.message || "Impossibile caricare le automazioni.";
  const inAggiornamento = flowsFetching || foldersFetching;
  const riprova = () => {
    void refetchFlows();
    void refetchFolders();
    // Anche struttura e iscritti: se erano in errore, senza questo il
    // retry lasciava tutte le righe a "0 trigger · 0 step".
    void queryClient.invalidateQueries({ queryKey: ["automation-node-summaries"] });
    void queryClient.invalidateQueries({ queryKey: ["automation-enrollment-counts"] });
  };

  // «Nessuna automazione» solo quando il database l'ha detto. Prima bastava non
  // avere dati: mentre il browser rimette in cache la copia salvata le query
  // restano ferme (niente dati e niente isLoading), e una copia vuota ma recente
  // non veniva ricaricata. Il 19/09 l'elenco della piattaforma, con 27
  // automazioni, è rimasto per minuti su «Crea la tua prima automazione».
  const datiArrivati = allFlows !== undefined && allFolders !== undefined;
  if (!hasContent && !inErrore && (inAggiornamento || (!datiArrivati && !!effectiveCompany?.id))) {
    return <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>;
  }

  // La scheda d'errore solo se non c'è niente da mostrare. Con una copia già in
  // cache l'elenco resta, e l'avviso sta sopra (vedi il render principale).
  if (inErrore && !hasContent) {
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-6 text-center">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-destructive" />
        <h3 className="font-semibold">Automazioni non caricate</h3>
        <p className="mx-auto mt-1 max-w-xl text-sm text-muted-foreground">
          {messaggioErrore}
        </p>
        <Button
          variant="outline"
          className="mt-4"
          disabled={inAggiornamento}
          onClick={riprova}
        >
          <RefreshCw className={cn("mr-2 h-4 w-4", inAggiornamento && "animate-spin")} />
          Riprova
        </Button>
      </div>
    );
  }

  if (!hasContent) {
    return (
      <div className="text-center py-16">
        <Zap className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
        <h3 className="text-lg font-medium mb-1 max-md:text-sm">Nessuna automazione</h3>
        <p className="text-sm text-muted-foreground mb-4 max-md:hidden">Crea la tua prima automazione visuale.</p>
        {isMobile && <p className="text-[11px] text-muted-foreground">si crea da computer o tablet</p>}
        <div className="flex items-center justify-center gap-2 max-md:hidden">
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
    // null = dati struttura non (ancora) disponibili: niente riga sotto il nome,
    // non un falso "0 trigger · 0 passaggi". Se la query è risolta ma il flusso
    // non ha nodi, summarizeNodes([]) dà il vero stato ("Aggiungi un trigger…").
    const summary = nodeSummaries ? (nodeSummaries[flow.id] ?? summarizeNodes([])) : null;
    const dettaglio = descriviFlusso(flow, summary);
    const esecuzione = esecuzioneDi(flow);

    return (
      <TableRow
        key={flow.id}
        className="cursor-pointer hover:bg-muted/40 transition-colors"
        onClick={() => navigate(`${routePrefix}/automazioni/${flow.id}`)}
      >
        <TableCell className="py-2" onClick={e => e.stopPropagation()}>
          <Checkbox checked={selectedIds.has(flow.id)} onCheckedChange={() => toggleOne(flow.id)} />
        </TableCell>
        <TableCell className="py-2">
          <div className={cn("flex min-w-0 items-start gap-2", indented && "pl-6")}>
            <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="truncate font-medium" title={flow.name}>{flow.name}</p>
              {dettaglio && (
                <p
                  className={cn(
                    "flex items-center gap-1 truncate text-xs",
                    dettaglio.problema ? "text-amber-700" : "text-muted-foreground",
                  )}
                  title={dettaglio.testo}
                >
                  {dettaglio.problema && <AlertTriangle className="h-3 w-3 shrink-0" />}
                  <span className="truncate">{dettaglio.testo}</span>
                </p>
              )}
            </div>
          </div>
        </TableCell>
        <TableCell className="py-2">
          <Badge className={cn("text-xs", badge.className)}>{badge.label}</Badge>
        </TableCell>
        <TableCell className="whitespace-nowrap py-2 text-right tabular-nums">
          {counts.total > 0 ? counts.total.toLocaleString("it-IT") : <span className="text-muted-foreground/60">0</span>}
          {counts.active > 0 && (
            <span className="ml-1 text-xs text-muted-foreground">· {counts.active.toLocaleString("it-IT")} attivi</span>
          )}
        </TableCell>
        <TableCell className="whitespace-nowrap py-2 text-sm">
          {esecuzione && (
            <>
              <span className={cn(esecuzione.mai && "text-muted-foreground")} title={esecuzione.titolo}>
                {esecuzione.testo}
              </span>
              {esecuzione.errori > 0 && (
                <p className="text-xs text-destructive" title={esecuzione.ultimoErrore ?? undefined}>
                  {esecuzione.errori} error{esecuzione.errori === 1 ? "e" : "i"} in 7 giorni
                </p>
              )}
            </>
          )}
        </TableCell>
        <TableCell
          className="hidden whitespace-nowrap py-2 text-sm text-muted-foreground xl:table-cell"
          title={dataCompleta(flow.updated_at)}
        >
          {quando(flow.updated_at, adessoMs)}
        </TableCell>
        <TableCell className="py-2" onClick={e => e.stopPropagation()}>
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
    const dettaglio = descriviFlusso(flow, summary);
    const esecuzione = esecuzioneDi(flow);
    return (
      <div
        key={flow.id}
        onClick={isMobile ? undefined : () => navigate(`${routePrefix}/automazioni/${flow.id}`)}
        className={cn(
          "rounded-lg border bg-card p-3 transition-all",
          !isMobile && "cursor-pointer hover:border-primary/30 hover:shadow-md",
        )}
      >
        <div className="mb-1.5 flex items-start justify-between gap-2">
          <h3 className="line-clamp-2 flex items-start gap-1.5 text-sm font-medium">
            <Zap className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            {flow.name}
          </h3>
          <Badge className={cn("shrink-0 text-xs", badge.className)}>{badge.label}</Badge>
        </div>
        {dettaglio && (
          <p className={cn(
            "mb-2 flex items-start gap-1 text-xs",
            dettaglio.problema ? "text-amber-700" : "text-muted-foreground",
          )}>
            {dettaglio.problema && <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />}
            <span className="line-clamp-2">{dettaglio.testo}</span>
          </p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span>
            {counts.total.toLocaleString("it-IT")} iscritti
            {counts.active > 0 && ` · ${counts.active.toLocaleString("it-IT")} attivi`}
          </span>
          {esecuzione && esecuzione.errori > 0 ? (
            <span className="ml-auto text-destructive" title={esecuzione.ultimoErrore ?? undefined}>
              {esecuzione.errori} error{esecuzione.errori === 1 ? "e" : "i"} in 7 giorni
            </span>
          ) : esecuzione && !esecuzione.mai ? (
            <span className="ml-auto" title={esecuzione.titolo}>Eseguita {esecuzione.testo}</span>
          ) : esecuzione && flow.status === "published" ? (
            <span className="ml-auto" title={esecuzione.titolo}>Mai eseguita</span>
          ) : (
            <span className="ml-auto" title={dataCompleta(flow.updated_at)}>
              Modificata {quando(flow.updated_at, adessoMs)}
            </span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {inErrore && (
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">Elenco non aggiornato: {messaggioErrore}</span>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" disabled={inAggiornamento} onClick={riprova}>
            <RefreshCw className={cn("mr-1 h-3 w-3", inAggiornamento && "animate-spin")} />
            Riprova
          </Button>
        </div>
      )}
      {/* Filter chips toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Una pastiglia a zero non filtra niente: compare quando serve (resta
              visibile quella scelta, e sempre «Tutti»). */}
          {STATUS_CHIPS.filter(chip => chip.key === "all" || chip.key === internalStatusFilter || (statusCounts[chip.key] ?? 0) > 0).map(chip => {
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
                {/* Il numero su ogni pastiglia: si vede subito quante bozze o
                    quante da sistemare ci sono, senza doverle aprire una a una. */}
                <span className={cn("ml-0.5 tabular-nums", !isActive && "text-muted-foreground/70")}>{count}</span>
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 max-md:hidden">
        <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => setCestinoOpen(true)}>
          <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Cestino
        </Button>
        {/* View toggle */}
        <div className="flex items-center border rounded-md overflow-hidden">
          <button
            onClick={() => setViewMode("list")}
            aria-label="Vista elenco"
            title="Vista elenco"
            aria-pressed={viewMode === "list"}
            className={cn("p-1.5 transition-colors", viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
          >
            <List className="h-4 w-4" />
          </button>
          <button
            onClick={() => setViewMode("grid")}
            aria-label="Vista a schede"
            title="Vista a schede"
            aria-pressed={viewMode === "grid"}
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
      {vista === "list" && (
        <div className="border rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            {/* Colonne fisse e il nome prende il resto: a larghezza automatica il
                nome (troncato, ma lungo) allargava la sua colonna e a 1024 la
                tabella sbordava di 260px. Sotto 1280 meno margine nelle celle e
                niente «Modificata». La tabella c'è solo da 768 (sotto, schede). */}
            <Table className="table-fixed [&_td]:px-3 [&_th]:px-3 xl:[&_td]:px-4 xl:[&_th]:px-4">
              <TableHeader>
                <TableRow className="bg-muted/20">
                  <TableHead className="h-9 w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></TableHead>
                  <TableHead className="h-9">Nome</TableHead>
                  <TableHead className="h-9 w-28">Stato</TableHead>
                  <TableHead className="h-9 w-24 text-right">Iscritti</TableHead>
                  {/* Su una riga: andando a capo alzava tutta l'intestazione. */}
                  <TableHead className="h-9 w-40 whitespace-nowrap">Ultima esecuzione</TableHead>
                  <TableHead className="hidden h-9 w-28 whitespace-nowrap xl:table-cell">Modificata</TableHead>
                  <TableHead className="h-9 w-14"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {/* Cartelle: solo in prima pagina, sopra le automazioni sciolte.
                    Prima si ripetevano in cima a ogni pagina. */}
                {safePage === 1 && allFolders?.filter(f => folderedGroups[f.id] && folderedGroups[f.id].length > 0).map(folder => {
                  const isExpanded = expandedFolders.has(folder.id);
                  const folderFlows = folderedGroups[folder.id] || [];
                  const pubblicate = folderFlows.filter(f => f.status === "published").length;
                  return (
                    <Fragment key={`folder-group-${folder.id}`}>
                      <TableRow
                        key={`folder-${folder.id}`}
                        className="cursor-pointer bg-muted/20 hover:bg-muted/40"
                        aria-expanded={isExpanded}
                        onClick={() => toggleFolder(folder.id)}
                      >
                        <TableCell className="py-2" onClick={e => e.stopPropagation()} />
                        {/* Stesse colonne dell'intestazione a ogni larghezza: con le
                            colonne fisse una colonna in più ruba spazio al nome. */}
                        <TableCell className="py-2" colSpan={4}>
                          <div className="flex items-center gap-2">
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                            {isExpanded ? <FolderOpen className="h-4 w-4 text-primary" /> : <Folder className="h-4 w-4 text-primary" />}
                            <span className="font-medium">{folder.name}</span>
                            <span className="rounded-full bg-muted px-1.5 text-xs tabular-nums text-muted-foreground">{folderFlows.length}</span>
                            {pubblicate > 0 && (
                              <span className="text-xs text-muted-foreground">
                                {pubblicate} pubblicat{pubblicate === 1 ? "a" : "e"}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="hidden py-2 xl:table-cell" />
                        <TableCell className="py-2" onClick={e => e.stopPropagation()}>
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
                    <TableCell colSpan={6} className="text-center py-12">
                      <Zap className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                      <p className="text-sm text-muted-foreground">Nessuna automazione con questi filtri</p>
                    </TableCell>
                    <TableCell className="hidden xl:table-cell" />
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {unfolderedFlows.length > pageSize && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/10 px-4 py-2">
              <span className="text-xs tabular-nums text-muted-foreground">
                {primoDellaPagina}–{ultimoDellaPagina} di {unfolderedFlows.length}
              </span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-7 text-xs" disabled={safePage <= 1} onClick={() => setPage(p => p - 1)}>
                    <ChevronLeft className="h-3.5 w-3.5 mr-1" /> Prec
                  </Button>
                  {pagineVisibili.map(p => (
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
      {vista === "grid" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
          {filtered.map(flow => renderFlowCard(flow))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-12">
              <Zap className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Nessuna automazione con questi filtri</p>
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
