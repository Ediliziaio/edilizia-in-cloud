// generate-floor-render — Edge Function EiC
// Render Pavimento AI — Gemini (google/gemini-2.5-flash-image)
// Same pattern as generate-render but for floor replacement

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe, refundRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";
import { captureRealCost } from "../_shared/renderCost.ts";
import { pickProviderSize, prepareInputImage } from "../_shared/renderImage.ts";
import { shouldFallbackOpenAIImageEdit } from "../_shared/openaiImageEdit.ts";
import { buildFloorPrompt } from "../../../shared/render-floor/floorPromptBuilder.ts";
import type { FloorPhotoMeta } from "../../../shared/render-floor/types.ts";

// ── CORS ──────────────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

async function remoteImageUrlToDataUrl(url: string): Promise<string> {
  const resp = await fetchWithTimeout(url, {}, 30_000);
  if (!resp.ok) {
    throw new Error(`Impossibile scaricare il risultato del provider (${resp.status})`);
  }
  const mimeType = (resp.headers.get("content-type") || "image/png").split(";")[0] || "image/png";
  const buffer = await resp.arrayBuffer();
  return `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`;
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

function extractTextParts(payload: Record<string, unknown>): string {
  const candidates = payload.candidates as Array<Record<string, unknown>> | undefined;
  const parts = candidates?.[0]?.content &&
    typeof candidates[0].content === "object" &&
    "parts" in candidates[0].content
    ? (candidates[0].content as { parts?: Array<Record<string, unknown>> }).parts
    : undefined;

  return (parts ?? [])
    .map((part) => typeof part.text === "string" ? part.text : "")
    .filter(Boolean)
    .join("\n")
    .trim();
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

// ── fetchWithTimeout ──────────────────────────────────────────────────────────
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 120_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

// ── fetchWithRetry ───────────────────────────────────────────────────────────
async function fetchWithRetry(url: string, options: RequestInit, retries = 2, delayMs = 2000): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || i === retries) return res;
      // Non-ok but retryable (5xx)
      if (res.status < 500) return res;
    } catch (err) {
      if (i === retries) throw err;
    }
    await new Promise(r => setTimeout(r, delayMs * (i + 1)));
  }
  throw new Error("fetchWithRetry: all retries exhausted");
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  let supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
  let user = { id: "" };
  let refundableSessionId: string | null = null;
  let refundableCompanyId: string | null = null;
  let creditDeducted = false;

  try {
    const auth = await requireAuth(req, CORS);
    supabase = auth.supabaseAdmin;
    user = { id: auth.userId };

    // ── Parse request ───────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { action, session_id, config, image_url, target_width, target_height, analysis, photo_meta } = body as {
      action?: string;
      session_id?: string;
      config?: Record<string, unknown>;
      image_url?: string;
      target_width?: number;
      target_height?: number;
      analysis?: Record<string, unknown>;
      photo_meta?: FloorPhotoMeta;
    };

    // ══════════════════════════════════════════════════════════════════════
    // ACTION: analyze — AI analysis of the floor photo
    // ══════════════════════════════════════════════════════════════════════
    if (action === "analyze") {
      if (!image_url) {
        return new Response(
          JSON.stringify({ error: "validation_error", message: "image_url is required for analyze" }),
          { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      // Get Gemini API key (DB → Supabase edge secret GEMINI_API_KEY)
      const { data: keyRow } = await supabase
        .from("platform_settings")
        .select("value")
        .eq("key", "render_gemini_api_key")
        .maybeSingle();

      const apiKey =
        (keyRow as { value: string } | null)?.value?.trim() ||
        Deno.env.get("GEMINI_API_KEY")?.trim() ||
        "";
      if (!apiKey) {
        return new Response(
          JSON.stringify({ success: true, analisi: null, provider: "analysis_skipped" }),
          { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
        );
      }

      // Download image
      const imgResp = await fetchWithTimeout(image_url, {}, 30_000);
      const imgBuffer = await imgResp.arrayBuffer();
      const imgB64 = arrayBufferToBase64(imgBuffer);

      const analyzePrompt = `Analyze this interior photograph for a surgical floor replacement workflow. Return ONLY compact JSON with these fields:
{
  "tipo_stanza": "room type",
  "pavimento_attuale": "current floor material",
  "colore_attuale": "current floor color",
  "dimensione_stimata": "estimated room size",
  "stato_conservazione": "floor condition",
  "battiscopa_presente": true/false,
  "current_floor_format": "tile/plank/module format if visible",
  "has_visible_joints": true/false,
  "visible_floor_area": "where the visible floor area is",
  "floor_perimeter_geometry": "wall/door/furniture boundaries",
  "thresholds_visible": true/false,
  "steps_visible": true/false,
  "rugs_present": true/false,
  "obstacles": ["visible furniture/objects touching floor"],
  "light_quality": "lighting and reflection notes",
  "preserved_elements": ["items that must remain unchanged"],
  "note": "short floor-specific observation"
}
Use short values. Do not describe a renovation.`;

      const geminiBody = {
        contents: [{
          parts: [
            { text: analyzePrompt },
            { inline_data: { mime_type: "image/jpeg", data: imgB64 } },
          ],
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 700,
          response_mime_type: "application/json",
        },
      };

      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
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
        throw new Error(`Gemini analysis error ${resp.status}: ${err.substring(0, 300)}`);
      }

      const gemData = await resp.json();
      const textPart = gemData.candidates?.[0]?.content?.parts?.find((p: Record<string, unknown>) => p.text);
      let analisi = null;

      if (textPart?.text) {
        try {
          const cleanJson = textPart.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
          analisi = JSON.parse(cleanJson);
        } catch {
          analisi = { tipo_stanza: "non identificata", pavimento_attuale: "non identificato", colore_attuale: "non identificato", dimensione_stimata: "non identificata", stato_conservazione: "non identificato", battiscopa_presente: false };
        }
      }

      // Save analysis to session
      if (session_id && analisi) {
        await supabase
          .from("render_pavimento_sessions")
          .update({ analisi_pavimento: analisi })
          .eq("id", session_id);
      }

      return new Response(
        JSON.stringify({ success: true, analisi }),
        { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ══════════════════════════════════════════════════════════════════════
    // ACTION: render — Generate floor render
    // ══════════════════════════════════════════════════════════════════════
    if (!session_id) {
      return new Response(
        JSON.stringify({ error: "validation_error", message: "session_id is required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }
    refundableSessionId = session_id;

    // ── Load session ────────────────────────────────────────────────────
    const { data: session, error: sessionErr } = await supabase
      .from("render_pavimento_sessions")
      .select("*")
      .eq("id", session_id)
      .single();

    if (sessionErr || !session) {
      return new Response(
        JSON.stringify({ error: "not_found", message: "Sessione non trovata" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }
    refundableCompanyId = session.company_id as string;

    // Verify ownership (impersonation-aware, FIX P1.3)
    const allowed = await canAccessCompany(
      supabase,
      user.id,
      session.company_id as string,
    );
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "forbidden", message: "Accesso negato alla sessione render pavimento" }),
        { status: 403, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Deduct credits (v3 → v2 → v1 fallback + audit ledger) ────────────
    const deductResult = await deductRenderCreditSafe(supabase, {
      companyId:  session.company_id as string,
      sessionId:  session_id,
      userId:     user.id,
      reasonMeta: { vertical: "pavimento", edge_fn: "generate-floor-render" },
      logTag:     "generate-floor-render",
    });

    if (deductResult.status === "insufficient") {
      return new Response(
        JSON.stringify({ error: "insufficient_credits", message: "Crediti render insufficienti" }),
        { status: 402, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }
    creditDeducted = true;

    // ── Update session: processing ──────────────────────────────────────
    await supabase
      .from("render_pavimento_sessions")
      .update({ status: "processing", processing_started_at: new Date().toISOString() })
      .eq("id", session_id);

    const originalPath = session.original_photo_url as string;
    if (!originalPath) {
      throw new Error("Foto originale della sessione mancante");
    }

    const prepared = await prepareInputImage({
      supabase,
      bucket: "pavimento-originals",
      originalPath,
      hintWidth: target_width,
      hintHeight: target_height,
    });

    const originalImage = await downloadImageAsInlineData(prepared.url);

    // ── Build prompt ────────────────────────────────────────────────────
    const activeConfig = (config || session.config) as Record<string, unknown>;
    const activeAnalysis = analysis || (session.analisi_pavimento as Record<string, unknown> | null) || null;
    const activePhotoMeta: FloorPhotoMeta = photo_meta ?? {
      width: prepared.effective_width,
      height: prepared.effective_height,
      orientation: prepared.effective_width > prepared.effective_height
        ? "landscape"
        : prepared.effective_width < prepared.effective_height
          ? "portrait"
          : "square",
    };

    const {
      systemPrompt,
      userPrompt,
      promptVersion,
      normalizedConfig,
      validation,
    } = buildFloorPrompt(activeConfig, activeAnalysis, activePhotoMeta);
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    const { providerConfig, apiKey } = await loadRenderProviderWithKey(supabase);

    let imageData: string | null = null;
    let providerRawResponse: Record<string, unknown> = {};
    let modelUsed = providerConfig.model;

    if (providerConfig.provider_key === "openai") {
      const renderSize = pickProviderSize(
        prepared.effective_width,
        prepared.effective_height,
        "openai",
      ) ?? "1024x1024";
      const imageBlob = new Blob([originalImage.bytes], {
        type: originalImage.mimeType || "image/jpeg",
      });
      const modelChain = [providerConfig.model || "gpt-image-1"];
      if (modelChain[0] !== "dall-e-2") modelChain.push("dall-e-2");

      const buildForm = (modelName: string) => {
        const form = new FormData();
        form.append("model", modelName);
        form.append("prompt", fullPrompt);
        if (modelName === "dall-e-2") {
          form.append("image", imageBlob, "floor.png");
          form.append("size", "1024x1024");
          form.append("response_format", "b64_json");
        } else {
          form.append("image[]", imageBlob, "floor.jpg");
          form.append("size", renderSize);
        }
        form.append("n", "1");
        return form;
      };

      let openAiResp: Response | null = null;
      let lastErr = "";

      for (const modelName of modelChain) {
        const resp = await fetchWithRetry(
          "https://api.openai.com/v1/images/edits",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: buildForm(modelName),
          },
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

      const openAiData = await openAiResp.json() as Record<string, unknown>;
      providerRawResponse = { ...openAiData, _model_used: modelUsed };
      imageData = extractGeneratedImageData(openAiData);
      if (!imageData) {
        const remoteUrl = (openAiData.data as Array<{ url?: string }> | undefined)?.[0]?.url;
        if (remoteUrl) {
          imageData = await remoteImageUrlToDataUrl(remoteUrl);
        }
      }
    } else if (providerConfig.provider_key === "gemini") {
      const geminiBody = {
        contents: [{
          parts: [
            { text: fullPrompt },
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
          temperature: 0.35,
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

      const geminiData = await resp.json() as Record<string, unknown>;
      providerRawResponse = geminiData;
      imageData = extractGeneratedImageData(geminiData);
      if (!imageData) {
        const providerText = extractTextParts(geminiData);
        throw new Error(
          providerText
            ? `Il provider non ha restituito un'immagine renderizzabile: ${providerText.substring(0, 240)}`
            : "Nessuna immagine ricevuta dal provider AI",
        );
      }
    } else {
      throw new Error(
        `Provider '${providerConfig.provider_key}' non supportato. Selezionare OpenAI o Gemini.`,
      );
    }

    if (!imageData) {
      throw new Error("Nessuna immagine ricevuta dal provider AI");
    }

    const uploadPayload = dataUrlToBytes(imageData);
    const resultPath = `${session.company_id}/${session_id}/render_${Date.now()}.${uploadPayload.extension}`;

    const { error: uploadErr } = await supabase.storage
      .from("pavimento-results")
      .upload(resultPath, uploadPayload.bytes, {
        contentType: uploadPayload.mimeType,
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Errore upload risultato: ${uploadErr.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from("pavimento-results")
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
    const costBilled = Number(providerConfig.cost_billed_per_render ?? 0.10);

    await supabase
      .from("render_pavimento_sessions")
      .update({
        status: "completed",
        result_urls: [resultUrl],
        prompt_used: fullPrompt,
        prompt_version: promptVersion,
        prompt_char_count: fullPrompt.length,
        provider_key: providerConfig.provider_key,
        cost_real: costReal,
        cost_billed: costBilled,
        config_snapshot: {
          ...normalizedConfig,
          prompt_validation: validation,
        },
        processing_completed_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    await supabase
      .from("render_provider_config")
      .update({ renders_generated: (providerConfig.renders_generated ?? 0) + 1 })
      .eq("id", providerConfig.id);

    return new Response(
      JSON.stringify({
        success: true,
        session_id,
        result_url: resultUrl,
        provider: providerConfig.provider_key,
        cost_billed: costBilled,
        prompt_version: promptVersion,
        prompt_validation: validation,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-floor-render] error:", msg);

    try {
      const body2 = await req.clone().json().catch(() => ({}));
      const sid = (body2 as { session_id?: string }).session_id;
      if (sid) {
        if (creditDeducted && refundableCompanyId && refundableSessionId) {
          await refundRenderCreditSafe(supabase, {
            companyId: refundableCompanyId,
            sessionId: refundableSessionId,
            userId: user.id,
            reasonMeta: { vertical: "pavimento", edge_fn: "generate-floor-render", error: msg.substring(0, 500) },
            logTag: "generate-floor-render",
          });
        }
        await supabase
          .from("render_pavimento_sessions")
          .update({
            status: "failed",
            error_message: msg.substring(0, 500),
            processing_completed_at: new Date().toISOString(),
          })
          .eq("id", sid);
      }
    } catch { /* best-effort */ }

    return new Response(
      JSON.stringify({ error: "internal_error", message: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
