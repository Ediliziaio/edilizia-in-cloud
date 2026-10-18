import type { QueryClient } from "@tanstack/react-query";

/** Includes legacy readers during the gradual transition. */
export function refreshMaterialQueries(qc: QueryClient) {
  for (const key of ["material-procurement", "material-procurement-unmapped", "po-item-coverage", "po-item-coverage-panel", "linked-purchase-orders", "oes-oda", "commessa-bolle-ddt", "commessa-fatture-fornitori"]) {
    void qc.invalidateQueries({ queryKey: [key] });
  }
}
