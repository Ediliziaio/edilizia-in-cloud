// MP05-FIX — Direct API wrapper per provider non supportati da OpenRouter
// (Whisper, embeddings, image generation, vision diretto Anthropic/Gemini).
//
// A differenza di chat() in index.ts:
//   - non instrada via OpenRouter
//   - il chiamante esegue il fetch() al provider e passa il costo reale o stimato
//
// Garanzia: tutto il logging finisce in `ai_model_usage_log` via la stessa
// RPC `deduct_ai_credits_with_markup` usata da chargeAndLog (billing.ts), così
// il dashboard SuperAdmin (`pct_centralized`) vede questi consumi come tracciati.
//
// Rimpiazza l'uso di _shared/directAiLedger.ts (charge_ai_call →
// platform_ai_usage_log) per le 11 edge functions che ora vengono unificate.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface DirectChargeArgs {
  supabase: SupabaseClient;
  /** UUID azienda. Se null/undefined → log senza scalo crediti (modalità SuperAdmin). */
  company_id: string | null | undefined;
  /** Identificativo task; non vincolato all'enum TaskKind perché la CHECK constraint è stata rimossa. */
  task_kind: string;
  /** Etichetta modello provider/modello (es. "openai/text-embedding-3-small", "openai/whisper-1"). */
  model_used: string;
  /** Costo USD reale (se misurabile) o stimato. */
  cost_usd_real: number;
  /** True se il costo è stimato (no header x-or-cost / endpoint senza usage). */
  cost_is_estimated?: boolean;
  /** Token prompt o token equivalenti (0 ammesso per image-gen/whisper). */
  tokens_prompt?: number;
  /** Token completion (0 per embedding/whisper/image-gen). */
  tokens_completion?: number;
  /** Metadata libera (latency_ms, file_size, duration_sec, ecc.). */
  metadata?: Record<string, unknown>;
}

export interface DirectChargeResult {
  charged: boolean;
  reason: string;
  balance_before?: number;
  balance_after?: number;
  cost_billed_eur?: number;
  margin_eur?: number;
  usage_log_id?: string;
}

/**
 * Scala crediti + log unificato in `ai_model_usage_log` per chiamate AI dirette.
 *
 * Mirrors `chargeAndLog` di billing.ts ma esposto al di fuori del flusso chat()
 * — pensato per Whisper, embeddings, image generation, vision diretto.
 */
export async function chargeAndLogDirect(
  args: DirectChargeArgs,
): Promise<DirectChargeResult> {
  const tokensPrompt = Math.max(0, Math.floor(args.tokens_prompt ?? 0));
  const tokensCompletion = Math.max(0, Math.floor(args.tokens_completion ?? 0));

  // Modalità SuperAdmin/platform (no company): log diretto, no scalo.
  if (!args.company_id) {
    const { error } = await args.supabase.from("ai_model_usage_log").insert({
      task_kind: args.task_kind,
      model_requested: args.model_used,
      model_used: args.model_used,
      provider_used: args.model_used.split("/")[0] ?? "unknown",
      tokens_prompt: tokensPrompt,
      tokens_completion: tokensCompletion,
      tokens_total: tokensPrompt + tokensCompletion,
      cost_usd: args.cost_usd_real,
      cost_is_estimated: args.cost_is_estimated ?? true,
      ok: true,
      credits_deducted: false,
      metadata: args.metadata ?? {},
    });
    if (error) {
      console.error(
        JSON.stringify({
          level: "error",
          fn: "chargeAndLogDirect",
          msg: "platform insert failed",
          error: error.message,
        }),
      );
      return { charged: false, reason: "log_error" };
    }
    return { charged: false, reason: "no_company" };
  }

  const { data, error } = await args.supabase.rpc(
    "deduct_ai_credits_with_markup",
    {
      p_company_id: args.company_id,
      p_task_kind: args.task_kind,
      p_model_used: args.model_used,
      p_cost_usd_real: args.cost_usd_real,
      p_tokens_prompt: tokensPrompt,
      p_tokens_completion: tokensCompletion,
      p_wa_message_id: null,
      p_metadata: {
        ...(args.metadata ?? {}),
        cost_is_estimated: args.cost_is_estimated ?? true,
        direct_api: true,
      },
    },
  );

  if (error || !data || (data as Array<unknown>).length === 0) {
    console.error(
      JSON.stringify({
        level: "error",
        fn: "chargeAndLogDirect",
        msg: "deduct_ai_credits_with_markup failed",
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

// ────────────────────────── Stimatori di costo ──────────────────────────

const FX = () => Number(Deno.env.get("AI_FX_USD_EUR") ?? "0.92");

export function estimateWhisperCostUsd(durationSeconds: number | null | undefined): number {
  const seconds = Math.max(1, Number(durationSeconds ?? 0));
  // OpenAI Whisper: $0.006 / minuto.
  const price = Number(Deno.env.get("AI_WHISPER_USD_PER_MIN") ?? "0.006");
  return (seconds / 60) * price;
}

export function estimateEmbeddingUsage(
  input: string | string[],
): { tokens: number; costUsd: number } {
  const text = Array.isArray(input) ? input.join("\n") : input;
  const tokens = Math.max(1, Math.ceil(text.length / 4));
  const pricePerMillion = Number(
    Deno.env.get("AI_EMBEDDING_3_SMALL_USD_PER_1M_TOKENS") ?? "0.02",
  );
  const costUsd = Math.max(0.000001, (tokens / 1_000_000) * pricePerMillion);
  return { tokens, costUsd };
}

export function estimateDallECostUsd(opts: {
  model?: string;
  size?: string;
  quality?: "standard" | "hd";
  count?: number;
}): number {
  const model = (opts.model ?? "dall-e-3").toLowerCase();
  const size = opts.size ?? "1024x1024";
  const count = Math.max(1, Number(opts.count ?? 1));
  // DALL-E 3 (USD per immagine):
  //   1024x1024 standard $0.040, HD $0.080
  //   1792x1024 / 1024x1792 standard $0.080, HD $0.120
  // DALL-E 2: 1024x1024 $0.020
  let unit = 0.04;
  if (model.includes("dall-e-2") || model.includes("dalle2")) {
    unit = 0.02;
  } else {
    const isLarge = size.includes("1792");
    const hd = opts.quality === "hd";
    unit = isLarge ? (hd ? 0.12 : 0.08) : hd ? 0.08 : 0.04;
  }
  return unit * count;
}

export function estimateTokenCostUsd(args: {
  provider: string;
  model?: string;
  inputTokens?: number | null;
  outputTokens?: number | null;
  fallbackCostUsd?: number;
}): number {
  const provider = args.provider.toLowerCase();
  const defaults = provider.includes("anthropic")
    ? { input: 3, output: 15 }
    : provider.includes("gemini") || provider.includes("google")
      ? { input: 1.25, output: 10 }
      : provider.includes("openai")
        ? { input: 5, output: 15 }
        : { input: 1, output: 3 };

  const envPrefix = provider.includes("anthropic")
    ? "ANTHROPIC"
    : provider.includes("gemini") || provider.includes("google")
      ? "GEMINI"
      : provider.includes("openai")
        ? "OPENAI"
        : "DIRECT_AI";

  const inputPrice = Number(
    Deno.env.get(`AI_${envPrefix}_USD_PER_1M_INPUT_TOKENS`) ?? defaults.input,
  );
  const outputPrice = Number(
    Deno.env.get(`AI_${envPrefix}_USD_PER_1M_OUTPUT_TOKENS`) ?? defaults.output,
  );
  const inputTokens = Math.max(0, Number(args.inputTokens ?? 0));
  const outputTokens = Math.max(0, Number(args.outputTokens ?? 0));
  const tokenCost =
    (inputTokens / 1_000_000) * inputPrice +
    (outputTokens / 1_000_000) * outputPrice;

  if (tokenCost > 0) return Math.max(0.000001, tokenCost);
  return Math.max(0.000001, Number(args.fallbackCostUsd ?? 0.01));
}

export function usdToEur(usd: number): number {
  return usd * FX();
}
