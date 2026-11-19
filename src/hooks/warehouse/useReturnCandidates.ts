import { warehouseCapabilities, warehouseRpc } from "@/lib/magazzino/protocolloMovimenti";
import type { ReturnCandidate } from "@/lib/magazzino/resiCantiere";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { readAllOrderRows } from "@/lib/orders/listScope";
import { leggiRapportiniApprovati } from "@/lib/distinta/rapportiniApprovati";
import { returnCandidates, type ReturnArticle, type ReturnMovement, type ReturnStock } from "@/lib/magazzino/resiCantiere";

export function useReturnCandidates(companyId: string | undefined, orderId: string | undefined) {
  return useQuery({
    queryKey: ["warehouse", "return-candidates", companyId, orderId],
    enabled: !!companyId && !!orderId,
    staleTime: 0,
    queryFn: async (): Promise<ReturnCandidate[]> => {
      const protocol = await warehouseCapabilities(companyId!);
      if (protocol.version >= 2) {
        const { data, error } = await warehouseRpc("warehouse_return_candidates_v2", { p_order_id: orderId });
        if (error) throw error;
        if (!Array.isArray(data)) throw new Error("Residuo non verificabile: aggiorna i materiali.");
        return data as ReturnCandidate[];
      }
      const [articles, movements, reports] = await Promise.all([
        readAllOrderRows<ReturnArticle>((from, to) => supabase.from("order_items")
          .select("id,name,quantity,unita_misura,stock_item_id,order:orders!inner(company_id)").eq("order_id", orderId!).eq("order.company_id", companyId!).order("id").range(from, to)),
        readAllOrderRows<ReturnMovement>((from, to) => supabase.from("warehouse_movements")
          .select("id,order_item_id,stock_item_id,movement_type,quantity,notes,rientro_commessa")
          .eq("company_id", companyId!).eq("order_id", orderId!).order("id").range(from, to)),
        leggiRapportiniApprovati(companyId!, orderId!),
      ]);
      const ids = [...new Set([...articles.flatMap((a) => a.stock_item_id ? [a.stock_item_id] : []), ...movements.map((m) => m.stock_item_id)])];
      const stock: ReturnStock[] = [];
      for (let start = 0; start < ids.length; start += 50) {
        const { data, error } = await supabase.from("warehouse_stock").select("id,tracking_mode,warehouse_id,unita_misura")
          .eq("company_id", companyId!).in("id", ids.slice(start, start + 50));
        if (error) throw error;
        stock.push(...data);
      }
      return returnCandidates(articles, movements, reports, stock);
    },
  });
}
