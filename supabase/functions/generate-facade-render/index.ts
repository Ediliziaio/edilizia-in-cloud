import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";
import { captureRealCost } from "../_shared/renderCost.ts";
import { pickProviderSize, prepareInputImage } from "../_shared/renderImage.ts";
import { buildFacciataPrompt } from "../../../shared/render-facciata/facciataPromptBuilder.ts";
import { buildFacciataRenderConfig } from "../../../shared/render-facciata/facciataRenderConfig.ts";
import { normalizeFacciataSceneAnalysis } from "../../../shared/render-facciata/facciataSceneAnalysis.ts";
import type { FacciataPhotoMeta } from "../../../shared/render-facciata/types.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

type RenderProviderConfig = {
  id?: string;
  provider_key: string;
  model: string;
  api_endpoint: string;
  renders_generated?: number | null;
  cost_real_per_render?: number | null;
  cost_billed_per_render?: number | null;
};

type FacciataSessionRow = {
  id: string;
  company_id: string;
  original_photo_url: string | null;
  config: Record<string, unknown> | null;
  foto_analisi?: Record<string, unknown> | null;
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 120_000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2,
  delayMs = 2000,
  timeoutMs = 120_000,
): Promise<Response> {
  for (let index = 0; index <= retries; index += 1) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);
      if (response.ok || index === retries) return response;
      if (response.status < 500) return response;
    } catch (error) {
      if (index === retries) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs * (index + 1)));
  }
  throw new Error("fetchWithRetry: all retries exhausted");
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function downloadImageAsInlineData(imageUrl: string): Promise<{
  mimeType: string;
  base64: string;
  bytes: Uint8Array;
}> {
  const imageResponse = await fetchWithTimeout(imageUrl, {}, 30_000);
  if (!imageResponse.ok) {
    throw new Error(`Impossibile scaricare l'immagine (${imageResponse.status})`);
  }
  const mimeType = (imageResponse.headers.get("content-type") || "image/jpeg").split(";")[0] || "image/jpeg";
  const imageBuffer = await imageResponse.arrayBuffer();
  if (imageBuffer.byteLength === 0) {
    throw new Error("L'immagine originale risulta vuota");
  }
  return {
    mimeType,
    base64: arrayBufferToBase64(imageBuffer),
    bytes: new Uint8Array(imageBuffer),
  };
}

function readUint32BE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]
  ) >>> 0;
}

function detectImageDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 16) return null;

  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    if (bytes.length < 24) return null;
    return { width: readUint32BE(bytes, 16), height: readUint32BE(bytes, 20) };
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 8 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
      const marker = bytes[offset];
      offset += 1;
      if (marker === 0xd9 || marker === 0xda) break;
      if (offset + 1 >= bytes.length) break;
      const length = (bytes[offset] << 8) | bytes[offset + 1];
      if (length < 2 || offset + length > bytes.length) break;

      const isSofMarker =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);

      if (isSofMarker && offset + 6 < bytes.length) {
        return {
          height: (bytes[offset + 3] << 8) | bytes[offset + 4],
          width: (bytes[offset + 5] << 8) | bytes[offset + 6],
        };
      }

      offset += length;
    }
  }

  return null;
}

function orientationFromDimensions(width: number, height: number): FacciataPhotoMeta["orientation"] {
  if (width === height) return "square";
  return width > height ? "landscape" : "portrait";
}

function extractTextParts(payload: Record<string, unknown>): string {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const first = candidates[0];
  const content = first && typeof first === "object" ? (first as Record<string, unknown>).content : null;
  const parts = content && typeof content === "object" && Array.isArray((content as Record<string, unknown>).parts)
    ? ((content as Record<string, unknown>).parts as Array<Record<string, unknown>>)
    : [];

  return parts
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

function extractFirstJsonObject(rawText: string): Record<string, unknown> | null {
  const start = rawText.indexOf("{");
  const end = rawText.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(rawText.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function extractGeneratedImageData(aiData: Record<string, unknown>): string | null {
  const data = aiData.data as Array<Record<string, unknown>> | undefined;
  const first = Array.isArray(data) ? data[0] : undefined;
  const b64 = typeof first?.b64_json === "string" ? first.b64_json : null;
  if (b64) {
    return `data:image/png;base64,${b64}`;
  }

  const candidates = aiData.candidates as Array<Record<string, unknown>> | undefined;
  const parts = candidates?.[0]?.content &&
    typeof candidates[0].content === "object" &&
    "parts" in candidates[0].content
    ? (candidates[0].content as { parts?: Array<Record<string, unknown>> }).parts
    : undefined;

  for (const part of parts ?? []) {
    const inlineData = part.inlineData as { mimeType?: string; data?: string } | undefined;
    if (inlineData?.mimeType?.startsWith("image/") && inlineData.data) {
      return `data:${inlineData.mimeType};base64,${inlineData.data}`;
    }
  }

  return null;
}

async function remoteImageUrlToDataUrl(url: string): Promise<string> {
  const response = await fetchWithTimeout(url, {}, 30_000);
  if (!response.ok) {
    throw new Error(`Impossibile scaricare il risultato del provider (${response.status})`);
  }
  const mimeType = (response.headers.get("content-type") || "image/png").split(";")[0] || "image/png";
  const buffer = await response.arrayBuffer();
  return `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`;
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mimeType: string; extension: string } {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/);
  if (!match) {
    throw new Error("Formato immagine provider non valido");
  }

  const mimeType = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const extension =
    mimeType.includes("png") ? "png" :
    mimeType.includes("webp") ? "webp" :
    mimeType.includes("jpeg") || mimeType.includes("jpg") ? "jpg" :
    "png";

  return { bytes, mimeType, extension };
}

async function getProviderApiKey(
  supabase: ReturnType<typeof createClient>,
  providerKey: string,
): Promise<string> {
  const { data: keyRow } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", `render_${providerKey}_api_key`)
    .maybeSingle();

  const envCandidates = providerKey === "gemini"
    ? ["RENDER_GEMINI_API_KEY", "GEMINI_API_KEY", "GOOGLE_AI_API_KEY"]
    : [`${providerKey.toUpperCase()}_API_KEY`];

  for (const envName of envCandidates) {
    const value = Deno.env.get(envName)?.trim();
    if (value) return value;
  }

  return (keyRow as { value?: string } | null)?.value?.trim() || "";
}

async function loadRenderProviderWithKey(
  supabase: ReturnType<typeof createClient>,
): Promise<{ providerConfig: RenderProviderConfig; apiKey: string }> {
  const { data: providerConfig } = await supabase
    .from("render_provider_config")
    .select("*")
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();

  if (!providerConfig) {
    throw new Error("Nessun provider render attivo. Configurare in Admin > Impostazioni AI > Render.");
  }

  const typedProvider = providerConfig as RenderProviderConfig;
  const apiKey = await getProviderApiKey(supabase, typedProvider.provider_key);
  if (!apiKey) {
    throw new Error(`API key mancante per provider '${typedProvider.provider_key}'. Configurarla in Admin > Impostazioni AI > Render.`);
  }

  return { providerConfig: typedProvider, apiKey };
}

async function runFacadeAnalysis(params: {
  supabase: ReturnType<typeof createClient>;
  imageUrl: string;
}): Promise<Record<string, unknown>> {
  const geminiApiKey = await getProviderApiKey(params.supabase, "gemini");
  if (!geminiApiKey) {
    throw new Error("Gemini API key non configurata per l'analisi facciata.");
  }

  const { mimeType, base64, bytes } = await downloadImageAsInlineData(params.imageUrl);
  const dimensions = detectImageDimensions(bytes);
  const photoMeta: FacciataPhotoMeta | null = dimensions
    ? {
        width: dimensions.width,
        height: dimensions.height,
        orientation: orientationFromDimensions(dimensions.width, dimensions.height),
      }
    : null;

  const analyzePrompt = `You are an expert architectural facade renovation analyzer.
Analyze the provided building facade photo and return ONLY a valid JSON object.

Return this exact schema:
{
  "building_type": "string",
  "building_style": "string",
  "floors_count": number,
  "openings_visible": number,
  "camera_angle": "string",
  "lighting_condition": "string",
  "wall_texture": "string",
  "current_plaster_finish": "string",
  "current_facade_color": "string",
  "current_condition": "string",
  "ground_context": "string",
  "preserved_context": ["sky", "road", "vegetation"],
  "preserve_rigidly": ["same building geometry", "same facade crop"],
  "window_cornices": boolean,
  "string_courses": boolean,
  "sills": boolean,
  "base_course": boolean,
  "gutters": boolean,
  "downpipes": boolean,
  "balconies": boolean,
  "railings": boolean,
  "shutters": boolean,
  "entrance_door": boolean,
  "garage": boolean,
  "lights": boolean,
  "intercoms_mailboxes": boolean,
  "cables": boolean,
  "air_conditioners": boolean,
  "openings": [
    {
      "id": "A",
      "label": "Main opening",
      "position": "left|center|right|upper_left|upper_center|upper_right|ground_left|ground_center|ground_right|unknown",
      "floor_hint": "string",
      "opening_kind": "window|door_window|balcony_door|entrance_door|garage_door|arched_window|unknown",
      "apparent_size": "string",
      "special_shape": "string or null",
      "has_cornice": boolean,
      "has_sill": boolean,
      "sill_material": "string",
      "has_shutter": boolean,
      "shutter_type": "string",
      "has_balcony": boolean,
      "has_railing": boolean,
      "reveal_depth": "string",
      "lighting_notes": "string",
      "shadow_notes": "string",
      "preserve_notes": "string"
    }
  ],
  "note_analisi": "string",
  "tipo_edificio": "legacy string",
  "numero_piani": number,
  "numero_finestre": number,
  "intonaco_attuale": "legacy string",
  "colore_attuale_hex": "#D3D3D3",
  "stato_conservazione": "string",
  "elementi_presenti": ["cornici", "davanzali"]
}

Do not include markdown. Do not include explanations outside the JSON.`;

  const body = {
    contents: [{
      parts: [
        { text: analyzePrompt },
        {
          inline_data: {
            mime_type: mimeType,
            data: base64,
          },
        },
      ],
    }],
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.2,
    },
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`;
  const response = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
    1,
    1500,
    60_000,
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Analisi facciata Gemini fallita (${response.status}): ${errorText.substring(0, 240)}`);
  }

  const payload = await response.json() as Record<string, unknown>;
  const rawText = extractTextParts(payload);
  const extracted = extractFirstJsonObject(rawText);
  if (!extracted) {
    throw new Error("Gemini non ha restituito un JSON analisi valido per la facciata");
  }

  return normalizeFacciataSceneAnalysis(extracted, photoMeta) as unknown as Record<string, unknown>;
}

async function renderWithProvider(params: {
  providerConfig: RenderProviderConfig;
  apiKey: string;
  prompt: string;
  preparedUrl: string;
  width?: number;
  height?: number;
}): Promise<{ imageData: string; providerRawResponse: Record<string, unknown>; modelUsed: string }> {
  const originalImage = await downloadImageAsInlineData(params.preparedUrl);
  const providerKey = params.providerConfig.provider_key;
  let modelUsed = params.providerConfig.model;

  if (providerKey === "openai") {
    const renderSize = pickProviderSize(params.width, params.height, "openai") ?? "1024x1024";
    const imageBlob = new Blob([originalImage.bytes], { type: originalImage.mimeType || "image/jpeg" });
    const modelChain = [params.providerConfig.model || "gpt-image-1"];
    if (modelChain[0] !== "dall-e-2") modelChain.push("dall-e-2");

    const buildForm = (modelName: string) => {
      const form = new FormData();
      form.append("model", modelName);
      form.append("prompt", params.prompt);
      if (modelName === "dall-e-2") {
        form.append("image", imageBlob, "facade.png");
        form.append("size", "1024x1024");
        form.append("response_format", "b64_json");
      } else {
        form.append("image[]", imageBlob, "facade.jpg");
        form.append("size", renderSize);
      }
      form.append("n", "1");
      return form;
    };

    let response: Response | null = null;
    let lastError = "";

    for (const modelName of modelChain) {
      const candidate = await fetchWithRetry(
        "https://api.openai.com/v1/images/edits",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${params.apiKey}` },
          body: buildForm(modelName),
        },
      );

      if (candidate.ok) {
        response = candidate;
        modelUsed = modelName;
        break;
      }

      const errorText = await candidate.text();
      lastError = `OpenAI error ${candidate.status}: ${errorText.substring(0, 300)}`;
      const isModelAccessIssue = errorText.includes("invalid_value") && errorText.includes("\"model\"");
      if (!isModelAccessIssue) throw new Error(lastError);
    }

    if (!response) {
      throw new Error(lastError || "OpenAI: tutti i model tentati sono falliti");
    }

    const payload = await response.json() as Record<string, unknown>;
    const imageData = extractGeneratedImageData(payload)
      ?? await (async () => {
        const remoteUrl = (payload.data as Array<{ url?: string }> | undefined)?.[0]?.url;
        if (!remoteUrl) throw new Error("Nessuna immagine ricevuta dal provider AI");
        return remoteImageUrlToDataUrl(remoteUrl);
      })();

    return {
      imageData,
      providerRawResponse: { ...payload, _model_used: modelUsed },
      modelUsed,
    };
  }

  if (providerKey === "gemini") {
    const body = {
      contents: [{
        parts: [
          { text: params.prompt },
          {
            inline_data: {
              mime_type: originalImage.mimeType,
              data: originalImage.base64,
            },
          },
        ],
      }],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
        temperature: 1,
      },
    };

    const url = `${params.providerConfig.api_endpoint}/${params.providerConfig.model}:generateContent?key=${params.apiKey}`;
    const response = await fetchWithRetry(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini error ${response.status}: ${errorText.substring(0, 300)}`);
    }

    const payload = await response.json() as Record<string, unknown>;
    const imageData = extractGeneratedImageData(payload);
    if (!imageData) {
      const providerText = extractTextParts(payload);
      throw new Error(
        providerText
          ? `Il provider non ha restituito un'immagine renderizzabile: ${providerText.substring(0, 240)}`
          : "Nessuna immagine ricevuta dal provider AI",
      );
    }

    return {
      imageData,
      providerRawResponse: payload,
      modelUsed,
    };
  }

  throw new Error(`Provider '${providerKey}' non supportato. Selezionare OpenAI o Gemini.`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  let supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  let requestSessionId: string | null = null;

  try {
    const auth = await requireAuth(req, CORS);
    supabase = auth.supabaseAdmin;
    const userId = auth.userId;

    const body = await req.json().catch(() => ({}));
    const {
      action,
      session_id,
      config,
      target_width,
      target_height,
      image_url,
    } = body as {
      action?: string;
      session_id?: string;
      config?: Record<string, unknown>;
      target_width?: number;
      target_height?: number;
      image_url?: string;
    };

    requestSessionId = session_id ?? null;
    if (!requestSessionId) {
      return jsonResponse({ error: "validation_error", message: "session_id is required" }, 400);
    }

    const { data: session, error: sessionErr } = await supabase
      .from("render_facciata_sessions")
      .select("*")
      .eq("id", requestSessionId)
      .single();

    if (sessionErr || !session) {
      return jsonResponse({ error: "not_found", message: "Sessione non trovata" }, 404);
    }

    const typedSession = session as FacciataSessionRow & Record<string, unknown>;

    const allowed = await canAccessCompany(supabase, userId, typedSession.company_id);
    if (!allowed) {
      return jsonResponse({ error: "forbidden", message: "Accesso negato alla sessione render facciata" }, 403);
    }

    if (action === "analyze") {
      const signedUrl = typeof image_url === "string" && image_url
        ? image_url
        : await (async () => {
            if (!typedSession.original_photo_url) throw new Error("Foto originale della sessione mancante");
            const { data, error } = await supabase.storage
              .from("facciata-originals")
              .createSignedUrl(typedSession.original_photo_url, 600);
            if (error || !data?.signedUrl) throw new Error("Impossibile creare signed URL per la foto originale");
            return data.signedUrl;
          })();

      const analisi = await runFacadeAnalysis({
        supabase,
        imageUrl: signedUrl,
      });

      await supabase
        .from("render_facciata_sessions")
        .update({ foto_analisi: analisi })
        .eq("id", requestSessionId);

      return jsonResponse({
        success: true,
        session_id: requestSessionId,
        analisi_facciata: analisi,
      });
    }

    const deductResult = await deductRenderCreditSafe(supabase, {
      companyId: typedSession.company_id,
      sessionId: requestSessionId,
      userId,
      reasonMeta: { vertical: "facciata", edge_fn: "generate-facade-render" },
      logTag: "generate-facade-render",
    });

    if (deductResult.status === "insufficient") {
      return jsonResponse({ error: "insufficient_credits", message: "Crediti render insufficienti" }, 402);
    }

    await supabase
      .from("render_facciata_sessions")
      .update({ status: "processing", processing_started_at: new Date().toISOString() })
      .eq("id", requestSessionId);

    if (!typedSession.original_photo_url) {
      throw new Error("Foto originale della sessione mancante");
    }

    const prepared = await prepareInputImage({
      supabase,
      bucket: "facciata-originals",
      originalPath: typedSession.original_photo_url,
      hintWidth: target_width,
      hintHeight: target_height,
    });

    const dimensions = target_width && target_height
      ? { width: target_width, height: target_height }
      : prepared.effective_width && prepared.effective_height
        ? { width: prepared.effective_width, height: prepared.effective_height }
        : null;

    const photoMeta: FacciataPhotoMeta | null = dimensions
      ? {
          width: dimensions.width,
          height: dimensions.height,
          orientation: orientationFromDimensions(dimensions.width, dimensions.height),
        }
      : null;

    const normalizedConfig = buildFacciataRenderConfig(
      (config ?? typedSession.config ?? {}) as never,
      {
        sceneAnalysis: config?.scene_analysis ?? typedSession.foto_analisi ?? null,
        photoMeta,
        notes: typeof config?.notes === "string" ? config.notes : typeof config?.note_libere === "string" ? config.note_libere : "",
      },
    );

    const { systemPrompt, userPrompt, promptVersion, blocks } = buildFacciataPrompt(
      normalizedConfig as unknown as Record<string, unknown>,
    );

    const prompt = `${systemPrompt}\n\n${userPrompt}`;
    const { providerConfig, apiKey } = await loadRenderProviderWithKey(supabase);
    const { imageData, providerRawResponse, modelUsed } = await renderWithProvider({
      providerConfig,
      apiKey,
      prompt,
      preparedUrl: prepared.url,
      width: prepared.effective_width,
      height: prepared.effective_height,
    });

    const uploadPayload = dataUrlToBytes(imageData);
    const resultPath = `${typedSession.company_id}/${requestSessionId}/render_${Date.now()}.${uploadPayload.extension}`;

    const { error: uploadError } = await supabase.storage
      .from("facciata-results")
      .upload(resultPath, uploadPayload.bytes, {
        contentType: uploadPayload.mimeType,
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Errore upload risultato: ${uploadError.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from("facciata-results")
      .getPublicUrl(resultPath);

    const resultUrl = publicUrlData.publicUrl;

    const legacyCostReal = Number(providerConfig.cost_real_per_render ?? 0.04);
    const capture = await captureRealCost({
      supabase,
      providerKey: providerConfig.provider_key,
      model: modelUsed,
      rawResponse: providerRawResponse,
      legacyFallbackEur: legacyCostReal,
    });
    const costReal = capture.cost_eur;
    const costBilled = Number(providerConfig.cost_billed_per_render ?? 0.1);

    await supabase
      .from("render_facciata_sessions")
      .update({
        status: "completed",
        config: normalizedConfig,
        foto_analisi: normalizedConfig.scene_analysis,
        result_urls: [resultUrl],
        prompt_used: userPrompt,
        prompt_blocks: blocks,
        prompt_version: promptVersion,
        prompt_char_count: prompt.length,
        provider_key: providerConfig.provider_key,
        cost_real: costReal,
        cost_billed: costBilled,
        config_snapshot: normalizedConfig,
        processing_completed_at: new Date().toISOString(),
      })
      .eq("id", requestSessionId);

    if (providerConfig.id) {
      await supabase
        .from("render_provider_config")
        .update({ renders_generated: (providerConfig.renders_generated ?? 0) + 1 })
        .eq("id", providerConfig.id);
    }

    return jsonResponse({
      success: true,
      session_id: requestSessionId,
      result_url: resultUrl,
      result_urls: [resultUrl],
      provider: providerConfig.provider_key,
      prompt_version: promptVersion,
    });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : String(error);
    console.error("[generate-facade-render] error:", message);

    if (requestSessionId) {
      try {
        await supabase
          .from("render_facciata_sessions")
          .update({ status: "failed", error_message: message })
          .eq("id", requestSessionId);
      } catch {
        // ignore
      }
    }

    return jsonResponse({ error: "render_failed", message }, 500);
  }
});
