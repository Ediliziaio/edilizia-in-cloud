export const QUOTE_DEMO_COMPANY = 'd2000000-0000-4000-a000-000000000002';
export type QuoteAvailability = { production: boolean; demo: boolean };

/** Activation is not authorization. Every enabled request must still pass
 * user JWT, company membership, edit permission and payment checks.
 */
export function quoteCompanyEnabled(companyId: string, availability: QuoteAvailability): boolean {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(companyId)) return false;
  return availability.production || availability.demo && companyId === QUOTE_DEMO_COMPANY;
}
