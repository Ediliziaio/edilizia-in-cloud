import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { SortableTaskRow } from "@/components/attivita/SortableTaskRow";
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
  BarChart2, User, Users, SlidersHorizontal,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/useDebounce";
import { usePermissions } from "@/hooks/usePermissions";
import { TaskKanbanBoard } from "@/components/attivita/TaskKanbanBoard";
import { TaskCalendarView } from "@/components/attivita/TaskCalendarView";
import { TaskAgendaView } from "@/components/attivita/TaskAgendaView";
import { TaskStatsView } from "@/components/attivita/TaskStatsView";
import { TaskDetailPanel } from "@/components/attivita/TaskDetailPanel";
import { format, isAfter, isBefore, addHours, startOfWeek, addDays, addWeeks, addMonths, parseISO } from "date-fns";
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
} from "@/lib/taskStatuses";

const ALL_CATEGORY_LABELS: Record<string, string> = {
  generale: "Generale",
  ordini: "Ordini",
  magazzino: "Magazzino",
  pagamenti: "Pagamenti",
  costi: "Costi",
  marketing: "Marketing",
  contatti: "Contatti",
  opportunita: "Opportunità",
};

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

export default function UnifiedTasks({ embedded = false, initialTab = "myday" }: UnifiedTasksProps = {}) {
  const { effectiveCompany, user, isImpersonating, role } = useAuth() as any;
  const { isAdmin, canViewTeamTasks } = usePermissions();
  // Visione team: admin, permesso esplicito, o ruolo piattaforma in
  // impersonificazione (che gestisce per conto dell'azienda).
  const seesTeamTasks = isAdmin || canViewTeamTasks || (isImpersonating && PLATFORM_ROLES.includes(role));
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialFonte = searchParams.get("fonte") || "all";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [dialogDefaultAssignedTo, setDialogDefaultAssignedTo] = useState<string | null | undefined>(undefined);
  const [filterStatus, setFilterStatus] = useState("active");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterFonte, setFilterFonte] = useState(initialFonte);
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState(initialTab);
  const [viewMode, setViewMode] = useState<"list" | "kanban" | "calendar" | "agenda" | "stats">("list");
  const [searchText, setSearchText] = useState("");
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const [statusSettingsOpen, setStatusSettingsOpen] = useState(false);
  const debouncedSearch = useDebounce(searchText, 300);

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
  const notifiedRef = useRef(false);
  useEffect(() => {
    if (notifiedRef.current || tasks.length === 0) return;
    if (stats.overdue > 0) {
      notifiedRef.current = true;
      toast.warning(
        `${stats.overdue} attività scadut${stats.overdue === 1 ? "a" : "e"}`,
        {
          description: "Clicca su \"Scadute\" per visualizzarle",
          duration: 6000,
          action: { label: "Vedi", onClick: () => { setActiveTab("all"); setFilterStatus("overdue"); } },
        }
      );
    }
  }, [tasks, stats.overdue]);

  const handleStatFilterClick = useCallback((filter: "expiring" | "overdue") => {
    setActiveTab("all");
    setFilterStatus(filter);
  }, []);

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
        if (!t.title?.toLowerCase().includes(q) && !t.notes?.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [tasks, filterStatus, filterPriority, filterCategory, filterFonte, filterAssignee, debouncedSearch, statusOptions]);

  // DnD is only meaningful when showing all tasks unfiltered — otherwise sort_order
  // would be calculated only over the visible subset, corrupting the order of hidden tasks.
  const isDragDisabled =
    filterStatus !== "active" || filterPriority !== "all" || filterCategory !== "all" ||
    filterFonte !== "all" || filterAssignee !== "all" || !!debouncedSearch;

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

  const openNewTask = useCallback((options?: { assignedTo?: string | null; defaults?: Record<string, unknown> | null }) => {
    const defaultAssignee =
      options?.assignedTo !== undefined
        ? options.assignedTo
        : ((options?.defaults?.assigned_to as string | null | undefined) ?? user?.id ?? null);
    setDialogDefaultAssignedTo(defaultAssignee);
    setEditingTask(options?.defaults ?? null);
    setDialogOpen(true);
  }, [user?.id]);

  const handleToggleComplete = async (task: any) => {
    const nextStatus = getNextTaskStatusForQuickAction(task.status, statusOptions);
    const updates = buildTaskStatusUpdate(nextStatus.value, statusOptions);
    const { error } = await supabase
      .from("tasks")
      .update(updates)
      .eq("id", task.id);
    if (error) {
      toast.error("Errore", { description: error.message });
      return;
    }

    await logTaskActivity({
      companyId,
      userId: user?.id,
      taskId: task.id,
      taskTitle: task.title,
      eventType: getTaskStatusEventType(task.status, nextStatus.value, statusOptions),
      description: getTaskStatusTransitionDescription(task.status, nextStatus.value, statusOptions),
      changes: updates,
      beforeSnapshot: task,
      afterSnapshot: { ...task, ...updates },
    });

    // Task ricorrente completata → crea la prossima occorrenza
    if (isTaskDoneStatus(nextStatus.value, statusOptions) && task.is_recurring && task.recurrence_rule && task.due_date) {
      const base = parseISO(task.due_date);
      let nextDue: Date;
      switch (task.recurrence_rule) {
        case "daily":     nextDue = addDays(base, 1);    break;
        case "weekly":    nextDue = addWeeks(base, 1);   break;
        case "biweekly":  nextDue = addWeeks(base, 2);   break;
        case "monthly":   nextDue = addMonths(base, 1);  break;
        default:          nextDue = addWeeks(base, 1);
      }
      const endDate = task.recurrence_end_date ? parseISO(task.recurrence_end_date) : null;
      if (!endDate || nextDue <= endDate) {
        const { id: _id, created_at: _ca, updated_at: _ua, completed_at: _coa, ...rest } = task;
        const { error: insErr } = await supabase.from("tasks").insert({
          ...rest,
          status: "da_fare",
          due_date: format(nextDue, "yyyy-MM-dd"),
          parent_task_id: task.id,
          completed_at: null,
          creator_profile: undefined, // campo sintetico (non colonna): escludere o PostgREST rifiuta l'insert (PGRST204) e la ricorrenza si interrompe
          assigned_profile: undefined,
          order: undefined,
          stock_item: undefined,
          cost: undefined,
          contact: undefined,
          opportunity: undefined,
        } as any);
        if (insErr) toast.error("Errore creazione ricorrenza", { description: insErr.message });
      }
    }

    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    queryClient.invalidateQueries({ queryKey: ["my-task-count"] });
  };

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
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
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
                <span className="text-xs text-muted-foreground">{filteredTasks.length} attività visualizzate</span>
              </div>
              <div className="flex flex-wrap items-center gap-3">
              <div className="relative w-full sm:flex-1 sm:min-w-[200px] sm:max-w-xs">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Cerca attività..."
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={filterFonte} onValueChange={setFilterFonte}>
                <SelectTrigger className="w-full sm:w-[180px] h-9"><SelectValue placeholder="Fonte" /></SelectTrigger>
                <SelectContent>
                  {FONTE_OPTIONS.map((o) => (<SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-full sm:w-[140px] h-9"><SelectValue placeholder="Stato" /></SelectTrigger>
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
                <SelectTrigger className="w-full sm:w-[140px] h-9"><SelectValue placeholder="Priorità" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte</SelectItem>
                  <SelectItem value="bassa">Bassa</SelectItem>
                  <SelectItem value="normale">Normale</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-full sm:w-[140px] h-9"><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutte</SelectItem>
                  {Object.entries(ALL_CATEGORY_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {seesTeamTasks && (
                <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                  <SelectTrigger className="w-full sm:w-[160px] h-9"><SelectValue placeholder="Assegnatario" /></SelectTrigger>
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
              {/* Toggle view */}
              <div className="flex rounded-md border overflow-hidden sm:ml-auto">
                <button
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "p-2 transition-colors",
                    viewMode === "list" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                  title="Vista lista"
                >
                  <LayoutList className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("kanban")}
                  className={cn(
                    "p-2 transition-colors",
                    viewMode === "kanban" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                  title="Vista kanban"
                >
                  <Kanban className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("calendar")}
                  className={cn(
                    "p-2 transition-colors",
                    viewMode === "calendar" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                  title="Vista calendario"
                >
                  <CalendarDays className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("agenda")}
                  className={cn(
                    "p-2 transition-colors",
                    viewMode === "agenda" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                  title="Vista agenda"
                >
                  <CalendarRange className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setViewMode("stats")}
                  className={cn(
                    "p-2 transition-colors",
                    viewMode === "stats" ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                  title="Statistiche"
                >
                  <BarChart2 className="h-4 w-4" />
                </button>
              </div>
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
                  <h3 className="text-lg font-medium mb-1">Nessuna attività</h3>
                  <p className="text-muted-foreground mb-4">Crea la tua prima attività per iniziare</p>
                  <Button onClick={() => openNewTask({ assignedTo: user?.id ?? null })}>
                    <Plus className="h-4 w-4 mr-2" /> Nuova Attività
                  </Button>
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
                <BulkActionsBar selectedIds={selectedIds} onClear={() => setSelectedIds(new Set())} statusOptions={statusOptions} />
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
                            <TableHead>Titolo</TableHead>
                            <TableHead>Assegnatario</TableHead>
                            <TableHead>Collegamento</TableHead>
                            <TableHead>Categoria</TableHead>
                            <TableHead>Priorità</TableHead>
                            <TableHead>Scadenza</TableHead>
                            <TableHead>Stato</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          <SortableContext items={filteredTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                            {filteredTasks.map((task) => (
                              <SortableTaskRow
                                key={task.id}
                                task={task}
                                isSelected={selectedIds.has(task.id)}
                                onToggleSelect={() => toggleSelect(task.id)}
                                onSelect={() => setSelectedTask(task)}
                                onToggleComplete={() => handleToggleComplete(task)}
                                dragDisabled={isDragDisabled}
                                statusOptions={statusOptions}
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
