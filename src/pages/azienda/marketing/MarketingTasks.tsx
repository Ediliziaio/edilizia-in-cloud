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
import { Plus, ListTodo, ExternalLink, CheckCircle2 } from "lucide-react";
import { format, isAfter, isBefore, addHours, startOfWeek } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { TaskStatCards } from "@/components/tasks/TaskStatCards";
import { TaskDialog } from "@/components/tasks/TaskDialog";
import { BulkActionsBar } from "@/components/tasks/BulkActionsBar";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

const MARKETING_CATEGORIES = ["marketing", "contatti", "opportunita"];

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

const CATEGORY_LABELS: Record<string, string> = {
  marketing: "Marketing",
  contatti: "Contatti",
  opportunita: "Opportunità",
};

export default function MarketingTasks() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);
  const [filterStatus, setFilterStatus] = useState("active");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
    queryKey: queryKeys.tasks.marketing(companyId),
    queryFn: async () => {
      if (!companyId) return [];
      const { data, error } = await supabase
        .from("tasks")
        .select(`
          *,
          assigned_profile:profiles!tasks_assigned_to_fkey(first_name, last_name),
          contact:marketing_contacts!tasks_contact_id_fkey(first_name, last_name),
          opportunity:marketing_opportunities!tasks_opportunity_id_fkey(name, value)
        `)
        .eq("company_id", companyId)
        .in("category", MARKETING_CATEGORIES)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId,
    staleTime: 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  const now = new Date();
  const in48h = addHours(now, 48);
  const weekStart = startOfWeek(now, { locale: it });

  const stats = useMemo(() => {
    return tasks.reduce(
      (acc, t) => {
        if (t.status === "completata") {
          if (t.completed_at && isAfter(new Date(t.completed_at), weekStart)) acc.completedThisWeek++;
          return acc;
        }
        acc.active++;
        if (t.due_date) {
          const due = new Date(t.due_date);
          if (isBefore(due, now)) acc.overdue++;
          else if (isAfter(due, now) && isBefore(due, in48h)) acc.expiring++;
        }
        return acc;
      },
      { active: 0, expiring: 0, overdue: 0, completedThisWeek: 0 }
    );
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (filterStatus === "active" && t.status === "completata") return false;
      if (filterStatus !== "all" && filterStatus !== "active" && t.status !== filterStatus) return false;
      if (filterPriority !== "all" && t.priority !== filterPriority) return false;
      if (filterCategory !== "all" && t.category !== filterCategory) return false;
      return true;
    });
  }, [tasks, filterStatus, filterPriority, filterCategory]);

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
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    }
  };

  const isOverdue = (task: any) => task.status !== "completata" && task.due_date && isBefore(new Date(task.due_date), now);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Attività Marketing</h1>
          <p className="text-muted-foreground">{stats.active} attività attive</p>
        </div>
        <Button onClick={() => { setEditingTask(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Nuova Attività
        </Button>
      </div>

      <TaskStatCards {...stats} />

      <div className="flex flex-wrap gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Stato" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte</SelectItem>
            <SelectItem value="active">Attive</SelectItem>
            <SelectItem value="da_fare">Da fare</SelectItem>
            <SelectItem value="in_corso">In corso</SelectItem>
            <SelectItem value="completata">Completate</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Priorità" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte</SelectItem>
            <SelectItem value="bassa">Bassa</SelectItem>
            <SelectItem value="normale">Normale</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
            <SelectItem value="urgente">Urgente</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterCategory} onValueChange={setFilterCategory}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte</SelectItem>
            <SelectItem value="marketing">Marketing</SelectItem>
            <SelectItem value="contatti">Contatti</SelectItem>
            <SelectItem value="opportunita">Opportunità</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">Caricamento...</CardContent></Card>
      ) : filteredTasks.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <ListTodo className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-1">Nessuna attività</h3>
            <p className="text-muted-foreground mb-4">Crea la tua prima attività marketing</p>
            <Button onClick={() => { setEditingTask(null); setDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Nuova Attività
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <BulkActionsBar selectedIds={selectedIds} onClear={() => setSelectedIds(new Set())} />
          <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={filteredTasks.length > 0 && selectedIds.size === filteredTasks.length}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>Titolo</TableHead>
                <TableHead>Assegnatario</TableHead>
                <TableHead>Contatto</TableHead>
                <TableHead>Opportunità</TableHead>
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
                  onClick={() => { setEditingTask(task); setDialogOpen(true); }}
                >
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selectedIds.has(task.id)}
                      onCheckedChange={() => toggleSelect(task.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className={task.status === "completata" ? "line-through" : ""}>{task.title}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {task.assigned_profile
                      ? `${task.assigned_profile.first_name} ${task.assigned_profile.last_name}`
                      : "—"}
                  </TableCell>
                  <TableCell>
                    {task.contact ? (
                      <Link
                        to={`/azienda/marketing/contatti/${task.contact_id}`}
                        className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink className="h-3 w-3" />
                        {task.contact.first_name} {task.contact.last_name || ""}
                      </Link>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    {task.opportunity ? (
                      <span className="text-sm text-muted-foreground">
                        {task.opportunity.name}
                      </span>
                    ) : "—"}
                  </TableCell>
                  <TableCell>
                    <span className="text-xs text-muted-foreground">{CATEGORY_LABELS[task.category] || task.category}</span>
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
                        task.status === "completata"
                          ? "text-primary hover:bg-primary/10"
                          : "text-muted-foreground hover:bg-muted"
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

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ["tasks"] })}
        defaultCategory="marketing"
      />
    </div>
  );
}
