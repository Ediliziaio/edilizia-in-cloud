// ============================================================================
// renderImage.ts — Helpers immagini per edge function render (Supermaster A4+A5)
//
// 1. `prepareInputImage()` — produce URL + meta dell'immagine di input con
//    resize server-side (via Supabase Storage transform) al lato lungo 1600px
//    max. Evita di mandare foto iPhone 4032x3024 al provider (cost killer).
//
// 2. `pickProviderSize()` — sceglie la size output del provider mappando
//    l'aspect ratio dell'input su una delle size supportate da OpenAI
//    (1024x1024 / 1536x1024 / 1024x1536).
//
// NOTE: Supabase Storage transform API richiede il bucket con image transform
// abilitato (default-on per progetti nuovi). Se la chiamata fallisce, fallback
// trasparente all'URL originale (no resize ma continua a funzionare).
// ============================================================================

// ── Tipi ────────────────────────────────────────────────────────────────────

// v8.6.32 — Gemini rimosso, ora solo OpenAI gpt-image-1 (+ fallback OpenRouter).
export type ProviderKey = "openai";

export interface InputImageMeta {
  input_original_px: string | null;   // "4032x3024" — dall'hint client
  input_resized_px: string | null;    // "1600x1200" — se resize applicato
  input_original_bytes: number | null;
  input_resized_bytes: number | null;
  resize_applied: boolean;
  resize_error: string | null;
}

export interface PreparedInputImage {
  /** URL da passare al provider (può essere signed URL con transform o raw). */
  url: string;
  /** Meta da scrivere su render_sessions.meta (jsonb). */
  meta: InputImageMeta;
  /** Dimensioni effettive dell'immagine che verrà inviata al provider. */
  effective_width: number | null;
  effective_height: number | null;
}

// ── Costanti ───────────────────────────────────────────────────────────────

/** Lato lungo massimo accettato in input al provider. */
export const MAX_INPUT_LONG_SIDE = 1600;

/** Lato lungo massimo output (tetto per risparmiare costi). */
export const MAX_OUTPUT_LONG_SIDE = 1600;

/** OpenAI gpt-image-1 supporta solo queste size. */
const OPENAI_SIZES = ["1024x1024", "1536x1024", "1024x1536"] as const;

/** Bucket generico usato come fallback quando il bucket verticale non esiste ancora. */
const FALLBACK_ORIGINALS_BUCKET = "render-originals";

function fallbackOriginalPaths(bucket: string, originalPath: string): string[] {
  return originalPath.startsWith(`${bucket}/`)
    ? [originalPath]
    : [`${bucket}/${originalPath}`, originalPath];
}

// deno-lint-ignore no-explicit-any
async function createSignedUrlWithBucketFallback(args: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  bucket: string;
  originalPath: string;
  expiresIn: number;
  options?: Record<string, unknown>;
}): Promise<{ signedUrl: string; errorMessage: string | null }> {
  const { supabase, bucket, originalPath, expiresIn, options } = args;

  const primary = await supabase.storage
    .from(bucket)
    .createSignedUrl(originalPath, expiresIn, options);

  if (!primary.error && primary.data?.signedUrl) {
    return { signedUrl: primary.data.signedUrl, errorMessage: null };
  }

  let lastError = primary.error?.message ?? "signed url empty";
  for (const fallbackPath of fallbackOriginalPaths(bucket, originalPath)) {
    const fallback = await supabase.storage
      .from(FALLBACK_ORIGINALS_BUCKET)
      .createSignedUrl(fallbackPath, expiresIn, options);
    if (!fallback.error && fallback.data?.signedUrl) {
      return { signedUrl: fallback.data.signedUrl, errorMessage: primary.error?.message ?? null };
    }
    lastError = fallback.error?.message ?? lastError;
  }

  return { signedUrl: "", errorMessage: lastError };
}

// ── Compute resize dims ────────────────────────────────────────────────────

/**
 * Calcola le dimensioni resized mantenendo aspect ratio, longest side = max.
 * Se input <= max: ritorna null (no resize needed).
 */
export function computeResizedDims(
  origW: number,
  origH: number,
  maxLongSide: number = MAX_INPUT_LONG_SIDE,
): { w: number; h: number } | null {
  const longest = Math.max(origW, origH);
  if (longest <= maxLongSide) return null;
  const ratio = maxLongSide / longest;
  return {
    w: Math.round(origW * ratio),
    h: Math.round(origH * ratio),
  };
}

// ── Prepare input image ────────────────────────────────────────────────────

/**
 * Prepara l'immagine di input:
 *   - Se `hintWidth/hintHeight` > MAX_INPUT_LONG_SIDE → resized signed URL
 *   - Altrimenti signed URL plain (+10 min TTL)
 *   - Se `originalPath` è già un http(s) URL, ritorna tal-quale (es. test fixture)
 *
 * La meta è sempre popolata (anche con null se non ci sono hint).
 */
// deno-lint-ignore no-explicit-any
export async function prepareInputImage(args: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  bucket: string;
  originalPath: string;
  hintWidth?: number | null;
  hintHeight?: number | null;
}): Promise<PreparedInputImage> {
  const { supabase, bucket, originalPath, hintWidth, hintHeight } = args;

  // Se è già un URL http(s) assoluto, non possiamo applicare transform —
  // ritorna con meta minima.
  if (originalPath && originalPath.startsWith("http")) {
    return {
      url: originalPath,
      meta: {
        input_original_px: hintWidth && hintHeight ? `${hintWidth}x${hintHeight}` : null,
        input_resized_px: null,
        input_original_bytes: null,
        input_resized_bytes: null,
        resize_applied: false,
        resize_error: null,
      },
      effective_width: hintWidth ?? null,
      effective_height: hintHeight ?? null,
    };
  }

  const origW = Number(hintWidth || 0);
  const origH = Number(hintHeight || 0);
  const resized = origW > 0 && origH > 0
    ? computeResizedDims(origW, origH, MAX_INPUT_LONG_SIDE)
    : null;

  // Caso 1: resize necessario — usa Supabase transform API
  if (resized) {
    try {
      const { signedUrl, errorMessage } = await createSignedUrlWithBucketFallback({
        supabase,
        bucket,
        originalPath,
        expiresIn: 600,
        options: {
          transform: {
            width: resized.w,
            height: resized.h,
            resize: "contain",
            quality: 85,
          },
        },
      });
      if (!signedUrl) {
        throw new Error(errorMessage || "signed url empty");
      }
      return {
        url: signedUrl,
        meta: {
          input_original_px: `${origW}x${origH}`,
          input_resized_px: `${resized.w}x${resized.h}`,
          input_original_bytes: null, // non disponibile senza HEAD
          input_resized_bytes: null,
          resize_applied: true,
          resize_error: null,
        },
        effective_width: resized.w,
        effective_height: resized.h,
      };
    } catch (err) {
      // Fallback trasparente: signed URL normale senza resize
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[renderImage] transform failed, fallback to raw:", msg);
      const fallback = await createSignedUrlWithBucketFallback({
        supabase,
        bucket,
        originalPath,
        expiresIn: 600,
      });
      return {
        url: fallback.signedUrl || originalPath,
        meta: {
          input_original_px: `${origW}x${origH}`,
          input_resized_px: null,
          input_original_bytes: null,
          input_resized_bytes: null,
          resize_applied: false,
          resize_error: msg,
        },
        effective_width: origW || null,
        effective_height: origH || null,
      };
    }
  }

  // Caso 2: input già piccolo o dims sconosciute — signed URL plain
  const { signedUrl } = await createSignedUrlWithBucketFallback({
    supabase,
    bucket,
    originalPath,
    expiresIn: 600,
  });
  return {
    url: signedUrl || originalPath,
    meta: {
      input_original_px: origW > 0 && origH > 0 ? `${origW}x${origH}` : null,
      input_resized_px: null,
      input_original_bytes: null,
      input_resized_bytes: null,
      resize_applied: false,
      resize_error: null,
    },
    effective_width: origW || null,
    effective_height: origH || null,
  };
}

// ── Pick provider size ────────────────────────────────────────────────────

/**
 * Sceglie la size output del provider in base all'aspect ratio dell'input.
 *
 * OpenAI gpt-image-1: mappa su 1024x1024 / 1536x1024 / 1024x1536 (quella più vicina).
 *
 * Invariante: l'output non supera MAX_OUTPUT_LONG_SIDE (1600) per design.
 */
export function pickProviderSize(
  inputW: number | null | undefined,
  inputH: number | null | undefined,
  _provider: ProviderKey,
): string | null {
  // Default square se mancano dim
  if (!inputW || !inputH || inputW <= 0 || inputH <= 0) {
    return "1024x1024";
  }
  const ratio = inputW / inputH;
  // Landscape: ratio > 1.3
  if (ratio > 1.3) return "1536x1024";
  // Portrait: ratio < 0.77
  if (ratio < 0.77) return "1024x1536";
  // Square-ish
  return "1024x1024";
}

/** Lista delle size OpenAI supportate (read-only). */
export function openaiSupportedSizes(): ReadonlyArray<string> {
  return OPENAI_SIZES;
}
