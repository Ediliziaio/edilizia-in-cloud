// generate-floor-render — Edge Function EiC
// Render Pavimento AI — pipeline unificata via OpenRouter + fallback OpenAI.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import {
  deductRenderCreditSafe,
  refundRenderCreditSafe,
} from "../_shared/renderCreditDeduct.ts";
import { captureRealCost } from "../_shared/renderCost.ts";
import { prepareInputImage } from "../_shared/renderImage.ts";
import { editImage } from "../_shared/ai-provider/image.ts";
import { analyzeScene } from "../_shared/ai-provider/sceneAnalysis.ts";
import { buildFloorPrompt } from "../../../shared/render-floor/floorPromptBuilder.ts";
import type { FloorPhotoMeta } from "../../../shared/render-floor/types.ts";

// ── CORS ──────────────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
  const mimeType =
    (imgResp.headers.get("content-type") || "image/jpeg").split(";")[0] ||
    "image/jpeg";
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

function dataUrlToBytes(dataUrl: string): {
  bytes: Uint8Array;
  mimeType: string;
  extension: string;
} {
  const match = dataUrl.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/,
  );
  if (!match) {
    throw new Error("Formato immagine provider non valido");
  }

  const mimeType = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const extension = mimeType.includes("png")
    ? "png"
    : mimeType.includes("webp")
    ? "webp"
    : mimeType.includes("jpeg") || mimeType.includes("jpg")
    ? "jpg"
    : "png";

  return { bytes, mimeType, extension };
}

// ── fetchWithTimeout ──────────────────────────────────────────────────────────
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs = 120_000,
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

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

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

    // ── Parse request ───────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const {
      action,
      session_id,
      config,
      image_url,
      target_width,
      target_height,
      analysis,
      photo_meta,
    } = body as {
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
          JSON.stringify({
            error: "validation_error",
            message: "image_url is required for analyze",
          }),
          {
            status: 400,
            headers: { ...CORS, "Content-Type": "application/json" },
          },
        );
      }
      let analysisCompanyId: string | null = null;
      if (session_id) {
        const { data: sessionForAnalysis, error: sessionForAnalysisErr } =
          await supabase
            .from("render_pavimento_sessions")
            .select("id, company_id")
            .eq("id", session_id)
            .maybeSingle();
        if (sessionForAnalysisErr || !sessionForAnalysis) {
          return new Response(
            JSON.stringify({
              error: "not_found",
              message: "Sessione non trovata",
            }),
            {
              status: 404,
              headers: { ...CORS, "Content-Type": "application/json" },
            },
          );
        }
        analysisCompanyId = sessionForAnalysis.company_id as string;
        const allowed = await canAccessCompany(
          supabase,
          user.id,
          analysisCompanyId,
        );
        if (!allowed) {
          return new Response(
            JSON.stringify({
              error: "forbidden",
              message: "Accesso negato alla sessione render pavimento",
            }),
            {
              status: 403,
              headers: { ...CORS, "Content-Type": "application/json" },
            },
          );
        }
      }

      // Download image
      const imgResp = await fetchWithTimeout(image_url, {}, 30_000);
      const mimeType =
        (imgResp.headers.get("content-type") || "image/jpeg").split(";")[0] ||
        "image/jpeg";
      const imgBuffer = await imgResp.arrayBuffer();
      const imgB64 = arrayBufferToBase64(imgBuffer);

      const analyzePrompt =
        `Analyze this interior photograph for a surgical floor replacement workflow. Return ONLY compact JSON with these fields:
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

      const analysisResult = await analyzeScene({
        systemPrompt:
          "You are a senior flooring visual analyst. Return only compact grounded JSON. Do not invent hidden materials.",
        userPrompt: analyzePrompt,
        imageDataUrl: `data:${mimeType};base64,${imgB64}`,
        metadata: {
          task_kind: "render_scene_analysis",
          company_id: analysisCompanyId,
          session_id: session_id ?? null,
        },
        maxOutputTokens: 700,
        timeoutMs: 90_000,
      });
      const analisi = analysisResult.parsed;

      // Save analysis to session
      if (session_id && analisi) {
        await supabase
          .from("render_pavimento_sessions")
          .update({ analisi_pavimento: analisi })
          .eq("id", session_id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          analisi,
          provider: "openrouter",
          model: analysisResult.modelUsed,
        }),
        {
          status: 200,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
    }

    // ══════════════════════════════════════════════════════════════════════
    // ACTION: render — Generate floor render
    // ══════════════════════════════════════════════════════════════════════
    if (!session_id) {
      return new Response(
        JSON.stringify({
          error: "validation_error",
          message: "session_id is required",
        }),
        {
          status: 400,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
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
        {
          status: 404,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
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
        JSON.stringify({
          error: "forbidden",
          message: "Accesso negato alla sessione render pavimento",
        }),
        {
          status: 403,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
    }

    // ── Deduct credits (v3 → v2 → v1 fallback + audit ledger) ────────────
    const deductResult = await deductRenderCreditSafe(supabase, {
      companyId: session.company_id as string,
      sessionId: session_id,
      userId: user.id,
      reasonMeta: { vertical: "pavimento", edge_fn: "generate-floor-render" },
      logTag: "generate-floor-render",
    });

    if (deductResult.status === "insufficient") {
      return new Response(
        JSON.stringify({
          error: "insufficient_credits",
          message: "Crediti render insufficienti",
        }),
        {
          status: 402,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
    }
    creditDeducted = true;

    // ── Update session: processing ──────────────────────────────────────
    await supabase
      .from("render_pavimento_sessions")
      .update({
        status: "processing",
        processing_started_at: new Date().toISOString(),
      })
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
    const activeAnalysis = analysis ||
      (session.analisi_pavimento as Record<string, unknown> | null) || null;
    const effectiveWidth = prepared.effective_width ?? undefined;
    const effectiveHeight = prepared.effective_height ?? undefined;
    const activePhotoMeta: FloorPhotoMeta = photo_meta ?? {
      width: effectiveWidth,
      height: effectiveHeight,
      orientation: (effectiveWidth ?? 0) > (effectiveHeight ?? 0)
        ? "landscape"
        : (effectiveWidth ?? 0) < (effectiveHeight ?? 0)
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
    const imageBlob = new Blob([
      originalImage.bytes.buffer.slice(
        originalImage.bytes.byteOffset,
        originalImage.bytes.byteOffset + originalImage.bytes.byteLength,
      ) as ArrayBuffer,
    ], {
      type: originalImage.mimeType || "image/jpeg",
    });
    const renderResult = await editImage({
      prompt: fullPrompt,
      sourceImageBlob: imageBlob,
      effectiveWidth: prepared.effective_width ?? undefined,
      effectiveHeight: prepared.effective_height ?? undefined,
      openaiQuality: "medium",
      // v8.5 — Per-provider timeout 180s → 75s. Allineato a generate-render
      // v8.4.3: con 180s un singolo provider lento esauriva il budget 150s
      // dell'edge function. Con 75s, fallback rapido al provider successivo.
      timeoutMs: 75_000,
      metadata: {
        task_kind: "render_image_edit",
        company_id: session.company_id as string,
        session_id,
      },
    });
    const uploadPayload = dataUrlToBytes(renderResult.imageDataUrl);
    const resultPath =
      `${session.company_id}/${session_id}/render_${Date.now()}.${uploadPayload.extension}`;

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
    const providerKey = renderResult.providerUsed === "gemini_direct"
      ? "gemini"
      : renderResult.providerUsed === "openrouter"
      ? "openrouter_image"
      : "openai";
    const modelUsed = renderResult.modelUsed;
    const providerRawResponse = {
      ...renderResult.rawResponse,
      _provider_used: renderResult.providerUsed,
      _model_used: renderResult.modelUsed,
      _cost_usd: renderResult.costUsd ?? null,
      _cost_is_estimated: renderResult.costIsEstimated,
      _latency_ms: renderResult.latencyMs,
    };
    const capture = await captureRealCost({
      supabase,
      providerKey,
      model: modelUsed,
      rawResponse: providerRawResponse,
      legacyFallbackEur: renderResult.costUsd
        ? renderResult.costUsd * 0.92
        : 0.039,
    });
    const costReal = capture.cost_eur;
    const { data: providerConfig } = await supabase
      .from("render_provider_config")
      .select("id, cost_billed_per_render, renders_generated")
      .eq("provider_key", providerKey)
      .maybeSingle();
    const costBilled = Number(providerConfig?.cost_billed_per_render ?? 0.10);

    await supabase
      .from("render_pavimento_sessions")
      .update({
        status: "completed",
        result_urls: [resultUrl],
        prompt_used: fullPrompt,
        prompt_version: promptVersion,
        prompt_char_count: fullPrompt.length,
        provider_key: providerKey,
        cost_real: costReal,
        cost_billed: costBilled,
        config_snapshot: {
          ...normalizedConfig,
          prompt_validation: validation,
        },
        processing_completed_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    if (providerConfig?.id) {
      await supabase
        .from("render_provider_config")
        .update({
          renders_generated: Number(providerConfig.renders_generated ?? 0) + 1,
        })
        .eq("id", providerConfig.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        session_id,
        result_url: resultUrl,
        provider: providerKey,
        model: modelUsed,
        attempts: renderResult.attempts,
        cost_billed: costBilled,
        prompt_version: promptVersion,
        prompt_validation: validation,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
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
            reasonMeta: {
              vertical: "pavimento",
              edge_fn: "generate-floor-render",
              error: msg.substring(0, 500),
            },
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
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
