import type { QueryClient } from "@tanstack/react-query";

/** Dopo una perdita aggiorna sia il dettaglio sia la vista economica canonica. */
export function refreshOrderErrorQueries(client: QueryClient, orderId: string, companyId: string) {
  for (const key of ["order-errors", "oes-errors", "order-economics-canonical"]) {
    void client.invalidateQueries({ queryKey: [key, orderId] });
  }
  for (const key of ["global-errors", "errori-azienda-12m", "marginalita-cantieri", "marginalita-widget"]) {
    void client.invalidateQueries({ queryKey: [key, companyId] });
  }
}
