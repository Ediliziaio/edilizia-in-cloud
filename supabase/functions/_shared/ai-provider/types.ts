// MP05 — Tipi condivisi AI Provider layer.
import type { AiTurnControl } from "../aiTurnControl.ts";

export type TaskKind =
  | "bot_operativo_titolare"
  | "bot_operativo_operaio"
  | "assistenza_clienti"
  | "lead_qualificazione"
  | "vision_ddt"
  | "vision_cantiere"
  | "parse_rapportino"
  | "computo_metrico"
  | "bank_categorize"
  | "chat_routine"
  | "render_image_edit"
  | "render_scene_analysis"
  | "render_image_qa"
  | "default";

export type ChatMessageContentPart =
  | { type: "text"; text: string }
  | {
    type: "image_url";
    image_url: { url: string; detail?: "low" | "high" | "auto" };
  };

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | ChatMessageContentPart[] | null;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
  name?: string;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatRequest {
  task_kind: TaskKind;
  company_id?: string | null;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  tool_choice?: "auto" | "none" | "required";
  temperature?: number;
  max_tokens?: number;
  json_mode?: boolean;
  model_override?: string;
  wa_message_id?: string | null;
  /** Opaque, tenant-scoped conversation key, never a phone number. */
  session_id?: string;
  /** Same control across retries and tool iterations. Never sent to the provider. */
  turnControl?: AiTurnControl;
}

export interface ChatResponse {
  content: string | null;
  tool_calls: ToolCall[];
  model_used: string;
  provider_used: string;
  finish_reason: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  cost_usd: number;
  /** FX/costo effettivamente registrato dalla RPC, non ricalcolato dal modello richiesto. */
  cost_real_eur?: number;
  latency_ms: number;
  fallback_hops: number;
}

export type AIErrorCode =
  | "rate_limit"
  | "timeout"
  | "invalid_api_key"
  | "provider_credits_exhausted"
  | "provider_outcome_unknown"
  | "cost_unavailable"
  | "model_not_found"
  | "context_too_long"
  | "feature_not_supported"
  | "unknown";

export interface AIProviderError extends Error {
  code: AIErrorCode;
  retryable: boolean;
  provider_status?: number;
}

export function makeAIError(
  code: AIErrorCode,
  message: string,
  retryable: boolean,
  status?: number,
): AIProviderError {
  const err = new Error(message) as AIProviderError;
  err.code = code;
  err.retryable = retryable;
  err.provider_status = status;
  return err;
}
