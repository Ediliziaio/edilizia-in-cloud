import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Plus, CheckSquare, CalendarDays, AlertTriangle } from "lucide-react";
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
  category: string;
  companyId?: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  bassa: "bg-muted text-muted-foreground",
  normale: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  alta: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
  urgente: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
};

export function LinkedTasks({ orderId, stockItemId, costId, category, companyId: propCompanyId }: LinkedTasksProps) {
  const { effectiveCompany } = useAuth();
  const companyId = propCompanyId || effectiveCompany?.id;
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<any>(null);

  const filterKey = orderId ? `order-${orderId}` : stockItemId ? `stock-${stockItemId}` : costId ? `cost-${costId}` : "none";

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", "linked", filterKey],
    queryFn: async () => {
      if (!companyId) return [];
      let query = supabase
        .from("tasks")
        .select("*, assigned:profiles!tasks_assigned_to_fkey(first_name, last_name)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (orderId) query = query.eq("order_id", orderId);
      else if (stockItemId) query = query.eq("stock_item_id", stockItemId);
      else if (costId) query = query.eq("cost_id", costId);
      else return [];

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: !!companyId && !!(orderId || stockItemId || costId),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      const { error } = await supabase
        .from("tasks")
        .update({
          status: completed ? "completata" : "da_fare",
          completed_at: completed ? new Date().toISOString() : null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
  });

  const activeTasks = tasks.filter((t: any) => t.status !== "completata");

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
      category: task.category,
    });
    setDialogOpen(true);
  };

  const getDefaultTask = () => ({
    title: "",
    notes: "",
    status: "da_fare",
    priority: "normale",
    due_date: null,
    assigned_to: null,
    order_id: orderId || null,
    stock_item_id: stockItemId || null,
    cost_id: costId || null,
    category,
  });

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckSquare className="h-4 w-4" />
            Attività
            {activeTasks.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-xs">{activeTasks.length}</Badge>
            )}
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={handleAddTask}>
            <Plus className="h-4 w-4 mr-1" />
            Aggiungi
          </Button>
        </CardHeader>
        <CardContent className="pt-0">
          {tasks.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-3">
              Nessuna attività collegata
            </p>
          ) : (
            <div className="space-y-2">
              {tasks.map((task: any) => {
                const isCompleted = task.status === "completata";
                const isOverdue = task.due_date && !isCompleted && isPast(parseISO(task.due_date));

                return (
                  <div
                    key={task.id}
                    className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 cursor-pointer group"
                    onClick={() => handleEditTask(task)}
                  >
                    <div
                      className="mt-0.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleMutation.mutate({ id: task.id, completed: !isCompleted });
                      }}
                    >
                      <Checkbox checked={isCompleted} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isCompleted ? "line-through text-muted-foreground" : ""}`}>
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <Badge className={`text-[10px] px-1.5 py-0 ${PRIORITY_COLORS[task.priority] || ""}`}>
                          {task.priority}
                        </Badge>
                        {task.assigned?.first_name && (
                          <span className="text-[11px] text-muted-foreground">
                            {task.assigned.first_name} {task.assigned.last_name?.[0]}.
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
          )}
        </CardContent>
      </Card>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask || (dialogOpen ? getDefaultTask() : null)}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["tasks"] });
        }}
        defaultCategory={category}
        defaultOrderId={orderId}
        defaultStockItemId={stockItemId}
        defaultCostId={costId}
      />
    </>
  );
}
