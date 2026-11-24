/**
 * Le fasi dei miei cantieri, per dire in Home e in «Lavori» cosa c'è da fare oggi. Una sola lettura per tutti i
 * cantieri della pagina; chiave propria (colonne diverse da «campo-fasi-commessa»: niente cache avvelenata).
 * Gli importi non servono e non si chiedono: il client legge comunque dalla vista protetta.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCampoWorkDay } from "@/hooks/campo/useCampoWorkDay";
import { daFareOggi, type DaFareOggi, type FaseDaFare } from "@/lib/campo/daFareOggi";

export function useDaFareOggi(orderIds: (string | null | undefined)[]): Map<string, DaFareOggi> {
  const oggi = useCampoWorkDay();
  const ids = useMemo(() => [...new Set(orderIds.filter((x): x is string => !!x))].sort(), [orderIds]);
  const q = useQuery({
    queryKey: ["campo-da-fare-oggi", ids],
    enabled: ids.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<FaseDaFare[]> => {
      const { data, error } = await supabase.from("order_work_phases")
        .select("order_id, name, status, position, start_date, end_date")
        .in("order_id", ids).limit(1000);
      if (error) throw error;
      return (data ?? []) as FaseDaFare[];
    },
  });
  return useMemo(() => {
    const perCantiere = new Map<string, FaseDaFare[]>();
    for (const f of q.data ?? []) perCantiere.set(f.order_id, [...(perCantiere.get(f.order_id) ?? []), f]);
    const out = new Map<string, DaFareOggi>();
    for (const [id, fasi] of perCantiere) out.set(id, daFareOggi(fasi, oggi));
    return out;
  }, [q.data, oggi]);
}
