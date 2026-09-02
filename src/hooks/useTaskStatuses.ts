/**
 * Stati delle attività: sono un vocabolario dell'AZIENDA, non una preferenza
 * del browser.
 *
 * Fino al 2026-09-02 vivevano solo in localStorage: chi creava uno stato era
 * l'unico a vederlo, cambiando computer spariva e il backend non ne sapeva
 * nulla. Ora stanno in `company_task_statuses`; il localStorage resta come
 * scorta locale, e la prima volta che si apre la pagina gli stati salvati sul
 * vecchio computer vengono portati su nel database (una sola volta, senza
 * sovrascrivere quelli già condivisi).
 *
 * L'interfaccia del hook non cambia: chi lo usava continua a leggere
 * `statuses` e a chiamare `saveStatuses` / `resetStatuses`.
 */
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  TASK_STATUS_STORAGE_EVENT,
  type TaskStatusDefinition,
  loadStoredTaskStatuses,
  mergeTaskStatusDefinitions,
  normalizeTaskStatusDefinition,
  resetStoredTaskStatuses,
  saveStoredTaskStatuses,
} from "@/lib/taskStatuses";

interface RigaStato {
  value: string;
  label: string;
  stage: string | null;
  tone: string | null;
  order_index: number | null;
  locked: boolean | null;
}

function daRiga(r: RigaStato, index: number): TaskStatusDefinition {
  return normalizeTaskStatusDefinition(
    {
      value: r.value,
      label: r.label,
      stage: (r.stage ?? undefined) as TaskStatusDefinition["stage"],
      tone: (r.tone ?? undefined) as TaskStatusDefinition["tone"],
      order: r.order_index ?? undefined,
      locked: r.locked ?? undefined,
    },
    index,
  );
}

export function useTaskStatuses(companyId?: string | null, observedStatuses: string[] = []) {
  const queryClient = useQueryClient();
  const chiave = ["company-task-statuses", companyId ?? null];
  const migrazioneFatta = useRef(false);

  const { data: customStatuses = [] } = useQuery<TaskStatusDefinition[]>({
    queryKey: chiave,
    enabled: !!companyId,
    // Il vocabolario cambia di rado: non ha senso richiederlo a ogni montaggio.
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("company_task_statuses")
        .select("value, label, stage, tone, order_index, locked")
        .eq("company_id", companyId!)
        .order("order_index", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as RigaStato[]).map(daRiga);
    },
  });

  const scriviSulDb = useCallback(
    async (statuses: TaskStatusDefinition[]) => {
      if (!companyId) return;
      const righe = statuses
        .filter((s) => s.value && s.label)
        .map((s, index) => ({
          company_id: companyId,
          value: s.value,
          label: s.label,
          stage: s.stage,
          tone: s.tone,
          order_index: (index + 1) * 10,
          locked: !!s.locked,
        }));

      // Sostituzione completa: quello che l'utente vede nel dialogo è la lista
      // definitiva, comprese le righe tolte.
      const { error: errDelete } = await supabase
        .from("company_task_statuses")
        .delete()
        .eq("company_id", companyId)
        .not("value", "in", `(${righe.map((r) => r.value).join(",") || "''"})`);
      if (errDelete) throw errDelete;

      if (righe.length > 0) {
        const { error } = await supabase
          .from("company_task_statuses")
          .upsert(righe, { onConflict: "company_id,value" });
        if (error) throw error;
      }
    },
    [companyId],
  );

  const salva = useMutation({
    mutationFn: scriviSulDb,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chiave }),
    onError: (e: Error) =>
      toast.error("Stati non salvati per tutti", {
        description: `${e.message}. Restano attivi su questo computer.`,
      }),
  });

  // Migrazione una tantum: gli stati rimasti nel localStorage salgono nel DB.
  useEffect(() => {
    if (!companyId || migrazioneFatta.current) return;
    const locali = loadStoredTaskStatuses(companyId);
    if (locali.length === 0 || customStatuses.length > 0) return;
    migrazioneFatta.current = true;
    void scriviSulDb(locali)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: chiave });
        toast.success("Stati attività condivisi con il team", {
          description: "Erano salvati solo su questo computer: ora li vedono tutti.",
        });
      })
      .catch(() => { /* niente permessi o rete: restano locali, nessun rumore */ });
  }, [companyId, customStatuses.length, scriviSulDb, queryClient, chiave]);

  // Un collega cambia il vocabolario da un'altra scheda: ricarichiamo.
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const ricarica = () => queryClient.invalidateQueries({ queryKey: chiave });
    window.addEventListener(TASK_STATUS_STORAGE_EVENT, ricarica);
    return () => window.removeEventListener(TASK_STATUS_STORAGE_EVENT, ricarica);
  }, [queryClient, chiave]);

  const statuses = useMemo(
    () => mergeTaskStatusDefinitions({ customStatuses, observedStatuses }),
    [customStatuses, observedStatuses],
  );

  const saveStatuses = useCallback(
    (nextStatuses: TaskStatusDefinition[]) => {
      // Scorta locale: se il salvataggio condiviso fallisce l'utente non perde il lavoro.
      saveStoredTaskStatuses(companyId, nextStatuses);
      salva.mutate(nextStatuses);
    },
    [companyId, salva],
  );

  const resetStatuses = useCallback(() => {
    resetStoredTaskStatuses(companyId);
    salva.mutate([]);
  }, [companyId, salva]);

  return { statuses, customStatuses, saveStatuses, resetStatuses };
}
