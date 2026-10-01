import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";

/** Un salvataggio deve aggiornare elenco, KPI, filtri e schede già visitate.
 * Alcune schede storiche usano ancora chiavi con underscore: non sono prefissi
 * di marketing-contacts e vanno invalidate esplicitamente. */
export function refreshCrmContacts(client: QueryClient, companyId: string | undefined, contactId?: string) {
  if (!companyId) return Promise.resolve([]);
  const keys: readonly unknown[][] = [
    [...queryKeys.marketingContacts.all],
    [...queryKeys.opportunities.all],
    [...queryKeys.marketing.all],
    [...queryKeys.customFields.all],
    ["marketing_contact_ids", companyId],
    ["marketing_contacts_search", companyId],
    ["marketing_contacts_search_detail", companyId],
    ["add-to-list-contacts", companyId],
  ];
  const legacyKeys = ["marketing_contact", "marketing_contact_field_values", "marketing_contact_kpis", "marketing_contact_activities"];
  return Promise.all([
    ...keys.map((queryKey) => client.invalidateQueries({ queryKey })),
    ...legacyKeys.map((key) => client.invalidateQueries({
      queryKey: contactId ? [key, contactId] : [key],
    })),
  ]);
}
