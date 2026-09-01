// _shared/ai-provider/image.ts
// Image generation/edit via OpenAI gpt-image-1 (direct + OpenRouter fallback).
//
// v8.6.32 — GEMINI ELIMINATO definitivamente (richiesta utente).
// Catena: OpenAI direct → OpenRouter OpenAI.
//
// Compagno di openrouter.ts: stesso stile, stessi headers, stessa retry policy.
// Tutti i render AI (infissi, bagno, facciata, pavimento, etc.) passano qui.

import { type AIProviderError, makeAIError } from "./types.ts";

const OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const OPENAI_IMAGES_EDIT_ENDPOINT = "https://api.openai.com/v1/images/edits";
const DEFAULT_TIMEOUT_MS = 180_000;
const DEFAULT_RETRIES = 2;

// FIX 2026-05-15: il default era `openai/gpt-image-1.5` che NON esiste nel
// catalog OpenRouter (verificato via debug-ai-providers endpoint).
// I modelli OpenAI image disponibili oggi su OpenRouter sono:
// openai/gpt-5-image, openai/gpt-5-image-mini, openai/gpt-5.4-image-2.
// Usiamo gpt-5-image come default stabile (markup standard).
export const IMAGE_MODEL_OPENROUTER_OPENAI =
  Deno.env.get("OPENROUTER_OPENAI_IMAGE_MODEL")?.trim() ||
  Deno.env.get("RENDER_OPENROUTER_OPENAI_IMAGE_MODEL")?.trim() ||
  "openai/gpt-5-image";
// FIX 2026-05-15 v8.4.1: il default era "gpt-image-1.5" che è un nome
// inesistente sul portale OpenAI Images API. Il modello corretto è
// "gpt-image-1" (no .5). gpt-image-1.5 era una stima del successor che
// non è mai stato rilasciato con quel nome. Con OPENAI_IMAGE_MODEL env
// si può sovrascrivere per usare modelli futuri (es. gpt-image-2).
export const IMAGE_MODEL_OPENAI_DIRECT =
  Deno.env.get("OPENAI_IMAGE_MODEL")?.trim() ||
  Deno.env.get("RENDER_OPENAI_IMAGE_MODEL")?.trim() ||
  "gpt-image-1";

export type ImageProvider = "openrouter" | "openai_direct";

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

/**
 * Foto reference passata INSIEME alla sorgente al modello multi-image.
 * GPT-5 Image / gpt-image-1 accettano N immagini per turno: la prima è la
 * "scena", le successive sono ancore visive per colore/modello/finitura.
 */
export interface ImageReferenceInput {
  /** Label semantica (es. "FRAME COLOR TARGET — Grigio Ardesia (RAL 1009)"). */
  label: string;
  /** Immagine in data URL base64 (es. "data:image/webp;base64,..."). */
  dataUrl: string;
}

export interface ImageEditParams {
  /** Prompt completo (system+user concatenato dal chiamante). */
  prompt: string;
  /** Foto sorgente in Blob (preferito) o data URL base64. */
  sourceImageBlob?: Blob;
  sourceImageDataUrl?: string;
  /** v8.3.3 — Foto reference da passare DOPO la sorgente al modello.
   *  L'ordine deve corrispondere alla legenda inclusa nel prompt
   *  ("Image 2 = …, Image 3 = …"). Max ~6 per non saturare il context. */
  referenceImages?: ImageReferenceInput[];
  /** Hint dimensioni dell'input — usato solo da eventuali provider fallback. */
  effectiveWidth?: number;
  effectiveHeight?: number;
  /** OpenAI quality tier — usato sui fallback OpenAI. */
  openaiQuality?: "low" | "medium" | "high";
  /** Negative prompt opzionale — concatenato al prompt principale. */
  negativePrompt?: string;
  /** Timeout per chiamata singola (millisecondi). */
  timeoutMs?: number;
  /** F1 (audit 16/07) — Max retry per provider (default DEFAULT_RETRIES=2).
   *  I render image-edit durano 60-80s a tentativo: 3 tentativi × 90s
   *  sforavano il cap 150s dell'edge runtime (isolate killata a metà =
   *  credito perso). Il chiamante passa 0/1 per stare nel budget. */
  maxRetries?: number;
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
 * v8.6.32 — Ordine provider FISSO (Gemini eliminato per richiesta utente):
 *   Tier 1: OpenAI direct (gpt-image-1)         — primary
 *   Tier 2: OpenRouter OpenAI (gpt-5-image)     — fallback
 */
type ProviderStep = {
  provider: ImageProvider;
  model: string;
  call: (args: ProviderCallArgs) => Promise<ProviderCallResult>;
};

function getProviderOrder(): ProviderStep[] {
  console.log(JSON.stringify({
    lvl: "info",
    fn: "ai-provider/image",
    msg: "provider_chain_resolved",
    chain: "openai_only_v8.6.32",
    tier1: "openai_direct (gpt-image-1)",
    tier2: "openrouter (openai gpt-5-image)",
  }));
  return [
    { provider: "openai_direct", model: IMAGE_MODEL_OPENAI_DIRECT, call: callOpenAIImage },
    { provider: "openrouter", model: IMAGE_MODEL_OPENROUTER_OPENAI, call: callOpenRouterImage },
  ];
}

/**
 * Edit foto con fallback chain configurabile via env RENDER_PROVIDER_FIRST.
 * Throw aggregato se TUTTI i modelli falliscono.
 */
export async function editImage(
  args: ImageEditParams,
): Promise<ImageEditResult> {
  const errors: Array<{ model: string; error: string }> = [];
  const attemptHistory: ImageProviderAttempt[] = [];

  const steps = getProviderOrder();
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const tier = i + 1;
    try {
      const result = await step.call({ model: step.model, params: args });
      attemptHistory.push({
        model: step.model,
        provider: step.provider,
        ok: true,
        tier,
        latencyMs: result.latencyMs,
      });
      return {
        ...result,
        attempts: tier,
        providerUsed: step.provider,
        attemptHistory,
      };
    } catch (e) {
      const err = e as AIProviderError;
      errors.push({ model: step.model, error: err.message });
      attemptHistory.push({
        model: step.model,
        provider: step.provider,
        ok: false,
        tier,
        error: err.message.substring(0, 500),
        code: err.code,
        status: err.provider_status,
      });
      logImageError({
        session_id: args.metadata.session_id,
        model: step.model,
        msg: err.message,
      });
    }
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
// GENERAZIONE DA TESTO (creatività social/ads) — catena OpenRouter-first
// ────────────────────────────────────────────────────────────────────────────

export interface ImageGenerateParams {
  /** Prompt completo (brief utente + canoni di brand). */
  prompt: string;
  /** Dimensione richiesta, formato "1024x1536". Usata dal ramo OpenAI diretto. */
  size: string;
  /** Qualità nella scala del modello, quando applicabile. */
  openaiQuality?: "low" | "medium" | "high";
  negativePrompt?: string;
  timeoutMs?: number;
  maxRetries?: number;
  metadata: {
    task_kind: string;
    company_id?: string | null;
    session_id?: string | null;
  };
}

/**
 * Ordine per la GENERAZIONE: OpenRouter primo.
 *
 * Diverso dall'edit dei render (OpenAI diretto primo, invariato per non
 * toccare ciò che funziona): per le creatività la piattaforma passa da
 * OpenRouter, che dà un catalogo unico, il costo REALE nell'header x-or-cost
 * e la possibilità di cambiare modello senza toccare il codice. OpenAI diretto
 * resta come rete di sicurezza se OpenRouter è irraggiungibile.
 */
function getGenerateProviderOrder(): ProviderStep[] {
  return [
    { provider: "openrouter", model: IMAGE_MODEL_OPENROUTER_OPENAI, call: callOpenRouterGenerate },
    { provider: "openai_direct", model: IMAGE_MODEL_OPENAI_DIRECT, call: callOpenAIGenerate },
  ];
}

/**
 * Genera un'immagine da solo testo, con fallback tra provider.
 * Throw aggregato se falliscono tutti — il chiamante decide il messaggio utente.
 */
export async function generateImage(
  args: ImageGenerateParams,
): Promise<ImageEditResult> {
  const errors: Array<{ model: string; error: string }> = [];
  const attemptHistory: ImageProviderAttempt[] = [];

  // Riusa la stessa struttura di ProviderCallArgs dell'edit: i due rami
  // condividono retry, timeout e formato del risultato.
  const paramsCompat = args as unknown as ImageEditParams;

  const steps = getGenerateProviderOrder();
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const tier = i + 1;
    try {
      const result = await step.call({ model: step.model, params: paramsCompat });
      attemptHistory.push({
        model: step.model,
        provider: step.provider,
        ok: true,
        tier,
        latencyMs: result.latencyMs,
      });
      return { ...result, attempts: tier, providerUsed: step.provider, attemptHistory };
    } catch (e) {
      const err = e as AIProviderError;
      errors.push({ model: step.model, error: err.message });
      attemptHistory.push({
        model: step.model,
        provider: step.provider,
        ok: false,
        tier,
        error: err.message.substring(0, 500),
        code: err.code,
        status: err.provider_status,
      });
      logImageError({ session_id: args.metadata.session_id, model: step.model, msg: err.message });
    }
  }

  throw withAttemptHistory(
    makeAIError(
      "unknown",
      `Image generate failed on all providers: ${errors.map((e) => `[${e.model}] ${e.error}`).join(" | ")}`,
      false,
    ),
    attemptHistory,
  );
}

/** OpenRouter: chat/completions con modalities image, SENZA immagine sorgente. */
async function callOpenRouterGenerate(args: ProviderCallArgs): Promise<ProviderCallResult> {
  const apiKey = Deno.env.get("OPENROUTER_API_KEY")?.trim();
  if (!apiKey) {
    throw makeAIError("invalid_api_key", "OPENROUTER_API_KEY non configurata in Supabase secrets", false);
  }
  const p = args.params as unknown as ImageGenerateParams;
  const appName = Deno.env.get("OPENROUTER_APP_NAME") ?? "EdiliziaInCloud";
  const siteUrl = Deno.env.get("OPENROUTER_SITE_URL") ?? "https://www.ediliziaincloud.com";
  const timeoutMs = p.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const fullPrompt = p.negativePrompt
    ? `${p.prompt}\n\n[DA EVITARE]\n${p.negativePrompt}`
    : p.prompt;

  const body = {
    model: args.model,
    messages: [{ role: "user", content: [{ type: "text", text: fullPrompt }] }],
    modalities: ["image", "text"],
  };

  // Gli header devono essere ASCII puri: un em dash fa esplodere fetch()
  // ("headers is not a valid ByteString") — lezione dai render.
  const asciiOnly = (s: string) => s.replace(/[^\x20-\x7E]/g, "-").trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": asciiOnly(siteUrl),
    "X-Title": asciiOnly(`${appName} - Creativita`),
    "X-OR-Task-Kind": asciiOnly(p.metadata.task_kind),
  };
  if (p.metadata.company_id) headers["X-OR-Company"] = asciiOnly(p.metadata.company_id);

  const backoff = [1500, 4000];
  const maxAttempts = p.maxRetries ?? DEFAULT_RETRIES;
  let lastErr: AIProviderError | null = null;

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startMs = Date.now();
    try {
      const resp = await fetch(OPENROUTER_ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const latencyMs = Date.now() - startMs;

      if (resp.status === 429 || resp.status >= 500) {
        const txt = await safeRead(resp);
        lastErr = makeAIError(
          resp.status === 429 ? "rate_limit" : "unknown",
          `OpenRouter ${resp.status}: ${txt.substring(0, 300)}`,
          true,
          resp.status,
        );
        if (attempt < maxAttempts) { await sleep(backoff[attempt] ?? 4000); continue; }
        throw lastErr;
      }
      if (resp.status === 401 || resp.status === 403) {
        throw makeAIError("invalid_api_key", `OpenRouter ${resp.status}`, false, resp.status);
      }
      if (resp.status === 404) {
        throw makeAIError("model_not_found", `Model non disponibile su OpenRouter: ${args.model}`, false, 404);
      }
      if (!resp.ok) {
        const txt = await safeRead(resp);
        throw makeAIError("unknown", `OpenRouter ${resp.status}: ${txt.substring(0, 300)}`, false, resp.status);
      }

      const json = (await resp.json()) as Record<string, unknown>;
      const imageDataUrl = extractOpenRouterImage(json);
      if (!imageDataUrl) throw makeAIError("unknown", "OpenRouter: nessuna immagine nella risposta", false);

      // x-or-cost è il costo REALE della chiamata: meglio di ogni stima.
      const costHeader = resp.headers.get("x-or-cost");
      const costUsd = costHeader ? Number(costHeader) : undefined;

      return {
        imageDataUrl,
        modelUsed: args.model,
        rawResponse: json,
        costUsd: Number.isFinite(costUsd) ? costUsd : undefined,
        costIsEstimated: !costHeader,
        latencyMs,
      };
    } catch (e) {
      clearTimeout(timer);
      const err = e as AIProviderError;
      if (err?.code) {
        if (!err.retryable || attempt >= maxAttempts) throw err;
        lastErr = err;
        await sleep(backoff[attempt] ?? 4000);
        continue;
      }
      const asError = e as Error;
      lastErr = asError.name === "AbortError"
        ? makeAIError("timeout", `Timeout dopo ${timeoutMs}ms`, true)
        : makeAIError("unknown", String(asError.message ?? e), true);
      if (attempt < maxAttempts) { await sleep(backoff[attempt] ?? 4000); continue; }
      throw lastErr;
    }
  }
  throw lastErr ?? makeAIError("unknown", "Errore generazione immagine dopo retry", false);
}

/** OpenAI diretto: /v1/images/generations (rete di sicurezza). */
async function callOpenAIGenerate(args: ProviderCallArgs): Promise<ProviderCallResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
  if (!apiKey) {
    throw makeAIError("invalid_api_key", "OPENAI_API_KEY non configurata", false);
  }
  const p = args.params as unknown as ImageGenerateParams;
  const timeoutMs = p.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startMs = Date.now();

  try {
    const isGptImage = args.model.startsWith("gpt-image");
    const body: Record<string, unknown> = {
      model: args.model,
      prompt: p.negativePrompt ? `${p.prompt}\n\n[DA EVITARE]\n${p.negativePrompt}` : p.prompt,
      size: p.size,
      n: 1,
    };
    if (p.openaiQuality) body.quality = p.openaiQuality;
    // Solo DALL·E accetta response_format; gpt-image-1 ritorna b64 di default.
    if (!isGptImage) body.response_format = "b64_json";

    const chiama = (payload: Record<string, unknown>) =>
      fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

    let resp = await chiama(body);
    // Un 400 con `quality` valorizzata è quasi sempre un valore fuori scala per
    // quel modello: si riprova senza, invece di perdere l'immagine. Il costo va
    // poi calcolato sulla qualità di default (lo fa il chiamante leggendo
    // qualityApplicata dal risultato).
    let qualityRimossa = false;
    if (!resp.ok && resp.status === 400 && body.quality) {
      const dettaglio = await safeRead(resp.clone());
      console.warn(`[image/generate] quality rifiutata da ${args.model}, retry senza: ${dettaglio.slice(0, 160)}`);
      const senzaQuality = { ...body };
      delete senzaQuality.quality;
      resp = await chiama(senzaQuality);
      qualityRimossa = true;
    }
    clearTimeout(timer);
    const latencyMs = Date.now() - startMs;

    if (!resp.ok) {
      const txt = await safeRead(resp);
      throw makeAIError(
        resp.status === 429 ? "rate_limit" : "unknown",
        `OpenAI ${resp.status}: ${txt.substring(0, 300)}`,
        resp.status === 429 || resp.status >= 500,
        resp.status,
      );
    }

    const json = (await resp.json()) as { data?: Array<{ b64_json?: string; url?: string }> };
    const b64 = json.data?.[0]?.b64_json;
    if (!b64) throw makeAIError("unknown", "OpenAI: nessuna immagine nella risposta", false);

    return {
      imageDataUrl: `data:image/png;base64,${b64}`,
      modelUsed: args.model,
      rawResponse: { ...(json as unknown as Record<string, unknown>), quality_rimossa: qualityRimossa },
      costIsEstimated: true,
      latencyMs,
    };
  } catch (e) {
    clearTimeout(timer);
    const err = e as AIProviderError;
    if (err?.code) throw err;
    const asError = e as Error;
    throw asError.name === "AbortError"
      ? makeAIError("timeout", `Timeout dopo ${timeoutMs}ms`, true)
      : makeAIError("unknown", String(asError.message ?? e), true);
  }
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

// v8.6.32 — callGeminiImage REMOSSO (Gemini eliminato dal sistema).

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
    "https://www.ediliziaincloud.com";
  const timeoutMs = args.params.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // Converti sourceImageBlob → data URL se necessario
  const sourceDataUrl = await ensureSourceDataUrl(args.params);

  // FORMATO DELL'OUTPUT — il ramo OpenRouter passa da chat/completions e non
  // ha un parametro `size` come il ramo OpenAI diretto. Senza dirlo, il modello
  // produce un 1024x1024 quadrato anche da una foto landscape: per riempire il
  // quadrato ricompone la scena, e il risultato perde il soffitto, sposta la
  // finestra e reinventa le pareti — cioe' esattamente cio' che un render di
  // ristrutturazione non deve fare. Visto in prod il 01/09/2026: sorgente
  // 1024x683 (3:2), render restituito 1024x1024.
  // Qui il vincolo viene messo nel prompt, che e' l'unico canale disponibile
  // su questo ramo, usando lo stesso mapping del ramo diretto.
  const targetSize = pickOpenAISize(
    args.params.effectiveWidth,
    args.params.effectiveHeight,
  );
  const [tw, th] = targetSize.split("x").map((n) => parseInt(n, 10));
  const orient = tw > th ? "landscape" : tw < th ? "portrait" : "square";
  const formatDirective = [
    `[OUTPUT FORMAT — MANDATORY]`,
    `Return the image at ${targetSize} pixels (${orient}, aspect ratio ${(tw / th).toFixed(2)}:1).`,
    `Keep the SAME framing, camera angle and crop as the source photo: same walls, same ceiling and floor visible, same amount of scene.`,
    `Do NOT recompose, do NOT zoom in or out, do NOT crop away the ceiling or any part visible in the source, do NOT add padding or bars.`,
  ].join("\n");

  const fullPrompt = [
    args.params.negativePrompt
      ? `${args.params.prompt}\n\n[NEGATIVE]\n${args.params.negativePrompt}`
      : args.params.prompt,
    formatDirective,
  ].join("\n\n");

  // v8.3.3 — Multi-image input via OpenRouter content array
  const contentParts: Array<Record<string, unknown>> = [
    { type: "text", text: fullPrompt },
    { type: "image_url", image_url: { url: sourceDataUrl } },
  ];
  if (args.params.referenceImages && args.params.referenceImages.length > 0) {
    for (const ref of args.params.referenceImages) {
      contentParts.push({
        type: "image_url",
        image_url: { url: ref.dataUrl },
      });
    }
  }

  const body = {
    model: args.model,
    messages: [
      {
        role: "user",
        content: contentParts,
      },
    ],
    modalities: ["image", "text"],
  };

  const backoff = [1500, 4000];
  const maxAttempts = args.params.maxRetries ?? DEFAULT_RETRIES;
  let lastErr: AIProviderError | null = null;

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startMs = Date.now();

    try {
      // FIX 2026-05-15: gli HTTP header devono essere ByteString ASCII-puri.
      // Il vecchio `${appName} — Render AI` conteneva un em dash (U+2014)
      // che fa esplodere `fetch()` con
      //   "Failed to construct 'Request': 'headers' is not a valid ByteString"
      // Tutti i Tier 2/3 OpenRouter fallivano per questo (verificato via
      // provider_chain_used in render_sessions). Sanifichiamo TUTTI gli
      // header values stripping non-ASCII.
      const asciiOnly = (s: string) =>
        // eslint-disable-next-line no-control-regex
        s.replace(/[^\x20-\x7E]/g, "-").trim();
      const safeHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": asciiOnly(siteUrl),
        "X-Title": asciiOnly(`${appName} - Render AI`),
        "X-OR-Task-Kind": asciiOnly(args.params.metadata.task_kind),
      };
      if (args.params.metadata.company_id) {
        safeHeaders["X-OR-Company"] = asciiOnly(args.params.metadata.company_id);
      }
      const resp = await fetch(OPENROUTER_ENDPOINT, {
        method: "POST",
        headers: safeHeaders,
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
        if (attempt < maxAttempts) {
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
        if (attempt < maxAttempts) {
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
        if (!err.retryable || attempt >= maxAttempts) throw err;
        lastErr = err;
        await sleep(backoff[attempt] ?? 4000);
        continue;
      }
      const asError = e as Error;
      if (asError.name === "AbortError") {
        lastErr = makeAIError("timeout", `Timeout dopo ${timeoutMs}ms`, true);
        if (attempt < maxAttempts) {
          await sleep(backoff[attempt] ?? 4000);
          continue;
        }
        throw lastErr;
      }
      lastErr = makeAIError("unknown", String(asError.message ?? e), true);
      if (attempt < maxAttempts) {
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
  const maxAttempts = args.params.maxRetries ?? DEFAULT_RETRIES;
  let lastErr: AIProviderError | null = null;

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const startMs = Date.now();

    try {
      const form = new FormData();
      form.append("model", args.model);
      form.append("prompt", buildOpenAIPrompt(args.params));
      form.append("image[]", sourceBlob, "photo.jpg");
      // v8.3.3 — Multi-image: aggiunge le reference images come ulteriori
      // entries `image[]`. La legenda nel prompt spiega cosa è ognuna.
      if (args.params.referenceImages && args.params.referenceImages.length > 0) {
        let refIndex = 0;
        for (const ref of args.params.referenceImages) {
          try {
            const match = ref.dataUrl.match(
              /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/,
            );
            if (!match) continue;
            const refMime = match[1];
            const refBytes = Uint8Array.from(
              atob(match[2]),
              (c) => c.charCodeAt(0),
            );
            const refBlob = new Blob([refBytes], { type: refMime });
            const ext = refMime.split("/")[1] ?? "png";
            form.append("image[]", refBlob, `ref_${refIndex}.${ext}`);
            refIndex++;
          } catch {
            // Skip ref malformato
          }
        }
      }
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
        if (attempt < maxAttempts) {
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
        if (attempt < maxAttempts) {
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
        if (!err.retryable || attempt >= maxAttempts) throw err;
        lastErr = err;
        await sleep(backoff[attempt] ?? 4000);
        continue;
      }
      const asError = e as Error;
      if (asError.name === "AbortError") {
        lastErr = makeAIError("timeout", `Timeout dopo ${timeoutMs}ms`, true);
        if (attempt < maxAttempts) {
          await sleep(backoff[attempt] ?? 4000);
          continue;
        }
        throw lastErr;
      }
      lastErr = makeAIError("unknown", String(asError.message ?? e), true);
      if (attempt < maxAttempts) {
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

// v8.6.32 — extractGeminiImage / getGeminiApiKey / splitDataUrl rimossi (orfani).

function withAttemptHistory(
  error: AIProviderError,
  attemptHistory: ImageProviderAttempt[],
): AIProviderError & { attemptHistory: ImageProviderAttempt[] } {
  return Object.assign(error, { attemptHistory });
}

function pickOpenAISize(w?: number, h?: number): string {
  // v8.6.2 — Tornato a calcolo discreto (no "auto").
  // "size=auto" di gpt-image-1 in alcuni casi causa retry interni del modello
  // che gonfia il tempo di generazione (osservato ~5 minuti su render
  // "bloccati al 15%"). I 3 size discreti garantiscono comportamento
  // deterministico:
  //   1024x1024 → square
  //   1024x1536 → portrait
  //   1536x1024 → landscape
  // Scegliamo quello con ratio piu' vicino alla source per minimizzare il
  // crop visivo finale.
  if (!w || !h) return "1024x1024";
  const ratio = w / h;
  // ratio < 0.8 = portrait alto → 1024x1536 (ratio 0.666)
  // 0.8 <= ratio < 1.25 = quadrato-ish → 1024x1024
  // ratio >= 1.25 = landscape → 1536x1024 (ratio 1.5)
  if (ratio < 0.8) return "1024x1536";
  if (ratio > 1.25) return "1536x1024";
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
