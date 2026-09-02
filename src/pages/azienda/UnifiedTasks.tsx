import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { SortableTaskRow, type AzioniRiga } from "@/components/attivita/SortableTaskRow";
import { PRIORITY_ORDER, PRIORITY_CONFIG } from "@/lib/taskPriorities";
import { TASK_CATEGORY_LABELS as ALL_CATEGORY_LABELS } from "@/lib/taskCategories";
import { costruisciCsv, scaricaCsv } from "@/lib/csv";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus, ListTodo, Search, LayoutList, Kanban, CalendarDays, CalendarRange,
  BarChart2, User, Users, SlidersHorizontal, ArrowUp, ArrowDown, ArrowUpDown,
  Download,
} from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/useDebounce";
import { usePermissions } from "@/hooks/usePermissions";
import { TaskKanbanBoard } from "@/components/attivita/TaskKanbanBoard";
import { TaskCalendarView } from "@/components/attivita/TaskCalendarView";
import { TaskAgendaView } from "@/components/attivita/TaskAgendaView";
import { TaskStatsView } from "@/components/attivita/TaskStatsView";
import { TaskDetailPanel } from "@/components/attivita/TaskDetailPanel";
import { format, isAfter, isBefore, addHours, startOfWeek, addDays, parseISO, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { TaskStatCards } from "@/components/tasks/TaskStatCards";
import { TaskDialog } from "@/components/tasks/TaskDialog";
import { BulkActionsBar } from "@/components/tasks/BulkActionsBar";
import { TaskStatusSettingsDialog } from "@/components/tasks/TaskStatusSettingsDialog";
import { MyDayView } from "@/components/attivita/MyDayView";
import { TaskQuickAdd } from "@/components/attivita/TaskQuickAdd";
import { useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import { logTaskActivity } from "@/lib/taskActivityLog";
import { useTaskStatuses } from "@/hooks/useTaskStatuses";
import {
  buildTaskStatusUpdate,
  getNextTaskStatusForQuickAction,
  getTaskStatusEventType,
  getTaskStatusTransitionDescription,
  isTaskDoneStatus,
  getTaskStatusLabel,
} from "@/lib/taskStatuses";

type ColonnaOrdinabile = "title" | "assignee" | "priority" | "due_date" | "status";


const FONTE_OPTIONS = [
  { value: "all", label: "Tutte le fonti" },
  { value: "cantieri", label: "Cantieri & Lavori" },
  { value: "marketing", label: "Marketing & Vendita" },
];

const MARKETING_CATEGORIES = ["marketing", "contatti", "opportunita"];

type UnifiedTasksProps = {
  embedded?: boolean;
  initialTab?: "myday" | "all";
};

const PLATFORM_ROLES = ["super_admin", "platform_admin", "platform_support", "platform_viewer"];

type ViewMode = "list" | "kanban" | "calendar" | "agenda" | "stats";
const VIEW_MODES: Array<{ value: ViewMode; label: string; icon: typeof LayoutList; descr: string }> = [
  { value: "list", label: "Lista", icon: LayoutList, descr: "Tabella ordinabile, selezione multipla e trascinamento" },
  { value: "kanban", label: "Kanban", icon: Kanban, descr: "Colonne per stato, trascina per cambiare stato" },
  { value: "calendar", label: "Calendario", icon: CalendarDays, descr: "Attività sul mese, per scadenza" },
  { value: "agenda", label: "Agenda", icon: CalendarRange, descr: "Elenco per giorno, dalle più vicine" },
  { value: "stats", label: "Statistiche", icon: BarChart2, descr: "Carico per persona, stato e priorità" },
];
const isViewMode = (v: string | null): v is ViewMode => !!v && VIEW_MODES.some((m) => m.value === v);
const FILTRI_DEFAULT = { stato: "active", priorita: "all", categoria: "all", fonte: "all", assegnatario: "all" };

export default function UnifiedTasks({ embedded = false, initialTab = "myday" }: UnifiedTasksProps = {}) {
  const { effectiveCompany, user, isImpersonating, role } = useAuth() as any;
  const { isAdmin, canViewTeamTasks } = usePermissions();
  // Visione team: admin, permesso esplicito, o ruolo piattaforma in
  // impersonificazione (che gestisce per conto dell'azienda).
  const seesTeamTasks = isAdmin || canViewTeamTasks || (isImpersonating && PLATFORM_ROLES.includes(role));
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  // Vista e filtri principali vivono anche nell'URL: il refresh non li perde e
  // il link si può condividere ("guarda le scadute in kanban").
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFonte = searchParams.get("fonte") || FILTRI_DEFAULT.fonte;
  const initialVista: ViewMode = isViewMode(searchParams.get("vista")) ? (searchParams.get("vista") as ViewMode) : "list";
  const initialStato = searchParams.get("stato") || FILTRI_DEFAULT.stato;
  const initialAssegnatario = searchParams.get("assegnatario") || FILTRI_DEFAULT.assegnatario;

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [dialogDefaultAssignedTo, setDialogDefaultAssignedTo] = useState<string | null | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState(initialStato);
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterFonte, setFilterFonte] = useState(initialFonte);
  const [filterAssignee, setFilterAssignee] = useState(initialAssegnatario);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState(initialTab);
  const [viewMode, setViewMode] = useState<ViewMode>(initialVista);
  const [searchText, setSearchText] = useState("");
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [statusSettingsOpen, setStatusSettingsOpen] = useState(false);
  const debouncedSearch = useDebounce(searchText, 300);
  const [sort, setSort] = useState<{ col: ColonnaOrdinabile; dir: "asc" | "desc" } | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<any>(null);
  const ricercaRef = useRef<HTMLInputElement>(null);


  useEffect(() => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      const metti = (k: string, v: string, def: string) => (v === def ? next.delete(k) : next.set(k, v));
      metti("vista", viewMode, "list");
      metti("stato", filterStatus, FILTRI_DEFAULT.stato);
      metti("fonte", filterFonte, FILTRI_DEFAULT.fonte);
      metti("assegnatario", filterAssignee, FILTRI_DEFAULT.assegnatario);
      return next;
    }, { replace: true });
  }, [viewMode, filterStatus, filterFonte, filterAssignee, setSearchParams]);

  const filtriAttivi =
    filterStatus !== FILTRI_DEFAULT.stato || filterPriority !== FILTRI_DEFAULT.priorita || filterCategory !== FILTRI_DEFAULT.categoria ||
    filterFonte !== FILTRI_DEFAULT.fonte || filterAssignee !== FILTRI_DEFAULT.assegnatario || !!searchText;
  const azzeraFiltri = () => {
    setFilterStatus(FILTRI_DEFAULT.stato); setFilterPriority(FILTRI_DEFAULT.priorita); setFilterCategory(FILTRI_DEFAULT.categoria);
    setFilterFonte(FILTRI_DEFAULT.fonte); setFilterAssignee(FILTRI_DEFAULT.assegnatario); setSearchText("");
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const reorderMutation = useMutation({
    mutationFn: async (updates: { id: string; sort_order: number }[]) => {
      for (const u of updates) {
        await supabase.from("tasks").update({ sort_order: u.sort_order }).eq("id", u.id);
      }
    },
    onError: () => toast.error("Errore nel salvataggio dell'ordine"),
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredTasks.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTasks.map((t) => t.id)));
    }
  };

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: [...queryKeys.tasks.all, "unified", companyId, seesTeamTasks, user?.id],
    queryFn: async () => {
      if (!companyId) return [];
      let q = supabase
        .from("tasks")
        .select(`
          *,
          assigned_profile:profiles!tasks_assigned_to_fkey(first_name, last_name),
          order:orders!tasks_order_id_fkey(description, order_code),
          stock_item:warehouse_stock!tasks_stock_item_id_fkey(name),
          cost:company_costs!tasks_cost_id_fkey(name, amount),
          contact:marketing_contacts!tasks_contact_id_fkey(first_name, last_name),
          opportunity:marketing_opportunities!tasks_opportunity_id_fkey(name, value)
        `)
        .eq("company_id", companyId)
        .order("sort_order", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(5000);
      // Senza "Attività del team": scoping alle proprie (personal-first)
      if (!seesTeamTasks && user?.id) q = q.eq("assigned_to", user.id);
      const { data, error } = await q;
      if (error) throw error;
      const rawTasks = data || [];
      const creatorIds = [...new Set(rawTasks.map((task: any) => task.created_by).filter(Boolean))];
      if (creatorIds.length === 0) return rawTasks;

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, first_name, last_name")
        .in("id", creatorIds);

      const creators = new Map((profiles || []).map((profile: any) => [profile.id, profile]));
      return rawTasks.map((task: any) => ({
        ...task,
        creator_profile: creators.get(task.created_by) || null,
      }));
    },
    enabled: !!companyId,
  });

  const observedStatuses = useMemo(
    () => Array.from(new Set(tasks.map((task: any) => task.status).filter(Boolean))),
    [tasks],
  );
  const { statuses: statusOptions, saveStatuses, resetStatuses } = useTaskStatuses(companyId, observedStatuses);

  useEffect(() => {
    if (!selectedTask) return;
    const freshTask = tasks.find((task: any) => task.id === selectedTask.id);
    if (freshTask) setSelectedTask(freshTask);
  }, [tasks, selectedTask?.id]);

  // Extract unique assignees for filter
  // Exclude the current user if they are impersonating (superadmin doesn't belong to this company)
  const assignees = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    tasks.forEach((t) => {
      if (t.assigned_profile && t.assigned_to) {
        // Skip the impersonating superadmin — they don't belong to this company
        if (isImpersonating && PLATFORM_ROLES.includes(role) && t.assigned_to === user?.id) return;
        map.set(t.assigned_to, {
          id: t.assigned_to,
          name: `${t.assigned_profile.first_name} ${t.assigned_profile.last_name}`,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks, isImpersonating, role, user?.id]);

  const now = new Date();
  const in48h = addHours(now, 48);
  const weekStart = startOfWeek(now, { locale: it });

  const stats = useMemo(() => {
    const isDone = (task: any) => isTaskDoneStatus(task.status, statusOptions);
    const active = tasks.filter((t) => !isDone(t)).length;
    const inReview = tasks.filter((t) => statusOptions.find((status) => status.value === t.status)?.stage === "review").length;
    const expiring = tasks.filter((t) => !isDone(t) && t.due_date && isAfter(new Date(t.due_date), now) && isBefore(new Date(t.due_date), in48h)).length;
    const overdue = tasks.filter((t) => !isDone(t) && t.due_date && isBefore(new Date(t.due_date), now)).length;
    const completedThisWeek = tasks.filter((t) => isDone(t) && t.completed_at && isAfter(new Date(t.completed_at), weekStart)).length;
    return { active, inReview, expiring, overdue, completedThisWeek };
  }, [tasks, statusOptions]);

  // Toast notifica al primo caricamento se ci sono task scaduti
  // Una volta per sessione e per giorno (non a ogni apertura della Regia):
  // il numero di scadute è già nel badge in testa e nella card "Scadute".
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (notifiedRef.current || tasks.length === 0) return;
    const chiave = `regia-scadute-avvisate:${companyId}:${format(new Date(), "yyyy-MM-dd")}`;
    let giaAvvisato = false;
    try { giaAvvisato = sessionStorage.getItem(chiave) === "1"; } catch { /* storage non disponibile */ }
    if (stats.overdue > 0 && !giaAvvisato) {
      notifiedRef.current = true;
      try { sessionStorage.setItem(chiave, "1"); } catch { /* ignora */ }
      toast.warning(
        `${stats.overdue} attività scadut${stats.overdue === 1 ? "a" : "e"}`,
        {
          description: "Clicca su \"Scadute\" per visualizzarle",
          duration: 6000,
          action: { label: "Vedi", onClick: () => { setActiveTab("all"); setFilterStatus("overdue"); } },
        }
      );
    }
  }, [tasks, stats.overdue, companyId]);

  const handleStatFilterClick = useCallback((filter: "active" | "expiring" | "overdue" | "done") => {
    setActiveTab("all");
    if (filter === "done") {
      const chiuso = statusOptions.find((s) => s.stage === "done")?.value ?? "completata";
      setFilterStatus(chiuso);
      return;
    }
    setFilterStatus(filter);
  }, [statusOptions]);

  const filteredTasks = useMemo(() => {
    const now = new Date();
    const in48h = addHours(now, 48);
    return tasks.filter((t) => {
      const isDone = isTaskDoneStatus(t.status, statusOptions);
      if (filterStatus === "active" && isDone) return false;
      if (filterStatus === "overdue") {
        if (isDone || !t.due_date || !isBefore(new Date(t.due_date), now)) return false;
      } else if (filterStatus === "expiring") {
        if (isDone || !t.due_date) return false;
        const d = new Date(t.due_date);
        if (!isAfter(d, now) || !isBefore(d, in48h)) return false;
      } else if (filterStatus !== "all" && filterStatus !== "active" && t.status !== filterStatus) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterCategory !== "all" && t.category !== filterCategory) return false;
      if (filterFonte === "marketing" && !MARKETING_CATEGORIES.includes(t.category)) return false;
      if (filterFonte === "cantieri" && MARKETING_CATEGORIES.includes(t.category)) return false;
      if (filterAssignee !== "all" && t.assigned_to !== filterAssignee) return false;
      if (debouncedSearch) {
        const q = debouncedSearch.toLowerCase();
        const assegnatario = t.assigned_profile ? `${t.assigned_profile.first_name ?? ""} ${t.assigned_profile.last_name ?? ""}`.toLowerCase() : "";
        const commessa = `${t.order?.order_code ?? ""} ${t.order?.description ?? ""}`.toLowerCase();
        if (!t.title?.toLowerCase().includes(q) && !t.notes?.toLowerCase().includes(q) && !assegnatario.includes(q) && !commessa.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, filterStatus, filterPriority, filterCategory, filterFonte, filterAssignee, debouncedSearch, statusOptions]);

  // Ordinamento per colonna (click sull'intestazione). Senza ordinamento vale
  // l'ordine manuale (sort_order) e il trascinamento resta attivo.
  const sortedTasks = useMemo(() => {
    if (!sort) return filteredTasks;
    const nome = (t: any) => t.assigned_profile ? `${t.assigned_profile.last_name ?? ""} ${t.assigned_profile.first_name ?? ""}`.trim().toLowerCase() : "";
    const ordineStato = (t: any) => statusOptions.find((s) => s.value === t.status)?.order ?? 999;
    const cmp = (a: any, b: any) => {
      switch (sort.col) {
        case "title": return (a.title ?? "").localeCompare(b.title ?? "", "it");
        case "assignee": return nome(a).localeCompare(nome(b), "it") || (nome(a) ? 0 : 1) - (nome(b) ? 0 : 1);
        case "priority": return PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority);
        case "due_date": {
          if (!a.due_date && !b.due_date) return 0;
          if (!a.due_date) return 1; // senza scadenza sempre in fondo
          if (!b.due_date) return -1;
          return String(a.due_date).localeCompare(String(b.due_date));
        }
        case "status": return ordineStato(a) - ordineStato(b);
        default: return 0;
      }
    };
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filteredTasks].sort((a, b) => {
      const r = cmp(a, b);
      // le "senza scadenza" restano in fondo anche in ordine decrescente
      if (sort.col === "due_date" && (!a.due_date || !b.due_date)) return r;
      return r * dir;
    });
  }, [filteredTasks, sort, statusOptions]);

  const toggleSort = (col: ColonnaOrdinabile) =>
    setSort((prev) => (!prev || prev.col !== col ? { col, dir: "asc" } : prev.dir === "asc" ? { col, dir: "desc" } : null));

  const intestazione = (col: ColonnaOrdinabile, label: string) => {
    const attiva = sort?.col === col;
    const Icona = !attiva ? ArrowUpDown : sort!.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        onClick={() => toggleSort(col)}
        className={cn("inline-flex items-center gap-1 whitespace-nowrap hover:text-foreground", attiva && "text-foreground font-semibold")}
        title={attiva ? (sort!.dir === "asc" ? "Ordine crescente (clicca per decrescente)" : "Ordine decrescente (clicca per togliere)") : `Ordina per ${label.toLowerCase()}`}
        aria-sort={attiva ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
      >
        {label}
        <Icona className={cn("h-3.5 w-3.5", !attiva && "opacity-40")} />
      </button>
    );
  };

  // DnD is only meaningful when showing all tasks unfiltered — otherwise sort_order
  // would be calculated only over the visible subset, corrupting the order of hidden tasks.
  const isDragDisabled = filtriAttivi || !!debouncedSearch || !!sort;

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    // Reorder within the full task list so sort_order stays consistent across all tasks
    const oldIndex = tasks.findIndex((t) => t.id === active.id);
    const newIndex = tasks.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(tasks, oldIndex, newIndex);
    const updates = reordered.map((t, i) => ({ id: t.id, sort_order: i + 1 }));
    reorderMutation.mutate(updates, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all }),
    });
  }, [tasks, reorderMutation, queryClient]);

  /** Le attività filtrate e ordinate come le vedi, in CSV apribile da Excel. */
  const esportaCsv = () => {
    if (sortedTasks.length === 0) { toast.info("Nessuna attività da esportare con i filtri attuali"); return; }
    const nome = (t: any) => t.assigned_profile ? `${t.assigned_profile.first_name ?? ""} ${t.assigned_profile.last_name ?? ""}`.trim() : "";
    const data = (v: unknown) => (typeof v === "string" && v ? format(parseISO(v), "dd/MM/yyyy") : "");
    const csv = costruisciCsv(sortedTasks as any[], [
      { label: "Titolo", valore: (t) => t.title },
      { label: "Stato", valore: (t) => getTaskStatusLabel(t.status, statusOptions) },
      { label: "Priorità", valore: (t) => PRIORITY_CONFIG[t.priority as keyof typeof PRIORITY_CONFIG]?.label ?? t.priority },
      { label: "Categoria", valore: (t) => ALL_CATEGORY_LABELS[t.category] ?? t.category },
      { label: "Scadenza", valore: (t) => data(t.due_date) },
      { label: "Assegnata a", valore: nome },
      { label: "Commessa", valore: (t) => t.order?.order_code ?? "" },
      { label: "Stima ore", valore: (t) => t.estimated_hours ?? "" },
      { label: "Ore effettive", valore: (t) => t.actual_hours ?? "" },
      { label: "Creata il", valore: (t) => data(t.created_at) },
      { label: "Note", valore: (t) => t.notes ?? "" },
    ]);
    scaricaCsv(`attivita-${format(new Date(), "yyyy-MM-dd")}.csv`, csv);
    toast.success(sortedTasks.length === 1 ? "1 attività esportata" : `${sortedTasks.length} attività esportate`);
  };

  const openNewTask = useCallback((options?: { assignedTo?: string | null; defaults?: Record<string, unknown> | null }) => {
    const defaultAssignee =
      options?.assignedTo !== undefined
        ? options.assignedTo
        : ((options?.defaults?.assigned_to as string | null | undefined) ?? user?.id ?? null);
    setDialogDefaultAssignedTo(defaultAssignee);
    setEditingTask(options?.defaults ?? null);
    setDialogOpen(true);
  }, [user?.id]);

  // Scorciatoie da tastiera (come nei task manager): n = nuova attività, / = cerca.
  // Ignorate mentre si scrive in un campo o con un dialog aperto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "n") { e.preventDefault(); openNewTask({ assignedTo: user?.id ?? null }); }
      if (e.key === "/") { e.preventDefault(); setActiveTab("all"); ricercaRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openNewTask, user?.id]);

  const invalidaTask = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    queryClient.invalidateQueries({ queryKey: ["my-task-count"] });
  };

  /**
   * Applica uno stato scelto (dal menu o dall'azione rapida) e offre "Annulla"
   * nel toast: chi segna "fatto" per sbaglio torna indietro con un click.
   * Se la chiusura di una ricorrente crea l'occorrenza successiva, l'annulla
   * la elimina.
   */
  const applicaStato = async (task: any, nuovoStato: string) => {
    if (nuovoStato === task.status) return;
    const updates = buildTaskStatusUpdate(nuovoStato, statusOptions);
    const { error } = await supabase.from("tasks").update(updates).eq("id", task.id);
    if (error) {
      toast.error("Stato non cambiato", { description: error.message });
      return;
    }

    await logTaskActivity({
      companyId,
      userId: user?.id,
      taskId: task.id,
      taskTitle: task.title,
      eventType: getTaskStatusEventType(task.status, nuovoStato, statusOptions),
      description: getTaskStatusTransitionDescription(task.status, nuovoStato, statusOptions),
      changes: updates,
      beforeSnapshot: task,
      afterSnapshot: { ...task, ...updates },
    });

    // La prossima occorrenza di una ricorrente la crea il DB (trigger
    // trg_task_ricorrenza_prossima): vale da qui, dal kanban, dal pannello,
    // dalle azioni multiple, dal campo, da Silvio e dalle automazioni.

    invalidaTask();

    const ripristina = async () => {
      const indietro: TablesUpdate<"tasks"> = { status: task.status, completed_at: (task.completed_at as string | null | undefined) ?? null };
      const { error: errUndo } = await supabase.from("tasks").update(indietro).eq("id", task.id);
      if (errUndo) { toast.error("Annullamento non riuscito", { description: errUndo.message }); return; }
      // Se il completamento ha generato la prossima occorrenza, va via anche quella.
      if (task.is_recurring) {
        // Solo le figlie nate dopo l'ultima modifica della task: quelle generate da questo completamento.
        const daQuando = (task.updated_at as string | null | undefined) ?? (task.created_at as string);
        await supabase.from("tasks").delete().eq("parent_task_id", task.id).eq("status", "da_fare").gte("created_at", daQuando);
      }
      await logTaskActivity({
        companyId, userId: user?.id, taskId: task.id, taskTitle: task.title,
        eventType: "task_status_changed",
        description: `ha annullato il cambio di stato (di nuovo ${getTaskStatusLabel(task.status, statusOptions)})`,
        changes: indietro, beforeSnapshot: { ...task, ...updates }, afterSnapshot: { ...task, ...indietro },
      });
      invalidaTask();
      toast.success("Ripristinato", { description: `"${task.title}" è di nuovo ${getTaskStatusLabel(task.status, statusOptions)}` });
    };
    toast.success(`${isTaskDoneStatus(nuovoStato, statusOptions) ? "Completata" : getTaskStatusLabel(nuovoStato, statusOptions)}: ${task.title}`, {
      duration: 8000,
      action: { label: "Annulla", onClick: () => { void ripristina(); } },
    });
  };

  const handleToggleComplete = (task: any) =>
    applicaStato(task, getNextTaskStatusForQuickAction(task.status, statusOptions).value);

  /** Modifica di un campo singolo con toast; per la scadenza e la priorità dalla riga. */
  const aggiornaCampo = async (task: any, updates: TablesUpdate<"tasks">, messaggio: string, campo: string) => {
    const { error } = await supabase.from("tasks").update(updates).eq("id", task.id);
    if (error) { toast.error("Modifica non salvata", { description: error.message }); return; }
    await logTaskActivity({
      companyId, userId: user?.id, taskId: task.id, taskTitle: task.title,
      eventType: "task_updated", description: `ha modificato ${campo}`,
      changes: updates, beforeSnapshot: task, afterSnapshot: { ...task, ...updates },
    });
    invalidaTask();
    toast.success(messaggio);
  };

  const duplicaTask = async (task: any) => {
    const copia = {
      company_id: task.company_id ?? companyId,
      title: `${task.title} (copia)`,
      notes: task.notes ?? null,
      status: statusOptions.find((s) => s.stage === "todo")?.value ?? "da_fare",
      priority: task.priority ?? "normale",
      due_date: task.due_date ?? null,
      assigned_to: task.assigned_to ?? null,
      order_id: task.order_id ?? null,
      stock_item_id: task.stock_item_id ?? null,
      cost_id: task.cost_id ?? null,
      category: task.category ?? "generale",
      contact_id: task.contact_id ?? null,
      opportunity_id: task.opportunity_id ?? null,
      ticket_id: task.ticket_id ?? null,
      is_recurring: task.is_recurring ?? false,
      recurrence_rule: task.recurrence_rule ?? null,
      recurrence_end_date: task.recurrence_end_date ?? null,
      estimated_hours: task.estimated_hours ?? null,
      created_by: user?.id,
      completed_at: null as string | null,
    };
    const { data, error } = await supabase.from("tasks").insert(copia as any).select("id").single();
    if (error) { toast.error("Duplicazione non riuscita", { description: error.message }); return; }
    const nuovoId = (data as { id: string } | null)?.id;
    invalidaTask();
    toast.success("Attività duplicata", {
      description: copia.title,
      action: nuovoId ? { label: "Annulla", onClick: () => { void supabase.from("tasks").delete().eq("id", nuovoId).then(() => invalidaTask()); } } : undefined,
    });
  };

  const eliminaTask = async () => {
    const task = taskToDelete;
    if (!task) return;
    setTaskToDelete(null);
    const { error } = await supabase.from("tasks").delete().eq("id", task.id);
    if (error) { toast.error("Eliminazione non riuscita", { description: error.message }); return; }
    if (selectedTask?.id === task.id) setSelectedTask(null);
    invalidaTask();
    toast.success("Attività eliminata", { description: task.title });
  };

  const costruisciAzioni = (task: any): AzioniRiga => ({
    onChangeStatus: (status) => { void applicaStato(task, status); },
    onChangePriority: (priority) => { void aggiornaCampo(task, { priority }, `Priorità: ${priority}`, "la priorità"); },
    onChangeDueDate: (date) => { void aggiornaCampo(task, { due_date: date }, date ? `Scadenza: ${format(parseISO(date), "d MMM yyyy", { locale: it })}` : "Scadenza rimossa", "la scadenza"); },
    onAssignToMe: user?.id && task.assigned_to !== user.id
      ? () => { void aggiornaCampo(task, { assigned_to: user.id }, "Assegnata a te", "l'assegnatario"); }
      : undefined,
    onDuplicate: () => { void duplicaTask(task); },
    onPostpone: (giorni) => {
      const base = task.due_date ? parseISO(String(task.due_date).slice(0, 10)) : startOfDay(new Date());
      const nuova = format(addDays(base, giorni), "yyyy-MM-dd");
      void aggiornaCampo(task, { due_date: nuova }, `Rimandata al ${format(parseISO(nuova), "d MMM yyyy", { locale: it })}`, "la scadenza");
    },
    onDelete: () => setTaskToDelete(task),
  });

  const handleRefresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });

  return (
    <div className={embedded ? "space-y-5" : "space-y-6"}>
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                Regia operativa
              </span>
              {stats.overdue > 0 && (
                <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
                  {stats.overdue} scadute
                </span>
              )}
            </div>
            <h1 className={cn("font-bold tracking-tight", embedded ? "text-xl" : "text-2xl")}>
              {embedded ? "Regia attività" : "Attività"}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Gestisci attività personali e di team, priorità, scadenze e responsabilità da un unico punto.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button className="gap-2" onClick={() => openNewTask({ assignedTo: user?.id ?? null })}>
              <Plus className="h-4 w-4" />
              Aggiungi attività
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => openNewTask({ assignedTo: null })}>
              <Users className="h-4 w-4" />
              Per team
            </Button>
            <Button variant="outline" className="gap-2" onClick={() => setStatusSettingsOpen(true)}>
              <SlidersHorizontal className="h-4 w-4" />
              Stati
            </Button>
            <Button variant="outline" className="gap-2" onClick={esportaCsv} title="Scarica in CSV (Excel) le attività filtrate">
              <Download className="h-4 w-4" />
              Esporta
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "myday" | "all")}>
        <TabsList className="h-10 rounded-lg">
          <TabsTrigger value="myday">La mia giornata</TabsTrigger>
          <TabsTrigger value="all">Tutte le attività</TabsTrigger>
        </TabsList>

        <TabsContent value="myday">
          <MyDayView onNewTask={() => openNewTask({ assignedTo: user?.id ?? null })} />
        </TabsContent>

        <TabsContent value="all">
          <div className="space-y-6">
            <TaskQuickAdd
              defaultAssignedTo={user?.id ?? null}
              onAdvancedCreate={() => openNewTask({ assignedTo: user?.id ?? null })}
            />
            <TaskStatCards
              {...stats}
              onFilterClick={handleStatFilterClick}
              onStatusClick={(status) => {
                setActiveTab("all");
                setFilterStatus(status);
              }}
            />

            <div className="rounded-xl border bg-card p-3 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
                  Filtri e vista
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{filteredTasks.length} di {tasks.length} attività</span>
                  {filtriAttivi && (
                    <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={azzeraFiltri}>
                      Azzera filtri
                    </Button>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  ref={ricercaRef}
                  placeholder="Cerca attività...  (tasto /)"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={filterFonte} onValueChange={setFilterFonte}>
                <SelectTrigger className="w-full sm:w-[190px] h-9 gap-1" aria-label="Filtro fonte"><span className="text-muted-foreground">Fonte:</span> <SelectValue placeholder="Tutte" /></SelectTrigger>
                <SelectContent>
                  {FONTE_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-[170px] h-9 gap-1" aria-label="Filtro stato"><span className="text-muted-foreground">Stato:</span> <SelectValue placeholder="Attive" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte</SelectItem>
                  <SelectItem value="active">Attive</SelectItem>
                  {statusOptions.map((status) => (
                    <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                  ))}
                  <SelectItem value="expiring">In scadenza (48h)</SelectItem>
                  <SelectItem value="overdue">Scadute</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterPriority} onValueChange={setFilterPriority}>
                <SelectTrigger className="w-full sm:w-[160px] h-9 gap-1" aria-label="Filtro priorità"><span className="text-muted-foreground">Priorità:</span> <SelectValue placeholder="Tutte" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte</SelectItem>
                  <SelectItem value="bassa">Bassa</SelectItem>
                  <SelectItem value="normale">Normale</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-full sm:w-[180px] h-9 gap-1" aria-label="Filtro categoria"><span className="text-muted-foreground">Categoria:</span> <SelectValue placeholder="Tutte" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte</SelectItem>
                  {Object.entries(ALL_CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {seesTeamTasks && (
                <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                  <SelectTrigger className="w-full sm:w-[200px] h-9 gap-1" aria-label="Filtro assegnatario"><span className="text-muted-foreground">Assegnatario:</span> <SelectValue placeholder="Tutti" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tutti</SelectItem>
                    {assignees.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {/* Filtro rapido "Le mie" — inutile quando vedi già solo le tue */}
              {seesTeamTasks && (
                <button
                  onClick={() => setFilterAssignee(filterAssignee === user?.id ? "all" : (user?.id || "all"))}
                  className={cn(
                    "h-9 px-3 rounded-md border text-sm transition-colors flex items-center gap-1.5 whitespace-nowrap",
                    filterAssignee === user?.id
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  <User className="h-3.5 w-3.5" />
                  Le mie
                </button>
              )}
              {/* Toggle view: icona + nome (su schermi larghi) + tooltip con la spiegazione */}
              <TooltipProvider delayDuration={200}>
                <div className="flex rounded-md border overflow-hidden sm:ml-auto" role="group" aria-label="Vista">
                  {VIEW_MODES.map((m) => (
                    <Tooltip key={m.value}>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setViewMode(m.value)}
                          aria-label={`Vista ${m.label.toLowerCase()}`}
                          aria-pressed={viewMode === m.value}
                          className={cn(
                            "flex items-center gap-1.5 px-2.5 py-2 text-xs transition-colors",
                            viewMode === m.value ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                          )}
                        >
                          <m.icon className="h-4 w-4" />
                          <span className="hidden xl:inline">{m.label}</span>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-[220px] text-xs">
                        <p className="font-medium">{m.label}</p>
                        <p className="text-muted-foreground">{m.descr}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </div>
              </TooltipProvider>
              </div>
            </div>

            {isLoading ? (
              <Card>
                <div className="divide-y">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-4 p-4">
                      <Skeleton className="h-4 w-4 rounded" />
                      <Skeleton className="h-4 flex-1 max-w-xs" />
                      <Skeleton className="h-4 w-24 hidden md:block" />
                      <Skeleton className="h-4 w-20 hidden lg:block" />
                      <Skeleton className="h-6 w-16 rounded-full" />
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-6 w-20 rounded-md" />
                    </div>
                  ))}
                </div>
              </Card>
            ) : filteredTasks.length === 0 ? (
              <Card>
                <CardContent className="p-12 text-center">
                  <ListTodo className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  {tasks.length > 0 ? (
                    <>
                      <h3 className="text-lg font-medium mb-1">Nessuna attività con questi filtri</h3>
                      <p className="text-muted-foreground mb-4">Ce ne sono {tasks.length} in tutto: allarga i filtri o azzerali.</p>
                      <Button variant="outline" onClick={azzeraFiltri}>Azzera filtri</Button>
                    </>
                  ) : (
                    <>
                      <h3 className="text-lg font-medium mb-1">Nessuna attività</h3>
                      <p className="text-muted-foreground mb-4">Crea la tua prima attività per iniziare</p>
                      <Button onClick={() => openNewTask({ assignedTo: user?.id ?? null })}>
                        <Plus className="h-4 w-4 mr-2" /> Nuova Attività
                      </Button>
                    </>
                  )}
                </CardContent>
              </Card>
            ) : viewMode === "stats" ? (
              <TaskStatsView tasks={tasks} />
            ) : viewMode === "agenda" ? (
              <TaskAgendaView
                tasks={filteredTasks}
                onTaskSelect={(task) => setSelectedTask(task)}
              />
            ) : viewMode === "calendar" ? (
              <TaskCalendarView
                tasks={filteredTasks}
                onTaskSelect={(task) => setSelectedTask(task)}
                onNewTaskForDate={(date) => {
                  openNewTask({ assignedTo: user?.id ?? null, defaults: { due_date: date.toISOString().slice(0, 10) } });
                }}
              />
            ) : viewMode === "kanban" ? (
              <TaskKanbanBoard
                tasks={filteredTasks}
                statusOptions={statusOptions}
                onTaskSelect={(task) => setSelectedTask(task)}
                onAddTaskToColumn={(status) => {
                  openNewTask({ assignedTo: user?.id ?? null, defaults: { status } });
                }}
              />
            ) : (
              <>
                <BulkActionsBar companyId={companyId} selectedIds={selectedIds} onClear={() => setSelectedIds(new Set())} statusOptions={statusOptions} tasks={tasks} />
                <Card>
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <div className="overflow-x-auto">
                      <Table className="min-w-[800px]">
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-6 px-1" />
                            <TableHead className="w-10">
                              <Checkbox checked={filteredTasks.length > 0 && selectedIds.size === filteredTasks.length} onCheckedChange={toggleSelectAll} />
                            </TableHead>
                            <TableHead>{intestazione("title", "Titolo")}</TableHead>
                            <TableHead>{intestazione("assignee", "Assegnatario")}</TableHead>
                            <TableHead>Collegamento</TableHead>
                            <TableHead>Categoria</TableHead>
                            <TableHead>{intestazione("priority", "Priorità")}</TableHead>
                            <TableHead>{intestazione("due_date", "Scadenza")}</TableHead>
                            <TableHead>{intestazione("status", "Stato")}</TableHead>
                            <TableHead className="w-10" />
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <SortableContext items={sortedTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                            {sortedTasks.map((task) => (
                              <SortableTaskRow
                                key={task.id}
                                task={task}
                                isSelected={selectedIds.has(task.id)}
                                onToggleSelect={() => toggleSelect(task.id)}
                                onSelect={() => setSelectedTask(task)}
                                onToggleComplete={() => handleToggleComplete(task)}
                                dragDisabled={isDragDisabled}
                                statusOptions={statusOptions}
                                azioni={costruisciAzioni(task)}
                              />
                            ))}
                          </SortableContext>
                        </TableBody>
                      </Table>
                    </div>
                  </DndContext>
                </Card>
              </>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <AlertDialog open={!!taskToDelete} onOpenChange={(o) => { if (!o) setTaskToDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare "{taskToDelete?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>Commenti, checklist e cronologia dell'attività vengono eliminati. Questa azione non può essere annullata.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => { void eliminaTask(); }} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Elimina</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
        onSaved={handleRefresh}
        defaultAssignedTo={dialogDefaultAssignedTo}
      />

      <TaskDetailPanel
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
      />

      <TaskStatusSettingsDialog
        open={statusSettingsOpen}
        onOpenChange={setStatusSettingsOpen}
        statuses={statusOptions}
        onSave={saveStatuses}
        onReset={resetStatuses}
      />
    </div>
  );
}
