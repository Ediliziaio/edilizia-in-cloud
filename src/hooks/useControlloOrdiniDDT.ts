import { useQuery } from "@tanstack/react-query";
import { documentiDb as db } from "@/lib/ddt/documentiPersistenti";
import { loadCatalogPages } from "@/lib/listino/loadCatalogPages";
import type { RigaOrdine } from "@/lib/ddt/abbinaRigheOrdine";
import type { DDTRicezione } from "./useDDTRicezione";

export interface OrdineCollegatoDDT {
  id: string;
  oda_number: string;
  status: string;
  order_id: string | null;
  attachment_url?:string|null;
}
export function useControlloOrdiniDDT(ddt: DDTRicezione) {
  return useQuery({
    queryKey: ["ddt-controllo-ordini", ddt.company_id, ddt.id],
    queryFn: async () => {
      const legami = await loadCatalogPages<{
        id: string;
        purchase_order_id: string;
        ddt_id: string;
      }>((a, b) =>
        db
          .from("ddt_ordini_collegati")
          .select("id,purchase_order_id,ddt_id")
          .eq("company_id", ddt.company_id)
          .eq("ddt_id", ddt.id)
          .order("purchase_order_id")
          .range(a, b),
      );
      const ids = [...new Set(legami.map((r) => r.purchase_order_id))];
      if (!ids.length)
        return {
          ordini: [] as OrdineCollegatoDDT[],
          righe: [] as RigaOrdine[],
          manuali: [] as string[],
          bolle: [] as Array<{
            id: string;
            numero_ddt: string;
            data_ricezione: string;
            stato: string;
          }>,
        };
      const [ordini, righe, altri, manuali] = await Promise.all([
        loadCatalogPages<OrdineCollegatoDDT>((a, b) =>
          db
            .from("purchase_orders")
            .select("id,oda_number,status,order_id,attachment_url")
            .eq("company_id", ddt.company_id)
            .in("id", ids)
            .order("id")
            .range(a, b),
        ),
        loadCatalogPages<RigaOrdine>((a, b) =>
          db
            .from("purchase_order_items")
            .select(
              "id,purchase_order_id,description,sku,unit_of_measure,quantity,quantity_received",
            )
            .eq("company_id", ddt.company_id)
            .in("purchase_order_id", ids)
            .order("sort_order")
            .order("id")
            .range(a, b),
        ),
        loadCatalogPages<{ id: string; ddt_id: string }>((a, b) =>
          db
            .from("ddt_ordini_collegati")
            .select("id,ddt_id,purchase_order_id")
            .eq("company_id", ddt.company_id)
            .in("purchase_order_id", ids)
            .order("ddt_id")
            .order("purchase_order_id")
            .range(a, b),
        ),
        loadCatalogPages<{ id: string }>((a, b) =>
          db
            .from("ddt_ordini_acquisto")
            .select("id:purchase_order_id")
            .eq("company_id", ddt.company_id)
            .eq("ddt_id", ddt.id)
            .order("purchase_order_id")
            .range(a, b),
        ),
      ]);
      const ddtIds = [...new Set(altri.map((r) => r.ddt_id))];
      const bolle = ddtIds.length
        ? await loadCatalogPages<{
            id: string;
            numero_ddt: string;
            data_ricezione: string;
            stato: string;
          }>((a, b) =>
            db
              .from("ddt_ricezione")
              .select("id,numero_ddt,data_ricezione,stato")
              .eq("company_id", ddt.company_id)
              .in("id", ddtIds)
              .order("data_ricezione")
              .order("id")
              .range(a, b),
          )
        : [];
      const numeri = new Map(ordini.map((o) => [o.id, o.oda_number]));
      return {
        ordini,
        manuali: manuali.map((r) => r.id),
        righe: righe.map((r) => ({
          ...r,
          oda_number: numeri.get(r.purchase_order_id ?? ""),
        })),
        bolle,
      };
    },
  });
}
