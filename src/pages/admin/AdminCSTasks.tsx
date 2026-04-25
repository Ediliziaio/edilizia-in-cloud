import { Fragment, useCallback, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, CheckCircle, Clock, AlertCircle, RefreshCw, Search, X, Play, Undo2,
  ExternalLink, Users2, Flag, CalendarClock, Trash2, ArrowRight,
} from "lucide-react";
import { format, startOfDay, addDays, isToday, isTomorrow, isPast } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Link } from "react-router-dom";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";
import { NewTaskDialog, getTaskTypeConfig } from "@/components/admin/tasks/NewTaskDialog";

interface CSTask {
  id: string;
  company_id: string;
  assigned_to: string | null;
  title: string;
  description: string | null;
  task_type: string;
  priority: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  created_at: string;
}

type DateRangePreset = "all" | "overdue" | "today" | "tomorrow" | "week" | "nodate";
type GroupBy = "none" | "company" | "priority" | "duedate";

export default function AdminCSTasks() {
  const { permissions } = useSuperAdminPermissions();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const canManageTasks = permissions.can_manage_companies || permissions.can_manage_tickets;

  // Filters
  const [showNew, setShowNew] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("open");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [filterDate, setFilterDate] = useState<DateRangePreset>("all");
  const [filterCompany, setFilterCompany] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [groupBy, setGroupBy] = useState<GroupBy>("none");

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // ─── Queries ──────────────────────────────────────────────

  const { data: tasks = [], isLoading, isError, refetch } = useQuery({
    queryKey: queryKeys.csTasks.list(filterStatus),
    queryFn: async () => {
      let query = supabase
        .from("cs_tasks" as never)
        .select("*")
        .order("created_at", { ascending: false });
      if (filterStatus !== "all") {
        query = query.eq("status", filterStatus as never);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as unknown as CSTask[];
    },
    enabled: canManageTasks,
    staleTime: 2 * 60 * 1000,
  });

  const { data: companies = [] } = useQuery({
    queryKey: queryKeys.csTasks.companies,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .eq("is_platform_admin_company", false)
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: canManageTasks,
    staleTime: 5 * 60 * 1000,
  });

  // ─── Mutations ────────────────────────────────────────────

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (status === "completed") updates.completed_at = new Date().toISOString();
      const { error } = await supabase
        .from("cs_tasks" as never)
        .update(updates as never)
        .eq("id", id as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.csTasks.all });
      toast.success("Task aggiornato");
    },
    onError: (error) => toast.error(error.message || "Impossibile aggiornare"),
  });

  // Bulk: update status per N task in una volta
  const bulkUpdateStatus = useMutation({
    mutationFn: async ({ ids, status }: { ids: string[]; status: string }) => {
      const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() };
      if (status === "completed") updates.completed_at = new Date().toISOString();
      const { error } = await supabase
        .from("cs_tasks" as never)
        .update(updates as never)
        .in("id" as never, ids as never);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.csTasks.all });
      toast.success(`${n} task aggiornati`);
      setSelected(new Set());
    },
    onError: (error) => toast.error(error.message || "Errore bulk"),
  });

  const bulkUpdatePriority = useMutation({
    mutationFn: async ({ ids, priority }: { ids: string[]; priority: string }) => {
      const { error } = await supabase
        .from("cs_tasks" as never)
        .update({ priority, updated_at: new Date().toISOString() } as never)
        .in("id" as never, ids as never);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.csTasks.all });
      toast.success(`Priorità aggiornata su ${n} task`);
      setSelected(new Set());
    },
    onError: (error) => toast.error(error.message || "Errore bulk"),
  });

  const bulkDelete = useMutation({
    mutationFn: async (ids: string[]) => {
      const { error } = await supabase
        .from("cs_tasks" as never)
        .delete()
        .in("id" as never, ids as never);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (n) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.csTasks.all });
      toast.success(`${n} task eliminati`);
      setSelected(new Set());
    },
    onError: (error) => toast.error(error.message || "Errore eliminazione"),
  });

  // ─── Helpers ──────────────────────────────────────────────

  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const todayKey = new Date().toISOString().slice(0, 10);
  const isOverdue = useCallback((task: CSTask) =>
    task.status !== "completed" && !!task.due_date && task.due_date.slice(0, 10) < todayKey,
  [todayKey]);

  // Multi-filter client-side: search, priority, date range, company
  const visibleTasks = useMemo(() => {
    const q = search.trim().toLowerCase();
    const start = startOfDay(new Date());
    const endWeek = addDays(start, 7);
    return tasks.filter((t) => {
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterCompany !== "all" && t.company_id !== filterCompany) return false;
      // Date range
      if (filterDate === "overdue" && !isOverdue(t)) return false;
      if (filterDate === "today" && (!t.due_date || !isToday(new Date(t.due_date)))) return false;
      if (filterDate === "tomorrow" && (!t.due_date || !isTomorrow(new Date(t.due_date)))) return false;
      if (filterDate === "week") {
        if (!t.due_date) return false;
        const d = new Date(t.due_date);
        if (d < start || d > endWeek) return false;
      }
      if (filterDate === "nodate" && t.due_date) return false;
      // Text search
      if (q) {
        const hay = `${t.title} ${t.description ?? ""} ${companyMap.get(t.company_id) ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tasks, filterPriority, filterCompany, filterDate, search, companyMap, isOverdue]);

  const taskStats = useMemo(() => {
    const open = tasks.filter((t) => t.status === "open").length;
    const inProgress = tasks.filter((t) => t.status === "in_progress").length;
    const urgent = tasks.filter((t) => t.priority === "high" && t.status !== "completed").length;
    const overdue = tasks.filter(isOverdue).length;
    const dueToday = tasks.filter((t) => t.due_date && isToday(new Date(t.due_date)) && t.status !== "completed").length;
    const unassigned = tasks.filter((t) => !t.assigned_to && t.status !== "completed").length;
    return { open, inProgress, urgent, overdue, dueToday, unassigned };
  }, [tasks, isOverdue]);

  // Group tasks by selected key
  const groupedTasks = useMemo(() => {
    if (groupBy === "none") return [{ key: "", label: "", tasks: visibleTasks }];
    const groups = new Map<string, CSTask[]>();
    for (const t of visibleTasks) {
      let key = "";
      if (groupBy === "company") key = companyMap.get(t.company_id) ?? "—";
      else if (groupBy === "priority") key = t.priority ?? "medium";
      else if (groupBy === "duedate") {
        if (!t.due_date) key = "Senza scadenza";
        else if (isToday(new Date(t.due_date))) key = "Oggi";
        else if (isTomorrow(new Date(t.due_date))) key = "Domani";
        else if (isPast(new Date(t.due_date)) && t.status !== "completed") key = "Scaduti";
        else key = format(new Date(t.due_date), "EEEE dd MMM", { locale: it });
      }
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(t);
    }
    return Array.from(groups.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, tasks]) => ({ key, label: key, tasks }));
  }, [visibleTasks, groupBy, companyMap]);

  // Selection helpers
  const allVisibleSelected = visibleTasks.length > 0 && visibleTasks.every(t => selected.has(t.id));
  const someSelected = visibleTasks.some(t => selected.has(t.id)) && !allVisibleSelected;
  const hasActiveFilters = filterPriority !== "all" || filterCompany !== "all"
    || filterDate !== "all" || search.trim() !== "";

  const toggleAll = () => {
    const next = new Set(selected);
    if (allVisibleSelected) visibleTasks.forEach(t => next.delete(t.id));
    else visibleTasks.forEach(t => next.add(t.id));
    setSelected(next);
  };
  const toggleOne = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  // UI helpers
  const priorityBadge = (p: string) => {
    if (p === "high") return <Badge variant="destructive" className="text-xs">Alta</Badge>;
    if (p === "low") return <Badge variant="outline" className="text-xs">Bassa</Badge>;
    return <Badge variant="secondary" className="text-xs">Media</Badge>;
  };
  const statusIcon = (s: string) => {
    if (s === "completed") return <CheckCircle className="h-4 w-4 text-green-600" />;
    if (s === "in_progress") return <Clock className="h-4 w-4 text-amber-600" />;
    return <AlertCircle className="h-4 w-4 text-blue-600" />;
  };

  if (!canManageTasks) return <AccessDenied />;

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="hidden md:block">
          <h1 className="text-2xl font-bold">Task</h1>
          <p className="text-muted-foreground text-sm">
            Tutte le attività del team — follow-up, supporto, vendita, onboarding, billing
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-2" /> Nuovo Task
          </Button>
        </div>
      </div>
      <NewTaskDialog open={showNew} onOpenChange={setShowNew} />

      {/* KPI — 6 card cliccabili come filtri rapidi */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="Aperti"
          value={taskStats.open}
          icon={<AlertCircle className="h-4 w-4" />}
          accent="bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
          active={filterStatus === "open"}
          onClick={() => setFilterStatus(filterStatus === "open" ? "all" : "open")}
        />
        <KpiCard
          label="In lavorazione"
          value={taskStats.inProgress}
          icon={<Clock className="h-4 w-4" />}
          accent="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
          active={filterStatus === "in_progress"}
          onClick={() => setFilterStatus(filterStatus === "in_progress" ? "all" : "in_progress")}
        />
        <KpiCard
          label="Alta priorità"
          value={taskStats.urgent}
          icon={<Flag className="h-4 w-4" />}
          accent={filterPriority === "high"
            ? "bg-rose-200 text-rose-800 dark:bg-rose-900 dark:text-rose-200"
            : "bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300"}
          active={filterPriority === "high"}
          onClick={() => setFilterPriority(filterPriority === "high" ? "all" : "high")}
        />
        <KpiCard
          label="In scadenza oggi"
          value={taskStats.dueToday}
          icon={<CalendarClock className="h-4 w-4" />}
          accent="bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300"
          active={filterDate === "today"}
          onClick={() => setFilterDate(filterDate === "today" ? "all" : "today")}
        />
        <KpiCard
          label="Scaduti"
          value={taskStats.overdue}
          icon={<AlertCircle className="h-4 w-4" />}
          accent={taskStats.overdue > 0
            ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
            : "bg-muted text-muted-foreground"}
          active={filterDate === "overdue"}
          onClick={() => setFilterDate(filterDate === "overdue" ? "all" : "overdue")}
        />
        <KpiCard
          label="Senza responsabile"
          value={taskStats.unassigned}
          icon={<Users2 className="h-4 w-4" />}
          accent="bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300"
        />
      </div>

      {/* Filters toolbar */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Cerca titolo, descrizione, azienda…"
              className="pl-9 h-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearch("")}
                aria-label="Pulisci ricerca"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti gli stati</SelectItem>
              <SelectItem value="open">Aperti</SelectItem>
              <SelectItem value="in_progress">In Corso</SelectItem>
              <SelectItem value="completed">Completati</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterPriority} onValueChange={setFilterPriority}>
            <SelectTrigger className="w-[140px] h-9"><SelectValue placeholder="Priorità" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Ogni priorità</SelectItem>
              <SelectItem value="high">🔴 Alta</SelectItem>
              <SelectItem value="medium">🟡 Media</SelectItem>
              <SelectItem value="low">⚪️ Bassa</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterDate} onValueChange={(v) => setFilterDate(v as DateRangePreset)}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder="Scadenza" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Ogni scadenza</SelectItem>
              <SelectItem value="overdue">Scaduti</SelectItem>
              <SelectItem value="today">Oggi</SelectItem>
              <SelectItem value="tomorrow">Domani</SelectItem>
              <SelectItem value="week">Entro 7 giorni</SelectItem>
              <SelectItem value="nodate">Senza scadenza</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterCompany} onValueChange={setFilterCompany}>
            <SelectTrigger className="w-[180px] h-9"><SelectValue placeholder="Azienda" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte le aziende</SelectItem>
              {companies.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Raggruppa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nessun raggruppamento</SelectItem>
              <SelectItem value="company">Per azienda</SelectItem>
              <SelectItem value="priority">Per priorità</SelectItem>
              <SelectItem value="duedate">Per scadenza</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="h-9 text-xs" onClick={() => {
              setFilterPriority("all"); setFilterCompany("all"); setFilterDate("all"); setSearch("");
            }}>
              <X className="h-3.5 w-3.5 mr-1" /> Reset filtri
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {visibleTasks.length === tasks.length
              ? `${tasks.length} task`
              : `${visibleTasks.length}/${tasks.length} task`}
          </span>
        </div>

        {/* Bulk action bar */}
        {selected.size > 0 && (
          <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 gap-2 flex-wrap">
            <span className="text-sm font-medium">
              {selected.size} task selezionat{selected.size === 1 ? "o" : "i"}
            </span>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => bulkUpdateStatus.mutate({ ids: Array.from(selected), status: "in_progress" })} disabled={bulkUpdateStatus.isPending}>
                <Play className="h-3 w-3 mr-1" /> Avvia
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkUpdateStatus.mutate({ ids: Array.from(selected), status: "completed" })} disabled={bulkUpdateStatus.isPending}>
                <CheckCircle className="h-3 w-3 mr-1" /> Completa
              </Button>
              <Button size="sm" variant="outline" onClick={() => bulkUpdateStatus.mutate({ ids: Array.from(selected), status: "open" })} disabled={bulkUpdateStatus.isPending}>
                <Undo2 className="h-3 w-3 mr-1" /> Riapri
              </Button>
              <Select onValueChange={(v) => bulkUpdatePriority.mutate({ ids: Array.from(selected), priority: v })}>
                <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Priorità…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">🔴 Alta</SelectItem>
                  <SelectItem value="medium">🟡 Media</SelectItem>
                  <SelectItem value="low">⚪️ Bassa</SelectItem>
                </SelectContent>
              </Select>
              <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => bulkDelete.mutate(Array.from(selected))} disabled={bulkDelete.isPending}>
                <Trash2 className="h-3 w-3 mr-1" /> Elimina
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                Deseleziona
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : isError ? (
            <div className="text-center py-10 space-y-2">
              <AlertCircle className="h-8 w-8 mx-auto text-destructive" />
              <p className="text-muted-foreground text-sm">Errore nel caricamento dei task.</p>
              <button onClick={() => refetch()} className="text-primary text-sm underline inline-flex items-center gap-1">
                <RefreshCw className="h-3 w-3" /> Riprova
              </button>
            </div>
          ) : tasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <CheckCircle className="h-9 w-9 text-muted-foreground" />
              <div>
                <p className="font-medium">Nessun task trovato</p>
                <p className="text-sm text-muted-foreground">Crea un follow-up CS o cambia filtro.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setShowNew(true)}>
                <Plus className="h-4 w-4 mr-2" /> Nuovo Task
              </Button>
            </div>
          ) : visibleTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Nessun task corrisponde ai filtri.</p>
              <Button variant="outline" size="sm" onClick={() => {
                setFilterPriority("all"); setFilterCompany("all"); setFilterDate("all"); setSearch("");
              }}>
                Reset filtri
              </Button>
            </div>
          ) : isMobile ? (
            <div className="divide-y">
              {groupedTasks.map((group) => (
                <div key={group.key}>
                  {group.label && (
                    <div className="px-3 py-2 bg-muted/30 text-xs font-medium text-muted-foreground">
                      {group.label} · {group.tasks.length}
                    </div>
                  )}
                  {group.tasks.map((task) => (
                    <MobileRow
                      key={task.id}
                      task={task}
                      selected={selected.has(task.id)}
                      onToggleSelect={() => toggleOne(task.id)}
                      companyName={companyMap.get(task.company_id) ?? "—"}
                      statusIcon={statusIcon(task.status)}
                      priorityBadge={priorityBadge(task.priority)}
                      isOverdue={isOverdue(task)}
                      updating={updateStatus.isPending}
                      onStatus={(s) => updateStatus.mutate({ id: task.id, status: s })}
                    />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allVisibleSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={toggleAll}
                    />
                  </TableHead>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Titolo</TableHead>
                  <TableHead className="w-24">Tipo</TableHead>
                  <TableHead>Azienda</TableHead>
                  <TableHead>Priorità</TableHead>
                  <TableHead>Scadenza</TableHead>
                  <TableHead>Creato</TableHead>
                  <TableHead className="w-24">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {groupedTasks.map((group) => (
                  <Fragment key={`group-${group.key || "_default"}`}>
                    {group.label && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={8} className="py-2 text-xs font-medium text-muted-foreground">
                          {group.label} · {group.tasks.length}
                        </TableCell>
                      </TableRow>
                    )}
                    {group.tasks.map((task) => (
                      <TableRow
                        key={task.id}
                        className={cn(
                          selected.has(task.id) && "bg-muted/40",
                          isOverdue(task) && "bg-red-50/30 dark:bg-red-950/10",
                        )}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selected.has(task.id)}
                            onCheckedChange={() => toggleOne(task.id)}
                          />
                        </TableCell>
                        <TableCell>{statusIcon(task.status)}</TableCell>
                        <TableCell>
                          <div>
                            <p className="font-medium">{task.title}</p>
                            {task.description && <p className="text-xs text-muted-foreground truncate max-w-[260px]">{task.description}</p>}
                          </div>
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const cfg = getTaskTypeConfig(task.task_type);
                            const Icon = cfg.icon;
                            return (
                              <span
                                className={cn(
                                  "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium",
                                  cfg.tone
                                )}
                                title={cfg.label}
                              >
                                <Icon className="h-3 w-3" />
                                <span className="hidden lg:inline">{cfg.label}</span>
                              </span>
                            );
                          })()}
                        </TableCell>
                        <TableCell className="text-sm">
                          <Link
                            to={`/admin/aziende/${task.company_id}`}
                            className="inline-flex items-center gap-1 text-primary hover:underline"
                            title="Apri scheda azienda"
                          >
                            {companyMap.get(task.company_id) ?? "—"}
                            <ExternalLink className="h-3 w-3 opacity-60" />
                          </Link>
                        </TableCell>
                        <TableCell>{priorityBadge(task.priority)}</TableCell>
                        <TableCell className={cn(
                          "text-sm",
                          isOverdue(task) ? "text-destructive font-medium" : "text-muted-foreground",
                        )}>
                          <div className="flex items-center gap-2">
                            <span>{task.due_date ? format(new Date(task.due_date), "dd/MM/yy") : "—"}</span>
                            {isOverdue(task) && <Badge variant="destructive" className="text-[10px]">Scaduto</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {format(new Date(task.created_at), "dd/MM", { locale: it })}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {task.status === "open" && (
                              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: task.id, status: "in_progress" })}>
                                <Play className="h-3 w-3 mr-1" /> Inizia
                              </Button>
                            )}
                            {task.status === "in_progress" && (
                              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: task.id, status: "completed" })}>
                                <CheckCircle className="h-3 w-3 mr-1" /> Completa
                              </Button>
                            )}
                            {task.status === "completed" && (
                              <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: task.id, status: "open" })}>
                                <Undo2 className="h-3 w-3 mr-1" /> Riapri
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// Subcomponents
// ============================================================================

function KpiCard({
  label, value, icon, accent, active, onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Card
      className={cn(
        "transition-all",
        onClick && "cursor-pointer hover:shadow-md",
        active && "ring-2 ring-primary/50",
      )}
      onClick={onClick}
    >
      <CardContent className="p-3 flex items-start gap-2.5">
        <div className={cn("p-1.5 rounded-lg shrink-0", accent)}>{icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{label}</p>
          <p className="text-xl font-bold leading-tight mt-0.5">{value}</p>
          {active && <p className="text-[10px] text-primary mt-0.5">Filtro attivo</p>}
        </div>
      </CardContent>
    </Card>
  );
}

function MobileRow({
  task, selected, onToggleSelect, companyName, statusIcon, priorityBadge,
  isOverdue: overdue, updating, onStatus,
}: {
  task: CSTask;
  selected: boolean;
  onToggleSelect: () => void;
  companyName: string;
  statusIcon: React.ReactNode;
  priorityBadge: React.ReactNode;
  isOverdue: boolean;
  updating: boolean;
  onStatus: (s: string) => void;
}) {
  return (
    <div className={cn("p-3 space-y-2", selected && "bg-muted/40", overdue && "bg-red-50/30 dark:bg-red-950/10")}>
      <div className="flex items-start gap-2">
        <Checkbox checked={selected} onCheckedChange={onToggleSelect} />
        <span className="mt-0.5">{statusIcon}</span>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm">{task.title}</p>
          {task.description && <p className="text-xs text-muted-foreground truncate">{task.description}</p>}
        </div>
        {priorityBadge}
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground pl-10">
        <Link to={`/admin/aziende/${task.company_id}`} className="text-primary hover:underline">
          {companyName}
        </Link>
        <span className={overdue ? "text-destructive font-medium" : ""}>
          {task.due_date ? format(new Date(task.due_date), "dd/MM/yy") : ""}
        </span>
      </div>
      {overdue && (
        <div className="pl-10">
          <Badge variant="destructive" className="text-xs">Scaduto</Badge>
        </div>
      )}
      <div className="pl-10 flex gap-1">
        {task.status === "open" && (
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={updating} onClick={() => onStatus("in_progress")}>
            <Play className="h-3 w-3 mr-1" /> Inizia
          </Button>
        )}
        {task.status === "in_progress" && (
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={updating} onClick={() => onStatus("completed")}>
            <ArrowRight className="h-3 w-3 mr-1" /> Completa
          </Button>
        )}
        {task.status === "completed" && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={updating} onClick={() => onStatus("open")}>
            Riapri
          </Button>
        )}
      </div>
    </div>
  );
}
