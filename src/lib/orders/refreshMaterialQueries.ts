import type { QueryClient } from "@tanstack/react-query";
import { refreshPurchasingQueries } from "./financialRefresh";

/** Includes legacy readers during the gradual transition. */
export function refreshMaterialQueries(qc: QueryClient) {
  refreshPurchasingQueries(qc);
}
