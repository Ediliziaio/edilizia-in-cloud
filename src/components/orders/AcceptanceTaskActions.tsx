import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { queryKeys } from "@/lib/queryKeys";
import { toast } from "sonner";
import type { AcceptanceAction } from "../../../supabase/functions/collaudo-commessa/model";
import { useT } from "@/lib/campo/lingua/LinguaCampo";

export interface AcceptanceTask {
  id: string;
  title: string;
  status: string;
  due_date: string | null;
  acceptance_action_index: number | null;
}
interface Props {
  reportId: string;
  companyId: string;
  orderId: string;
  actions: AcceptanceAction[];
  canCreate: boolean;
  onOpenTasks?: () => void;
}
const states: Record<string, string> = {
  da_fare: "Da fare",
  in_corso: "In corso",
  in_attesa: "In attesa",
  completata: "Completata",
};
const day = (value: string | null, vuoto = "Da definire") =>
  value?.match(/^\d{4}-\d{2}-\d{2}$/)
    ? value.split("-").reverse().join("/")
    : vuoto;

export function AcceptanceTaskActions({
  reportId,
  companyId,
  orderId,
  actions,
  canCreate,
  onOpenTasks,
}: Props) {
  const tr = useT();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const query = useQuery({
    queryKey: ["tasks", "acceptance", companyId, orderId, reportId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tasks")
        .select("id,title,status,due_date,acceptance_action_index")
        .eq("company_id", companyId)
        .eq("order_id", orderId)
        .eq("acceptance_report_id", reportId)
        .order("acceptance_action_index");
      if (error) throw error;
      return (data ?? []) as AcceptanceTask[];
    },
    enabled: actions.length > 0,
  });
  const tasks = query.data ?? [];
  const byIndex = new Map(tasks.map((t) => [t.acceptance_action_index, t]));
  const missing = actions.filter((_, i) => !byIndex.has(i)).length;
  const completed = tasks.filter((t) => t.status === "completata").length;
  const create = async () => {
    if (submitting.current || !canCreate || query.isError || query.isLoading)
      return;
    submitting.current = true;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("create_acceptance_tasks", {
        p_report_id: reportId,
      });
      if (error) throw error;
      if (typeof data !== "number" || !Number.isInteger(data) || data < 0)
        throw new Error(
          tr("Risposta non valida: aggiorna le attività prima di riprovare."),
        );
      toast.success(
        data > 0
          ? tr(data === 1 ? "{n} attività creata" : "{n} attività create", { n: data })
          : tr("Nessuna duplicazione: le attività risultano già collegate."),
        {
          description:
            data > 0
              ? tr("Assegnate a te per il coordinamento. Referenti e scadenze sono riportati dal verbale.")
              : undefined,
        },
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.tasks.all }),
        qc.invalidateQueries({ queryKey: ["order-next-task", orderId] }),
      ]);
    } catch (e) {
      toast.error(tr("Non riesco a creare le attività"), {
        description:
          e instanceof Error
            ? e.message
            : ((e as { message?: string })?.message ?? tr("Riprova.")),
      });
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  };
  if (!actions.length) return null;
  return (
    <section
      aria-label={tr("Attività dalle riserve")}
      className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{tr("Da fare dopo la verifica")}</h3>
        {!query.isLoading && !query.isError && (
          <Badge variant="outline">
            {tr("{fatte}/{totale} completate", { fatte: completed, totale: actions.length })}
          </Badge>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        {tr("Trasforma gli interventi del verbale in attività della commessa. Assegnate a te per seguirne la chiusura; il referente indicato nel verbale rimane riportato nelle note.")}
      </p>
      {query.isLoading ? (
        <p role="status" className="text-sm">
          {tr("Controllo le attività già collegate…")}
        </p>
      ) : query.isError ? (
        <div role="alert" className="text-sm">
          {tr("Non riesco a verificare le attività esistenti.")}{" "}
          <Button size="sm" variant="outline" onClick={() => query.refetch()}>
            {tr("Riprova")}
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {actions.map((action, i) => {
            const task = byIndex.get(i);
            return (
              <li key={i} className="rounded-lg border bg-white p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 break-words font-medium">
                    {task?.title ?? action.work}
                  </p>
                  <Badge variant="outline">
                    {task
                      ? (states[task.status] ? tr(states[task.status]) : task.status)
                      : tr("Non collegata o non visibile")}
                  </Badge>
                </div>
                <p className="mt-1 text-muted-foreground">
                  {tr("Referente nel verbale: {nome}", { nome: action.owner })}
                </p>
                <p className="text-muted-foreground">
                  {tr("Scadenza: {data}", { data: day(task ? task.due_date : action.due, tr("Da definire")) })}
                  {task && task.due_date !== action.due
                    ? ` · ${tr("Nel verbale: {data}", { data: day(action.due, tr("Da definire")) })}`
                    : ""}
                </p>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {canCreate && (
          <Button
            disabled={busy || query.isLoading || query.isError || missing === 0}
            onClick={create}
          >
            {busy
              ? tr("Creazione in corso…")
              : missing === 0
                ? tr("Attività già collegate")
                : tr("Crea attività per me")}
          </Button>
        )}
        {onOpenTasks && (
          <Button variant="outline" onClick={onOpenTasks} disabled={busy}>
            {tr("Apri attività della commessa")}
          </Button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {tr("Le attività già create, anche completate, non vengono duplicate o riassegnate. La loro chiusura non modifica questo verbale e non vale come accettazione del cliente.")}
      </p>
    </section>
  );
}
