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

// ── Row types dalle SELECT (discriminated union) ──────────────────────────
// FIX P3.5: rimossi tutti gli `as any` residui. Ora abbiamo tipi precisi
// per wallet EUR vs render (integer) e nessun cast silenzioso.
interface EurWalletRow {
  balance_eur: number | null;
  total_recharged_eur: number | null;
  calls_blocked: boolean | null;
  sends_blocked: boolean | null;
  blocked_reason: string | null;
  auto_recharge_enabled: boolean | null;
  auto_recharge_threshold: number | null;
  auto_recharge_amount: number | null;
}

interface RenderWalletRow {
  balance: number | null;
  total_purchased: number | null;
  total_used: number | null;
}

type WalletRow = EurWalletRow | RenderWalletRow | null;

function isRenderRow(row: WalletRow): row is RenderWalletRow {
  return row != null && "balance" in row;
}

function isEurRow(row: WalletRow): row is EurWalletRow {
  return row != null && "balance_eur" in row;
}

// ── ConsumeCredits RPC payload ────────────────────────────────────────────
interface ConsumeRpcResultBase {
  credit_type: string;
  amount: number;
  balance_before: number;
  balance_after: number;
}

interface ConsumeRpcSuccess extends ConsumeRpcResultBase {
  success: true;
}

interface ConsumeRpcFailure {
  success: false;
  error: string;
  credit_type?: string;
}

type ConsumeRpcResult = ConsumeRpcSuccess | ConsumeRpcFailure;

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
  consume: (
    amount: number,
    description?: string,
    metadata?: Record<string, unknown>,
  ) => Promise<ConsumeRpcSuccess>;
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
    queryFn: async (): Promise<WalletRow> => {
      if (!companyId) return null;
      const selectClause = type === "render"
        ? "balance, total_purchased, total_used"
        : "balance_eur, total_recharged_eur, calls_blocked, sends_blocked, blocked_reason, auto_recharge_enabled, auto_recharge_threshold, auto_recharge_amount";
      const { data, error } = await supabase
        .from(table)
        .select(selectClause)
        // Cast locale: il client Supabase tipizza table-per-table ma qui il
        // nome arriva da mapping statico, non da input utente — safe.
        .eq("company_id" as never, companyId as never)
        .maybeSingle();
      if (error) {
        console.error(`[useCredits] fetch ${type}:`, error);
        throw error;
      }
      return (data ?? null) as WalletRow;
    },
    enabled: !!companyId,
    staleTime: 30 * 1000, // 30s — i saldi cambiano spesso ma non devono essere realtime
  });

  // Estrazione discriminata: non più `as any`, ora type-safe.
  let balance = 0;
  let totalRecharged = 0;
  let blocked = false;
  let blockedReason: string | null = null;
  let autoRechargeEnabled = false;
  let autoRechargeThreshold: number | null = null;
  let autoRechargeAmount: number | null = null;

  if (type === "render" && isRenderRow(data ?? null)) {
    const row = data as RenderWalletRow;
    balance = Number(row.balance ?? 0);
    totalRecharged = Number(row.total_purchased ?? 0);
    // Render non ha concetto di "blocked" / auto-recharge: defaults ok.
  } else if (type !== "render" && isEurRow(data ?? null)) {
    const row = data as EurWalletRow;
    balance = Number(row.balance_eur ?? 0);
    totalRecharged = Number(row.total_recharged_eur ?? 0);
    blocked = Boolean(row.calls_blocked || row.sends_blocked);
    blockedReason = row.blocked_reason ?? null;
    autoRechargeEnabled = Boolean(row.auto_recharge_enabled);
    autoRechargeThreshold = row.auto_recharge_threshold != null
      ? Number(row.auto_recharge_threshold) : null;
    autoRechargeAmount = row.auto_recharge_amount != null
      ? Number(row.auto_recharge_amount) : null;
  }

  const consumeMutation = useMutation({
    mutationFn: async (args: {
      amount: number;
      description?: string;
      metadata?: Record<string, unknown>;
    }): Promise<ConsumeRpcSuccess> => {
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
        // jsonb parametro opzionale — JSON-serializable, cast a never per
        // compatibilità con il tipo di @supabase/supabase-js
        p_metadata: (args.metadata ?? null) as never,
      });

      if (error) {
        // RPC failure reale (network, RLS, etc.) — rilancia così
        throw error;
      }

      const result = data as unknown as ConsumeRpcResult | null;

      if (!result?.success) {
        const errorCode = (result as ConsumeRpcFailure | null)?.error;
        const err = new Error(
          errorCode === "insufficient_credits"
            ? "Crediti insufficienti per completare l'operazione"
            : `Consumo crediti fallito: ${errorCode ?? "errore sconosciuto"}`,
        ) as Error & { code?: string };
        err.code = errorCode;
        throw err;
      }

      return result;
    },
    onSuccess: () => {
      // Refresh saldo dopo consumo — il gating della UI che dipende dal balance
      // deve ri-leggere al primo render successivo.
      qc.invalidateQueries({ queryKey });
    },
  });

  return {
    balance,
    totalRecharged,
    blocked,
    blockedReason,
    autoRechargeEnabled,
    autoRechargeThreshold,
    autoRechargeAmount,
    isLoading,
    canUse: (amount: number) => balance >= amount && !blocked,
    consume: (amount, description, metadata) =>
      consumeMutation.mutateAsync({ amount, description, metadata }),
    isConsuming: consumeMutation.isPending,
  };
}
