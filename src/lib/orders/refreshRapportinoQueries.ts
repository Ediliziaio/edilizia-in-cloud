import type { QueryClient } from "@tanstack/react-query";

// Le chiavi storiche non hanno tutte lo stesso ordine. Non usare un prefisso
// globale per compensare: farebbe ricaricare anche le altre commesse aperte.
const ORDER_FIRST = new Set([
  "order-campo-rapportini", "campo-rapportini-ordine", "order-diary-audit",
  "cronoprogramma-rapportini", "order-material-usage", "order-campo-fasi-nomi",
  "campo-lavoro-rapportino-oggi", "campo-ore-gia-registrate",
]);
const COMPANY_FIRST = new Set([
  "order-events", "costi-materiali-fasi", "campo-rapportino-gia-oggi",
  "campo-materiali-consegnati-rapportino",
]);
const WITH_COMPANY_SUFFIX = new Set([
  "order-campo-rapportini", "order-diary-audit", "cronoprogramma-rapportini",
  "order-material-usage", "order-campo-fasi-nomi",
]);

/** Solo cache locali. Non sostituisce una transazione o la sincronizzazione tra dispositivi. */
export function refreshRapportinoQueries(qc: QueryClient, orderId: string | null | undefined, companyId?: string | null) {
  if (!orderId) return;
  void qc.invalidateQueries({ predicate: ({ queryKey }) => isRapportinoQueryKey(queryKey, orderId, companyId) });
}

export function isRapportinoQueryKey(queryKey: readonly unknown[], orderId: string, companyId?: string | null): boolean {
    const prefix = queryKey[0];
    if (typeof prefix !== "string") return false;
    if (ORDER_FIRST.has(prefix)) {
      if (queryKey[1] !== orderId) return false;
      return !WITH_COMPANY_SUFFIX.has(prefix) || !companyId || queryKey[2] == null || queryKey[2] === companyId;
    }
    return COMPANY_FIRST.has(prefix) && queryKey[2] === orderId && (!companyId || queryKey[1] === companyId);
}

/** Ricezione del solo evento già pubblicato dal server, senza altri canali Realtime. */
export function refreshRapportinoFromOrderEvent(qc: QueryClient, companyId: string, orderId: string, row: Record<string, unknown>): boolean {
  if (!companyId || !orderId || row.company_id !== companyId || row.order_id !== orderId ||
    row.event_type !== "reportino_cantiere") return false;
  refreshRapportinoQueries(qc, orderId, companyId);
  return true;
}
