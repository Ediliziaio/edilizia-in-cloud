// generate-bathroom-render — Edge Function EiC
// Render Bagno AI — Multi-Provider (OpenAI / Gemini)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe, refundRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";
import { captureRealCost } from "../_shared/renderCost.ts";
import { pickProviderSize, prepareInputImage } from "../_shared/renderImage.ts";
import { shouldFallbackOpenAIImageEdit } from "../_shared/openaiImageEdit.ts";
import { buildBathroomPrompt } from "../../../shared/render-bathroom/bathroomPromptBuilder.ts";
import { normalizeBathroomSceneAnalysis } from "../../../shared/render-bathroom/bathroomSceneAnalysis.ts";
import type { BathroomPhotoMeta } from "../../../shared/render-bathroom/types.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

type BathroomSessionRow = {
  id: string;
  company_id: string;
  foto_originale_path: string | null;
  configurazione: Record<string, unknown> | null;
  analisi_bagno: Record<string, unknown> | null;
  tipo_intervento: string | null;
};

type RenderProviderConfig = {
  id: string;
  provider_key: string;
  model: string;
  api_endpoint: string;
  is_active?: boolean | null;
  is_default?: boolean | null;
  quality?: string | null;
  cost_real_per_render?: number | null;
  cost_billed_per_render?: number | null;
  renders_generated?: number | null;
};

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
  for (let i = 0; i <= retries; i += 1) {
    try {
      const res = await fetchWithTimeout(url, options, timeoutMs);
      if (res.ok || i === retries) return res;
      if (res.status < 500) return res;
    } catch (err) {
      if (i === retries) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
  }

  throw new Error("fetchWithRetry: all retries exhausted");
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

declare const EdgeRuntime: { waitUntil?: (promise: Promise<unknown>) => void } | undefined;

function acceptedRenderResponse(sessionId: string): Response {
  return jsonResponse({ success: true, accepted: true, session_id: sessionId, status: "processing" }, 202);
}

function runInBackground(promise: Promise<unknown>) {
  if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime?.waitUntil === "function") {
    EdgeRuntime.waitUntil(promise);
    return;
  }

  promise.catch((err) => {
    console.error("[generate-bathroom-render] background fallback error:", err);
  });
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

function dataUrlToBytes(dataUrl: string): {
  bytes: Uint8Array;
  mimeType: string;
  extension: string;
} {
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

async function getGeminiApiKey(
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  return await getProviderApiKey(supabase, "gemini");
}

async function loadDefaultRenderProvider(
  supabase: ReturnType<typeof createClient>,
): Promise<RenderProviderConfig | null> {
  const { data: providerConfig } = await supabase
    .from("render_provider_config")
    .select("*")
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();

  return (providerConfig as RenderProviderConfig | null) ?? null;
}

async function loadRenderProviderWithKey(
  supabase: ReturnType<typeof createClient>,
): Promise<{ providerConfig: RenderProviderConfig; apiKey: string }> {
  const providerConfig = await loadDefaultRenderProvider(supabase);
  if (!providerConfig) {
    throw new Error("Nessun provider render attivo. Configurare in Admin > Impostazioni AI > Render.");
  }

  const apiKey = await getProviderApiKey(supabase, providerConfig.provider_key);
  if (!apiKey) {
    throw new Error(
      `API key mancante per provider '${providerConfig.provider_key}'. ` +
      `Configurarla in Admin > Impostazioni AI > Render o come Supabase secret ${providerConfig.provider_key.toUpperCase()}_API_KEY.`,
    );
  }

  return { providerConfig, apiKey };
}

async function remoteImageUrlToDataUrl(url: string): Promise<string> {
  const resp = await fetchWithTimeout(url, {}, 30_000);
  if (!resp.ok) {
    throw new Error(`Impossibile scaricare il risultato del provider (${resp.status})`);
  }

  const mimeType = (resp.headers.get("content-type") || "image/png").split(";")[0] || "image/png";
  const buffer = await resp.arrayBuffer();
  return `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`;
}

async function downloadImageAsInlineData(imageUrl: string): Promise<{
  mimeType: string;
  base64: string;
  bytes: Uint8Array;
}> {
  const imgResp = await fetchWithTimeout(imageUrl, {}, 30_000);
  if (!imgResp.ok) {
    throw new Error(`Impossibile scaricare l'immagine (${imgResp.status})`);
  }

  const mimeType = (imgResp.headers.get("content-type") || "image/jpeg").split(";")[0] || "image/jpeg";
  const imgBuffer = await imgResp.arrayBuffer();

  if (imgBuffer.byteLength === 0) {
    throw new Error("L'immagine originale risulta vuota");
  }

  return {
    mimeType,
    base64: arrayBufferToBase64(imgBuffer),
    bytes: new Uint8Array(imgBuffer),
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

  // PNG
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    if (bytes.length < 24) return null;
    return {
      width: readUint32BE(bytes, 16),
      height: readUint32BE(bytes, 20),
    };
  }

  // JPEG
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

  // WEBP
  if (
    bytes.length >= 30 &&
    String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
  ) {
    const chunkType = String.fromCharCode(...bytes.slice(12, 16));

    if (chunkType === "VP8X" && bytes.length >= 30) {
      const width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16);
      const height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16);
      return { width, height };
    }

    if (chunkType === "VP8 " && bytes.length >= 30) {
      const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
      const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
      if (width > 0 && height > 0) return { width, height };
    }

    if (chunkType === "VP8L" && bytes.length >= 25) {
      const b0 = bytes[21];
      const b1 = bytes[22];
      const b2 = bytes[23];
      const b3 = bytes[24];
      const width = 1 + (((b1 & 0x3f) << 8) | b0);
      const height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6));
      if (width > 0 && height > 0) return { width, height };
    }
  }

  return null;
}

function orientationFromDimensions(width: number, height: number): "portrait" | "landscape" | "square" {
  if (width === height) return "square";
  return width > height ? "landscape" : "portrait";
}

function describeFormatMismatch(
  expected: { width: number; height: number } | null,
  actual: { width: number; height: number } | null,
): string | null {
  if (!expected || !actual) return null;

  const expectedOrientation = orientationFromDimensions(expected.width, expected.height);
  const actualOrientation = orientationFromDimensions(actual.width, actual.height);
  if (expectedOrientation !== actualOrientation && expectedOrientation !== "square") {
    return `orientation mismatch (${expectedOrientation} expected, got ${actualOrientation})`;
  }

  const expectedRatio = expected.width / expected.height;
  const actualRatio = actual.width / actual.height;
  const diff = Math.abs(expectedRatio - actualRatio) / expectedRatio;
  if (diff > 0.08) {
    return `aspect ratio mismatch (${expected.width}:${expected.height} expected, got ${actual.width}:${actual.height})`;
  }

  return null;
}

function extractTextParts(payload: Record<string, unknown>): string {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const texts: string[] = [];

  for (const candidate of candidates) {
    const parts = (candidate as { content?: { parts?: Array<Record<string, unknown>> } }).content?.parts ?? [];
    for (const part of parts) {
      if (typeof part.text === "string" && part.text.trim()) {
        texts.push(part.text.trim());
      }
    }
  }

  return texts.join("\n");
}

function extractFirstJsonObject(rawText: string): Record<string, unknown> | null {
  const clean = rawText
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();

  if (!clean) return null;

  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function extractGeneratedImageData(aiData: Record<string, unknown>): string | null {
  const choices = Array.isArray(aiData.choices) ? aiData.choices : [];

  for (const choice of choices) {
    const content = (choice as { message?: { content?: unknown } }).message?.content;

    if (typeof content === "string" && content.startsWith("data:image/")) {
      return content;
    }

    if (Array.isArray(content)) {
      for (const part of content) {
        const typedPart = part as {
          type?: string;
          image_url?: { url?: string };
          source?: { media_type?: string; data?: string };
          b64_json?: string;
        };

        if (typedPart.type === "image_url" && typedPart.image_url?.url) {
          return typedPart.image_url.url;
        }

        if (typedPart.type === "image" && typedPart.source?.data) {
          return `data:${typedPart.source.media_type || "image/png"};base64,${typedPart.source.data}`;
        }

        if (typedPart.b64_json) {
          return `data:image/png;base64,${typedPart.b64_json}`;
        }
      }
    }
  }

  const candidates = Array.isArray(aiData.candidates) ? aiData.candidates : [];
  for (const candidate of candidates) {
    const parts = (candidate as { content?: { parts?: Array<Record<string, unknown>> } }).content?.parts ?? [];
    for (const part of parts) {
      const inlineData = part.inlineData as { mimeType?: string; data?: string } | undefined;
      if (inlineData?.mimeType?.startsWith("image/") && inlineData.data) {
        return `data:${inlineData.mimeType};base64,${inlineData.data}`;
      }
    }
  }

  const dataItems = Array.isArray(aiData.data) ? aiData.data : [];
  for (const item of dataItems) {
    const b64Json = (item as { b64_json?: string }).b64_json;
    if (typeof b64Json === "string" && b64Json) {
      return `data:image/png;base64,${b64Json}`;
    }
  }

  return null;
}

async function loadBathroomSession(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
): Promise<BathroomSessionRow | null> {
  const { data: session } = await supabase
    .from("render_bagno_sessions")
    .select("id, company_id, foto_originale_path, configurazione, analisi_bagno, tipo_intervento")
    .eq("id", sessionId)
    .maybeSingle();

  return session as BathroomSessionRow | null;
}

async function requestBathroomRender(params: {
  providerConfig: RenderProviderConfig;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  originalImage: { mimeType: string; base64: string; bytes: Uint8Array };
  targetWidth?: number | null;
  targetHeight?: number | null;
  strictNote?: string;
}): Promise<{ dataUrl: string; aiData: Record<string, unknown>; modelUsed: string }> {
  const promptText = params.strictNote
    ? `${params.systemPrompt}\n\n${params.userPrompt}\n\n${params.strictNote}`
    : `${params.systemPrompt}\n\n${params.userPrompt}`;

  if (params.providerConfig.provider_key === "openai") {
    const renderSize = pickProviderSize(
      params.targetWidth ?? null,
      params.targetHeight ?? null,
      "openai",
    ) ?? "1024x1024";
    const imageBlob = new Blob([params.originalImage.bytes], {
      type: params.originalImage.mimeType || "image/jpeg",
    });
    const modelChain = [params.providerConfig.model || "gpt-image-1"];
    if (modelChain[0] !== "dall-e-2") modelChain.push("dall-e-2");

    const buildForm = (modelName: string) => {
      const form = new FormData();
      form.append("model", modelName);
      form.append("prompt", promptText);
      if (modelName === "dall-e-2") {
        form.append("image", imageBlob, "bathroom.png");
        form.append("size", "1024x1024");
        form.append("response_format", "b64_json");
      } else {
        form.append("image[]", imageBlob, "bathroom.jpg");
        form.append("size", renderSize);
      }
      form.append("n", "1");
      return form;
    };

    let openAiResp: Response | null = null;
    let lastErr = "";
    let modelUsed = modelChain[0];

    for (const modelName of modelChain) {
      const resp = await fetchWithRetry(
        "https://api.openai.com/v1/images/edits",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${params.apiKey}` },
          body: buildForm(modelName),
        },
        2,
        2000,
        120_000,
      );

      if (resp.ok) {
        openAiResp = resp;
        modelUsed = modelName;
        break;
      }

      const errText = await resp.text();
      lastErr = `OpenAI error ${resp.status}: ${errText.substring(0, 300)}`;
      const isModelAccessIssue = shouldFallbackOpenAIImageEdit(resp.status, errText);
      if (!isModelAccessIssue) throw new Error(lastErr);
    }

    if (!openAiResp) {
      throw new Error(lastErr || "OpenAI: tutti i model tentati sono falliti");
    }

    const aiData = await openAiResp.json() as Record<string, unknown>;
    let dataUrl = extractGeneratedImageData(aiData);
    if (!dataUrl) {
      const remoteUrl = (aiData.data as Array<{ url?: string }> | undefined)?.[0]?.url;
      if (remoteUrl) {
        dataUrl = await remoteImageUrlToDataUrl(remoteUrl);
      }
    }

    if (!dataUrl) {
      throw new Error("Nessuna immagine ricevuta da OpenAI");
    }

    return {
      dataUrl,
      aiData: { ...aiData, _model_used: modelUsed },
      modelUsed,
    };
  }

  if (params.providerConfig.provider_key !== "gemini") {
    throw new Error(
      `Provider '${params.providerConfig.provider_key}' non supportato. Selezionare OpenAI o Gemini.`,
    );
  }

  const geminiBody = {
    contents: [{
      parts: [
        { text: promptText },
        {
          inline_data: {
            mime_type: params.originalImage.mimeType,
            data: params.originalImage.base64,
          },
        },
      ],
    }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      temperature: 0.35,
    },
  };

  const geminiUrl = `${params.providerConfig.api_endpoint}/${params.providerConfig.model}:generateContent?key=${params.apiKey}`;
  const aiResp = await fetchWithRetry(
    geminiUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    },
    2,
    2000,
    120_000,
  );

  if (!aiResp.ok) {
    const errText = await aiResp.text();
    throw new Error(`Gemini render error ${aiResp.status}: ${errText.substring(0, 300)}`);
  }

  const aiData = await aiResp.json() as Record<string, unknown>;
  const dataUrl = extractGeneratedImageData(aiData);

  if (!dataUrl) {
    const providerText = extractTextParts(aiData);
    throw new Error(
      providerText
        ? `Il provider non ha restituito un'immagine renderizzabile: ${providerText.substring(0, 240)}`
        : "Nessuna immagine ricevuta dal provider AI",
    );
  }

  return {
    dataUrl,
    aiData,
    modelUsed: params.providerConfig.model,
  };
}

async function runBathroomAnalysis(params: {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  imageUrl: string;
  sessionId?: string;
}): Promise<Record<string, unknown>> {
  const { supabase, userId, imageUrl, sessionId } = params;

  if (sessionId) {
    const session = await loadBathroomSession(supabase, sessionId);
    if (!session) {
      throw new Error("Sessione render bagno non trovata");
    }

    const allowed = await canAccessCompany(supabase, userId, session.company_id);
    if (!allowed) {
      throw new Error("Accesso negato alla sessione render bagno");
    }

    await supabase
      .from("render_bagno_sessions")
      .update({ stato: "analyzing" })
      .eq("id", sessionId);
  }

  const geminiApiKey = await getGeminiApiKey(supabase);
  if (!geminiApiKey) {
    return {};
  }

  const { mimeType, base64, bytes } = await downloadImageAsInlineData(imageUrl);
  const dimensions = detectImageDimensions(bytes);
  const photoMeta: BathroomPhotoMeta | null = dimensions
    ? {
        width: dimensions.width,
        height: dimensions.height,
        orientation: orientationFromDimensions(dimensions.width, dimensions.height),
      }
    : null;

  const analyzePrompt = `Analyze this bathroom photo and return ONLY one raw JSON object.

Required schema:
{
  "room_type": "bathroom|ensuite|powder_room|wet_room|laundry_bath|unknown",
  "estimated_size": "short grounded string",
  "estimated_ceiling_height": "short grounded string",
  "layout_type": "linear_single_wall|opposed_walls|corner_shower|bathtub_alcove|compact_rectangular|split_zones|unknown",
  "camera_perspective": "short grounded string",
  "camera_angle": "short grounded string",
  "colori_dominanti": ["string"],
  "wall_tiles": {
    "description": "string",
    "effect": "string",
    "format": "string",
    "laying_pattern": "string",
    "grout_color": "string",
    "coverage": "string"
  },
  "floor": {
    "description": "string",
    "effect": "string",
    "format": "string",
    "laying_pattern": "string",
    "grout_color": "string"
  },
  "shower": {
    "present": true,
    "type": "walk_in|nicchia_box|frontale_box|angolare|semicircolare|generic_box|unknown|none",
    "position": "left_wall|right_wall|back_wall|center|corner_left|corner_right|under_window|unknown",
    "enclosure_type": "string",
    "glass_type": "string",
    "tray_type": "string",
    "frame_finish": "string",
    "notes": "string"
  },
  "bathtub": {
    "present": false,
    "type": "freestanding_ovale|freestanding_rettangolare|back_to_wall|incassata|angolare|generic_built_in|unknown|none",
    "position": "left_wall|right_wall|back_wall|center|corner_left|corner_right|under_window|unknown",
    "faucet_type": "string",
    "screen_present": false,
    "notes": "string"
  },
  "vanity": {
    "present": true,
    "type": "wall_hung|floor_standing|console|unknown|none",
    "position": "left_wall|right_wall|back_wall|center|corner_left|corner_right|under_window|unknown",
    "basin_type": "string",
    "basin_count": 1,
    "mirror_present": true,
    "mirror_type": "string",
    "notes": "string"
  },
  "sanitary_ware": {
    "wc_present": true,
    "wc_type": "wall_hung|back_to_wall|floor_standing|unknown|none",
    "bidet_present": true,
    "bidet_type": "wall_hung|back_to_wall|floor_standing|unknown|none",
    "position": "left_wall|right_wall|back_wall|center|corner_left|corner_right|under_window|unknown",
    "notes": "string"
  },
  "lighting": {
    "type": "natural|ceiling_spots|pendant|mirror_backlit|wall_sconces|mixed|unknown",
    "direction": "string",
    "temperature": "string",
    "notes": "string"
  },
  "mirror_present": true,
  "towel_warmer_present": false,
  "towel_warmer_type": "string",
  "window_present": true,
  "window_position": "left_wall|right_wall|back_wall|center|corner_left|corner_right|under_window|unknown",
  "niche_present": false,
  "partition_present": false,
  "preserve_rigidly": ["string"],
  "demolition_sensitive_areas": ["string"],
  "stato_conservazione": "buono|discreto|da_ristrutturare",
  "note_analisi": "string",

  "tipo_stanza": "legacy string",
  "dimensione_stimata": "legacy string",
  "altezza_stimata": "legacy string",
  "piastrelle_parete_attuali": "legacy string",
  "pavimento_attuale": "legacy string",
  "presenza_doccia": true,
  "tipo_doccia": "legacy string or null",
  "presenza_vasca": false,
  "presenza_mobile": true,
  "tipo_mobile": "legacy string or null",
  "sanitari_tipo": "legacy string or null",
  "rubinetteria_attuale": "legacy string or null",
  "illuminazione_attuale": "legacy string or null",
  "note": "legacy short note"
}

Rules:
- This is the SAME real bathroom photo, not a design moodboard.
- Be concrete and visually grounded.
- If uncertain, use safe strings like "unknown" or "not identified", but still fill the schema.
- Focus on layout, current shower/tub state, vanity, sanitary positions, surfaces and rigid preservation anchors.
- Return ONLY raw JSON, no markdown.`;

  const geminiBody = {
    contents: [{
      parts: [
        { text: analyzePrompt },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ],
    }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1200,
    },
  };

  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
  const resp = await fetchWithRetry(
    geminiUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    },
    2,
    1500,
    60_000,
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Analisi AI fallita (${resp.status}): ${errText.substring(0, 300)}`);
  }

  const geminiData = await resp.json() as Record<string, unknown>;
  const rawText = extractTextParts(geminiData);
  const analysis = normalizeBathroomSceneAnalysis(extractFirstJsonObject(rawText), photoMeta) as unknown as Record<string, unknown>;

  if (sessionId) {
    await supabase
      .from("render_bagno_sessions")
      .update({
        stato: "analysis_done",
        analisi_bagno: analysis,
      })
      .eq("id", sessionId);
  }

  return analysis;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS });
  }

  let supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  let user = { id: "" };
  let refundableSessionId: string | null = null;
  let refundableCompanyId: string | null = null;
  let creditDeducted = false;

  try {
    const auth = await requireAuth(req, CORS);
    supabase = auth.supabaseAdmin;
    user = { id: auth.userId };

    const body = await req.json().catch(() => ({}));
    const {
      action,
      session_id,
      image_url,
      target_width,
      target_height,
    } = body as {
      action?: string;
      session_id?: string;
      image_url?: string;
      target_width?: number;
      target_height?: number;
    };

    if (action === "analyze") {
      if (!image_url) {
        return jsonResponse(
          { error: "validation_error", message: "image_url is required for analyze" },
          400,
        );
      }

      try {
        const analysis = await runBathroomAnalysis({
          supabase,
          userId: user.id,
          imageUrl: image_url,
          sessionId: session_id,
        });

        return jsonResponse({
          success: true,
          analisi_bagno: analysis,
          provider: "gemini",
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (session_id) {
          await supabase
            .from("render_bagno_sessions")
            .update({ stato: "analysis_done" })
            .eq("id", session_id);
        }

        return jsonResponse(
          { error: "analysis_failed", message },
          502,
        );
      }
    }

    if (!session_id) {
      return jsonResponse(
        { error: "validation_error", message: "session_id is required" },
        400,
      );
    }
    refundableSessionId = session_id;

    const session = await loadBathroomSession(supabase, session_id);
    if (!session) {
      return jsonResponse(
        { error: "not_found", message: "Sessione non trovata" },
        404,
      );
    }
    refundableCompanyId = session.company_id;

    const allowed = await canAccessCompany(supabase, user.id, session.company_id);
    if (!allowed) {
      return jsonResponse(
        { error: "forbidden", message: "Accesso negato alla sessione render bagno" },
        403,
      );
    }

    if (session.stato === "completato" && session.render_result_url) {
      return jsonResponse({
        success: true,
        session_id,
        result_url: session.render_result_url,
        provider: session.provider_key,
        prompt_version: session.prompt_version,
        already_completed: true,
      });
    }
    if (session.stato === "processing") {
      return acceptedRenderResponse(session_id);
    }

    const deductResult = await deductRenderCreditSafe(supabase, {
      companyId: session.company_id,
      sessionId: session_id,
      userId: user.id,
      reasonMeta: { vertical: "bagno", edge_fn: "generate-bathroom-render" },
      logTag: "generate-bathroom-render",
    });

    if (deductResult.status === "insufficient") {
      return jsonResponse(
        { error: "insufficient_credits", message: "Crediti render insufficienti" },
        402,
      );
    }
    creditDeducted = true;

    const { providerConfig, apiKey } = await loadRenderProviderWithKey(supabase);

    await supabase
      .from("render_bagno_sessions")
      .update({
        stato: "processing",
        processing_started_at: new Date().toISOString(),
        provider_key: providerConfig.provider_key,
      })
      .eq("id", session_id);

    const renderJob = (async () => {
    const originalPath = session.foto_originale_path;
    if (!originalPath) {
      throw new Error("Foto originale della sessione mancante");
    }

    const prepared = await prepareInputImage({
      supabase,
      bucket: "bagno-originals",
      originalPath,
      hintWidth: target_width,
      hintHeight: target_height,
    });

    const originalImage = await downloadImageAsInlineData(prepared.url);
    const sourceDimensions =
      Number.isFinite(Number(target_width)) && Number.isFinite(Number(target_height)) &&
      Number(target_width) > 0 && Number(target_height) > 0
        ? {
            width: prepared.effective_width ?? Number(target_width),
            height: prepared.effective_height ?? Number(target_height),
          }
        : detectImageDimensions(originalImage.bytes);

    const photoMetaForPrompt: BathroomPhotoMeta | null = sourceDimensions
      ? {
          width: sourceDimensions.width,
          height: sourceDimensions.height,
          orientation: orientationFromDimensions(sourceDimensions.width, sourceDimensions.height),
        }
      : null;

    const { systemPrompt, userPrompt, promptVersion } = buildBathroomPrompt(
      (session.configurazione || {}) as Record<string, unknown>,
      session.analisi_bagno || {},
      photoMetaForPrompt,
    );

    let renderResult = await requestBathroomRender({
      providerConfig,
      apiKey,
      systemPrompt,
      userPrompt,
      originalImage,
      targetWidth: sourceDimensions?.width ?? null,
      targetHeight: sourceDimensions?.height ?? null,
    });

    let uploadPayload = dataUrlToBytes(renderResult.dataUrl);
    const firstAttemptDimensions = detectImageDimensions(uploadPayload.bytes);
    const firstMismatch = describeFormatMismatch(sourceDimensions ?? null, firstAttemptDimensions);

    if (firstMismatch) {
      renderResult = await requestBathroomRender({
        providerConfig,
        apiKey,
        systemPrompt,
        userPrompt,
        originalImage,
        targetWidth: sourceDimensions?.width ?? null,
        targetHeight: sourceDimensions?.height ?? null,
        strictNote: `[FORMAT CORRECTION]
The previous attempt was not acceptable because of ${firstMismatch}.
Regenerate the image keeping EXACT same orientation, framing, crop, visible room size, and apparent camera distance as the source photo.
The bathroom must occupy the same image area as the source. No zooming out, no zooming in, no padding, no crop change.`,
      });
      uploadPayload = dataUrlToBytes(renderResult.dataUrl);
    }

    const resultPath = `${session.company_id}/${session_id}/render_bagno_${Date.now()}.${uploadPayload.extension}`;

    const { error: uploadErr } = await supabase.storage
      .from("bagno-results")
      .upload(resultPath, uploadPayload.bytes, {
        contentType: uploadPayload.mimeType,
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Upload risultato fallito: ${uploadErr.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from("bagno-results")
      .getPublicUrl(resultPath);

    const resultUrl = publicUrlData.publicUrl;
    const modelUsed = renderResult.modelUsed || providerConfig.model;
    const legacyCostReal = Number(providerConfig.cost_real_per_render ?? 0.04);
    const capture = await captureRealCost({
      supabase,
      providerKey: providerConfig.provider_key,
      model: modelUsed,
      rawResponse: renderResult.aiData,
      legacyFallbackEur: legacyCostReal,
    });
    const costReal = capture.cost_eur;
    const costBilled = Number(providerConfig.cost_billed_per_render ?? 0.10);

    await supabase
      .from("render_bagno_sessions")
      .update({
        stato: "completato",
        render_result_path: resultPath,
        render_result_url: resultUrl,
        prompt_usato: userPrompt,
        prompt_version: promptVersion,
        provider_key: providerConfig.provider_key,
        model_used: modelUsed,
        cost_real: costReal,
        cost_billed: costBilled,
        processing_completed_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    await supabase
      .from("render_provider_config")
      .update({ renders_generated: (providerConfig.renders_generated ?? 0) + 1 })
      .eq("id", providerConfig.id);

    return jsonResponse({
      success: true,
      session_id,
      result_url: resultUrl,
      provider: providerConfig.provider_key,
      prompt_version: promptVersion,
    });
    })().catch(async (jobErr: unknown) => {
      const message = jobErr instanceof Error ? jobErr.message : String(jobErr);
      console.error("[generate-bathroom-render] background error:", message);
      await refundRenderCreditSafe(supabase, {
        companyId: session.company_id,
        sessionId: session_id,
        userId: user.id,
        reasonMeta: { vertical: "bagno", edge_fn: "generate-bathroom-render", error: message.substring(0, 500) },
        logTag: "generate-bathroom-render",
      });
      await supabase
        .from("render_bagno_sessions")
        .update({
          stato: "errore",
          processing_completed_at: new Date().toISOString(),
        })
        .eq("id", session_id);
    });

    runInBackground(renderJob);
    return acceptedRenderResponse(session_id);
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-bathroom-render] error:", message);

    try {
      const body = await req.clone().json().catch(() => ({}));
      const sid = (body as { session_id?: string }).session_id;

      if (sid) {
        if (creditDeducted && refundableCompanyId && refundableSessionId) {
          await refundRenderCreditSafe(supabase, {
            companyId: refundableCompanyId,
            sessionId: refundableSessionId,
            userId: user.id,
            reasonMeta: { vertical: "bagno", edge_fn: "generate-bathroom-render", error: message.substring(0, 500) },
            logTag: "generate-bathroom-render",
          });
        }
        await supabase
          .from("render_bagno_sessions")
          .update({
            stato: "errore",
            processing_completed_at: new Date().toISOString(),
          })
          .eq("id", sid);
      }
    } catch {
      // no-op
    }

    return jsonResponse(
      { error: "render_failed", message },
      500,
    );
  }
});
