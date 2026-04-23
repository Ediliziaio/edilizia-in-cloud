// MP05 — Entry point AIProvider: chat() con fallback chain automatico.
//
// USAGE minimale:
//   import { chat } from "../_shared/ai-provider/index.ts";
//   const r = await chat({
//     task_kind: "bot_operativo_operaio",
//     company_id: "11111111-...",
//     messages: [{ role: "user", content: "Ciao" }],
//   });
//   console.log(r.content, r.model_used, r.cost_usd);

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

export async function chat(req: ChatRequest): Promise<ChatResponse> {
  const supabase = getSupabase();

  const config = await resolveModelConfig(
    supabase,
    req.task_kind,
    req.company_id,
  );
  if (!config.enabled) {
    throw new Error(
      `Task ${req.task_kind} disabilitato per company ${req.company_id ?? "global"}`,
    );
  }

  const modelChain = req.model_override
    ? [req.model_override]
    : [config.primary_model, ...config.fallback_chain];

  const temperature = req.temperature ?? config.temperature;
  const max_tokens = req.max_tokens ?? config.max_tokens;

  let lastError: AIProviderError | null = null;
  let hops = 0;

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

      await logUsage(supabase, {
        company_id: req.company_id ?? null,
        task_kind: req.task_kind,
        model_requested: modelChain[0],
        model_used: result.model,
        provider_used: extractProvider(result.model),
        fallback_hops: hops,
        tokens_prompt: result.usage.prompt_tokens,
        tokens_completion: result.usage.completion_tokens,
        tokens_total: result.usage.total_tokens,
        cost_usd: result.cost_usd,
        latency_ms: result.latency_ms,
        ok: true,
        wa_message_id: req.wa_message_id ?? null,
      });

      return {
        content: result.content,
        tool_calls: (result.tool_calls ?? []) as ChatResponse["tool_calls"],
        model_used: result.model,
        provider_used: extractProvider(result.model),
        finish_reason: result.finish_reason,
        usage: result.usage,
        cost_usd: result.cost_usd,
        latency_ms: result.latency_ms,
        fallback_hops: hops,
      };
    } catch (e) {
      const err = e as AIProviderError;
      lastError = err;

      await logUsage(supabase, {
        company_id: req.company_id ?? null,
        task_kind: req.task_kind,
        model_requested: modelChain[0],
        model_used: model,
        provider_used: extractProvider(model),
        fallback_hops: hops,
        tokens_prompt: 0,
        tokens_completion: 0,
        tokens_total: 0,
        cost_usd: 0,
        latency_ms: 0,
        ok: false,
        error_code: err.code ?? "unknown",
        error_detail: String(err.message ?? e).substring(0, 500),
        wa_message_id: req.wa_message_id ?? null,
      }).catch(() => {
        /* silent */
      });

      // API key invalida → abort (inutile provare altri modelli)
      if (err.code === "invalid_api_key") throw err;

      const shouldFallback =
        err.code === "rate_limit" ||
        err.code === "timeout" ||
        err.code === "model_not_found" ||
        err.code === "context_too_long" ||
        err.code === "feature_not_supported" ||
        err.code === "unknown";

      if (!shouldFallback || i === modelChain.length - 1) {
        throw err;
      }
      // else: continua chain
    }
  }

  throw lastError ?? new Error("AI chat failed on all fallback models");
}

function extractProvider(modelId: string): string {
  return modelId.split("/")[0] ?? "unknown";
}

interface UsageLogEntry {
  company_id: string | null;
  task_kind: string;
  model_requested: string;
  model_used: string;
  provider_used: string;
  fallback_hops: number;
  tokens_prompt: number;
  tokens_completion: number;
  tokens_total: number;
  cost_usd: number;
  latency_ms: number;
  ok: boolean;
  error_code?: string;
  error_detail?: string;
  wa_message_id: string | null;
}

async function logUsage(
  supabase: SupabaseClient,
  entry: UsageLogEntry,
): Promise<void> {
  await supabase.from("ai_model_usage_log").insert(entry);
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
