import { useRef } from "react";
import { warehouseRequestStorage, WarehouseRequestSlot, warehouseRequestScope, warehouseRpc } from "@/lib/magazzino/protocolloMovimenti";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/queryKeys";
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
 * paga il materiale rimasto in cantiere. Il protocollo 2 attribuisce ogni reso
 * all’uscita originale, con decimali e matricole; il servizio precedente mantiene
 * il proprio flusso per le righe non ancora migrate.
 */
export function useRientroMateriale(orderId: string) {
  const { effectiveCompany, user } = useAuth();
  const slots = useRef(new Map<string, WarehouseRequestSlot>());
  const qc = useQueryClient();
  return useMutation({
    // giaRientrati: quanti ne vedeva rientrati chi decide. Se nel frattempo è cambiato il database si ferma:
    // lo stesso avanzo non rientra due volte da due schede o da due colleghi.
    mutationFn: async (p: { riga: string; quantita: number; magazzino: string | null; giaRientrati: number;
      protocolVersion?: 2; stockItemId?: string; orderItemId?: string | null; serialNumbers?: string[] }) => {
      let data: unknown;
      if (p.protocolVersion === 2) {
        if (!effectiveCompany?.id || !p.stockItemId) throw new Error("Origine del materiale non verificata.");
        const scope = warehouseRequestScope(effectiveCompany.id, user?.id, "reso");
        if (!slots.current.has(scope)) slots.current.set(scope, new WarehouseRequestSlot(scope, warehouseRequestStorage()));
        const slot = slots.current.get(scope)!;
        const payload = { p_order_id: orderId, p_stock_item_id: p.stockItemId, p_order_item_id: p.orderItemId ?? null,
          p_quantity: p.quantita, p_serial_numbers: p.serialNumbers ?? [], p_expected_returned: p.giaRientrati };
        try {
          const result = await warehouseRpc("warehouse_return_material_v2", { ...payload, p_request_id: slot.request(payload) });
          if (result.error) throw result.error;
          data = result.data;
          if (!(data as { quantita?: number })?.quantita) throw new Error("Esito reso non disponibile: verifica i movimenti prima di riprovare.");
          slot.succeeded();
        } catch (error) { slot.failed(error); throw error; }
      } else {
        const result = await db.rpc("materiale_rientro_magazzino", { p_riga: p.riga, p_quantita: p.quantita, p_magazzino: p.magazzino, p_gia_rientrati: p.giaRientrati });
        if (result.error) throw result.error;
        data = result.data;
      }
      return data as { quantita: number; rientrati: number; warehouse_id: string };
    },
    onSuccess: (r) => {
      toast.success(`${Number(r.quantita).toLocaleString("it-IT")} ${r.quantita === 1 ? "rientrato" : "rientrati"} in magazzino. Il reso è collegato al prelievo di origine.`);
      for (const k of [chiaveConsumi(orderId), ["materiali-per-fase", orderId], ["order-items", orderId], ["costi-materiali-fasi"],
        ["marginalita-cantieri"], ["marginalita-widget"], ["order-material-usage"], ["warehouses"], ["warehouse-stock"],
        // Il conto economico della commessa legge v_ordine_marginalita da qui (useOrderEconomicsBase).
        ["order-economics-canonical", orderId]]) {
        void qc.invalidateQueries({ queryKey: k });
      }
      qc.invalidateQueries({ queryKey: queryKeys.warehouse.all });
      qc.invalidateQueries({ queryKey: ["magazzino-live"] });
      refreshMaterialQueries(qc);
    },
    onError: (e: Error) => toast.error(e.message || "Rientro non registrato"),
  });
}

