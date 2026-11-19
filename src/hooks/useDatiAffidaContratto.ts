import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SottofaseLavoro } from "@/lib/orders/ditteLavori";

// Le relazioni delle lavorazioni non sono ancora tutte nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useDatiAffidaContratto(orderId: string, companyId: string) {
  return useQuery({
    queryKey: ["affida-contratto-commessa", companyId, orderId],
    queryFn: async () => {
      const [fasi, contratti, schede, sottofasi] = await Promise.all([
        db.from("order_work_phases").select("id, name, position, start_date, end_date").eq("order_id", orderId).eq("company_id", companyId).order("position"),
        db.from("contratti_subappalto").select("id, subappaltatore_id, stato, firmato_il, elenco_lavori, importo_contrattuale, oneri_sicurezza, data_inizio, data_fine_prevista").eq("order_id", orderId).eq("company_id", companyId),
        db.from("subappaltatori_sicurezza").select("id, campo_subappaltatore_id, order_id, created_at").eq("company_id", companyId).not("campo_subappaltatore_id", "is", null),
        db.from("order_work_phases").select("sottofasi:order_work_subphases(id, phase_id, name, position)").eq("order_id", orderId).eq("company_id", companyId),
      ]);
      for (const r of [fasi, contratti, schede, sottofasi]) if (r.error) throw r.error;
      return { fasi: fasi.data ?? [], contratti: contratti.data ?? [], schede: schede.data ?? [],
        sottofasi: ((sottofasi.data ?? []) as Array<{ sottofasi: SottofaseLavoro[] }>).flatMap((fase) => fase.sottofasi ?? []) };
    },
  });
}
