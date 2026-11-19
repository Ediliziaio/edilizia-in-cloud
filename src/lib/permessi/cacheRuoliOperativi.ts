import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

/** La lista dei venditori attivi ha una radice propria, diversa da salespeople. */
export async function invalidaRuoliOperativi(qc: QueryClient, companyId: string) {
  await Promise.all([
    queryKeys.salespeople.all,
    queryKeys.salespeople.active(companyId),
    queryKeys.employees.all,
    queryKeys.staff.all,
    ["company-staff-users"],
    ["company-staff-by-area"],
    ["office-employees", companyId],
    ["employees_active", companyId],
    ["hr-organigramma", companyId],
    ["hr-profili-all", companyId],
    ["stati-app-operai", companyId],
  ].map((queryKey) => qc.invalidateQueries({ queryKey })));
}
