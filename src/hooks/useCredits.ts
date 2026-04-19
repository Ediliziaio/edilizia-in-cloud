import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Tipi di wallet credito supportati. Deve restare allineato con la RPC
 * `consume_credits` lato DB e con gli schemi SQL (`ai_credits`, `email_credits`,
 * `whatsapp_credits`, `render_credits`).
 *
 * Nota: la UI legacy usa la chiave "ai_agents" per il wallet AI — manteniamo
 * quella forma nella superficie del hook (lettura), ma la RPC canonica vuole
 * "ai" come `p_credit_type`. Il mapping è gestito dentro `consume()`.
 */
export type CreditType = "ai_agents" | "email" | "whatsapp" | "render";

const CREDIT_TABLE = {
  ai_agents: "ai_credits",
  email: "email_credits",
  whatsapp: "whatsapp_credits",
  render: "render_credits",
} as const satisfies Record<CreditType, string>;

const RPC_TYPE: Record<CreditType, "ai" | "email" | "whatsapp" | "render"> = {
  ai_agents: "ai",
  email: "email",
  whatsapp: "whatsapp",
  render: "render",
};

export interface CreditsState {
  /** Saldo attuale. EUR per ai/email/whatsapp, intero per render. */
  balance: number;
  totalRecharged: number;
  blocked: boolean;
  blockedReason: string | null;
  autoRechargeEnabled: boolean;
  autoRechargeThreshold: number | null;
  autoRechargeAmount: number | null;
  isLoading: boolean;
  /** Verifica sincrona: il saldo attuale copre `amount`? */
  canUse: (amount: number) => boolean;
  /**
   * Consuma `amount` crediti tramite la RPC atomica `consume_credits`.
   * Su saldo insufficiente la RPC torna `{success:false,error:'insufficient_credits'}`:
   * questo wrapper rilancia come Error così il caller può `try/catch`.
   * Su successo invalida la query del saldo per riflettere il nuovo balance.
   */
  consume: (amount: number, description?: string, metadata?: Record<string, unknown>) => Promise<{
    success: true;
    credit_type: string;
    amount: number;
    balance_before: number;
    balance_after: number;
  }>;
  isConsuming: boolean;
}

/**
 * Hook generico per lettura + consumo di un wallet credito dell'azienda corrente.
 *
 * Esempio (lettura):
 *   const { balance, blocked } = useCredits("ai_agents");
 *   if (blocked) return <BlockedBanner />;
 *
 * Esempio (consumo):
 *   const { canUse, consume } = useCredits("render");
 *   if (!canUse(1)) return toast.error("Crediti render esauriti");
 *   await consume(1, "Render AI di Villa Bianchi");
 *
 * La lettura è un React Query con staleTime 30s. Il consumo passa per la
 * RPC `consume_credits` (SECURITY DEFINER, row-level lock): sicuro anche
 * sotto concorrenza, log atomico sulla tabella per-tipo dove applicabile.
 */
export function useCredits(type: CreditType): CreditsState {
  const { effectiveCompany } = useAuth();
  const qc = useQueryClient();
  const companyId = effectiveCompany?.id;
  const table = CREDIT_TABLE[type];
  const queryKey = ["credits", type, companyId] as const;

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!companyId) return null;
      const { data, error } = await supabase
        .from(table)
        .select(
          type === "render"
            ? "balance, total_purchased, total_used"
            : "balance_eur, total_recharged_eur, calls_blocked, sends_blocked, blocked_reason, auto_recharge_enabled, auto_recharge_threshold, auto_recharge_amount",
        )
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
    enabled: !!companyId,
    staleTime: 30 * 1000, // 30s — i saldi cambiano spesso ma non devono essere realtime
  });

  const balance = type === "render"
    ? Number((data as any)?.balance ?? 0)
    : Number((data as any)?.balance_eur ?? 0);

  const blocked = Boolean(
    (data as any)?.calls_blocked || (data as any)?.sends_blocked,
  );

  const consumeMutation = useMutation({
    mutationFn: async (args: {
      amount: number;
      description?: string;
      metadata?: Record<string, unknown>;
    }) => {
      if (!companyId) {
        throw new Error("Nessuna azienda attiva: impossibile consumare crediti");
      }
      if (args.amount <= 0) {
        throw new Error("L'importo deve essere maggiore di zero");
      }

      const { data, error } = await supabase.rpc("consume_credits", {
        p_company_id:  companyId,
        p_credit_type: RPC_TYPE[type],
        p_amount:      args.amount,
        p_description: args.description ?? null,
        p_metadata:    (args.metadata as any) ?? null,
      });

      if (error) {
        // RPC failure reale (network, RLS, etc.) — rilancia così
        throw error;
      }

      const result = data as {
        success: boolean;
        error?: string;
        credit_type: string;
        amount: number;
        balance_before: number;
        balance_after: number;
      };

      if (!result?.success) {
        const err = new Error(
          result?.error === "insufficient_credits"
            ? "Crediti insufficienti per completare l'operazione"
            : `Consumo crediti fallito: ${result?.error ?? "errore sconosciuto"}`,
        ) as Error & { code?: string };
        err.code = result?.error;
        throw err;
      }

      return result as {
        success: true;
        credit_type: string;
        amount: number;
        balance_before: number;
        balance_after: number;
      };
    },
    onSuccess: () => {
      // Refresh saldo dopo consumo — il gating della UI che dipende dal balance
      // deve ri-leggere al primo render successivo.
      qc.invalidateQueries({ queryKey });
    },
  });

  return {
    balance,
    totalRecharged: type === "render"
      ? Number((data as any)?.total_purchased ?? 0)
      : Number((data as any)?.total_recharged_eur ?? 0),
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
    canUse: (amount: number) => balance >= amount && !blocked,
    consume: (amount, description, metadata) =>
      consumeMutation.mutateAsync({ amount, description, metadata }),
    isConsuming: consumeMutation.isPending,
  };
}
