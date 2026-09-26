/**
 * Distanza su strada dalla sede ai cantieri (26/09/2026). Si legge da
 * orders.distanza_sede_km; se manca e il cantiere ha la posizione, si calcola
 * col servizio percorsi (lo stesso della scheda cliente) e si salva sulla
 * commessa, così la volta dopo è subito lì.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyBase } from "@/hooks/useCompanyBase";
import { getRoute } from "@/lib/routing";

export interface DistanzaCantiere {
  km: number;
  minuti: number | null;
}

export function useDistanzeCantieri(orderIds: readonly string[]) {
  const base = useCompanyBase();
  const ids = [...new Set(orderIds)].sort();
  return useQuery({
    queryKey: ["distanza-cantieri", ids.join(","), base?.lat, base?.lng],
    enabled: ids.length > 0,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<Record<string, DistanzaCantiere>> => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, work_lat, work_lng, distanza_sede_km, distanza_sede_minuti")
        .in("id", ids);
      if (error) throw error;
      const out: Record<string, DistanzaCantiere> = {};
      for (const o of data ?? []) {
        if (o.distanza_sede_km != null) {
          out[o.id] = { km: Number(o.distanza_sede_km), minuti: o.distanza_sede_minuti };
          continue;
        }
        if (!base || o.work_lat == null || o.work_lng == null) continue;
        const percorso = await getRoute([base, { lat: Number(o.work_lat), lng: Number(o.work_lng) }]);
        if (!percorso) continue;
        const km = Math.round((percorso.distanceMeters / 1000) * 10) / 10;
        const minuti = Math.round(percorso.durationSec / 60);
        out[o.id] = { km, minuti };
        // Si salva per la prossima volta; se non riesce, il numero resta giusto lo stesso.
        await supabase.rpc("salva_distanza_cantiere", { p_order_id: o.id, p_km: km, p_minuti: minuti });
      }
      return out;
    },
  });
}
