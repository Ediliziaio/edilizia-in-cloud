import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { OrderWithDetails } from "@/lib/orderUtils";
import { FASI_PIPELINE, TASK_UFFICIO_PIPELINE, type ConteggioPipeline } from "@/lib/orders/conteggiPipeline";
import { readAllOrderRows } from "@/lib/orders/listScope";
import { faseCompletata } from "@/lib/orders/schedaCommessa";
import { withAbortableClientTimeout } from "@/lib/query-timeout";

type StatoCommessa = { order_id: string | null; status: string };

async function leggiConteggi<T extends { order_id: string | null }>(
  ids: string[],
  leggi: (batch: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
  completata: (riga: T) => boolean,
) {
  const conteggi = new Map<string, ConteggioPipeline>();
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100);
    const righe = await readAllOrderRows((from, to) => leggi(batch, from, to));
    for (const riga of righe) {
      if (!riga.order_id) continue;
      const conteggio = conteggi.get(riga.order_id) ?? { total: 0, done: 0 };
      conteggio.total++;
      if (completata(riga)) conteggio.done++;
      conteggi.set(riga.order_id, conteggio);
    }
  }
  return conteggi;
}

const NESSUNA_RIGA: ConteggioPipeline = { total: 0, done: 0 };

export function useConteggiPipeline(azienda: string, ordini: OrderWithDetails[], pronto: boolean) {
  const ids = useMemo(() => ordini.map(ordine => ordine.id).sort(), [ordini]);
  const enabled = pronto && !!azienda && ids.length > 0;
  const { data: fasi, isError: erroreFasi } = useQuery({
    queryKey: [FASI_PIPELINE, azienda, ids],
    enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: ({ signal }) => withAbortableClientTimeout(readSignal => leggiConteggi<StatoCommessa & { percentuale: number | null }>(ids, (batch, from, to) =>
      supabase.from("order_work_phases").select("order_id, status, percentuale")
        .eq("company_id", azienda).in("order_id", batch).order("id")
        .range(from, to).abortSignal(readSignal),
    faseCompletata), "Fasi della pipeline", 20_000, signal),
  });
  const { data: task, isError: erroreTask } = useQuery({
    queryKey: [TASK_UFFICIO_PIPELINE, azienda, ids],
    enabled,
    staleTime: 30_000,
    retry: false,
    queryFn: ({ signal }) => withAbortableClientTimeout(readSignal => leggiConteggi<StatoCommessa>(ids, (batch, from, to) =>
      supabase.from("tasks").select("order_id, status")
        .eq("company_id", azienda).eq("activity_scope", "ufficio").in("order_id", batch).order("id")
        .range(from, to).abortSignal(readSignal),
    riga => riga.status === "completata"), "Task d’ufficio della pipeline", 20_000, signal),
  });

  return useMemo(() => {
    if (!fasi && !task && !erroreFasi && !erroreTask) return ordini;
    return ordini.map<OrderWithDetails>(ordine => ({
      ...ordine,
      fasiPipeline: fasi ? fasi.get(ordine.id) ?? NESSUNA_RIGA : erroreFasi ? null : undefined,
      taskUfficioPipeline: task ? task.get(ordine.id) ?? NESSUNA_RIGA : erroreTask ? null : undefined,
    }));
  }, [fasi, task, erroreFasi, erroreTask, ordini]);
}
