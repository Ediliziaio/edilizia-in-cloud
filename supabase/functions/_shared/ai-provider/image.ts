// _shared/ai-provider/image.ts
// Image generation/edit via Gemini 2.5 Flash Image ("Nano Banana") con
// fallback OpenRouter e OpenAI diretto.
//
// Compagno di openrouter.ts: stesso stile, stessi headers, stessa retry policy.
// Tutti i render AI (infissi, bagno, facciata, pavimento, etc.) passano qui.
//
// Routing:
//   1) Gemini 2.5 Flash Image via Google Gemini API diretto
//   2) Fallback: Gemini 2.5 Flash Image via OpenRouter
//   3) Fallback: OpenAI image via OpenRouter
//   4) Last resort: OpenAI image diretto
//
// DALL-E 2/3 NON sono mai presenti nella chain. Sono deprecati.

import { type AIProviderError, makeAIError } from "./types.ts";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const GEMINI_API_ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/models";
const OPENAI_IMAGES_EDIT_ENDPOINT = "https://api.openai.com/v1/images/edits";
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_RETRIES = 2;

export const IMAGE_MODEL_GEMINI_DIRECT =
  Deno.env.get("GEMINI_IMAGE_MODEL")?.trim() ||
  Deno.env.get("RENDER_GEMINI_MODEL")?.trim() ||
  "gemini-2.5-flash-image";
export const IMAGE_MODEL_PRIMARY = "google/gemini-2.5-flash-image";
// FIX 2026-05-15: il default era `openai/gpt-image-1.5` che NON esiste nel
// catalog OpenRouter (verificato via debug-ai-providers endpoint).
// I modelli OpenAI image disponibili oggi su OpenRouter sono:
// openai/gpt-5-image, openai/gpt-5-image-mini, openai/gpt-5.4-image-2.
// Usiamo gpt-5-image come default stabile (markup standard).
export const IMAGE_MODEL_OPENROUTER_OPENAI =
  Deno.env.get("OPENROUTER_OPENAI_IMAGE_MODEL")?.trim() ||
  Deno.env.get("RENDER_OPENROUTER_OPENAI_IMAGE_MODEL")?.trim() ||
  "openai/gpt-5-image";
export const IMAGE_MODEL_OPENAI_DIRECT =
  Deno.env.get("OPENAI_IMAGE_MODEL")?.trim() ||
  Deno.env.get("RENDER_OPENAI_IMAGE_MODEL")?.trim() ||
  "gpt-image-1.5";

export type ImageProvider = "gemini_direct" | "openrouter" | "openai_direct";

export interface ImageProviderAttempt {
  model: string;
  provider: ImageProvider;
  ok: boolean;
  tier: number;
  latencyMs?: number;
  error?: string;
  code?: string;
  status?: number;
}

export interface ImageEditParams {
  /** Prompt completo (system+user concatenato dal chiamante). */
  prompt: string;
  /** Foto sorgente in Blob (preferito) o data URL base64. */
  sourceImageBlob?: Blob;
  sourceImageDataUrl?: string;
  /** Hint dimensioni dell'input — usato solo da eventuali provider fallback. */
  effectiveWidth?: number;
  effectiveHeight?: number;
  /** OpenAI quality tier — usato sui fallback OpenAI. */
  openaiQuality?: "low" | "medium" | "high";
  /** Negative prompt opzionale — su Gemini viene incluso nel prompt. */
  negativePrompt?: string;
  /** Timeout per chiamata singola (millisecondi). */
  timeoutMs?: number;
  /** Metadati per tracciamento (logging + header X-OR-*). */
  metadata: {
    task_kind: string;
    company_id?: string | null;
    session_id?: string | null;
  };
}

export interface ImageEditResult {
  /** Data URL completo "data:image/png;base64,..." */
  imageDataUrl: string;
  modelUsed: string;
  providerUsed: ImageProvider;
  attempts: number;
  /** Storico completo dei provider provati, inclusi i fallback falliti. */
  attemptHistory: ImageProviderAttempt[];
  rawResponse: Record<string, unknown>;
  costUsd?: number;
  costIsEstimated: boolean;
  latencyMs: number;
}

/**
 * Edit foto con fallback Gemini diretto → OpenRouter Gemini → OpenRouter OpenAI → OpenAI diretto.
 * Throw aggregato se TUTTI i modelli falliscono.
 */
export async function editImage(
  args: ImageEditParams,
): Promise<ImageEditResult> {
  const errors: Array<{ model: string; error: string }> = [];
  const attemptHistory: ImageProviderAttempt[] = [];

  // ── 1) Gemini Nano Banana diretto ───────────────────────────────────────
  try {
    const result = await callGeminiImage({
      model: IMAGE_MODEL_GEMINI_DIRECT,
      params: args,
    });
    attemptHistory.push({
      model: IMAGE_MODEL_GEMINI_DIRECT,
      provider: "gemini_direct",
      ok: true,
      tier: 1,
      latencyMs: result.latencyMs,
    });
    return {
      ...result,
      attempts: 1,
      providerUsed: "gemini_direct",
      attemptHistory,
    };
  } catch (e) {
    const err = e as AIProviderError;
    errors.push({ model: IMAGE_MODEL_GEMINI_DIRECT, error: err.message });
    attemptHistory.push({
      model: IMAGE_MODEL_GEMINI_DIRECT,
      provider: "gemini_direct",
      ok: false,
      tier: 1,
      error: err.message.substring(0, 500),
      code: err.code,
      status: err.provider_status,
    });
    logImageError({
      session_id: args.metadata.session_id,
      model: IMAGE_MODEL_GEMINI_DIRECT,
      msg: err.message,
    });
  }

  // ── 2) Gemini Nano Banana via OpenRouter ────────────────────────────────
  try {
    const result = await callOpenRouterImage({
      model: IMAGE_MODEL_PRIMARY,
      params: args,
    });
    attemptHistory.push({
      model: IMAGE_MODEL_PRIMARY,
      provider: "openrouter",
      ok: true,
      tier: 2,
      latencyMs: result.latencyMs,
    });
    return {
      ...result,
      attempts: 2,
      providerUsed: "openrouter",
      attemptHistory,
    };
  } catch (e) {
    const err = e as AIProviderError;
    errors.push({ model: IMAGE_MODEL_PRIMARY, error: err.message });
    attemptHistory.push({
      model: IMAGE_MODEL_PRIMARY,
      provider: "openrouter",
      ok: false,
      tier: 2,
      error: err.message.substring(0, 500),
      code: err.code,
      status: err.provider_status,
    });
    logImageError({
      session_id: args.metadata.session_id,
      model: IMAGE_MODEL_PRIMARY,
      msg: err.message,
    });
  }

  // ── 3) OpenAI image via OpenRouter ─────────────────────────────────────
  try {
    const result = await callOpenRouterImage({
      model: IMAGE_MODEL_OPENROUTER_OPENAI,
      params: args,
    });
    attemptHistory.push({
      model: IMAGE_MODEL_OPENROUTER_OPENAI,
      provider: "openrouter",
      ok: true,
      tier: 3,
      latencyMs: result.latencyMs,
    });
    return {
      ...result,
      attempts: 3,
      providerUsed: "openrouter",
      attemptHistory,
    };
  } catch (e) {
    const err = e as AIProviderError;
    errors.push({ model: IMAGE_MODEL_OPENROUTER_OPENAI, error: err.message });
    attemptHistory.push({
      model: IMAGE_MODEL_OPENROUTER_OPENAI,
      provider: "openrouter",
      ok: false,
      tier: 3,
      error: err.message.substring(0, 500),
      code: err.code,
      status: err.provider_status,
    });
    logImageError({
      session_id: args.metadata.session_id,
      model: IMAGE_MODEL_OPENROUTER_OPENAI,
      msg: err.message,
    });
  }

  // ── 4) Last resort: OpenAI diretto ─────────────────────────────────────
  try {
    const result = await callOpenAIImage({
      model: IMAGE_MODEL_OPENAI_DIRECT,
      params: args,
    });
    attemptHistory.push({
      model: IMAGE_MODEL_OPENAI_DIRECT,
      provider: "openai_direct",
      ok: true,
      tier: 4,
      latencyMs: result.latencyMs,
    });
    return {
      ...result,
      attempts: 4,
      providerUsed: "openai_direct",
      attemptHistory,
    };
  } catch (e) {
    const err = e as AIProviderError;
    errors.push({ model: IMAGE_MODEL_OPENAI_DIRECT, error: err.message });
    attemptHistory.push({
      model: IMAGE_MODEL_OPENAI_DIRECT,
      provider: "openai_direct",
      ok: false,
      tier: 4,
      error: err.message.substring(0, 500),
      code: err.code,
      status: err.provider_status,
    });
    logImageError({
      session_id: args.metadata.session_id,
      model: IMAGE_MODEL_OPENAI_DIRECT,
      msg: err.message,
    });
  }

  throw withAttemptHistory(
    makeAIError(
      "unknown",
      `Image edit failed on all providers: ${
        errors
          .map((e) => `[${e.model}] ${e.error}`)
          .join(" | ")
      }`,
      false,
    ),
    attemptHistory,
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Provider implementations
// ────────────────────────────────────────────────────────────────────────────

interface ProviderCallArgs {
  model: string;
  params: ImageEditParams;
}

interface ProviderCallResult {
  imageDataUrl: string;
  modelUsed: string;
  rawResponse: Record<string, unknown>;
  costUsd?: number;
  costIsEstimated: boolean;
  latencyMs: number;
}

async function callGeminiImage(
  args: ProviderCallArgs,
): Promise<ProviderCallResult> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw makeAIError(
      "invalid_api_key",
      "GEMINI_API_KEY non configurata nei Supabase secrets",
      false,
    );
  }

  const timeoutMs = args.params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const sourceDataUrl = await ensureSourceDataUrl(args.params);
  const { mime, base64 } = splitDataUrl(sourceDataUrl);
  const fullPrompt = args.params.negativePrompt
    ? `${args.params.prompt}\n\n[NEGATIVE]\n${args.params.negativePrompt}`
    : args.params.prompt;

  const body = {
    contents: [
      {
        role: "user",
        parts: [
          { text: fullPrompt },
          { inline_data: { mime_type: mime, data: base64 } },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["Image"],
    },
  };

  const backoff = [1500, 4000];
  let lastErr: AIProviderError | null = null;

  for (let attempt = 0; attempt <= DEFAULT_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startMs = Date.now();

    try {
      const resp = await fetch(
        `${GEMINI_API_ENDPOINT}/${args.model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        },
      );
      clearTimeout(timer);
      const latencyMs = Date.now() - startMs;

      if (resp.status === 429) {
        const txt = await safeRead(resp);
        lastErr = makeAIError("rate_limit", `Gemini 429: ${txt}`, true, 429);
        if (attempt < DEFAULT_RETRIES) {
          await sleep(backoff[attempt] ?? 4000);
          continue;
        }
        throw lastErr;
      }

      if (resp.status >= 500) {
        const txt = await safeRead(resp);
        lastErr = makeAIError(
          "unknown",
          `Gemini ${resp.status}: ${txt}`,
          true,
          resp.status,
        );
        if (attempt < DEFAULT_RETRIES) {
          await sleep(backoff[attempt] ?? 4000);
          continue;
        }
        throw lastErr;
      }

      if (resp.status === 401 || resp.status === 403) {
        throw makeAIError(
          "invalid_api_key",
          `Gemini ${resp.status}`,
          false,
          resp.status,
        );
      }

      if (resp.status === 404) {
        throw makeAIError(
          "model_not_found",
          `Gemini model not available: ${args.model}`,
          false,
          404,
        );
      }

      if (!resp.ok) {
        const txt = await safeRead(resp);
        throw makeAIError(
          "unknown",
          `Gemini ${resp.status}: ${txt.substring(0, 300)}`,
          false,
          resp.status,
        );
      }

      const json = (await resp.json()) as Record<string, unknown>;
      const imageDataUrl = extractGeminiImage(json);
      if (!imageDataUrl) {
        throw makeAIError("unknown", "Gemini: no image in response", false);
      }

      return {
        imageDataUrl,
        modelUsed: args.model,
        rawResponse: json,
        costUsd: undefined,
        costIsEstimated: true,
        latencyMs,
      };
    } catch (e) {
      clearTimeout(timer);
      const err = e as AIProviderError;
      if (err?.code) {
        if (!err.retryable || attempt >= DEFAULT_RETRIES) throw err;
        lastErr = err;
        await sleep(backoff[attempt] ?? 4000);
        continue;
      }
      const asError = e as Error;
      if (asError.name === "AbortError") {
        lastErr = makeAIError("timeout", `Timeout dopo ${timeoutMs}ms`, true);
        if (attempt < DEFAULT_RETRIES) {
          await sleep(backoff[attempt] ?? 4000);
          continue;
        }
        throw lastErr;
      }
      lastErr = makeAIError("unknown", String(asError.message ?? e), true);
      if (attempt < DEFAULT_RETRIES) {
        await sleep(backoff[attempt] ?? 4000);
        continue;
      }
      throw lastErr;
    }
  }

  throw lastErr ??
    makeAIError("unknown", "Errore image edit Gemini dopo retry", false);
}

async function callOpenRouterImage(
  args: ProviderCallArgs,
): Promise<ProviderCallResult> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY")?.trim();
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
  const timeoutMs = args.params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Converti sourceImageBlob → data URL se necessario
  const sourceDataUrl = await ensureSourceDataUrl(args.params);

  const fullPrompt = args.params.negativePrompt
    ? `${args.params.prompt}\n\n[NEGATIVE]\n${args.params.negativePrompt}`
    : args.params.prompt;

  const body = {
    model: args.model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: fullPrompt },
          { type: "image_url", image_url: { url: sourceDataUrl } },
        ],
      },
    ],
    modalities: ["image", "text"],
  };

  const backoff = [1500, 4000];
  let lastErr: AIProviderError | null = null;

  for (let attempt = 0; attempt <= DEFAULT_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startMs = Date.now();

    try {
      const resp = await fetch(OPENROUTER_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "HTTP-Referer": siteUrl,
          "X-Title": `${appName} — Render AI`,
          "X-OR-Task-Kind": args.params.metadata.task_kind,
          ...(args.params.metadata.company_id
            ? { "X-OR-Company": args.params.metadata.company_id }
            : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const latencyMs = Date.now() - startMs;

      if (resp.status === 429) {
        const txt = await safeRead(resp);
        lastErr = makeAIError(
          "rate_limit",
          `OpenRouter 429: ${txt}`,
          true,
          429,
        );
        if (attempt < DEFAULT_RETRIES) {
          await sleep(backoff[attempt] ?? 4000);
          continue;
        }
        throw lastErr;
      }

      if (resp.status >= 500) {
        const txt = await safeRead(resp);
        lastErr = makeAIError(
          "unknown",
          `OpenRouter ${resp.status}: ${txt}`,
          true,
          resp.status,
        );
        if (attempt < DEFAULT_RETRIES) {
          await sleep(backoff[attempt] ?? 4000);
          continue;
        }
        throw lastErr;
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
          `Model not available on OpenRouter: ${args.model}`,
          false,
          404,
        );
      }

      if (!resp.ok) {
        const txt = await safeRead(resp);
        throw makeAIError(
          "unknown",
          `OpenRouter ${resp.status}: ${txt.substring(0, 300)}`,
          false,
          resp.status,
        );
      }

      const json = (await resp.json()) as Record<string, unknown>;
      const imageDataUrl = extractOpenRouterImage(json);
      if (!imageDataUrl) {
        throw makeAIError("unknown", "OpenRouter: no image in response", false);
      }

      const costHeader = resp.headers.get("x-or-cost");
      const costUsd = costHeader ? Number(costHeader) : undefined;

      return {
        imageDataUrl,
        modelUsed: args.model,
        rawResponse: json,
        costUsd,
        costIsEstimated: !costHeader,
        latencyMs,
      };
    } catch (e) {
      clearTimeout(timer);
      const err = e as AIProviderError;
      if (err?.code) {
        if (!err.retryable || attempt >= DEFAULT_RETRIES) throw err;
        lastErr = err;
        await sleep(backoff[attempt] ?? 4000);
        continue;
      }
      const asError = e as Error;
      if (asError.name === "AbortError") {
        lastErr = makeAIError("timeout", `Timeout dopo ${timeoutMs}ms`, true);
        if (attempt < DEFAULT_RETRIES) {
          await sleep(backoff[attempt] ?? 4000);
          continue;
        }
        throw lastErr;
      }
      lastErr = makeAIError("unknown", String(asError.message ?? e), true);
      if (attempt < DEFAULT_RETRIES) {
        await sleep(backoff[attempt] ?? 4000);
        continue;
      }
      throw lastErr;
    }
  }

  throw lastErr ??
    makeAIError("unknown", "Errore image edit dopo retry", false);
}

async function callOpenAIImage(
  args: ProviderCallArgs,
): Promise<ProviderCallResult> {
  // OpenAI diretto (non OpenRouter): /v1/images/edits con multipart/form-data.
  // Tieniamo il diretto perché OpenRouter image API non sempre è stabile
  // per i parametri "edit" (size, quality, n).
  const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim() ||
    Deno.env.get("RENDER_OPENAI_API_KEY")?.trim() ||
    "";
  if (!apiKey) {
    throw makeAIError(
      "invalid_api_key",
      "OPENAI_API_KEY non configurata in Supabase secrets",
      false,
    );
  }

  const timeoutMs = args.params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const quality = args.params.openaiQuality ?? "medium";

  // gpt-image-1.5 e gpt-image-1 condividono lo schema delle size:
  // 1024x1024, 1536x1024, 1024x1536.
  const size = pickOpenAISize(
    args.params.effectiveWidth,
    args.params.effectiveHeight,
  );

  const sourceBlob = await ensureSourceBlob(args.params);

  const backoff = [1500, 4000];
  let lastErr: AIProviderError | null = null;

  for (let attempt = 0; attempt <= DEFAULT_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startMs = Date.now();

    try {
      const form = new FormData();
      form.append("model", args.model);
      form.append("prompt", buildOpenAIPrompt(args.params));
      form.append("image[]", sourceBlob, "photo.jpg");
      form.append("n", "1");
      form.append("size", size);
      form.append("quality", quality);

      const resp = await fetch(OPENAI_IMAGES_EDIT_ENDPOINT, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: controller.signal,
      });
      clearTimeout(timer);
      const latencyMs = Date.now() - startMs;

      if (resp.status === 429) {
        const txt = await safeRead(resp);
        lastErr = makeAIError("rate_limit", `OpenAI 429: ${txt}`, true, 429);
        if (attempt < DEFAULT_RETRIES) {
          await sleep(backoff[attempt] ?? 4000);
          continue;
        }
        throw lastErr;
      }

      if (resp.status >= 500) {
        const txt = await safeRead(resp);
        lastErr = makeAIError(
          "unknown",
          `OpenAI ${resp.status}: ${txt}`,
          true,
          resp.status,
        );
        if (attempt < DEFAULT_RETRIES) {
          await sleep(backoff[attempt] ?? 4000);
          continue;
        }
        throw lastErr;
      }

      if (resp.status === 401 || resp.status === 403) {
        throw makeAIError(
          "invalid_api_key",
          `OpenAI ${resp.status}`,
          false,
          resp.status,
        );
      }

      if (resp.status === 404) {
        throw makeAIError(
          "model_not_found",
          `OpenAI model not available: ${args.model}`,
          false,
          404,
        );
      }

      if (!resp.ok) {
        const txt = await safeRead(resp);
        throw makeAIError(
          "unknown",
          `OpenAI ${resp.status}: ${txt.substring(0, 300)}`,
          false,
          resp.status,
        );
      }

      const json = (await resp.json()) as {
        data?: Array<{ b64_json?: string; url?: string }>;
        usage?: Record<string, number>;
      };
      const b64 = json.data?.[0]?.b64_json;
      if (!b64) {
        throw makeAIError("unknown", "OpenAI: no b64_json in response", false);
      }

      return {
        imageDataUrl: `data:image/png;base64,${b64}`,
        modelUsed: args.model,
        rawResponse: json as Record<string, unknown>,
        costUsd: undefined, // OpenAI non include header costo — capture via renderCost.ts
        costIsEstimated: true,
        latencyMs,
      };
    } catch (e) {
      clearTimeout(timer);
      const err = e as AIProviderError;
      if (err?.code) {
        if (!err.retryable || attempt >= DEFAULT_RETRIES) throw err;
        lastErr = err;
        await sleep(backoff[attempt] ?? 4000);
        continue;
      }
      const asError = e as Error;
      if (asError.name === "AbortError") {
        lastErr = makeAIError("timeout", `Timeout dopo ${timeoutMs}ms`, true);
        if (attempt < DEFAULT_RETRIES) {
          await sleep(backoff[attempt] ?? 4000);
          continue;
        }
        throw lastErr;
      }
      lastErr = makeAIError("unknown", String(asError.message ?? e), true);
      if (attempt < DEFAULT_RETRIES) {
        await sleep(backoff[attempt] ?? 4000);
        continue;
      }
      throw lastErr;
    }
  }

  throw lastErr ??
    makeAIError("unknown", "Errore image edit OpenAI dopo retry", false);
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

function extractOpenRouterImage(json: Record<string, unknown>): string | null {
  // Formato risposta OpenRouter per modalities=["image","text"]:
  //   choices[0].message.images[0].image_url.url = "data:image/png;base64,..."
  // Fallback: choices[0].message.content può contenere data URL grezzo.
  const choices = (json.choices as Array<Record<string, unknown>>) ?? [];
  const message = (choices[0]?.message as Record<string, unknown>) ?? {};

  const images = message.images as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(images) && images.length > 0) {
    const first = images[0];
    const imageUrl = (first.image_url as Record<string, unknown>)?.url;
    if (typeof imageUrl === "string" && imageUrl.startsWith("data:image/")) {
      return imageUrl;
    }
  }

  const content = message.content;
  if (typeof content === "string" && content.startsWith("data:image/")) {
    return content;
  }
  if (Array.isArray(content)) {
    for (const part of content as Array<Record<string, unknown>>) {
      const directData = typeof part.data === "string"
        ? part.data
        : typeof part.b64_json === "string"
        ? part.b64_json
        : null;
      if (directData?.startsWith("data:image/")) return directData;
      if (directData) return `data:image/png;base64,${directData}`;

      const imageUrl = part.image_url;
      if (typeof imageUrl === "string" && imageUrl.startsWith("data:image/")) {
        return imageUrl;
      }
      if (imageUrl && typeof imageUrl === "object") {
        const url = (imageUrl as Record<string, unknown>).url;
        if (typeof url === "string" && url.startsWith("data:image/")) {
          return url;
        }
      }
    }
  }

  return null;
}

function extractGeminiImage(json: Record<string, unknown>): string | null {
  const candidates = (json.candidates as Array<Record<string, unknown>>) ?? [];
  const content = (candidates[0]?.content as Record<string, unknown>) ?? {};
  const parts = (content.parts as Array<Record<string, unknown>>) ?? [];

  for (const part of parts) {
    const inlineData =
      (part.inlineData as Record<string, unknown> | undefined) ??
        (part.inline_data as Record<string, unknown> | undefined);
    const data = inlineData?.data;
    const mime = inlineData?.mimeType ?? inlineData?.mime_type ?? "image/png";
    if (typeof data === "string" && data.length > 0) {
      return data.startsWith("data:image/")
        ? data
        : `data:${mime};base64,${data}`;
    }
  }

  return null;
}

function getGeminiApiKey(): string {
  return Deno.env.get("GEMINI_API_KEY")?.trim() ||
    Deno.env.get("GOOGLE_API_KEY")?.trim() ||
    Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY")?.trim() ||
    Deno.env.get("RENDER_GEMINI_API_KEY")?.trim() ||
    "";
}

function splitDataUrl(dataUrl: string): { mime: string; base64: string } {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    throw makeAIError("unknown", "Invalid source image data URL", false);
  }
  return { mime: match[1], base64: match[2] };
}

function withAttemptHistory(
  error: AIProviderError,
  attemptHistory: ImageProviderAttempt[],
): AIProviderError & { attemptHistory: ImageProviderAttempt[] } {
  return Object.assign(error, { attemptHistory });
}

function pickOpenAISize(w?: number, h?: number): string {
  if (!w || !h) return "1024x1024";
  const ratio = w / h;
  if (ratio > 1.3) return "1536x1024";
  if (ratio < 0.77) return "1024x1536";
  return "1024x1024";
}

function buildOpenAIPrompt(params: ImageEditParams): string {
  const negative = params.negativePrompt
    ? `\n\n[STRICT NEGATIVE CONSTRAINTS — DO NOT VIOLATE]\n${params.negativePrompt}`
    : "";
  return params.prompt + negative;
}

async function ensureSourceDataUrl(params: ImageEditParams): Promise<string> {
  if (params.sourceImageDataUrl) return params.sourceImageDataUrl;
  if (!params.sourceImageBlob) {
    throw makeAIError(
      "unknown",
      "Missing source image (blob and data URL)",
      false,
    );
  }
  const buf = await params.sourceImageBlob.arrayBuffer();
  const b64 = uint8ToBase64(new Uint8Array(buf));
  const mime = params.sourceImageBlob.type || "image/jpeg";
  return `data:${mime};base64,${b64}`;
}

function ensureSourceBlob(params: ImageEditParams): Blob {
  if (params.sourceImageBlob) return params.sourceImageBlob;
  if (!params.sourceImageDataUrl) {
    throw makeAIError(
      "unknown",
      "Missing source image (blob and data URL)",
      false,
    );
  }
  const match = params.sourceImageDataUrl.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/,
  );
  if (!match) {
    throw makeAIError("unknown", "Invalid source image data URL", false);
  }
  const mime = match[1];
  const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: mime });
}

function uint8ToBase64(arr: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < arr.length; i += chunkSize) {
    binary += String.fromCharCode(...arr.subarray(i, i + chunkSize));
  }
  return btoa(binary);
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

function logImageError(
  args: { session_id?: string | null; model: string; msg: string },
) {
  console.warn(
    JSON.stringify({
      lvl: "warn",
      fn: "ai-provider/image",
      session_id: args.session_id ?? null,
      model: args.model,
      msg: "image_edit_attempt_failed",
      detail: args.msg.substring(0, 300),
    }),
  );
}
