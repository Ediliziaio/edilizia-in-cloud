// MP02 — Budget giornaliero OpenAI per company.
// Soft limit → degraded_mode (gpt-4o-mini). Hard limit → suspended.
// Reset automatico al cambio giorno (UTC) via RPC reset_daily_budget_if_needed.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface BudgetCheckResult {
  ok: boolean;
  model_override: string | null;
  user_message: string;
}

export async function checkBudget(
  supabase: SupabaseClient,
  companyId: string,
): Promise<BudgetCheckResult> {
  // Limiti WhatsApp DISABILITATI (richiesta titolare): nessun blocco né degrado
  // del modello. Manteniamo SOLO il tracciamento della spesa (reset giornaliero +
  // riga) così resta la visibilità dei costi; consumeBudget continua a incrementare
  // current_spend_eur. Per ri-attivare un tetto: impostare i limiti sulla riga.
  try {
    await supabase.rpc("reset_daily_budget_if_needed", { p_company_id: companyId });
    const { data: b } = await supabase
      .from("wa_ai_daily_budget")
      .select("company_id")
      .eq("company_id", companyId)
      .maybeSingle();
    if (!b) {
      await supabase.from("wa_ai_daily_budget").insert({
        company_id: companyId,
        daily_limit_eur: Number(Deno.env.get("WA_AI_DAILY_LIMIT_EUR") ?? 1000000),
        hard_limit_eur: Number(Deno.env.get("WA_AI_HARD_LIMIT_EUR") ?? 1000000),
      });
    }
  } catch {
    // tracciamento best-effort: non bloccare MAI per un errore di budget
  }
  return { ok: true, model_override: null, user_message: "" };
}

export async function consumeBudget(
  supabase: SupabaseClient,
  companyId: string,
  eurDelta: number,
): Promise<void> {
  if (eurDelta <= 0) return;
  await supabase.rpc("increment_budget_spend", {
    p_company_id: companyId,
    p_eur: eurDelta,
  });
}

export function estimateCostEur(
  model: string | undefined,
  inTok: number | undefined,
  outTok: number | undefined,
): number {
  if (!model || !inTok || !outTok) return 0;
  const prices: Record<string, { in: number; out: number }> = {
    "gpt-4o": { in: 2.5, out: 10.0 },
    "gpt-4o-mini": { in: 0.15, out: 0.6 },
  };
  const p = prices[model];
  if (!p) return 0;
  const usd = (inTok / 1_000_000) * p.in + (outTok / 1_000_000) * p.out;
  return Math.round(usd * 0.92 * 100000) / 100000;
}
