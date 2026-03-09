import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Plus, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { toast } from "sonner";

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
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("open");
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newCompanyId, setNewCompanyId] = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newDueDate, setNewDueDate] = useState("");

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["cs-tasks", filterStatus],
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
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["cs-companies-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  const createTask = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("cs_tasks" as never)
        .insert({
          company_id: newCompanyId,
          title: newTitle,
          description: newDesc || null,
          priority: newPriority,
          due_date: newDueDate || null,
          created_by: user!.id,
          assigned_to: user!.id,
        } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cs-tasks"] });
      setNewTitle("");
      setNewDesc("");
      setNewCompanyId("");
      setNewDueDate("");
      setShowNew(false);
      toast.success("Task CS creato");
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
      queryClient.invalidateQueries({ queryKey: ["cs-tasks"] });
      toast.success("Task aggiornato");
    },
  });

  const companyMap = new Map(companies.map((c) => [c.id, c.name]));

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
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
                  Crea Task
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <p className="text-center text-muted-foreground py-8">Caricamento...</p>
          ) : tasks.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nessun task trovato</p>
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
                    <TableCell className="text-sm text-muted-foreground">
                      {task.due_date ? format(new Date(task.due_date), "dd/MM/yy") : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(task.created_at), "dd/MM", { locale: it })}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {task.status === "open" && (
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => updateStatus.mutate({ id: task.id, status: "in_progress" })}>
                            Inizia
                          </Button>
                        )}
                        {task.status === "in_progress" && (
                          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => updateStatus.mutate({ id: task.id, status: "completed" })}>
                            Completa
                          </Button>
                        )}
                        {task.status === "completed" && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => updateStatus.mutate({ id: task.id, status: "open" })}>
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
