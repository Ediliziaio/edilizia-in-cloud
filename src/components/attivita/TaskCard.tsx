import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { queryKeys } from "@/lib/queryKeys";
import { Checkbox } from "@/components/ui/checkbox";
import { ExternalLink, AlertTriangle, CalendarDays } from "lucide-react";
import { PrioritaBadge } from "./PrioritaBadge";
import { cn } from "@/lib/utils";
import { format, isToday, differenceInDays } from "date-fns";
import { it } from "date-fns/locale";
import { Link } from "react-router-dom";
import { toast } from "sonner";

interface TaskCardProps {
  task: any;
  onSelect: () => void;
}

export function TaskCard({ task, onSelect }: TaskCardProps) {
  const queryClient = useQueryClient();
  const isCompleted = task.status === "completata";
  const isOverdue = !isCompleted && task.due_date && new Date(task.due_date) < new Date();

  const toggleMutation = useMutation({
    mutationFn: async () => {
      const newStatus = isCompleted ? "da_fare" : "completata";
      const { error } = await supabase
        .from("tasks")
        .update({ status: newStatus, completed_at: newStatus === "completata" ? new Date().toISOString() : null })
        .eq("id", task.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
      queryClient.invalidateQueries({ queryKey: ["my-task-count"] });
      if (!isCompleted) toast.success("Attività completata");
    },
  });

  const scadenzaLabel = (() => {
    if (!task.due_date) return null;
    const d = new Date(task.due_date);
    if (isOverdue) {
      const giorni = differenceInDays(new Date(), d);
      return { text: `${giorni}g fa`, className: "text-destructive font-medium" };
    }
    if (isToday(d)) return { text: "Oggi", className: "text-primary font-medium" };
    return { text: format(d, "d MMM", { locale: it }), className: "text-muted-foreground" };
  })();

  const correlation = (() => {
    if (task.order) return { label: task.order.order_code || task.order.description?.slice(0, 20), to: `/azienda/ordini/${task.order_id}` };
    if (task.contact) return { label: `${task.contact.first_name} ${task.contact.last_name}`, to: `/azienda/marketing/contatti/${task.contact_id}` };
    if (task.opportunity) return { label: task.opportunity.name, to: `/azienda/marketing/opportunita` };
    if (task.stock_item) return { label: task.stock_item.name, to: null };
    if (task.cost) return { label: task.cost.name, to: null };
    return null;
  })();

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors hover:bg-muted/50",
        isOverdue && "border-destructive/30 bg-destructive/5",
        isCompleted && "opacity-60"
      )}
      onClick={onSelect}
    >
      <div className="mt-0.5" onClick={(e) => { e.stopPropagation(); toggleMutation.mutate(); }}>
        <Checkbox checked={isCompleted} />
      </div>
      <div className="flex-1 min-w-0 space-y-1">
        <p className={cn("text-sm font-medium truncate", isCompleted && "line-through text-muted-foreground")}>
          {task.title}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <PrioritaBadge priorita={task.priority} />
          {task.assigned_profile && (
            <span className="text-[11px] text-muted-foreground">
              {task.assigned_profile.first_name} {task.assigned_profile.last_name?.[0]}.
            </span>
          )}
          {scadenzaLabel && (
            <span className={cn("text-[11px] flex items-center gap-0.5", scadenzaLabel.className)}>
              {isOverdue && <AlertTriangle className="h-3 w-3" />}
              <CalendarDays className="h-3 w-3" />
              {scadenzaLabel.text}
            </span>
          )}
          {correlation && (
            correlation.to ? (
              <Link
                to={correlation.to}
                className="text-[11px] text-primary hover:underline flex items-center gap-0.5"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" />
                {correlation.label}
              </Link>
            ) : (
              <span className="text-[11px] text-muted-foreground">{correlation.label}</span>
            )
          )}
        </div>
      </div>
    </div>
  );
}
