import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const referralBalanceKey = (referrerId?: string) => ["referral-payout-balance", referrerId] as const;

export type ReferralBalance = {
  earned: number;
  paid: number;
  reserved: number;
  available: number;
  unvested?: number;
  shortfall?: number;
};

export type PaymentInstruction = {
  payment_method: string;
  amount: number;
  reference: string;
  beneficiary: string | null;
  iban: string | null;
};

export type PayoutAction = "approve" | "prepare" | "confirm" | "reject" | "bank_rejected";

async function getReferralBalance(referrerId: string): Promise<ReferralBalance> {
  const { data, error } = await supabase.rpc("referral_payout_balance", { p_referrer_id: referrerId });
  if (error) throw new Error(error.message);
  return data as ReferralBalance;
}

export function useReferralBalance(referrerId?: string) {
  return useQuery({
    queryKey: referralBalanceKey(referrerId),
    enabled: !!referrerId,
    queryFn: () => getReferralBalance(referrerId!),
  });
}

export async function requestReferralPayout(referrerId: string, amount: number, key: string, notes: string) {
  const { data, error } = await supabase.rpc("referral_request_payout", {
    p_referrer_id: referrerId, p_amount: amount, p_key: key, p_notes: notes,
  });
  if (error) throw new Error(error.message);
  return data;
}

export async function transitionReferralPayout(
  payoutId: string, action: "prepare",
): Promise<PaymentInstruction>;
export async function transitionReferralPayout(
  payoutId: string, action: Exclude<PayoutAction, "prepare">, reference?: string,
): Promise<void>;
export async function transitionReferralPayout(
  payoutId: string, action: PayoutAction, reference?: string,
): Promise<PaymentInstruction | void> {
  const { data, error } = await supabase.rpc("referral_payout_transition", {
    p_payout_id: payoutId, p_action: action, p_reference: reference,
  });
  if (error) throw new Error(error.message);
  return action === "prepare" ? data as PaymentInstruction : undefined;
}
