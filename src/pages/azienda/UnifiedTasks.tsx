import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, ListTodo, ExternalLink, CheckCircle2, Search, LayoutList, Kanban, CalendarDays, User } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/useDebounce";
import { TaskKanbanBoard } from "@/components/attivita/TaskKanbanBoard";
import { TaskCalendarView } from "@/components/attivita/TaskCalendarView";
import { TaskDetailPanel } from "@/components/attivita/TaskDetailPanel";
import { format, isAfter, isBefore, addHours, startOfWeek } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { TaskStatCards } from "@/components/tasks/TaskStatCards";
import { TaskDialog } from "@/components/tasks/TaskDialog";
import { BulkActionsBar } from "@/components/tasks/BulkActionsBar";
import { MyDayView } from "@/components/attivita/MyDayView";
import { TaskQuickAdd } from "@/components/attivita/TaskQuickAdd";
import { Link, useSearchParams } from "react-router-dom";
import { cn } from "@/lib/utils";

const PRIORITY_CONFIG: Record<string, { label: string; className: string }> = {
  bassa: { label: "Bassa", className: "bg-muted text-muted-foreground" },
  normale: { label: "Normale", className: "bg-primary/10 text-primary" },
  alta: { label: "Alta", className: "bg-warning/10 text-warning" },
  urgente: { label: "Urgente", className: "bg-destructive/10 text-destructive" },
};

const STATUS_LABELS: Record<string, string> = {
  da_fare: "Da fare",
  in_corso: "In corso",
  completata: "Completata",
};

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

export default function UnifiedTasks() {
  const { effectiveCompany, user } = useAuth() as any;
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialFonte = searchParams.get("fonte") || "all";

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState("active");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterFonte, setFilterFonte] = useState(initialFonte);
  const [filterAssignee, setFilterAssignee] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("myday");
  const [viewMode, setViewMode] = useState<"list" | "kanban" | "calendar">("list");
  const [searchText, setSearchText] = useState("");
  const [selectedTask, setSelectedTask] = useState<any>(null);
  const debouncedSearch = useDebounce(searchText, 300);

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
    queryKey: [...queryKeys.tasks.all, "unified", companyId],
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
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
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
  });

  // Extract unique assignees for filter
  const assignees = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    tasks.forEach((t) => {
      if (t.assigned_profile && t.assigned_to) {
        map.set(t.assigned_to, {
          id: t.assigned_to,
          name: `${t.assigned_profile.first_name} ${t.assigned_profile.last_name}`,
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [tasks]);

  const now = new Date();
  const in48h = addHours(now, 48);
  const weekStart = startOfWeek(now, { locale: it });

  const stats = useMemo(() => {
    const active = tasks.filter((t) => t.status !== "completata").length;
    const expiring = tasks.filter((t) => t.status !== "completata" && t.due_date && isAfter(new Date(t.due_date), now) && isBefore(new Date(t.due_date), in48h)).length;
    const overdue = tasks.filter((t) => t.status !== "completata" && t.due_date && isBefore(new Date(t.due_date), now)).length;
    const completedThisWeek = tasks.filter((t) => t.status === "completata" && t.completed_at && isAfter(new Date(t.completed_at), weekStart)).length;
    return { active, expiring, overdue, completedThisWeek };
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterStatus === "active" && t.status === "completata") return false;
      if (filterStatus !== "all" && filterStatus !== "active" && t.status !== filterStatus) return false;
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
  }, [tasks, filterStatus, filterPriority, filterCategory, filterFonte, filterAssignee, debouncedSearch]);

  const handleToggleComplete = async (task: any) => {
    const newStatus = task.status === "completata" ? "da_fare" : "completata";
    const { error } = await supabase
      .from("tasks")
      .update({
        status: newStatus,
        completed_at: newStatus === "completata" ? new Date().toISOString() : null,
      })
      .eq("id", task.id);
    if (error) {
      toast.error("Errore", { description: error.message });
    } else {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    }
  };

  const isOverdue = (task: any) => task.status !== "completata" && task.due_date && isBefore(new Date(task.due_date), now);

  const handleRefresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });

  const renderCorrelation = (task: any) => {
    if (task.order) {
      return (
        <Link to={`/azienda/ordini/${task.order_id}`} className="inline-flex items-center gap-1 text-primary hover:underline text-sm" onClick={(e) => e.stopPropagation()}>
          <ExternalLink className="h-3 w-3" />
          {task.order.order_code || task.order.description?.slice(0, 20)}
        </Link>
      );
    }
    if (task.contact) {
      return (
        <Link to={`/azienda/marketing/contatti/${task.contact_id}`} className="inline-flex items-center gap-1 text-primary hover:underline text-sm" onClick={(e) => e.stopPropagation()}>
          <ExternalLink className="h-3 w-3" />
          {task.contact.first_name} {task.contact.last_name}
        </Link>
      );
    }
    if (task.opportunity) {
      return (
        <Link to={`/azienda/marketing/opportunita`} className="inline-flex items-center gap-1 text-primary hover:underline text-sm" onClick={(e) => e.stopPropagation()}>
          <ExternalLink className="h-3 w-3" />
          {task.opportunity.name}
        </Link>
      );
    }
    if (task.stock_item) return <span className="text-sm text-muted-foreground">{task.stock_item.name}</span>;
    if (task.cost) return <span className="text-sm text-muted-foreground">{task.cost.name}</span>;
    return "—";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Attività</h1>
          <p className="text-muted-foreground">{stats.active} attività attive</p>
        </div>
        <Button onClick={() => { setEditingTask(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nuova Attività
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="myday">La mia giornata</TabsTrigger>
          <TabsTrigger value="all">Tutte le attività</TabsTrigger>
        </TabsList>

        <TabsContent value="myday">
          <MyDayView onNewTask={() => { setEditingTask(null); setDialogOpen(true); }} />
        </TabsContent>

        <TabsContent value="all">
          <div className="space-y-6">
            <TaskQuickAdd />
            <TaskStatCards {...stats} />

            <div className="flex flex-wrap items-center gap-3">
              <div className="relative flex-1 min-w-[200px] max-w-xs">
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
                  <SelectItem value="da_fare">Da fare</SelectItem>
                  <SelectItem value="in_corso">In corso</SelectItem>
                  <SelectItem value="completata">Completate</SelectItem>
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
              <Select value={filterAssignee} onValueChange={setFilterAssignee}>
                <SelectTrigger className="w-full sm:w-[160px] h-9"><SelectValue placeholder="Assegnatario" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tutti</SelectItem>
                  {assignees.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* Filtro rapido "Le mie" */}
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
                  <Button onClick={() => { setEditingTask(null); setDialogOpen(true); }}>
                    <Plus className="h-4 w-4 mr-2" /> Nuova Attività
                  </Button>
                </CardContent>
              </Card>
            ) : viewMode === "calendar" ? (
              <TaskCalendarView
                tasks={filteredTasks}
                onTaskSelect={(task) => setSelectedTask(task)}
                onNewTaskForDate={(date) => {
                  setEditingTask({ due_date: date.toISOString().slice(0, 10) });
                  setDialogOpen(true);
                }}
              />
            ) : viewMode === "kanban" ? (
              <TaskKanbanBoard
                tasks={filteredTasks}
                onTaskSelect={(task) => setSelectedTask(task)}
                onAddTaskToColumn={(status) => {
                  setEditingTask({ status });
                  setDialogOpen(true);
                }}
              />
            ) : (
              <>
                <BulkActionsBar selectedIds={selectedIds} onClear={() => setSelectedIds(new Set())} />
                <Card>
                  <Table>
                    <TableHeader>
                      <TableRow>
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
                      {filteredTasks.map((task) => (
                        <TableRow
                          key={task.id}
                          className={cn(
                            "cursor-pointer transition-colors",
                            isOverdue(task) && "bg-destructive/5",
                            task.status === "completata" && "opacity-60",
                            selectedIds.has(task.id) && "bg-primary/5"
                          )}
                          onClick={() => setSelectedTask(task)}
                        >
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <Checkbox checked={selectedIds.has(task.id)} onCheckedChange={() => toggleSelect(task.id)} />
                          </TableCell>
                          <TableCell className="font-medium">
                            <span className={task.status === "completata" ? "line-through" : ""}>{task.title}</span>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {task.assigned_profile ? `${task.assigned_profile.first_name} ${task.assigned_profile.last_name}` : "—"}
                          </TableCell>
                          <TableCell>{renderCorrelation(task)}</TableCell>
                          <TableCell>
                            <span className="text-xs text-muted-foreground">{ALL_CATEGORY_LABELS[task.category] || task.category}</span>
                          </TableCell>
                          <TableCell>
                            <Badge className={PRIORITY_CONFIG[task.priority]?.className || ""}>
                              {PRIORITY_CONFIG[task.priority]?.label || task.priority}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {task.due_date ? (
                              <span className={cn("text-sm", isOverdue(task) && "text-destructive font-medium")}>
                                {format(new Date(task.due_date), "dd/MM/yyyy")}
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell onClick={(e) => e.stopPropagation()}>
                            <button
                              className={cn(
                                "inline-flex items-center gap-1.5 text-sm rounded-md px-2 py-1 transition-colors",
                                task.status === "completata" ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:bg-muted"
                              )}
                              onClick={() => handleToggleComplete(task)}
                            >
                              <CheckCircle2 className={cn("h-4 w-4", task.status === "completata" && "text-primary")} />
                              {STATUS_LABELS[task.status] || task.status}
                            </button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
      />

      <TaskDetailPanel
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
      />
    </div>
  );
}
