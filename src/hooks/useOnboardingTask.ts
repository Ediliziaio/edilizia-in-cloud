import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface OnboardingTask {
  id: string;
  company_id: string;
  template_id: string | null;
  titolo: string;
  descrizione: string | null;
  stato: "da_fare" | "in_corso" | "completato" | "saltato";
  assegnato_a_nome: string | null;
  scadenza: string | null;
  completato_at: string | null;
  note: string | null;
  created_at: string;
}

export interface OnboardingTemplate {
  id: string;
  ordine: number;
  titolo: string;
  descrizione: string | null;
  giorni_da_iscrizione: number;
  assegna_a_ruolo: string | null;
  attivo: boolean;
}

export function useOnboardingTask(companyId: string | undefined) {
  const queryClient = useQueryClient();

  const {
    data: tasks,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["onboarding-tasks", companyId],
    queryFn: async (): Promise<OnboardingTask[]> => {
      if (!companyId) return [];
      const { data, error } = await supabase
        // Tipi generati da aggiornare dopo la pubblicazione della migrazione CS.
        .from("onboarding_task" as never)
        .select(
          "id, company_id, template_id, titolo, descrizione, stato, assegnato_a_nome, scadenza, completato_at, note, created_at",
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as OnboardingTask[];
    },
    enabled: !!companyId,
  });

  const aggiornaStato = useMutation({
    mutationFn: async ({
      taskId,
      stato,
      note,
    }: {
      taskId: string;
      stato: OnboardingTask["stato"];
      note?: string;
    }) => {
      if (!companyId) throw new Error("Azienda non selezionata");
      const update: Record<string, unknown> = {
        stato,
        completato_at: stato === "completato" ? new Date().toISOString() : null,
      };
      if (note !== undefined) update.note = note;
      const { error } = await supabase
        .from("onboarding_task" as never)
        .update(update as never)
        .eq("id", taskId)
        .eq("company_id", companyId)
        .select("id")
        .single();
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Task aggiornato");
      queryClient.invalidateQueries({
        queryKey: ["onboarding-tasks", companyId],
      });
    },
    onError: (err: Error) =>
      toast.error("Errore aggiornamento task", { description: err.message }),
  });

  const creaTask = useMutation({
    mutationFn: async (payload: {
      titolo: string;
      descrizione?: string;
      scadenza?: string;
      assegnato_a_nome?: string;
    }) => {
      if (!companyId) throw new Error("companyId mancante");
      const { error } = await supabase.from("onboarding_task" as never).insert({
        company_id: companyId,
        titolo: payload.titolo.trim(),
        descrizione: payload.descrizione ?? null,
        scadenza: payload.scadenza ?? null,
        assegnato_a_nome: payload.assegnato_a_nome ?? null,
      } as never);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Task creato");
      queryClient.invalidateQueries({
        queryKey: ["onboarding-tasks", companyId],
      });
    },
    onError: (err: Error) =>
      toast.error("Errore creazione task", { description: err.message }),
  });

  const completionePct = tasks
    ? Math.round(
        (tasks.filter((t) => t.stato === "completato").length /
          Math.max(tasks.length, 1)) *
          100,
      )
    : 0;

  // isError/error esposti: senza, un fetch fallito (es. tabella onboarding_task
  // non ancora migrata in prod) appariva come "nessun task" — dato falso.
  return {
    tasks: tasks ?? [],
    isLoading,
    isError,
    error,
    aggiornaStato,
    creaTask,
    completionePct,
  };
}
