import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { HrTask, TaskPriorita, TaskStato } from "@/types/hr";
import { toast } from "sonner";

/** Task/obiettivi di un singolo dipendente. */
export function useHrTask(profiloId: string | null | undefined) {
  return useQuery({
    queryKey: ["hr-task", profiloId],
    enabled: !!profiloId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_task")
        .select("*")
        .eq("profilo_id", profiloId!)
        .order("scadenza", { ascending: true, nullsFirst: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as HrTask[];
    },
    staleTime: 60 * 1000,
  });
}

export interface TaskInput {
  titolo: string;
  descrizione?: string | null;
  priorita?: TaskPriorita;
  scadenza?: string | null;
  order_id?: string | null;
}

/** Create/update/delete/toggle stato dei task di una persona. */
export function useHrTaskMutations(profiloId: string, companyId: string) {
  const qc = useQueryClient();
  const invalidate = () => qc.invalidateQueries({ queryKey: ["hr-task", profiloId] });

  const create = useMutation({
    mutationFn: async (input: TaskInput) => {
      const titolo = input.titolo?.trim();
      if (!titolo) throw new Error("Il titolo del task è obbligatorio");
      const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
      const { error } = await supabase.from("hr_task").insert({
        company_id: companyId,
        profilo_id: profiloId,
        titolo,
        descrizione: input.descrizione?.trim() || null,
        priorita: input.priorita ?? "media",
        scadenza: input.scadenza || null,
        order_id: input.order_id || null,
        created_by: uid,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Task aggiunto");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore creazione task"),
  });

  const setStato = useMutation({
    mutationFn: async ({ id, stato }: { id: string; stato: TaskStato }) => {
      const { error } = await supabase
        .from("hr_task")
        .update({
          stato,
          completed_at: stato === "fatto" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        } as any)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore aggiornamento stato"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("hr_task").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Task eliminato");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Errore eliminazione task"),
  });

  return { create, setStato, remove };
}
