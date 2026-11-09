import { leggiCostiRapportini } from "@/lib/campo/colonneRapportino";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffectiveCompanyId } from "@/hooks/useEffectiveCompanyId";
import { readAllPages } from "@/lib/personale/readAllPages";
import type { CedolinoMese, RapportinoOre } from "@/lib/orders/costoDaCedolini";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

/**
 * Rapportini approvati della commessa e cedolini delle sue persone. Gli stipendi li legge solo
 * l'amministratore dell'azienda (RLS di hr_cedolini): per gli altri la query resta spenta,
 * altrimenti vedrebbero un confronto fatto con il solo cedolino proprio.
 * Le bozze restano fuori: sono mesi non ancora chiusi.
 */
export function useCostoDaCedolini(orderId: string, employeeIds: string[], enabled: boolean) {
  const companyId = useEffectiveCompanyId();
  const ids = [...employeeIds].sort();
  return useQuery({
    queryKey: ["order-labor-cedolini", companyId, orderId, ids.join(",")],
    enabled: enabled && !!companyId && !!orderId && ids.length > 0,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<{ rapportini: RapportinoOre[]; cedolini: CedolinoMese[] }> => {
      const [rapportini, cedolini] = await Promise.all([
        leggiCostiRapportini({ orderId }).then((righe) => righe.filter((r) => r.stato === "approvato") as unknown as RapportinoOre[]),
        readAllPages<CedolinoMese>((da, a) => db.from("hr_cedolini").select("employee_id, anno, mese, lordo, contributi_datore, ore_lavorate")
          .eq("company_id", companyId).in("employee_id", ids).neq("stato", "bozza").order("id").range(da, a)),
      ]);
      return { rapportini, cedolini };
    },
  });
}
