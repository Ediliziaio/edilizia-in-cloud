import type { QueryClient } from "@tanstack/react-query";
/** Import e incassi devono aggiornare anche report/cruscotto, non solo la lista aperta. */
export function invalidaStatisticheFatturazione(qc: QueryClient, companyId: string | null | undefined) {
  if (!companyId) return;
  for (const key of ["dashboard-billing-kpi","top-clienti-fatturato","documenti-report-all"]) {
    void qc.invalidateQueries({ queryKey:[key,companyId] });
  }
}
