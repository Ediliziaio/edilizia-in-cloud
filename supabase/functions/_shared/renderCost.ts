// ============================================================================
// renderCost.ts — Cost capture reale API per provider AI (OpenAI / Gemini)
//
// Usato dalla edge function `generate-render` per calcolare il costo reale
// sostenuto sulla chiamata al provider di image generation.
//
// Pattern:
//   1. Leggi la provider_pricing row attiva (provider_key + model).
//   2. Parsa la response raw dell'API (usage / usageMetadata / billedCharacterCount).
//   3. Calcola cost_eur deterministico (formula oraria). Se l'API non espone
//      usage, fallback su `fallback_cost_per_call_eur`.
//   4. Ritorna {cost_eur, usage, model, request_id} da scrivere su
//      render_sessions.cost_real_api / provider_usage / provider_model /
//      provider_request_id.
//
// Nota: tipi deliberatamente "unknown" per sopravvivere a cambi di shape
// dell'API (OpenAI/Gemini aggiungono campi senza preavviso). Parsing safe:
// tutto è opzionale e qualsiasi errore scala a fallback.
// ============================================================================

// ── Tipi ────────────────────────────────────────────────────────────────────

export interface RenderPricing {
  id?: string;
  provider_key: string;
  model: string;
  pricing_mode: "per_image" | "per_token" | "hybrid";
  price_input_image_eur: number;
  price_input_token_eur: number;
  price_output_image_eur: number;
  price_output_token_eur: number;
  fallback_cost_per_call_eur: number;
}

export interface CostCaptureResult {
  cost_eur: number;
  usage: Record<string, unknown>;
  model: string | null;
  request_id: string | null;
}

// ── Pricing lookup ──────────────────────────────────────────────────────────

/**
 * Legge il pricing attivo per (provider_key, model) dalla tabella
 * `render_provider_pricing`. Se non esiste row attiva, ritorna null e il
 * chiamante deve decidere fallback (di solito: usa valore legacy da
 * render_provider_config.cost_real_per_render).
 *
 * "Attivo" = effective_to IS NULL (open-ended).
 */
export async function fetchPricing(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  providerKey: string,
  model: string,
): Promise<RenderPricing | null> {
  const { data, error } = await supabase
    .from("render_provider_pricing")
    .select("*")
    .eq("provider_key", providerKey)
    .eq("model", model)
    .is("effective_to", null)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[renderCost] fetchPricing error:", error.message);
    return null;
  }
  return (data as RenderPricing | null) ?? null;
}

// ── OpenAI: parse usage da gpt-image-1 ──────────────────────────────────────

/**
 * OpenAI gpt-image-1 ritorna (quando disponibile) un oggetto `usage` con:
 *   {
 *     input_tokens: number,
 *     input_tokens_details: { text_tokens: number, image_tokens: number },
 *     output_tokens: number,
 *     total_tokens: number
 *   }
 * Alcuni modelli più vecchi (DALL-E) non hanno usage → fallback per immagine.
 */
export function computeOpenAICost(
  rawResponse: Record<string, unknown>,
  pricing: RenderPricing,
): CostCaptureResult {
  const usageRaw = (rawResponse.usage as Record<string, unknown>) || {};
  const inputTokens = Number(usageRaw.input_tokens ?? 0);
  const outputTokens = Number(usageRaw.output_tokens ?? 0);
  const totalTokens = Number(usageRaw.total_tokens ?? (inputTokens + outputTokens));

  let cost = 0;

  if (pricing.pricing_mode === "per_image") {
    // 1 immagine per richiesta (n=1 hardcoded in edge function)
    cost = pricing.price_output_image_eur || pricing.fallback_cost_per_call_eur;
  } else if (pricing.pricing_mode === "per_token") {
    cost = inputTokens * pricing.price_input_token_eur
         + outputTokens * pricing.price_output_token_eur;
  } else {
    // hybrid: per immagine + token extra (più realistico per gpt-image-1)
    const imageCost = pricing.price_output_image_eur || 0;
    const tokenCost = inputTokens * pricing.price_input_token_eur
                    + outputTokens * pricing.price_output_token_eur;
    cost = imageCost + tokenCost;
  }

  // Se il parsing non ha dato nulla e cost è 0, usa fallback
  if (!Number.isFinite(cost) || cost <= 0) {
    cost = pricing.fallback_cost_per_call_eur;
  }

  return {
    cost_eur: Number(cost.toFixed(6)),
    usage: {
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      raw: usageRaw,
    },
    model: (rawResponse.model as string) || pricing.model,
    request_id: (rawResponse.id as string) || null,
  };
}

// ── Gemini: parse usageMetadata ────────────────────────────────────────────

/**
 * Gemini 2.5-flash-image ritorna:
 *   {
 *     usageMetadata: {
 *       promptTokenCount: number,
 *       candidatesTokenCount: number,
 *       totalTokenCount: number,
 *       promptTokensDetails?: [{modality, tokenCount}],
 *       candidatesTokensDetails?: [{modality, tokenCount}]
 *     },
 *     responseId: string,
 *     modelVersion: string
 *   }
 * Per gli image output è più affidabile contare "1 immagine output" + token
 * prompt (il modello pricing è ibrido).
 */
export function computeGeminiCost(
  rawResponse: Record<string, unknown>,
  pricing: RenderPricing,
): CostCaptureResult {
  const usageMeta = (rawResponse.usageMetadata as Record<string, unknown>) || {};
  const promptTokens = Number(usageMeta.promptTokenCount ?? 0);
  const candidatesTokens = Number(usageMeta.candidatesTokenCount ?? 0);
  const totalTokens = Number(usageMeta.totalTokenCount ?? (promptTokens + candidatesTokens));

  let cost = 0;

  if (pricing.pricing_mode === "per_image") {
    // 1 immagine output
    cost = pricing.price_output_image_eur || pricing.fallback_cost_per_call_eur;
    // Aggiungi costo token prompt se il listino lo prevede
    if (pricing.price_input_token_eur > 0) {
      cost += promptTokens * pricing.price_input_token_eur;
    }
  } else if (pricing.pricing_mode === "per_token") {
    cost = promptTokens * pricing.price_input_token_eur
         + candidatesTokens * pricing.price_output_token_eur;
  } else {
    // hybrid
    cost = pricing.price_output_image_eur
         + promptTokens * pricing.price_input_token_eur
         + candidatesTokens * pricing.price_output_token_eur;
  }

  if (!Number.isFinite(cost) || cost <= 0) {
    cost = pricing.fallback_cost_per_call_eur;
  }

  return {
    cost_eur: Number(cost.toFixed(6)),
    usage: {
      prompt_tokens: promptTokens,
      candidates_tokens: candidatesTokens,
      total_tokens: totalTokens,
      raw: usageMeta,
    },
    model: (rawResponse.modelVersion as string) || pricing.model,
    request_id: (rawResponse.responseId as string) || null,
  };
}

// ── OpenRouter image: parse header x-or-cost passato dal provider wrapper ───

export function computeOpenRouterImageCost(
  rawResponse: Record<string, unknown>,
  pricing: RenderPricing,
): CostCaptureResult {
  const costUsd = Number(rawResponse._cost_usd ?? 0);
  const costEurFromHeader = Number.isFinite(costUsd) && costUsd > 0
    ? costUsd * 0.92
    : 0;
  const cost = costEurFromHeader > 0
    ? costEurFromHeader
    : (pricing.fallback_cost_per_call_eur || pricing.price_output_image_eur || 0.039);

  return {
    cost_eur: Number(cost.toFixed(6)),
    usage: {
      openrouter_cost_usd: Number.isFinite(costUsd) ? costUsd : null,
      cost_is_estimated: Boolean(rawResponse._cost_is_estimated ?? true),
      raw_usage: (rawResponse.usage as Record<string, unknown>) ?? null,
    },
    model: (rawResponse._model_used as string) || pricing.model,
    request_id: (rawResponse.id as string) || null,
  };
}

// ── Dispatch principale ────────────────────────────────────────────────────

/**
 * Unico entry point della edge function. Dato il provider_key, il model e la
 * raw response, ritorna {cost_eur, usage, model, request_id}.
 *
 * Safe-by-default:
 *   - Provider non supportato → fallback su legacy cost
 *   - Pricing non trovato → fallback
 *   - Parsing errore → fallback
 *
 * La edge function scrive il risultato in render_sessions:
 *   cost_real_api    ← cost_eur
 *   provider_usage   ← usage (jsonb)
 *   provider_model   ← model
 *   provider_request_id ← request_id
 */
export async function captureRealCost(args: {
  // deno-lint-ignore no-explicit-any
  supabase: any;
  providerKey: string;
  model: string;
  rawResponse: Record<string, unknown>;
  legacyFallbackEur: number;
}): Promise<CostCaptureResult> {
  const { supabase, providerKey, model, rawResponse, legacyFallbackEur } = args;

  try {
    const pricing = await fetchPricing(supabase, providerKey, model);

    // Nessun pricing definito → usa legacy da render_provider_config
    if (!pricing) {
      console.warn(
        `[renderCost] Nessun pricing in render_provider_pricing per ${providerKey}/${model}. Uso legacy ${legacyFallbackEur} EUR.`,
      );
      return {
        cost_eur: Number(legacyFallbackEur.toFixed(6)),
        usage: { _fallback: "legacy_config" },
        model,
        request_id: null,
      };
    }

    if (providerKey === "openai") {
      return computeOpenAICost(rawResponse, pricing);
    }
    if (providerKey === "gemini") {
      return computeGeminiCost(rawResponse, pricing);
    }
    if (providerKey === "openrouter_image") {
      return computeOpenRouterImageCost(rawResponse, pricing);
    }

    // Provider sconosciuto: fallback puro con pricing.fallback_cost_per_call_eur
    return {
      cost_eur: Number(pricing.fallback_cost_per_call_eur.toFixed(6)),
      usage: { _fallback: "unsupported_provider" },
      model,
      request_id: null,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[renderCost] captureRealCost error:", msg);
    return {
      cost_eur: Number(legacyFallbackEur.toFixed(6)),
      usage: { _fallback: "error", error: msg },
      model,
      request_id: null,
    };
  }
}
