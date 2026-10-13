// src/hooks/useSottofasi.ts
import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";
import { messaggioErrore, SOTTOFASI_NELLA_FASE, sottofasiDalleFasi, sottofasiPerFase, type Sottofase } from "@/lib/orders/sottofasi";

// La tabella non è ancora nei tipi generati: cast localizzato, come useOrderWorkPhases.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/** Le sottofasi di una commessa e i comandi per cambiarle. */
export function useSottofasi(orderId: string | null | undefined) {
  const qc = useQueryClient();
  // Cambiare una sottofase cambia la fase (e la commessa): si aggiorna tutto il giro.
  const aggiorna = () => refreshWorkQueries(qc, orderId);
  const onError = (e: unknown) => toast.error(messaggioErrore(e));

  const query = useQuery({
    queryKey: ["order_work_subphases", orderId],
    enabled: !!orderId,
    staleTime: 30_000,
    queryFn: async (): Promise<Sottofase[]> => {
      // Le sottofasi non hanno la commessa: si parte dalle fasi della commessa.
      const { data, error } = await db
        .from("order_work_phases")
        .select(`id, ${SOTTOFASI_NELLA_FASE}`)
        .eq("order_id", orderId!);
      if (error) throw error;
      return sottofasiDalleFasi(data as Record<string, unknown>[] | null);
    },
  });

  const perFase = useMemo(() => sottofasiPerFase(query.data ?? []), [query.data]);

  const segna = useMutation({
    mutationFn: async ({ id, fatta }: { id: string; fatta: boolean }) => {
      const { error } = await db.from("order_work_subphases").update({ fatta }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError,
  });

  const aggiungi = useMutation({
    mutationFn: async ({ phaseId, nome }: { phaseId: string; nome: string }) => {
      const { error } = await db.from("order_work_subphases").insert({
        phase_id: phaseId, name: nome, position: (perFase.get(phaseId) ?? []).length,
      });
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError,
  });

  const rinomina = useMutation({
    mutationFn: async ({ id, nome }: { id: string; nome: string }) => {
      const { error } = await db.from("order_work_subphases").update({ name: nome }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError,
  });

  const elimina = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from("order_work_subphases").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: aggiorna,
    onError,
  });

  return { sottofasi: query.data ?? [], perFase, isLoading: query.isLoading, isError: query.isError, segna, aggiungi, rinomina, elimina };
}
