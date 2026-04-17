import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Tipi di wallet credito supportati. Deve restare allineato con
 * `TABLE_MAP` di supabase/functions/topup-credits/index.ts e con i
 * rispettivi schemi SQL (`ai_credits`, `email_credits`, `whatsapp_credits`).
 */
export type CreditType = "ai_agents" | "email" | "whatsapp";

const CREDIT_TABLE: Record<CreditType, string> = {
  ai_agents: "ai_credits",
  email: "email_credits",
  whatsapp: "whatsapp_credits",
};

export interface CreditsState {
  balance: number;
  totalRecharged: number;
  blocked: boolean;
  blockedReason: string | null;
  autoRechargeEnabled: boolean;
  autoRechargeThreshold: number | null;
  autoRechargeAmount: number | null;
  isLoading: boolean;
}

/**
 * Hook generico per leggere lo stato di un wallet credito dell'azienda corrente.
 *
 * Esempio:
 *   const { balance, blocked } = useCredits("ai_agents");
 *   if (blocked) return <BlockedBanner />;
 *   if (balance < 1) return <TopupPrompt />;
 *
 * N.B. Il CONSUMO dei crediti non passa da qui: avviene server-side tramite
 * le RPC atomiche `deduct_ai_credits`, `deduct_email_credits`, ecc. Questo hook
 * serve solo a riflettere il saldo nella UI.
 */
export function useCredits(type: CreditType): CreditsState {
  const { effectiveCompany } = useAuth();
  const companyId = effectiveCompany?.id;
  const table = CREDIT_TABLE[type];

  const { data, isLoading } = useQuery({
    queryKey: ["credits", type, companyId],
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from(table as never)
        .select(
          "balance_eur, total_recharged_eur, calls_blocked, sends_blocked, blocked_reason, auto_recharge_enabled, auto_recharge_threshold, auto_recharge_amount",
        )
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!companyId,
    staleTime: 30 * 1000, // 30s — i saldi cambiano spesso ma non devono essere realtime
  });

  const blocked = Boolean(
    (data as any)?.calls_blocked || (data as any)?.sends_blocked,
  );

  return {
    balance: Number((data as any)?.balance_eur ?? 0),
    totalRecharged: Number((data as any)?.total_recharged_eur ?? 0),
    blocked,
    blockedReason: (data as any)?.blocked_reason ?? null,
    autoRechargeEnabled: Boolean((data as any)?.auto_recharge_enabled),
    autoRechargeThreshold:
      (data as any)?.auto_recharge_threshold != null
        ? Number((data as any).auto_recharge_threshold)
        : null,
    autoRechargeAmount:
      (data as any)?.auto_recharge_amount != null
        ? Number((data as any).auto_recharge_amount)
        : null,
    isLoading,
  };
}
