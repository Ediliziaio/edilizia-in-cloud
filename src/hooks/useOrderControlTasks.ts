import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import {
  orderControlTasksToAutoComplete,
  orderControlsToCreate,
  resolveOrderControls,
  type OrderControlCheck,
  type OrderControlTask,
} from "@/lib/orders/controlWorkflow";

const isoDateAfterDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString("en-CA");
};

export function useOrderControlTasks(orderId: string, checks: OrderControlCheck[]) {
  const { user, effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const queryClient = useQueryClient();
  const lastAutoCloseSignature = useRef("");
  const taskTitles = useMemo(() => checks.map((check) => `Controllo commessa · ${check.taskLabel}`), [checks]);

  const tasksQuery = useQuery({
    queryKey: ["order-control-tasks", orderId],
    enabled: Boolean(companyId && orderId && taskTitles.length),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id, title, status, due_date")
        .eq("company_id", companyId!)
        .eq("order_id", orderId)
        .in("title", taskTitles);
      if (error) throw error;
      return (data ?? []) as OrderControlTask[];
    },
  });

  const controls = useMemo(
    () => resolveOrderControls(checks, tasksQuery.data ?? []),
    [checks, tasksQuery.data],
  );
  const controlsToCreate = useMemo(() => orderControlsToCreate(controls), [controls]);

  const invalidateTasks = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["order-control-tasks", orderId] });
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks.linked(`order-${orderId}`) });
    queryClient.invalidateQueries({ queryKey: ["order-next-task", orderId] });
  }, [orderId, queryClient]);

  const createMissingMutation = useMutation({
    scope: { id: `order-control-tasks-${orderId}` },
    mutationFn: async () => {
      if (!companyId || !user?.id) throw new Error("Sessione non disponibile");
      if (controlsToCreate.length === 0) return 0;

      // Lettura fresca dentro la mutazione + esecuzione seriale: anche un
      // doppio clic molto rapido non può duplicare lo stesso controllo.
      const { data: existing, error: existingError } = await supabase
        .from("tasks")
        .select("title")
        .eq("company_id", companyId)
        .eq("order_id", orderId)
        .in("title", controlsToCreate.map((control) => control.taskTitle));
      if (existingError) throw existingError;
      const existingTitles = new Set((existing ?? []).map((task) => task.title.trim().toLowerCase()));
      const trulyMissing = controlsToCreate.filter(
        (control) => !existingTitles.has(control.taskTitle.toLowerCase()),
      );
      if (trulyMissing.length === 0) return 0;

      const { error } = await supabase.from("tasks").insert(
        trulyMissing.map((control) => ({
          company_id: companyId,
          order_id: orderId,
          title: control.taskTitle,
          notes: "Controllo economico della commessa. Completa il dato indicato: quando il sistema lo rileva, questa attività viene chiusa automaticamente.",
          status: "da_fare",
          priority: control.priority,
          due_date: isoDateAfterDays(3),
          assigned_to: user.id,
          created_by: user.id,
          category: "costi",
        })),
      );
      if (error) throw error;
      return trulyMissing.length;
    },
    onSuccess: (created) => {
      if (created > 0) {
        toast.success(`${created} ${created === 1 ? "attività creata" : "attività create"}`, {
          description: "Assegnate a te, con scadenza tra 3 giorni.",
        });
      }
      invalidateTasks();
    },
    onError: (error) => {
      toast.error("Non riesco a creare le attività", {
        description: error instanceof Error ? error.message : "Riprova tra poco.",
      });
    },
  });

  // Il dato reale è la fonte di verità: appena il controllo diventa verde,
  // l'attività operativa corrispondente si chiude senza una seconda spunta.
  useEffect(() => {
    const ids = orderControlTasksToAutoComplete(controls).sort();
    const signature = ids.join(",");
    if (!signature || signature === lastAutoCloseSignature.current || !companyId) return;
    lastAutoCloseSignature.current = signature;

    void supabase
      .from("tasks")
      .update({ status: "completata", completed_at: new Date().toISOString() })
      .eq("company_id", companyId)
      .in("id", ids)
      .then(({ error }) => {
        if (error) {
          lastAutoCloseSignature.current = "";
          return;
        }
        invalidateTasks();
      });
  }, [companyId, controls, invalidateTasks]);

  return {
    controls,
    controlsToCreate,
    isLoading: tasksQuery.isLoading,
    isError: tasksQuery.isError,
    createMissing: () => createMissingMutation.mutate(),
    isCreating: createMissingMutation.isPending,
  };
}
