import { useQuery } from "@tanstack/react-query";
import { warehouseCapabilities, warehouseRpc } from "@/lib/magazzino/protocolloMovimenti";
import type { ReturnCandidate } from "@/lib/magazzino/resiCantiere";

/** Stesso registro verificato dei resi, richieste limitate a quattro commesse alla volta. */
export function usePreparationBalances(companyId: string | undefined, orderIds: string[]) {
  const ids = [...new Set(orderIds)].sort();
  return useQuery({
    queryKey: ["warehouse", "preparation-balances", companyId, ids], enabled: !!companyId && ids.length > 0,
    staleTime: 0, retry: false,
    queryFn: async () => {
      const protocol = await warehouseCapabilities(companyId!);
      if (protocol.version < 2) throw new Error("Riepilogo quantità non disponibile per questo servizio.");
      const lines = new Map<string, ReturnCandidate[]>();
      for (let start = 0; start < ids.length; start += 4) {
        const batch = await Promise.all(ids.slice(start, start + 4).map(async id => {
          const { data, error } = await warehouseRpc("warehouse_return_candidates_v2", { p_order_id: id });
          if (error) throw error;
          if (!Array.isArray(data)) throw new Error("Riepilogo quantità non verificabile.");
          return [id, data as ReturnCandidate[]] as const;
        }));
        batch.forEach(([id, rows]) => lines.set(id, rows));
      }
      return lines;
    },
  });
}
