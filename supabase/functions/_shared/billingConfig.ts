import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PRICING_TABLE_MAP: Record<string, string> = {
  email:     "email_pricing",
  whatsapp:  "whatsapp_pricing",
  ai_agents: "ai_agent_pricing",
  sms:       "sms_pricing",
};

/**
 * Get the active provider cost per unit for a given service.
 * Returns cost_billed_per_unit from the cheapest active pricing row.
 * Falls back to 0.001 if no pricing row found.
 */
export async function getActiveProviderCost(
  client: ReturnType<typeof createClient>,
  service: "email" | "whatsapp" | "ai_agents" | "sms"
): Promise<number> {
  const table = PRICING_TABLE_MAP[service];
  if (!table) return 0.001;
  const { data } = await client
    .from(table as never)
    .select("cost_billed_per_unit")
    .eq("is_active" as never, true as never)
    .order("cost_real_per_unit" as never, { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data as any)?.cost_billed_per_unit ?? 0.001;
}

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
