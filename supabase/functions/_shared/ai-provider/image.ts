// _shared/ai-provider/image.ts
// Image generation/edit via Gemini 2.5 Flash Image Preview ("Nano Banana") con
// fallback OpenAI gpt-image-1.5 (e gpt-image-1 come ultimo livello).
//
// Compagno di openrouter.ts: stesso stile, stessi headers, stessa retry policy.
// Tutti i render AI (infissi, bagno, facciata, pavimento, etc.) passano qui.
//
// Routing:
//   1) Gemini 2.5 Flash Image Preview via OpenRouter (Nano Banana)
//   2) Fallback: OpenAI gpt-image-1.5 (modello corrente 2026)
//   3) Last resort: OpenAI gpt-image-1 (legacy ma stabile)
//
// DALL-E 2/3 NON sono mai presenti nella chain. Sono deprecati.

import { type AIProviderError, makeAIError } from "./types.ts";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const OPENAI_IMAGES_EDIT_ENDPOINT = "https://api.openai.com/v1/images/edits";
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_RETRIES = 2;

export const IMAGE_MODEL_PRIMARY = "google/gemini-2.5-flash-image";
export const IMAGE_MODEL_FALLBACK_1 = "openai/gpt-image-1.5";
export const IMAGE_MODEL_FALLBACK_2 = "openai/gpt-image-1";

export type ImageProvider = "openrouter" | "openai_direct";

export interface ImageEditParams {
  /** Prompt completo (system+user concatenato dal chiamante). */
  prompt: string;
  /** Foto sorgente in Blob (preferito) o data URL base64. */
  sourceImageBlob?: Blob;
  sourceImageDataUrl?: string;
  /** Hint dimensioni dell'input — usato per scegliere size OpenAI. */
  effectiveWidth?: number;
  effectiveHeight?: number;
  /** OpenAI quality tier — default "medium" (€0.042/img su 1024). */
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
  rawResponse: Record<string, unknown>;
  costUsd?: number;
  costIsEstimated: boolean;
  latencyMs: number;
}

/**
 * Edit foto con fallback Gemini → OpenAI.
 * Throw aggregato se TUTTI i modelli falliscono.
 */
export async function editImage(
  args: ImageEditParams,
): Promise<ImageEditResult> {
  const errors: Array<{ model: string; error: string }> = [];

  // ── 1) Gemini Nano Banana via OpenRouter ────────────────────────────────
  try {
    const result = await callOpenRouterImage({
      model: IMAGE_MODEL_PRIMARY,
      params: args,
    });
    return { ...result, attempts: 1, providerUsed: "openrouter" };
  } catch (e) {
    const err = e as AIProviderError;
    errors.push({ model: IMAGE_MODEL_PRIMARY, error: err.message });
    if (err.code === "invalid_api_key") {
      // OpenRouter key rotta — non ha senso provare il fallback OpenAI
      // se la chain è configurata per passare ENTRAMBI via OpenRouter.
      // Procediamo comunque su OpenAI diretto (separate API key).
    }
    logImageError({
      session_id: args.metadata.session_id,
      model: IMAGE_MODEL_PRIMARY,
      msg: err.message,
    });
  }

  // ── 2) Fallback OpenAI gpt-image-1.5 (diretto, non OpenRouter) ──────────
  try {
    const result = await callOpenAIImage({
      model: "gpt-image-1.5",
      params: args,
    });
    return { ...result, attempts: 2, providerUsed: "openai_direct" };
  } catch (e) {
    const err = e as AIProviderError;
    errors.push({ model: "gpt-image-1.5", error: err.message });
    logImageError({
      session_id: args.metadata.session_id,
      model: "gpt-image-1.5",
      msg: err.message,
    });
  }

  // ── 3) Last resort: OpenAI gpt-image-1 (legacy) ─────────────────────────
  try {
    const result = await callOpenAIImage({
      model: "gpt-image-1",
      params: args,
    });
    return { ...result, attempts: 3, providerUsed: "openai_direct" };
  } catch (e) {
    const err = e as AIProviderError;
    errors.push({ model: "gpt-image-1", error: err.message });
    logImageError({
      session_id: args.metadata.session_id,
      model: "gpt-image-1",
      msg: err.message,
    });
  }

  throw makeAIError(
    "unknown",
    `Image edit failed on all providers: ${
      errors
        .map((e) => `[${e.model}] ${e.error}`)
        .join(" | ")
    }`,
    false,
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
