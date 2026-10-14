import type { QueryClient } from "@tanstack/react-query";

/** La stessa anagrafica alimenta impostazioni, acquisti, dettaglio, export e registro. */
export function invalidaFornitori(client: QueryClient) {
  return Promise.all(
    [
      "suppliers-config",
      "suppliers",
      "suppliers-for-orders",
      "suppliers-for-payments",
      "suppliers-export",
      "operational-suppliers",
      "supplier-audit-log",
      "supplier-product-counts",
    ].map((key) => client.invalidateQueries({ queryKey: [key] })),
  );
}
