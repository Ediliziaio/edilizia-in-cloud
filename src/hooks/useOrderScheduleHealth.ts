import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Semaforo tempi commessa (Fase C spec 2026-07-03-rapportino-flow-design):
 * wrapper della RPC `order_schedule_health(p_order_id)` che confronta,
 * fase per fase, l'avanzamento atteso a oggi (interpolazione lineare
 * start_date→end_date) con quello reale dichiarato dai rapportini.
 */

export type ScheduleStato = "in_ritardo" | "in_linea" | "in_anticipo" | "non_configurato";

export interface SchedulePhaseHealth {
  id: string;
  name: string;
  status: string;
  expected_pct: number;
  actual_pct: number;
  delta_pct: number;
  giorni_scarto: number;
}

export interface OrderScheduleHealth {
  stato: ScheduleStato;
  delta_pct?: number | null;
  giorni_scarto?: number | null;
  fase_critica?: string | null;
  n_fasi_datate: number;
  fasi: SchedulePhaseHealth[];
}

const EMPTY: OrderScheduleHealth = { stato: "non_configurato", n_fasi_datate: 0, fasi: [] };

export function useOrderScheduleHealth(orderId: string | null | undefined) {
  return useQuery({
    queryKey: ["order-schedule-health", orderId],
    enabled: !!orderId,
    staleTime: 60_000,
    queryFn: async (): Promise<OrderScheduleHealth> => {
      // RPC creata via migration, non ancora nei tipi generati → cast
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase.rpc as any)("order_schedule_health", {
        p_order_id: orderId,
      });
      if (error) throw error;
      const parsed = (data ?? null) as OrderScheduleHealth | null;
      if (!parsed || !parsed.stato) return EMPTY;
      return { ...parsed, fasi: Array.isArray(parsed.fasi) ? parsed.fasi : [] };
    },
  });
}
