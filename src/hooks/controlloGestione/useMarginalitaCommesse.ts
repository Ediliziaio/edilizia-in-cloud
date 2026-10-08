/**
 * Hook React Query — Marginalita per commessa/cantiere.
 */

import { useQuery } from "@tanstack/react-query";
import { cgRpc } from "@/hooks/controlloGestione/cgRpc";
import { supabase } from "@/integrations/supabase/client";

export type { Semaforo, CommessaRiga, CommesseKPI, MarginalitaCommesseResult } from "../../../supabase/functions/_shared/marginalitaCommesse.ts";
import { normalizeMarginalitaCommesse, type MarginalitaCommesseResult } from "../../../supabase/functions/_shared/marginalitaCommesse.ts";

export function useMarginalitaCommesse(
  anno: number | null = null,
  statusFilter: string | null = null,
) {
  return useQuery({
    queryKey: ["cg", "commesse", anno, statusFilter] as const,
    queryFn: async (): Promise<MarginalitaCommesseResult> => {
      const { data, error } = await cgRpc("cg_get_marginalita_commesse_safe", { p_anno: anno, p_status_filter: statusFilter });
      if (error) throw error;
      const result = data as unknown as MarginalitaCommesseResult;
      const righe = result.righe ?? [];

      // La vista consuntivo INCLUDE già la manodopera, ma la RPC non ne espone
      // la componente. La ricaviamo per order_id (order_employees interni + squadre
      // esterne a corpo) per mostrare "dove la manodopera incide di più" in soldi e ore.
      const ids = righe.map((r) => r.id);
      const labById = new Map<string, { costo: number; ore: number }>();
      const bump = (orderId: string, costo: number, ore: number) => {
        const cur = labById.get(orderId) ?? { costo: 0, ore: 0 };
        cur.costo += costo;
        cur.ore += ore;
        labById.set(orderId, cur);
      };
      for (let i = 0; i < ids.length; i += 200) {
        const chunk = ids.slice(i, i + 200);
        const [emp, ext] = await Promise.all([
          supabase.from("order_employees").select("order_id, total_cost, hours_worked").in("order_id", chunk),
          supabase.from("order_external_teams").select("order_id, total_cost").in("order_id", chunk),
        ]);
        if (emp.error) throw emp.error;
        if (ext.error) throw ext.error;
        for (const row of (emp.data ?? []) as Array<{ order_id: string; total_cost: number | null; hours_worked: number | null }>) {
          bump(row.order_id, Number(row.total_cost ?? 0), Number(row.hours_worked ?? 0));
        }
        for (const row of (ext.data ?? []) as Array<{ order_id: string; total_cost: number | null }>) {
          bump(row.order_id, Number(row.total_cost ?? 0), 0);
        }
      }
      return normalizeMarginalitaCommesse(result, labById);
    },
    staleTime: 60_000,
  });
}
