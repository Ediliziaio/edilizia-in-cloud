import type { QueryClient } from "@tanstack/react-query";
import { chiaveAffidamenti } from "./affidamentiCommessa";
import { chiaveFlussoSubappalto } from "@/hooks/useDettaglioSubappaltoCommessa";
import { refreshWorkQueries } from "@/lib/orders/refreshWorkQueries";

export function refreshFlussoSubappalto(qc: QueryClient, companyId: string, orderId: string) {
  for (const queryKey of [
    chiaveFlussoSubappalto(companyId, orderId), chiaveAffidamenti(orderId),
    ["affida-contratto-commessa", companyId, orderId], ["ditte-contratti-commessa", companyId, orderId],
    ["order-subcontract-statistics", orderId, companyId], ["order-supplier-payments"], ["contratto-varianti"],
  ]) void qc.invalidateQueries({ queryKey });
  refreshWorkQueries(qc, orderId, companyId);
}
