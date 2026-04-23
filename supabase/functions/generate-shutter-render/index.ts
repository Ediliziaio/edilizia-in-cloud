// generate-shutter-render — Edge Function EiC
// Render Persiane AI — Multi-Provider (OpenAI / Gemini)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";
import { buildPersianePrompt } from "../../../shared/render-persiane/persianePromptBuilder.ts";
import { normalizePersianeSceneAnalysis } from "../../../shared/render-persiane/persianeSceneAnalysis.ts";
import type { PersianePhotoMeta } from "../../../shared/render-persiane/types.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

type RenderProviderConfig = {
  provider_key: string;
  model: string;
  api_endpoint: string;
  cost_real_per_render?: number | null;
  cost_billed_per_render?: number | null;
};

type PersianeSessionRow = {
  id: string;
  company_id: string;
  original_photo_url: string | null;
  config: Record<string, unknown> | null;
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

  const apiKey = await getProviderApiKey(supabase, providerConfig.provider_key);
  if (!apiKey) {
    throw new Error(
      `API key mancante per provider '${providerConfig.provider_key}'. Configurarla in Admin > Impostazioni AI > Render.`,
    );
  }

  return {
    providerConfig: providerConfig as RenderProviderConfig,
    apiKey,
  };
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

  const bytes = new Uint8Array(imgBuffer);
  const base64 = btoa(String.fromCharCode(...bytes));
  return { mimeType, base64, bytes };
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

function orientationFromDimensions(width: number, height: number): PersianePhotoMeta["orientation"] {
  if (width === height) return "square";
  return width > height ? "landscape" : "portrait";
}

function resolveRenderSize(w?: number, h?: number): string {
  if (!w || !h) return "1024x1024";
  const ratio = w / h;
  if (ratio > 1.4) return "1792x1024";
  if (ratio < 0.7) return "1024x1792";
  return "1024x1024";
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

async function runPersianeAnalysis(params: {
  supabase: ReturnType<typeof createClient>;
  imageUrl: string;
}): Promise<Record<string, unknown>> {
  const geminiApiKey = await getProviderApiKey(params.supabase, "gemini");
  if (!geminiApiKey) {
    throw new Error("Gemini API key non configurata per l'analisi persiane.");
  }

  const { mimeType, base64, bytes } = await downloadImageAsInlineData(params.imageUrl);
  const dimensions = detectImageDimensions(bytes);
  const photoMeta: PersianePhotoMeta | null = dimensions
    ? {
        width: dimensions.width,
        height: dimensions.height,
        orientation: orientationFromDimensions(dimensions.width, dimensions.height),
      }
    : null;

  const analyzePrompt = `You are an expert architectural facade and shutter analyzer.
Analyze the provided facade/window photo and return ONLY a valid JSON object.

Return this exact schema:
{
  "facade_type": "string",
  "building_style": "string",
  "openings_visible": number,
  "camera_angle": "string",
  "lighting_condition": "string",
  "wall_texture": "string",
  "wall_color": "string",
  "untouched_elements": ["string"],
  "preserve_rigidly": ["string"],
  "primary_target_hint": "string or null",
  "note_analisi": "string",
  "tipo_facciata": "legacy string",
  "persiane_attuali": "legacy string",
  "materiale_attuale": "legacy string",
  "colore_attuale": "legacy string",
  "numero_finestre": number,
  "stato_conservazione": "string",
  "openings": [
    {
      "id": "A",
      "position": "far_left|left|center|right|far_right|upper_left|upper_center|upper_right|lower_left|lower_center|lower_right|full_width|unknown",
      "approximate_placement": "string",
      "opening_kind": "window|door_window|balcony_door|arched_window|unknown",
      "apparent_size": "string",
      "special_shape": "string or null",
      "has_existing_shutter": true,
      "existing_shutter_type": "veneziana_classica|veneziana_esterna|scuro_pieno|scuro_cornice|gelosia|avvolgibile_esterno|a_libro|griglia_sicurezza|brise_soleil|battente_generica|nessuna|unknown",
      "material_perceived": "string",
      "color_perceived": "string",
      "opening_state_perceived": "chiuso|socchiuso|aperto_45|aperto_90|anta_singola_aperta|not_visible|unknown",
      "leaf_orientation": "string",
      "leaf_count": number,
      "has_louvers": boolean,
      "louver_state": "string",
      "has_hinges": boolean,
      "has_hold_open_hardware": boolean,
      "has_tracks": boolean,
      "has_side_guides": boolean,
      "has_head_box": boolean,
      "has_security_grille": boolean,
      "reveal_depth": "string",
      "trim_details": ["string"],
      "lighting_notes": "string",
      "shadow_notes": "string",
      "geometry_notes": "string",
      "preserve_notes": "string"
    }
  ]
}

Important rules:
- Use left-to-right labels A, B, C for openings.
- If only one opening exists, still use opening id "A".
- Distinguish carefully between louvered shutters, solid shutters, roller shutters, security grilles and no shutters.
- If only one opening should obviously be the primary target, mention it in "primary_target_hint".
- Return ONLY raw JSON. No markdown.`;

  const geminiBody = {
    contents: [{
      parts: [
        { text: analyzePrompt },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ],
    }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1600,
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
    throw new Error(`Analisi AI persiane fallita (${resp.status}): ${errText.substring(0, 300)}`);
  }

  const geminiData = await resp.json() as Record<string, unknown>;
  const rawText = extractTextParts(geminiData);
  const analysis = normalizePersianeSceneAnalysis(extractFirstJsonObject(rawText), photoMeta) as unknown as Record<string, unknown>;
  return analysis;
}

async function loadSession(supabase: ReturnType<typeof createClient>, sessionId: string): Promise<PersianeSessionRow | null> {
  const { data, error } = await supabase
    .from("render_persiane_sessions")
    .select("id, company_id, original_photo_url, config")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  return (data as PersianeSessionRow | null) ?? null;
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
  let requestSessionId: string | null = null;

  try {
    const auth = await requireAuth(req, CORS);
    supabase = auth.supabaseAdmin;
    user = { id: auth.userId };

    const body = await req.json().catch(() => ({}));
    const {
      action,
      session_id,
      image_url,
      config,
      target_width,
      target_height,
    } = body as {
      action?: string;
      session_id?: string;
      image_url?: string;
      config?: Record<string, unknown>;
      target_width?: number;
      target_height?: number;
    };
    requestSessionId = session_id ?? null;

    if (action === "analyze") {
      if (!image_url) {
        return jsonResponse({ error: "validation_error", message: "image_url is required for analyze" }, 400);
      }

      if (session_id) {
        const session = await loadSession(supabase, session_id);
        if (!session) {
          return jsonResponse({ error: "not_found", message: "Sessione non trovata" }, 404);
        }
        const allowed = await canAccessCompany(supabase, user.id, session.company_id);
        if (!allowed) {
          return jsonResponse({ error: "forbidden", message: "Accesso negato alla sessione render persiane" }, 403);
        }
      }

      const analysis = await runPersianeAnalysis({ supabase, imageUrl: image_url });
      return jsonResponse({
        success: true,
        analisi_persiane: analysis,
        provider: "gemini",
      });
    }

    if (!session_id) {
      return jsonResponse({ error: "validation_error", message: "session_id is required" }, 400);
    }

    const session = await loadSession(supabase, session_id);
    if (!session) {
      return jsonResponse({ error: "not_found", message: "Sessione non trovata" }, 404);
    }

    const allowed = await canAccessCompany(supabase, user.id, session.company_id);
    if (!allowed) {
      return jsonResponse({ error: "forbidden", message: "Accesso negato alla sessione render persiane" }, 403);
    }

    const deductResult = await deductRenderCreditSafe(supabase, {
      companyId: session.company_id,
      sessionId: session_id,
      userId: user.id,
      reasonMeta: { vertical: "persiane", edge_fn: "generate-shutter-render" },
      logTag: "generate-shutter-render",
    });

    if (deductResult.status === "insufficient") {
      return jsonResponse({ error: "insufficient_credits", message: "Crediti render insufficienti" }, 402);
    }

    const { providerConfig, apiKey } = await loadRenderProviderWithKey(supabase);

    const originalPath = session.original_photo_url;
    if (!originalPath) {
      throw new Error("Foto originale della sessione mancante");
    }

    let imageUrl = originalPath;
    if (!originalPath.startsWith("http")) {
      const { data: signed } = await supabase.storage
        .from("persiane-originals")
        .createSignedUrl(originalPath, 600);
      if (signed?.signedUrl) imageUrl = signed.signedUrl;
    }

    const originalImage = await downloadImageAsInlineData(imageUrl);
    const sourceDimensions =
      Number.isFinite(Number(target_width)) && Number.isFinite(Number(target_height)) &&
      Number(target_width) > 0 && Number(target_height) > 0
        ? { width: Number(target_width), height: Number(target_height) }
        : detectImageDimensions(originalImage.bytes);

    const photoMeta: PersianePhotoMeta | null = sourceDimensions
      ? {
          width: sourceDimensions.width,
          height: sourceDimensions.height,
          orientation: orientationFromDimensions(sourceDimensions.width, sourceDimensions.height),
        }
      : null;

    const promptResult = buildPersianePrompt(
      (config || session.config || {}) as Record<string, unknown>,
      undefined,
      photoMeta,
    );

    const combinedPrompt = [
      promptResult.systemPrompt,
      promptResult.userPrompt,
      `[NEGATIVE CONSTRAINTS]\n${promptResult.negativePrompt}`,
    ].join("\n\n");

    await supabase
      .from("render_persiane_sessions")
      .update({
        status: "processing",
        processing_started_at: new Date().toISOString(),
        provider_key: providerConfig.provider_key,
        config: promptResult.normalizedConfig,
      })
      .eq("id", session_id);

    let imageData: string | null = null;

    if (providerConfig.provider_key === "openai") {
      const imgResp = await fetchWithTimeout(imageUrl, {}, 30_000);
      const imgBlob = await imgResp.blob();

      const form = new FormData();
      form.append("model", providerConfig.model);
      form.append("prompt", combinedPrompt);
      form.append("image[]", imgBlob, "photo.jpg");
      form.append("n", "1");
      form.append("size", resolveRenderSize(sourceDimensions?.width, sourceDimensions?.height));
      form.append("response_format", "b64_json");

      const resp = await fetchWithRetry(
        "https://api.openai.com/v1/images/edits",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        },
      );

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`OpenAI error ${resp.status}: ${err.substring(0, 300)}`);
      }

      const oaiData = await resp.json();
      const b64 = oaiData.data?.[0]?.b64_json;
      if (b64) imageData = `data:image/png;base64,${b64}`;
    } else if (providerConfig.provider_key === "gemini") {
      const geminiBody = {
        contents: [{
          parts: [
            { text: combinedPrompt },
            { inline_data: { mime_type: originalImage.mimeType, data: originalImage.base64 } },
          ],
        }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          temperature: 0.8,
        },
      };

      const geminiUrl = `${providerConfig.api_endpoint}/${providerConfig.model}:generateContent?key=${apiKey}`;
      const resp = await fetchWithRetry(
        geminiUrl,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(geminiBody),
        },
      );

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(`Gemini error ${resp.status}: ${err.substring(0, 300)}`);
      }

      const gemData = await resp.json();
      const parts = gemData.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith("image/")) {
          imageData = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }
    } else {
      throw new Error(`Provider '${providerConfig.provider_key}' non supportato.`);
    }

    if (!imageData) {
      throw new Error("Nessuna immagine ricevuta dal provider AI");
    }

    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const uint8 = Uint8Array.from(atob(base64Data), (char) => char.charCodeAt(0));
    const resultPath = `${session.company_id}/${session_id}/render_persiane_${Date.now()}.png`;

    const { error: uploadErr } = await supabase.storage
      .from("persiane-results")
      .upload(resultPath, uint8, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Errore upload risultato: ${uploadErr.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from("persiane-results")
      .getPublicUrl(resultPath);

    const resultUrl = publicUrlData.publicUrl;
    await supabase
      .from("render_persiane_sessions")
      .update({
        status: "completed",
        config: promptResult.normalizedConfig,
        result_urls: [resultUrl],
        prompt_used: combinedPrompt.substring(0, 10000),
        prompt_version: promptResult.promptVersion,
        provider_key: providerConfig.provider_key,
        model_used: providerConfig.model,
        cost_real: providerConfig.cost_real_per_render ?? 0.04,
        cost_billed: providerConfig.cost_billed_per_render ?? 0.10,
        processing_completed_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    return jsonResponse({
      success: true,
      result_url: resultUrl,
      result_urls: [resultUrl],
      session_id,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error ? err.message : "Errore interno sconosciuto";
    console.error("[generate-shutter-render] error:", message);

    try {
      if (requestSessionId) {
        await supabase
          .from("render_persiane_sessions")
          .update({
            status: "failed",
            error_message: message.substring(0, 500),
            processing_completed_at: new Date().toISOString(),
          })
          .eq("id", requestSessionId);
      }
    } catch {
      // ignore
    }

    return jsonResponse({ error: "internal_error", message }, 500);
  }
});
