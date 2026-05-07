// MP05 — Chiamata diretta a OpenRouter con retry + timeout.
// Il wrapper chiamante (index.ts) gestisce la fallback chain.

import { type AIProviderError, makeAIError } from "./types.ts";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_RETRIES = 1;

interface OpenRouterParams {
  model: string;
  messages: unknown[];
  tools?: unknown[];
  tool_choice?: "auto" | "none" | "required";
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
}

export interface OpenRouterResult {
  content: string | null;
  tool_calls: unknown[];
  model: string;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  cost_usd: number;
  finish_reason: string;
  latency_ms: number;
}

export async function callOpenRouter(
  params: OpenRouterParams,
  metadata: { task_kind: string; company_id?: string | null },
): Promise<OpenRouterResult> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY");
  if (!apiKey) {
    throw makeAIError(
      "invalid_api_key",
      "OPENROUTER_API_KEY non configurata in Supabase secrets",
      false,
    );
  }

  const appName = Deno.env.get("OPENROUTER_APP_NAME") ?? "EdiliziaInCloud";
  const siteUrl = Deno.env.get("OPENROUTER_SITE_URL") ??
    "https://ediliziaincloud.it";

  const maxRetries = readEnvInt(
    "AI_PROVIDER_REQUEST_RETRIES",
    DEFAULT_RETRIES,
    0,
    3,
  );
  let lastError: AIProviderError | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    const startMs = Date.now();

    try {
      const resp = await fetch(OPENROUTER_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "HTTP-Referer": siteUrl,
          "X-Title": appName,
          "X-OR-Task-Kind": metadata.task_kind,
          ...(metadata.company_id
            ? { "X-OR-Company": metadata.company_id }
            : {}),
        },
        body: JSON.stringify(params),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startMs;

      if (resp.status === 429) {
        const body = await safeRead(resp);
        lastError = makeAIError(
          "rate_limit",
          `OpenRouter 429: ${body}`,
          true,
          429,
        );
        if (attempt < maxRetries) {
          await sleep(getBackoffMs(attempt, resp.headers.get("retry-after")));
          continue;
        }
        throw lastError;
      }

      if ([500, 502, 503, 504].includes(resp.status)) {
        const body = await safeRead(resp);
        lastError = makeAIError(
          "unknown",
          `OpenRouter ${resp.status}: ${body}`,
          true,
          resp.status,
        );
        if (attempt < maxRetries) {
          await sleep(getBackoffMs(attempt, resp.headers.get("retry-after")));
          continue;
        }
        throw lastError;
      }

      if (resp.status === 401 || resp.status === 403) {
        throw makeAIError(
          "invalid_api_key",
          `OpenRouter ${resp.status}`,
          false,
          resp.status,
        );
      }

      if (resp.status === 404) {
        throw makeAIError(
          "model_not_found",
          `Model not available: ${params.model}`,
          false,
          404,
        );
      }

      if (!resp.ok) {
        const body = await safeRead(resp);
        if (/context.*exceeded|too large|too many tokens/i.test(body)) {
          throw makeAIError(
            "context_too_long",
            body.substring(0, 300),
            false,
            resp.status,
          );
        }
        throw makeAIError(
          "unknown",
          `OpenRouter ${resp.status}: ${body.substring(0, 300)}`,
          false,
          resp.status,
        );
      }

      const json = (await resp.json()) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            tool_calls?: unknown[];
          };
          finish_reason?: string;
        }>;
        model?: string;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };

      const choice = json.choices?.[0];
      if (!choice) {
        throw makeAIError(
          "unknown",
          "OpenRouter: no choices in response",
          false,
        );
      }

      const costHeader = resp.headers.get("x-or-cost");
      const costUsd = costHeader
        ? Number(costHeader)
        : estimateCost(json.usage ?? null, params.model);

      return {
        content: choice.message?.content ?? null,
        tool_calls: choice.message?.tool_calls ?? [],
        model: json.model ?? params.model,
        usage: {
          prompt_tokens: json.usage?.prompt_tokens ?? 0,
          completion_tokens: json.usage?.completion_tokens ?? 0,
          total_tokens: json.usage?.total_tokens ?? 0,
        },
        cost_usd: isNaN(costUsd) ? 0 : costUsd,
        finish_reason: choice.finish_reason ?? "stop",
        latency_ms: latencyMs,
      };
    } catch (e) {
      clearTimeout(timeoutId);
      const err = e as AIProviderError;
      if (err?.code) throw err;
      const asError = e as Error;
      if (asError.name === "AbortError") {
        lastError = makeAIError(
          "timeout",
          `Timeout dopo ${DEFAULT_TIMEOUT_MS}ms`,
          true,
        );
        // Non ritentare i timeout: sotto carico aumentano code lente e costi.
        throw lastError;
      }
      lastError = makeAIError(
        "unknown",
        String(asError.message ?? e),
        true,
      );
      if (attempt < maxRetries) {
        await sleep(getBackoffMs(attempt, null));
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ??
    makeAIError("unknown", "Errore sconosciuto dopo retry", false);
}

async function safeRead(resp: Response): Promise<string> {
  try {
    return (await resp.text()).substring(0, 500);
  } catch {
    return "";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function readEnvInt(
  name: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = Number(Deno.env.get(name) ?? fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.floor(raw), min), max);
}

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

function getBackoffMs(attempt: number, retryAfter: string | null): number {
  const retryAfterMs = parseRetryAfterMs(retryAfter);
  if (retryAfterMs !== null) {
    return Math.min(Math.max(retryAfterMs, 250), 8_000);
  }
  const jitter = crypto.getRandomValues(new Uint32Array(1))[0] % 250;
  return (attempt + 1) * 750 + jitter;
}

function estimateCost(
  usage: { prompt_tokens?: number; completion_tokens?: number } | null,
  _modelId: string,
): number {
  if (!usage) return 0;
  const avgIn = 1.5;
  const avgOut = 6.0;
  return (
    ((usage.prompt_tokens ?? 0) * avgIn +
      (usage.completion_tokens ?? 0) * avgOut) /
    1_000_000
  );
}
