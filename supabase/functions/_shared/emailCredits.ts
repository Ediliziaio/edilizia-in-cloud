import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Get an admin Supabase client (service role).
 */
function getAdminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}

/**
 * Deduct email credits for a company using the atomic RPC with logging.
 */
export async function deductEmailCredits(
  companyId: string,
  cost: number,
  opts?: {
    description?: string;
    campaignId?: string;
    metadata?: Record<string, unknown>;
    adminClient?: SupabaseClient;
  }
): Promise<{ balanceBefore: number; balanceAfter: number }> {
  const client = opts?.adminClient || getAdminClient();

  const { data, error } = await client.rpc("deduct_email_credits_with_log", {
    p_company_id: companyId,
    p_cost: cost,
    p_description: opts?.description || null,
    p_campaign_id: opts?.campaignId || null,
    p_metadata: opts?.metadata || null,
  });

  if (error) throw new Error(`deductEmailCredits failed: ${error.message}`);

  const result = data as { balance_before: number; balance_after: number };
  return {
    balanceBefore: result.balance_before,
    balanceAfter: result.balance_after,
  };
}

/**
 * Add email credits for a company (topup, bonus, refund) with logging.
 */
export async function addEmailCredits(
  companyId: string,
  amount: number,
  type: "topup" | "bonus" | "refund" = "topup",
  opts?: {
    description?: string;
    metadata?: Record<string, unknown>;
    adminClient?: SupabaseClient;
  }
): Promise<{ balanceBefore: number; balanceAfter: number }> {
  const client = opts?.adminClient || getAdminClient();

  const { data, error } = await client.rpc("add_email_credits_with_log", {
    p_company_id: companyId,
    p_amount: amount,
    p_type: type,
    p_description: opts?.description || null,
    p_metadata: opts?.metadata || null,
  });

  if (error) throw new Error(`addEmailCredits failed: ${error.message}`);

  const result = data as { balance_before: number; balance_after: number };
  return {
    balanceBefore: result.balance_before,
    balanceAfter: result.balance_after,
  };
}

/**
 * Get current email credits balance for a company.
 */
export async function getEmailBalance(
  companyId: string,
  adminClient?: SupabaseClient
): Promise<{
  balanceEur: number;
  totalSpent: number;
  totalRecharged: number;
  sendsBlocked: boolean;
}> {
  const client = adminClient || getAdminClient();

  const { data, error } = await client
    .from("email_credits")
    .select("balance_eur, total_spent_eur, total_recharged_eur, sends_blocked")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) throw new Error(`getEmailBalance failed: ${error.message}`);

  return {
    balanceEur: data?.balance_eur ?? 0,
    totalSpent: data?.total_spent_eur ?? 0,
    totalRecharged: data?.total_recharged_eur ?? 0,
    sendsBlocked: data?.sends_blocked ?? false,
  };
}

/**
 * Check if a company needs auto-topup and return config if enabled.
 */
export async function checkAutoTopup(
  companyId: string,
  walletType: "email" | "whatsapp" | "ai" = "email",
  adminClient?: SupabaseClient
): Promise<{
  needsTopup: boolean;
  config: {
    enabled: boolean;
    thresholdEur: number;
    topupAmountEur: number;
    stripePaymentMethodId: string | null;
  } | null;
}> {
  const client = adminClient || getAdminClient();

  const { data, error } = await client
    .from("company_auto_topup")
    .select("*")
    .eq("company_id", companyId)
    .eq("wallet_type", walletType)
    .maybeSingle();

  if (error || !data || !data.enabled) {
    return { needsTopup: false, config: null };
  }

  // Get current balance
  const balance = await getEmailBalance(companyId, client);

  return {
    needsTopup: balance.balanceEur <= data.threshold_eur,
    config: {
      enabled: data.enabled,
      thresholdEur: data.threshold_eur,
      topupAmountEur: data.topup_amount_eur,
      stripePaymentMethodId: data.stripe_payment_method_id,
    },
  };
}
