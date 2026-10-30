import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { refreshMaterialQueries } from "@/lib/orders/refreshMaterialQueries";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import type { RapportinoConMateriali } from "@/lib/distinta/consumiMateriali";
import { leggiRapportiniApprovati } from "@/lib/distinta/rapportiniApprovati";

/**
 * Quello che serve per dire quanto di ogni articolo è stato posato
 * (consumiMateriali): i rapportini approvati della commessa, con i loro
 * materiali, e i rientri in magazzino per articolo. Le divisioni tra le fasi
 * (note «Divisione tra le fasi:») non sono rientri: la merce passa da una riga
 * all'altra senza tornare in magazzino.
 */
// warehouse_movements.rientro_commessa non è nei tipi generati.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export const chiaveConsumi = (orderId: string) => ["consumi-materiali", orderId] as const;

export function useConsumiMateriali(orderId: string | null | undefined) {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  return useQuery({
    queryKey: [...chiaveConsumi(orderId ?? ""), companyId],
    enabled: !!orderId && !!companyId,
    staleTime: 60_000,
    queryFn: async (): Promise<{ rapportini: RapportinoConMateriali[]; rientrati: Map<string, number> }> => {
      const rapportini = await leggiRapportiniApprovati(companyId!, orderId!);
      const { data: movimenti, error } = await db
        .from("warehouse_movements")
        .select("order_item_id, quantity, notes")
        .eq("order_id", orderId)
        .eq("movement_type", "carico")
        .eq("rientro_commessa", true)
        .not("order_item_id", "is", null);
      if (error) throw error;
      const rientrati = new Map<string, number>();
      for (const m of (movimenti ?? []) as { order_item_id: string; quantity: number; notes: string | null }[]) {
        if ((m.notes ?? "").startsWith("Divisione tra le fasi:")) continue;
        rientrati.set(m.order_item_id, (rientrati.get(m.order_item_id) ?? 0) + (Number(m.quantity) || 0));
      }
      return { rapportini, rientrati };
    },
  });
}

/**
 * Fa rientrare in magazzino quello che il cantiere non ha posato: la commessa
 * paga solo il posato (v_ordine_marginalita toglie il rientrato dagli
 * acquisti). Il database rifiuta i decimali, chi supera quanto è ancora fuori
 * e le righe il cui costo sta nelle fatture.
 */
export function useRientroMateriale(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    // giaRientrati: quanti ne vedeva rientrati chi decide. Se nel frattempo è cambiato il database si ferma:
    // lo stesso avanzo non rientra due volte da due schede o da due colleghi.
    mutationFn: async (p: { riga: string; quantita: number; magazzino: string | null; giaRientrati: number }) => {
      const { data, error } = await db.rpc("materiale_rientro_magazzino", { p_riga: p.riga, p_quantita: p.quantita, p_magazzino: p.magazzino, p_gia_rientrati: p.giaRientrati });
      if (error) throw error;
      return data as { quantita: number; rientrati: number; warehouse_id: string };
    },
    onSuccess: (r) => {
      toast.success(`${r.quantita} rientrati in magazzino: la commessa paga solo il posato.`);
      for (const k of [chiaveConsumi(orderId), ["materiali-per-fase", orderId], ["order-items", orderId], ["costi-materiali-fasi"],
        ["marginalita-cantieri"], ["marginalita-widget"], ["order-material-usage"], ["warehouses"], ["warehouse-stock"],
        // Il conto economico della commessa legge v_ordine_marginalita da qui (useOrderEconomicsBase).
        ["order-economics-canonical", orderId]]) {
        void qc.invalidateQueries({ queryKey: k });
      }
      refreshMaterialQueries(qc);
    },
    onError: (e: Error) => toast.error(e.message || "Rientro non registrato"),
  });
}

