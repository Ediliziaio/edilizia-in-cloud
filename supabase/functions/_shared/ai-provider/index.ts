// MP05-FIX — Entry point AIProvider con billing integrato.
//
// Flusso:
//   1. precallCheck (PRIMA di chiamare OpenRouter) → abort se insufficienti
//   2. Fallback chain (come MP05 v1.0)
//   3. chargeAndLog atomico DOPO (scala crediti + log in una transazione SQL)
//
// Gli errori InsufficientCreditsError propagano al chiamante (handler WA),
// che mostra user_message_it all'utente finale senza rivelare modello/costi.

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import type {
  ChatRequest,
  ChatResponse,
  AIProviderError,
} from "./types.ts";
import { resolveModelConfig } from "./config.ts";
import { callOpenRouter } from "./openrouter.ts";
import { precallCheck, chargeAndLog } from "./billing.ts";

let _supabase: SupabaseClient | null = null;
function getSupabase(): SupabaseClient {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
  }
  return _supabase;
}

export class InsufficientCreditsError extends Error {
  public readonly reason: string;
  public readonly balance_eur: number;
  public readonly user_message_it: string;
  constructor(reason: string, balance: number, msg: string) {
    super(`Insufficient credits: ${reason} (balance €${balance})`);
    this.name = "InsufficientCreditsError";
    this.reason = reason;
    this.balance_eur = balance;
    this.user_message_it = msg;
  }
}

export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const supabase = getSupabase();

  // 1. Pre-call check saldo
  const precall = await precallCheck(supabase, {
    company_id: req.company_id,
    task_kind: req.task_kind,
    estimated_tokens_total: req.max_tokens ? req.max_tokens + 500 : 1500,
  });

  if (!precall.allow) {
    // Log tentativo bloccato (no call a OpenRouter)
    try {
      await supabase.from("ai_model_usage_log").insert({
        company_id: req.company_id ?? null,
        task_kind: req.task_kind,
        model_requested: "skipped",
        model_used: "skipped",
        provider_used: "none",
        tokens_prompt: 0,
        tokens_completion: 0,
        tokens_total: 0,
        cost_usd: 0,
        ok: false,
        error_code: precall.reason,
        error_detail: "precall_blocked",
        credits_deducted: false,
      });
    } catch {
      // Non bloccare la risposta utente se il log del tentativo fallisce.
    }

    throw new InsufficientCreditsError(
      precall.reason,
      precall.balance_eur,
      precall.user_message_it,
    );
  }

  // 2. Risolvi config modello (solo global SuperAdmin)
  const config = await resolveModelConfig(
    supabase,
    req.task_kind,
    req.company_id,
  );
  if (!config.enabled) {
    throw new Error(`Task ${req.task_kind} disabilitato globalmente`);
  }

  const modelChain = req.model_override
    ? [req.model_override]
    : [config.primary_model, ...config.fallback_chain];

  const temperature = req.temperature ?? config.temperature;
  const max_tokens = req.max_tokens ?? config.max_tokens;

  let lastError: AIProviderError | null = null;
  let hops = 0;

  // 3. Try fallback chain
  for (let i = 0; i < modelChain.length; i++) {
    const model = modelChain[i];
    hops = i;
    try {
      const result = await callOpenRouter(
        {
          model,
          messages: req.messages as unknown[],
          tools: req.tools as unknown[] | undefined,
          tool_choice:
            req.tools && req.tools.length > 0
              ? (req.tool_choice ?? "auto")
              : undefined,
          temperature,
          max_tokens,
          ...(req.json_mode
            ? { response_format: { type: "json_object" as const } }
            : {}),
        },
        { task_kind: req.task_kind, company_id: req.company_id },
      );

      // 4. Post-call: scala crediti + log atomico (MP05-FIX)
      await chargeAndLog(supabase, {
        company_id: req.company_id,
        task_kind: req.task_kind,
        model_used: result.model,
        cost_usd_real: result.cost_usd,
        tokens_prompt: result.usage.prompt_tokens,
        tokens_completion: result.usage.completion_tokens,
        wa_message_id: req.wa_message_id,
        metadata: {
          fallback_hops: hops,
          latency_ms: result.latency_ms,
          finish_reason: result.finish_reason,
        },
      });

      return {
        content: result.content,
        tool_calls: (result.tool_calls ?? []) as ChatResponse["tool_calls"],
        model_used: result.model,
        provider_used: result.model.split("/")[0] ?? "unknown",
        finish_reason: result.finish_reason,
        usage: result.usage,
        cost_usd: result.cost_usd,
        latency_ms: result.latency_ms,
        fallback_hops: hops,
      };
    } catch (e) {
      const err = e as AIProviderError;
      lastError = err;

      // invalid_api_key → abort (inutile altri modelli)
      if (err.code === "invalid_api_key") throw err;

      const shouldFallback =
        err.code === "rate_limit" ||
        err.code === "timeout" ||
        err.code === "model_not_found" ||
        err.code === "context_too_long" ||
        err.code === "feature_not_supported" ||
        err.code === "unknown";

      if (!shouldFallback || i === modelChain.length - 1) throw err;
    }
  }

  throw lastError ?? new Error("AI chat failed on all fallback models");
}

// Re-export per consumer
export type {
  ChatRequest,
  ChatResponse,
  TaskKind,
  ChatMessage,
  ToolDefinition,
  ToolCall,
  AIProviderError,
} from "./types.ts";
