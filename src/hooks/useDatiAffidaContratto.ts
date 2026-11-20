import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SottofaseLavoro } from "@/lib/orders/ditteLavori";
import type { ContrattoFlusso } from "@/lib/subappaltatori/flussoCommessa";
import { tutteLePagine } from "@/lib/fatturazione/registroVendite";

// Le relazioni delle lavorazioni non sono ancora tutte nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useDatiAffidaContratto(orderId: string, companyId: string) {
  return useQuery({
    queryKey: ["affida-contratto-commessa", companyId, orderId],
    queryFn: async () => {
      const [fasi, contratti, schede, sottofasi, commessa] = await Promise.all([
        db.from("order_work_phases").select("id, name, position, start_date, end_date").eq("order_id", orderId).eq("company_id", companyId).order("position"),
        tutteLePagine<ContrattoFlusso>((from, to) => db.from("contratti_subappalto").select("id, subappaltatore_id, numero_contratto, descrizione_lavori, stato, firmato_il, elenco_lavori, importo_contrattuale, oneri_sicurezza, ritenuta_garanzia_pct, data_inizio, data_fine_prevista").eq("order_id", orderId).eq("company_id", companyId).order("created_at").order("id").range(from, to)),
        tutteLePagine<{id: string; ragione_sociale: string; campo_subappaltatore_id: string | null; order_id: string | null; created_at: string}>((from, to) => db.from("subappaltatori_sicurezza").select("id, ragione_sociale, campo_subappaltatore_id, order_id, created_at").eq("company_id", companyId).order("id").range(from, to)),
        db.from("order_work_phases").select("sottofasi:order_work_subphases(id, phase_id, name, position)").eq("order_id", orderId).eq("company_id", companyId),
        db.from("orders").select("order_code").eq("company_id", companyId).eq("id", orderId).single(),
      ]);
      for (const r of [fasi, sottofasi, commessa]) if (r.error) throw r.error;
      return { fasi: (fasi.data ?? []) as Array<{id: string; name: string; position: number | null; start_date: string | null; end_date: string | null}>,
        contratti, schede, codiceCommessa: commessa.data.order_code as string,
        sottofasi: ((sottofasi.data ?? []) as Array<{ sottofasi: SottofaseLavoro[] }>).flatMap((fase) => fase.sottofasi ?? []) };
    },
  });
}
