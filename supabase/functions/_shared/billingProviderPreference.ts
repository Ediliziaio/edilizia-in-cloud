export interface ProviderConnection { provider: string; is_active?: boolean | null; is_primary?: boolean | null }
/** A direct connection explicitly selected by the customer wins over the central fallback. */
export function preferredBillingProvider(connections: ProviderConnection[]): string | null {
  const active = connections.filter(c => c.is_active);
  const directPrimary = active.find(c => c.provider !== "itala" && c.is_primary);
  if (directPrimary) return directPrimary.provider;
  if (active.some(c => c.provider === "fattureincloud")) return "fattureincloud";
  const direct = active.find(c => c.provider !== "itala");
  return direct?.provider ?? (active.some(c => c.provider === "itala") ? "itala" : null);
}
