// MP05 — Chiamata diretta a OpenRouter con retry + timeout.
// Il wrapper chiamante (index.ts) gestisce la fallback chain.

import { makeAIError, type AIProviderError } from "./types.ts";
import { segnalaErroreAI } from "../allarmeAI.ts";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_RETRIES = 2;

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
  /** true = costo stimato localmente (OpenRouter non ha mandato il costo).
   *  false = costo reale fornito da OpenRouter (`usage.cost` nel corpo). */
  cost_is_estimated: boolean;
  /** Id della generazione su OpenRouter (`gen-…`): serve a unire il registro all'export. */
  generation_id?: string | null;
  finish_reason: string;
  latency_ms: number;
}

export async function callOpenRouter(
  params: OpenRouterParams,
  metadata: { task_kind: string; company_id?: string | null },
): Promise<OpenRouterResult> {
  try {
    return await chiamaOpenRouter(params, metadata);
  } catch (e) {
    // Credito finito (402), chiave rifiutata (401), tetto della chiave: si
    // segnala QUI, dove nasce l'errore, per tutte le funzioni che passano da
    // questo client — anche quelle che lo chiamano senza la catena di ripiego
    // di index.ts (allarmeAI.ts). Non aspetta e non lancia: l'errore vero
    // prosegue com'era.
    segnalaErroreAI(e, {
      funzione: metadata.task_kind,
      modello: params.model,
      companyId: metadata.company_id,
    });
    throw e;
  }
}

async function chiamaOpenRouter(
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
  const siteUrl =
    Deno.env.get("OPENROUTER_SITE_URL") ?? "https://www.ediliziaincloud.com";

  const backoff = [500, 2000];
  let lastError: AIProviderError | null = null;

  for (let attempt = 0; attempt <= DEFAULT_RETRIES; attempt++) {
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
        // `usage: { include: true }`: senza, OpenRouter non manda il costo vero
        // (`usage.cost`) e si ricade nella stima fissa 1,5/6 $ per milione di token.
        body: JSON.stringify({ ...params, usage: { include: true } }),
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
        if (attempt < DEFAULT_RETRIES) {
          await sleep(backoff[attempt] ?? 2000);
          continue;
        }
        throw lastError;
      }

      if (resp.status >= 500) {
        const body = await safeRead(resp);
        lastError = makeAIError(
          "unknown",
          `OpenRouter ${resp.status}: ${body}`,
          true,
          resp.status,
        );
        if (attempt < DEFAULT_RETRIES) {
          await sleep(backoff[attempt] ?? 2000);
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
          throw makeAIError("context_too_long", body.substring(0, 300), false, resp.status);
        }
        throw makeAIError(
          "unknown",
          `OpenRouter ${resp.status}: ${body.substring(0, 300)}`,
          false,
          resp.status,
        );
      }

      const json = (await resp.json()) as {
        id?: string;
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
          /** Costo vero della chiamata in USD, presente solo se richiesto con `usage: { include: true }`. */
          cost?: number;
        };
      };

      const choice = json.choices?.[0];
      if (!choice) {
        throw makeAIError("unknown", "OpenRouter: no choices in response", false);
      }

      // Costo REALE da OpenRouter: sta nel corpo (`usage.cost`, in USD) se lo si
      // chiede con `usage: { include: true }`. L'header `x-or-cost`, che questo
      // codice cercava, nei dati di produzione non arriva mai: fino al 05/10/2026
      // ogni chiamata passava dalla stima fissa 1,5/6 $ per milione di token, che
      // dimezzava Sonnet 4 e gonfiava Haiku del 63%, e il registro la chiamava
      // «non stimata». Se manca tutto si ricade sulla stima, dichiarandola.
      const costoCorpo = typeof json.usage?.cost === "number" ? json.usage.cost : NaN;
      const costHeader = resp.headers.get("x-or-cost");
      const costoHeader = costHeader ? Number(costHeader) : NaN;
      const costoVero = Number.isFinite(costoCorpo) && costoCorpo >= 0
        ? costoCorpo
        : Number.isFinite(costoHeader) && costoHeader >= 0
        ? costoHeader
        : null;
      const costIsEstimated = costoVero === null;
      const costUsd = costoVero ?? estimateCost(json.usage ?? null, params.model);

      if (costIsEstimated) {
        console.warn(JSON.stringify({
          level: "warn",
          fn: "callOpenRouter",
          msg: "costo non fornito da OpenRouter (né usage.cost né x-or-cost) — stimato localmente, potrebbe non rispecchiare la spesa vera",
          model: params.model,
          task_kind: metadata.task_kind,
        }));
      }

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
        cost_is_estimated: costIsEstimated,
        generation_id: typeof json.id === "string" ? json.id : null,
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
        if (attempt < DEFAULT_RETRIES) {
          await sleep(backoff[attempt] ?? 2000);
          continue;
        }
        throw lastError;
      }
      lastError = makeAIError(
        "unknown",
        String(asError.message ?? e),
        true,
      );
      if (attempt < DEFAULT_RETRIES) {
        await sleep(backoff[attempt] ?? 2000);
        continue;
      }
      throw lastError;
    }
  }

  throw lastError ?? makeAIError("unknown", "Errore sconosciuto dopo retry", false);
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
