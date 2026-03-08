import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Shared billing configuration helper.
 * Loads company-specific billing overrides from `company_billing_overrides`.
 */

export interface BillingConfig {
  isEnabled: boolean;
  isFree: boolean;
  pricePerUnitEur: number | null;
  markupMultiplier: number | null;
  monthlyFeeEur: number | null;
}

const DEFAULT_CONFIG: BillingConfig = {
  isEnabled: true,
  isFree: false,
  pricePerUnitEur: null,
  markupMultiplier: null,
  monthlyFeeEur: null,
};

/**
 * Get billing configuration for a company + service.
 * Falls back to defaults if no override exists.
 */
export async function getCompanyBillingConfig(
  client: ReturnType<typeof createClient>,
  companyId: string,
  service: string
): Promise<BillingConfig> {
  const { data, error } = await client
    .from("company_billing_overrides")
    .select("is_enabled, is_free, price_per_unit_eur, markup_multiplier, monthly_fee_eur")
    .eq("company_id", companyId)
    .eq("service", service)
    .maybeSingle();

  if (error || !data) {
    return DEFAULT_CONFIG;
  }

  return {
    isEnabled: data.is_enabled ?? true,
    isFree: data.is_free ?? false,
    pricePerUnitEur: data.price_per_unit_eur ?? null,
    markupMultiplier: data.markup_multiplier ?? null,
    monthlyFeeEur: data.monthly_fee_eur ?? null,
  };
}
