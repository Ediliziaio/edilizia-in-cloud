import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, CheckSquare, CalendarDays, AlertTriangle, Lock, Building2, Wallet } from "lucide-react";
import { format, isPast, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { TaskDialog } from "./TaskDialog";

interface LinkedTasksProps {
  orderId?: string;
  stockItemId?: string;
  costId?: string;
  contactId?: string;
  opportunityId?: string;
  ticketId?: string;
  category: string;
  companyId?: string;
  /** Dentro un pannello che ha già la sua intestazione (es. sidebar contatto):
   *  niente Card/header propri, layout compatto senza doppio titolo. */
  embedded?: boolean;
}

// Il passo che deve chiudersi prima (flusso di lavoro commessa): serve il
// titolo, altrimenti "In attesa" non dice di CHI si sta aspettando.
const SELECT_TASK =
  "*, assigned:profiles!tasks_assigned_to_fkey(first_name, last_name), bloccata_da:tasks!tasks_bloccata_da_task_id_fkey(title), ufficio:company_uffici!tasks_ufficio_id_fkey(nome)";

const PRIORITY_COLORS: Record<string, string> = {
  bassa: "bg-muted text-muted-foreground",
  normale: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  alta: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  urgente: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function LinkedTasks({ orderId, stockItemId, costId, contactId, opportunityId, ticketId, category, companyId: propCompanyId, embedded }: LinkedTasksProps) {
  const { effectiveCompany } = useAuth();
  const companyId = propCompanyId || effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);

  const filterKey = orderId ? `order-${orderId}` : stockItemId ? `stock-${stockItemId}` : costId ? `cost-${costId}` : contactId ? `contact-${contactId}` : opportunityId ? `opp-${opportunityId}` : ticketId ? `ticket-${ticketId}` : "none";

  const { data: tasks = [] } = useQuery({
    queryKey: queryKeys.tasks.linked(filterKey),
    queryFn: async () => {
      if (!companyId) return [];

      if (contactId) {
        // Load tasks for this contact + tasks linked to any opportunity of this contact
        const [contactRes, oppsRes] = await Promise.all([
          supabase
            .from("tasks")
            .select(SELECT_TASK)
            .eq("company_id", companyId)
            .eq("contact_id", contactId)
            .order("created_at", { ascending: false }),
          supabase
            .from("marketing_opportunities")
            .select("id")
            .eq("contact_id", contactId)
            .eq("company_id", companyId),
        ]);
        if (contactRes.error) throw contactRes.error;
        const oppIds = (oppsRes.data || []).map((o: any) => o.id);
        let oppTasks: any[] = [];
        if (oppIds.length > 0) {
          const { data, error } = await supabase
            .from("tasks")
            .select(SELECT_TASK)
            .eq("company_id", companyId)
            .in("opportunity_id", oppIds)
            .order("created_at", { ascending: false });
          if (error) throw error;
          oppTasks = data || [];
        }
        // Merge and deduplicate
        const allTasks = [...(contactRes.data || []), ...oppTasks];
        const seen = new Set<string>();
        return allTasks.filter((t) => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
      }

      if (opportunityId) {
        // Load tasks for this opportunity + generic tasks of the linked contact
        const oppRes = await supabase
          .from("tasks")
          .select(SELECT_TASK)
          .eq("company_id", companyId)
          .eq("opportunity_id", opportunityId)
          .order("created_at", { ascending: false });
        if (oppRes.error) throw oppRes.error;

        // Find the contact_id from the opportunity
        const { data: opp } = await supabase
          .from("marketing_opportunities")
          .select("contact_id")
          .eq("id", opportunityId)
          .maybeSingle();

        let contactTasks: any[] = [];
        if (opp?.contact_id) {
          const { data, error } = await supabase
            .from("tasks")
            .select(SELECT_TASK)
            .eq("company_id", companyId)
            .eq("contact_id", opp.contact_id)
            .is("opportunity_id", null)
            .order("created_at", { ascending: false });
          if (error) throw error;
          contactTasks = data || [];
        }
        const allTasks = [...(oppRes.data || []), ...contactTasks];
        const seen = new Set<string>();
        return allTasks.filter((t) => { if (seen.has(t.id)) return false; seen.add(t.id); return true; });
      }

      let query = supabase
        .from("tasks")
        .select(SELECT_TASK)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (orderId) query = query.eq("order_id", orderId);
      else if (stockItemId) query = query.eq("stock_item_id", stockItemId);
      else if (costId) query = query.eq("cost_id", costId);
      else if (ticketId) query = query.eq("ticket_id", ticketId);
      else return [];

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && !!(orderId || stockItemId || costId || contactId || opportunityId || ticketId),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      if (!companyId) throw new Error("Missing company_id");
      const { error } = await supabase
        .from("tasks")
        .update({
          status: completed ? "completata" : "da_fare",
          completed_at: completed ? new Date().toISOString() : null,
        })
        .eq("id", id)
        .eq("company_id", companyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    },
  });

  const activeTasks = tasks.filter((t: any) => t.status !== "completata");

  // Ordine di lettura del flusso: prima quello che si puo' fare, poi quello che
  // aspetta il proprio turno, in fondo il chiuso.
  const tasksOrdinate = [...tasks].sort((a: any, b: any) => {
    const peso = (t: any) => (t.status === "completata" ? 2 : t.status === "in_attesa" ? 1 : 0);
    return peso(a) - peso(b);
  });

  const handleAddTask = () => {
    setEditingTask(null);
    setDialogOpen(true);
  };

  const handleEditTask = (task: any) => {
    setEditingTask({
      id: task.id,
      title: task.title,
      notes: task.notes,
      status: task.status,
      priority: task.priority,
      due_date: task.due_date,
      assigned_to: task.assigned_to,
      order_id: task.order_id,
      stock_item_id: task.stock_item_id,
      cost_id: task.cost_id,
      contact_id: task.contact_id,
      opportunity_id: task.opportunity_id,
      ticket_id: task.ticket_id,
      category: task.category,
    });
    setDialogOpen(true);
  };

  const getDefaultTask = () => ({
    title: "",
    notes: "",
    status: "da_fare",
    priority: "normale",
    due_date: null as string | null,
    assigned_to: null as string | null,
    order_id: orderId || null,
    stock_item_id: stockItemId || null,
    cost_id: costId || null,
    contact_id: contactId || null,
    opportunity_id: opportunityId || null,
    ticket_id: ticketId || null,
    category,
  });

  const taskList = (
    tasks.length === 0 ? (
      <p className={`text-muted-foreground text-center ${embedded ? "text-[11px] py-2" : "text-sm py-3"}`}>
        Nessuna attività collegata
      </p>
    ) : (
      <div className={embedded ? "space-y-1" : "space-y-2"}>
        {tasksOrdinate.map((task: any) => {
          const isCompleted = task.status === "completata";
          // Passo del flusso non ancora sbloccato: esiste, ma tocca a qualcun
          // altro prima. Si sblocca da solo (trigger DB sblocca_task_a_catena),
          // quindi qui la spunta va disattivata: chiuderla a mano salterebbe
          // il passaggio di consegne.
          const isBlocked = task.status === "in_attesa";
          const isOverdue = task.due_date && !isCompleted && isPast(parseISO(task.due_date));

          return (
            <div
              key={task.id}
              className={`flex items-start gap-2 rounded-md hover:bg-muted/50 cursor-pointer group ${embedded ? "p-1.5" : "p-2"} ${isBlocked ? "opacity-70" : ""}`}
              onClick={() => handleEditTask(task)}
            >
              {isBlocked ? (
                <div className="mt-0.5" title="Parte da sola quando si chiude il passo precedente">
                  <Lock className="h-4 w-4 text-violet-500" />
                </div>
              ) : (
                <div
                  className="mt-0.5"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleMutation.mutate({ id: task.id, completed: !isCompleted });
                  }}
                >
                  <Checkbox checked={isCompleted} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className={`font-medium truncate ${embedded ? "text-xs" : "text-sm"} ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
                  {task.title}
                </p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <Badge className={`text-[10px] px-1.5 py-0 ${PRIORITY_COLORS[task.priority] || ""}`}>
                    {task.priority}
                  </Badge>
                  {/* L'ufficio viene prima della persona: e' lui a rispondere
                      del passo, la persona e' chi ci sta mettendo le mani. */}
                  {task.ufficio?.nome && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5">
                      <Building2 className="h-2.5 w-2.5" /> {task.ufficio.nome}
                    </Badge>
                  )}
                  {task.assigned?.first_name && (
                    <span className="text-[11px] text-muted-foreground">
                      {task.assigned.first_name} {task.assigned.last_name?.[0]}.
                    </span>
                  )}
                  {/* Nessuno deve chiedersi perché questa non la fa nessuno:
                      si chiude da sola quando arriva l'incasso. */}
                  {task.chiudi_su_evento === "incasso_registrato" && !isCompleted && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 gap-0.5 border-emerald-200 text-emerald-700">
                      <Wallet className="h-2.5 w-2.5" /> si chiude all'incasso
                    </Badge>
                  )}
                  {isBlocked && (
                    <span className="text-[11px] text-violet-600">
                      {task.bloccata_da?.title ? `dopo: ${task.bloccata_da.title}` : "in attesa"}
                    </span>
                  )}
                  {task.due_date && (
                    <span className={`text-[11px] flex items-center gap-0.5 ${isOverdue ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                      {isOverdue && <AlertTriangle className="h-3 w-3" />}
                      <CalendarDays className="h-3 w-3" />
                      {format(parseISO(task.due_date), "dd/MM")}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    )
  );

  return (
    <>
      {embedded ? (
        // Nessuna Card/header propri: il pannello contenitore ha già il titolo.
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground flex items-center gap-1">
              <CheckSquare className="h-3.5 w-3.5" /> Attività
              {activeTasks.length > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{activeTasks.length}</Badge>}
            </span>
            <Button variant="ghost" size="sm" onClick={handleAddTask} className="h-6 text-[10px] text-primary px-1.5">
              <Plus className="h-3 w-3 mr-0.5" /> Nuova
            </Button>
          </div>
          {taskList}
        </div>
      ) : (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
            <CardTitle className="text-base flex items-center gap-2 min-w-0">
              <CheckSquare className="h-4 w-4 shrink-0" />
              <span className="truncate">Attività</span>
              {activeTasks.length > 0 && (
                <Badge variant="secondary" className="ml-1 text-xs shrink-0">{activeTasks.length}</Badge>
              )}
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={handleAddTask} className="shrink-0">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline ml-1">Aggiungi</span>
            </Button>
          </CardHeader>
          <CardContent className="pt-0">{taskList}</CardContent>
        </Card>
      )}

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask || (dialogOpen ? getDefaultTask() : null)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
        }}
        defaultCategory={category}
        defaultOrderId={orderId}
        defaultStockItemId={stockItemId}
        defaultCostId={costId}
        defaultContactId={contactId}
        defaultOpportunityId={opportunityId}
        defaultTicketId={ticketId}
      />
    </>
  );
}
