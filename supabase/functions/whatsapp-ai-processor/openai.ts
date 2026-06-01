// MP02 → MP05 — Wrapper di retrocompatibilità sul nuovo AI provider layer.
// Mantiene la stessa firma (ChatMessage/OpenAIRequest/OpenAIResponse) usata
// dal processor e dai sub-processor (assistenza/lead), ma redirige ogni
// chiamata al modulo _shared/ai-provider/ che gestisce routing, fallback chain
// e logging in ai_model_usage_log.
//
// Whisper audio transcription NON passa da OpenRouter (non supportato) → resta
// su OpenAI diretto.

import {
  chat,
  type ChatRequest,
  type ChatMessage as ProviderChatMessage,
  type TaskKind,
  type ToolDefinition,
} from "../_shared/ai-provider/index.ts";

// ── Re-export tipi per compat con codice esistente ──────────────────────────

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
  tool_call_id?: string;
}

export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface OpenAIRequest {
  model?: string;               // diventa model_override (solo test/debug)
  messages: ChatMessage[];
  tools?: OpenAITool[];
  tool_choice?: "auto" | "none" | "required";
  temperature?: number;
  max_tokens?: number;
  // MP05: parametri nuovi per routing
  task_kind?: TaskKind;
  company_id?: string | null;
  wa_message_id?: string | null;
  json_mode?: boolean;
}

export interface OpenAIChoice {
  index: number;
  finish_reason: string;
  message: ChatMessage;
}

export interface OpenAIResponse {
  id: string;
  model: string;
  choices: OpenAIChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  // MP05: metadati aggiuntivi (provider, costo, fallback hops)
  _meta?: {
    provider: string;
    cost_usd: number;
    latency_ms: number;
    fallback_hops: number;
  };
}

// ── Entry point refactored ─────────────────────────────────────────────────

export async function callOpenAI(req: OpenAIRequest): Promise<OpenAIResponse> {
  const chatReq: ChatRequest = {
    task_kind: req.task_kind ?? "default",
    company_id: req.company_id ?? null,
    messages: req.messages as ProviderChatMessage[],
    tools: req.tools as ToolDefinition[] | undefined,
    tool_choice: req.tool_choice,
    temperature: req.temperature,
    max_tokens: req.max_tokens,
    model_override: req.model,
    wa_message_id: req.wa_message_id ?? null,
    json_mode: req.json_mode,
  };

  const response = await chat(chatReq);

  return {
    id: `ai-${Date.now()}`,
    model: response.model_used,
    choices: [
      {
        index: 0,
        finish_reason: response.finish_reason,
        message: {
          role: "assistant",
          content: response.content,
          tool_calls:
            response.tool_calls.length > 0 ? response.tool_calls : undefined,
        },
      },
    ],
    usage: response.usage,
    _meta: {
      provider: response.provider_used,
      cost_usd: response.cost_usd,
      latency_ms: response.latency_ms,
      fallback_hops: response.fallback_hops,
    },
  };
}

// ── Whisper audio transcription (resta su OpenAI diretto — R32) ─────────────

export async function transcribeAudioWhisper(
  audioBytes: Uint8Array,
  filename = "audio.ogg",
  prompt?: string,
): Promise<string> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");
  if (!apiKey) throw new Error("OPENAI_API_KEY non configurata");

  const form = new FormData();
  const audioBuffer = new ArrayBuffer(audioBytes.byteLength);
  new Uint8Array(audioBuffer).set(audioBytes);
  form.append("file", new Blob([audioBuffer]), filename);
  form.append("model", "whisper-1");
  form.append("language", "it");
  // Bias verso il lessico di cantiere → meno errori su gergo/sigle (DDT, mq, ml…).
  if (prompt && prompt.trim()) form.append("prompt", prompt.trim());
  // Determinismo: stessa traccia → stessa trascrizione.
  form.append("temperature", "0");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25_000);

  try {
    const resp = await fetch(
      "https://api.openai.com/v1/audio/transcriptions",
      {
        method: "POST",
        headers: { "Authorization": `Bearer ${apiKey}` },
        body: form,
        signal: controller.signal,
      },
    );
    clearTimeout(timeoutId);

    if (!resp.ok) {
      throw new Error(
        `Whisper ${resp.status}: ${(await resp.text()).substring(0, 200)}`,
      );
    }
    const json = (await resp.json()) as { text?: string };
    return json.text ?? "";
  } catch (e) {
    clearTimeout(timeoutId);
    throw e;
  }
}
