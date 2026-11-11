import { useQuery } from "@tanstack/react-query";
import { documentiDb } from "@/lib/ddt/documentiPersistenti";
export interface ConsegnaDdt {
  id: string;
  riga_id: string;
  quantita: number;
  tipo: "ingresso" | "reso" | "servizio";
  destinazione: "cantiere" | "magazzino";
  order_id: string | null;
  warehouse_id: string | null;
  order_item_id: string | null;
  stock_item_id: string | null;
  purchase_order_item_id: string | null;
  consegna_origine_id: string | null;
  ddt_id: string;
  unita_misura: string;
  created_at: string;
  warehouses?: { name: string } | null;
}
export function useConsegneDDT(companyId: string, ddtId: string) {
  return useQuery<ConsegnaDdt[]>({
    queryKey: ["ddt-consegne", companyId, ddtId],
    enabled: !!companyId && !!ddtId,
    queryFn: async () => {
      const { data, error } = await documentiDb
        .from("ddt_consegne")
        .select("*,warehouses(name)")
        .eq("company_id", companyId)
        .eq("ddt_id", ddtId)
        .order("created_at")
        .order("id");
      if (error) throw error;
      return data ?? [];
    },
  });
}
