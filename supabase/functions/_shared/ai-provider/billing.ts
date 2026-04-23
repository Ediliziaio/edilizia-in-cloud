// MP05-FIX — Billing: precallCheck + chargeAndLog via RPC atomica.
// Separa logica crediti dal provider OpenRouter (principio di responsabilità).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { TaskKind } from "./types.ts";

export interface PrecallCheckResult {
  allow: boolean;
  reason: "ok" | "blocked" | "below_minimum" | "insufficient" | "no_company";
  balance_eur: number;
  est_cost_eur: number;
  user_message_it: string;
}

/**
 * Check PRE-chiamata AI. Se saldo insufficiente → non chiamiamo OpenRouter
 * (risparmia costo reale).
 */
export async function precallCheck(
  supabase: SupabaseClient,
  params: {
    company_id: string | null | undefined;
    task_kind: TaskKind;
    estimated_tokens_total?: number;
  },
): Promise<PrecallCheckResult> {
  // Chiamate senza company (es. SuperAdmin playground) sempre ammesse
  if (!params.company_id) {
    return {
      allow: true,
      reason: "no_company",
      balance_eur: 0,
      est_cost_eur: 0,
      user_message_it: "",
    };
  }

  const tokensEst = params.estimated_tokens_total ?? 1500;
  const avgPricingUsdPer1M = 3.0; // stima pessimistica GPT-4o-class
  const estCostUsd = (tokensEst / 1_000_000) * avgPricingUsdPer1M;

  const { data, error } = await supabase.rpc("check_ai_credits_available", {
    p_company_id: params.company_id,
    p_est_cost_usd: estCostUsd,
    p_task_kind: params.task_kind,
  });

  if (error || !data || (data as Array<unknown>).length === 0) {
    // Soft-fail: se il check fallisce, permetti la chiamata (meglio che bloccare)
    console.error(
      JSON.stringify({
        level: "warn",
        fn: "precallCheck",
        msg: "RPC error, soft-allow",
        error: error?.message,
      }),
    );
    return {
      allow: true,
      reason: "ok",
      balance_eur: 0,
      est_cost_eur: 0,
      user_message_it: "",
    };
  }

  const row = (data as Array<{
    o_ok: boolean;
    o_reason: string;
    o_balance_eur: number;
    o_est_cost_eur: number;
  }>)[0];

  let userMsg = "";
  if (!row.o_ok) {
    switch (row.o_reason) {
      case "blocked":
        userMsg =
          "Il servizio AI è temporaneamente sospeso su questo account. Contatta il supporto.";
        break;
      case "below_minimum":
      case "insufficient":
        userMsg =
          "Crediti AI esauriti. Ricarica dall'area Crediti per continuare.";
        break;
    }
  }

  return {
    allow: row.o_ok,
    reason: row.o_reason as PrecallCheckResult["reason"],
    balance_eur: Number(row.o_balance_eur ?? 0),
    est_cost_eur: Number(row.o_est_cost_eur ?? 0),
    user_message_it: userMsg,
  };
}

export interface ChargeResult {
  charged: boolean;
  reason: string;
  balance_before?: number;
  balance_after?: number;
  cost_billed_eur?: number;
  margin_eur?: number;
  usage_log_id?: string;
}

/**
 * Scala crediti + logga DOPO chiamata AI riuscita.
 * RPC atomica: se saldo insufficiente al momento dello scalo (race), fallisce
 * con reason='insufficient_credits' — la chiamata OpenRouter è già avvenuta,
 * ma il log è comunque persistito con credits_deducted=false.
 */
export async function chargeAndLog(
  supabase: SupabaseClient,
  params: {
    company_id: string | null | undefined;
    task_kind: TaskKind;
    model_used: string;
    cost_usd_real: number;
    tokens_prompt: number;
    tokens_completion: number;
    wa_message_id?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<ChargeResult> {
  // Playground SuperAdmin (no company): logga senza scalo
  if (!params.company_id) {
    await supabase.from("ai_model_usage_log").insert({
      task_kind: params.task_kind,
      model_requested: params.model_used,
      model_used: params.model_used,
      provider_used: params.model_used.split("/")[0] ?? "unknown",
      tokens_prompt: params.tokens_prompt,
      tokens_completion: params.tokens_completion,
      tokens_total: params.tokens_prompt + params.tokens_completion,
      cost_usd: params.cost_usd_real,
      ok: true,
      credits_deducted: false,
      metadata: params.metadata ?? {},
    });
    return { charged: false, reason: "no_company" };
  }

  const { data, error } = await supabase.rpc(
    "deduct_ai_credits_with_markup",
    {
      p_company_id: params.company_id,
      p_task_kind: params.task_kind,
      p_model_used: params.model_used,
      p_cost_usd_real: params.cost_usd_real,
      p_tokens_prompt: params.tokens_prompt,
      p_tokens_completion: params.tokens_completion,
      p_wa_message_id: params.wa_message_id ?? null,
      p_metadata: params.metadata ?? {},
    },
  );

  if (error || !data || (data as Array<unknown>).length === 0) {
    console.error(
      JSON.stringify({
        level: "error",
        fn: "chargeAndLog",
        msg: "RPC failed",
        error: error?.message,
      }),
    );
    return { charged: false, reason: "rpc_error" };
  }

  const row = (data as Array<{
    ok: boolean;
    reason: string;
    cost_real_eur: number;
    cost_billed_eur: number;
    margin_eur: number;
    balance_before: number;
    balance_after: number;
    usage_log_id: string;
  }>)[0];

  return {
    charged: row.ok === true,
    reason: row.reason,
    balance_before: Number(row.balance_before ?? 0),
    balance_after: Number(row.balance_after ?? 0),
    cost_billed_eur: Number(row.cost_billed_eur ?? 0),
    margin_eur: Number(row.margin_eur ?? 0),
    usage_log_id: row.usage_log_id,
  };
}
