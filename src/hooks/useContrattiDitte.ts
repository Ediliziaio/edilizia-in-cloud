import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { StatoContratto } from "@/types/subappaltatori";

/**
 * I contratti di subappalto dell'azienda con la commessa e quanto è già stato
 * fatturato a SAL (06/10/2026), per la pagina Subappaltatori: su quali
 * cantieri lavora ogni ditta e chi è al lavoro adesso. La vista
 * v_subappaltatori_dashboard porta un contratto solo per ditta (quello della
 * commessa della scheda): qui ci sono tutti.
 */
export interface ContrattoDitta {
  id: string;
  /** La scheda della ditta (subappaltatori_sicurezza.id). */
  schedaId: string;
  orderId: string | null;
  codiceCommessa: string | null;
  commessa: string | null;
  cliente: string | null;
  importo: number;
  stato: StatoContratto;
  dataInizio: string | null;
  dataFinePrevista: string | null;
  /** Somma dei SAL (lordo) del contratto. */
  salLordo: number;
}

/** Contratti in corso: quelli che mettono una ditta su un cantiere. */
export const STATI_IN_CORSO: ReadonlySet<StatoContratto> = new Set(["attivo", "sospeso", "bozza"]);

// contratti, SAL e commesse senza tipi generati per le colonne usate qui
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export function useContrattiDitte() {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: ["contratti-ditte", companyId],
    enabled: !!companyId,
    staleTime: 3 * 60 * 1000,
    queryFn: async (): Promise<ContrattoDitta[]> => {
      const [contratti, sal] = await Promise.all([
        db
          .from("contratti_subappalto")
          .select("id, subappaltatore_id, order_id, importo_contrattuale, stato, data_inizio, data_fine_prevista")
          .eq("company_id", companyId)
          .limit(2000),
        db
          .from("sal_subappaltatori")
          .select("contratto_id, importo_lordo")
          .eq("company_id", companyId)
          .limit(5000),
      ]);
      if (contratti.error) throw contratti.error;
      if (sal.error) throw sal.error;
      const salPer = new Map<string, number>();
      for (const s of (sal.data ?? []) as Array<{ contratto_id: string | null; importo_lordo: number | string | null }>) {
        if (!s.contratto_id) continue;
        salPer.set(s.contratto_id, (salPer.get(s.contratto_id) ?? 0) + (Number(s.importo_lordo) || 0));
      }
      const righe = (contratti.data ?? []) as Array<{
        id: string; subappaltatore_id: string; order_id: string | null; importo_contrattuale: number | string | null;
        stato: StatoContratto; data_inizio: string | null; data_fine_prevista: string | null;
      }>;
      const idCommesse = [...new Set(righe.map((r) => r.order_id).filter((x): x is string => !!x))];
      const commesse = new Map<string, { order_code: string | null; description: string | null; client_name: string | null }>();
      if (idCommesse.length > 0) {
        const { data, error } = await db
          .from("orders")
          .select("id, order_code, description, client_name")
          .eq("company_id", companyId)
          .in("id", idCommesse);
        if (error) throw error;
        for (const o of (data ?? []) as Array<{ id: string; order_code: string | null; description: string | null; client_name: string | null }>) {
          commesse.set(o.id, o);
        }
      }
      return righe.map((r) => {
        const o = r.order_id ? commesse.get(r.order_id) : undefined;
        return {
          id: r.id,
          schedaId: r.subappaltatore_id,
          orderId: r.order_id,
          codiceCommessa: o?.order_code ?? null,
          commessa: o?.description ?? null,
          cliente: o?.client_name ?? null,
          importo: Number(r.importo_contrattuale) || 0,
          stato: r.stato,
          dataInizio: r.data_inizio,
          dataFinePrevista: r.data_fine_prevista,
          salLordo: salPer.get(r.id) ?? 0,
        };
      });
    },
  });
}
