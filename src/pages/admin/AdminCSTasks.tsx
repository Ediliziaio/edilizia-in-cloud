import { useCallback, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { queryKeys } from "@/lib/queryKeys";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, CheckCircle, Clock, AlertCircle, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSuperAdminPermissions } from "@/hooks/useSuperAdminPermissions";
import { AccessDenied } from "@/components/admin/AccessDenied";

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

export default function AdminCSTasks() {
  const { user } = useAuth();
  const { permissions } = useSuperAdminPermissions();
  const queryClient = useQueryClient();
  const isMobile = useIsMobile();
  const canManageTasks = permissions.can_manage_companies || permissions.can_manage_tickets;
  const [showNew, setShowNew] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("open");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCompanyId, setNewCompanyId] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newDueDate, setNewDueDate] = useState("");

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

  const createTask = useMutation({
    mutationFn: async () => {
      const title = newTitle.trim();
      const description = newDesc.trim();
      if (!user?.id) throw new Error("Sessione admin non disponibile. Ricarica la pagina e riprova.");
      if (!newCompanyId) throw new Error("Seleziona un'azienda.");
      if (!title) throw new Error("Inserisci un titolo per il task.");

      const { error } = await supabase
        .from("cs_tasks" as never)
        .insert({
          company_id: newCompanyId,
          title,
          description: description || null,
          task_type: "manual",
          priority: newPriority,
          due_date: newDueDate || null,
          created_by: user.id,
          assigned_to: user.id,
        } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.csTasks.all });
      setNewTitle("");
      setNewDesc("");
      setNewCompanyId("");
      setNewPriority("medium");
      setNewDueDate("");
      setShowNew(false);
      toast.success("Task CS creato");
    },
    onError: (error) => {
      toast.error(error.message || "Impossibile creare il task CS");
    },
  });

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
    onError: (error) => {
      toast.error(error.message || "Impossibile aggiornare il task");
    },
  });

  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const todayKey = new Date().toISOString().slice(0, 10);
  const isOverdue = useCallback((task: CSTask) =>
    task.status !== "completed" && !!task.due_date && task.due_date.slice(0, 10) < todayKey,
  [todayKey]);

  const taskStats = useMemo(() => {
    const open = tasks.filter((task) => task.status === "open").length;
    const inProgress = tasks.filter((task) => task.status === "in_progress").length;
    const urgent = tasks.filter((task) => task.priority === "high" && task.status !== "completed").length;
    const overdue = tasks.filter(isOverdue).length;
    return { open, inProgress, urgent, overdue };
  }, [tasks, isOverdue]);

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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="hidden md:block">
          <h1 className="text-2xl font-bold">CS Tasks</h1>
          <p className="text-muted-foreground">Attività Customer Success per le aziende</p>
        </div>
        <div className="flex gap-2">
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutti</SelectItem>
              <SelectItem value="open">Aperti</SelectItem>
              <SelectItem value="in_progress">In Corso</SelectItem>
              <SelectItem value="completed">Completati</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={showNew} onOpenChange={setShowNew}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" /> Nuovo Task</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Nuovo Task CS</DialogTitle></DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Azienda</Label>
                  <Select value={newCompanyId} onValueChange={setNewCompanyId}>
                    <SelectTrigger><SelectValue placeholder="Seleziona azienda" /></SelectTrigger>
                    <SelectContent>
                      {companies.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Titolo</Label>
                  <Input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Es: Follow-up onboarding" />
                </div>
                <div>
                  <Label>Descrizione</Label>
                  <Textarea value={newDesc} onChange={(e) => setNewDesc(e.target.value)} placeholder="Dettagli opzionali" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Priorità</Label>
                    <Select value={newPriority} onValueChange={setNewPriority}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Bassa</SelectItem>
                        <SelectItem value="medium">Media</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Scadenza</Label>
                    <Input type="date" value={newDueDate} onChange={(e) => setNewDueDate(e.target.value)} />
                  </div>
                </div>
                <Button onClick={() => createTask.mutate()} disabled={!newTitle.trim() || !newCompanyId || createTask.isPending} className="w-full">
                  {createTask.isPending ? "Creazione..." : "Crea Task"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Aperti</p>
            <p className="text-2xl font-semibold">{taskStats.open}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">In lavorazione</p>
            <p className="text-2xl font-semibold">{taskStats.inProgress}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Alta priorità</p>
            <p className="text-2xl font-semibold">{taskStats.urgent}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Scaduti</p>
            <p className={`text-2xl font-semibold ${taskStats.overdue > 0 ? "text-destructive" : ""}`}>
              {taskStats.overdue}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <Table>
              <TableBody>
                {[1, 2, 3, 4, 5].map((i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-14 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                    <TableCell><Skeleton className="h-7 w-16 rounded" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
                <Plus className="h-4 w-4 mr-2" />
                Nuovo Task
              </Button>
            </div>
          ) : isMobile ? (
            <div className="divide-y">
              {tasks.map((task) => (
                <div key={task.id} className="p-3 space-y-2">
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5">{statusIcon(task.status)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{task.title}</p>
                      {task.description && <p className="text-xs text-muted-foreground truncate">{task.description}</p>}
                    </div>
                    {priorityBadge(task.priority)}
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground pl-6">
                    <span>{companyMap.get(task.company_id) || "—"}</span>
                    <span className={isOverdue(task) ? "text-destructive font-medium" : ""}>
                      {task.due_date ? format(new Date(task.due_date), "dd/MM/yy") : ""}
                    </span>
                  </div>
                  {isOverdue(task) && (
                    <div className="pl-6">
                      <Badge variant="destructive" className="text-xs">Scaduto</Badge>
                    </div>
                  )}
                  <div className="pl-6">
                    {task.status === "open" && (
                      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: task.id, status: "in_progress" })}>Inizia</Button>
                    )}
                    {task.status === "in_progress" && (
                      <Button variant="outline" size="sm" className="h-7 text-xs" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: task.id, status: "completed" })}>Completa</Button>
                    )}
                    {task.status === "completed" && (
                      <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: task.id, status: "open" })}>Riapri</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Titolo</TableHead>
                  <TableHead>Azienda</TableHead>
                  <TableHead>Priorità</TableHead>
                  <TableHead>Scadenza</TableHead>
                  <TableHead>Creato</TableHead>
                  <TableHead>Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tasks.map((task) => (
                  <TableRow key={task.id}>
                    <TableCell>{statusIcon(task.status)}</TableCell>
                    <TableCell>
                      <div>
                        <p className="font-medium">{task.title}</p>
                        {task.description && <p className="text-xs text-muted-foreground truncate max-w-[250px]">{task.description}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{companyMap.get(task.company_id) || "—"}</TableCell>
                    <TableCell>{priorityBadge(task.priority)}</TableCell>
                    <TableCell className={`text-sm ${isOverdue(task) ? "text-destructive font-medium" : "text-muted-foreground"}`}>
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
                            Inizia
                          </Button>
                        )}
                        {task.status === "in_progress" && (
                          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: task.id, status: "completed" })}>
                            Completa
                          </Button>
                        )}
                        {task.status === "completed" && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={updateStatus.isPending} onClick={() => updateStatus.mutate({ id: task.id, status: "open" })}>
                            Riapri
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
