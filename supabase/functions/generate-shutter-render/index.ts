// generate-shutter-render — Edge Function EiC
// Render Persiane AI — Provider unificato OpenRouter + fallback

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";
import { bytesToBase64 } from "../_shared/base64.ts";
import { captureRealCost } from "../_shared/renderCost.ts";
import { prepareInputImage } from "../_shared/renderImage.ts";
import {
  describeFormatMismatch,
  detectImageDimensions,
  orientationFromDimensions,
} from "../_shared/imageDimensions.ts";
import { editImage } from "../_shared/ai-provider/image.ts";
import { callVisionQa, QA_BLOCCO_RICOMPOSIZIONE } from "../_shared/ai-provider/visionQa.ts";
import { analyzeScene } from "../_shared/ai-provider/sceneAnalysis.ts";
import { buildPersianePrompt } from "../../../shared/render-persiane/persianePromptBuilder.ts";
import { normalizePersianeSceneAnalysis } from "../../../shared/render-persiane/persianeSceneAnalysis.ts";
import type { PersianePhotoMeta } from "../../../shared/render-persiane/types.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

type PersianeSessionRow = {
  id: string;
  company_id: string;
  original_photo_url: string | null;
  config: Record<string, unknown> | null;
  status: string | null;
  result_urls: string[] | null;
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

  const bytes = new Uint8Array(imgBuffer);
  const base64 = bytesToBase64(bytes);
  return { mimeType, base64, bytes };
}

function dataUrlToBytes(
  dataUrl: string,
): { bytes: Uint8Array; mimeType: string; extension: string } {
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

async function runPersianeAnalysis(params: {
  imageUrl: string;
  companyId: string | null;
  sessionId: string | null;
}): Promise<Record<string, unknown>> {
  const { mimeType, base64, bytes } = await downloadImageAsInlineData(
    params.imageUrl,
  );
  const dimensions = detectImageDimensions(bytes);
  const photoMeta: PersianePhotoMeta | null = dimensions
    ? {
      width: dimensions.width,
      height: dimensions.height,
      orientation: orientationFromDimensions(
        dimensions.width,
        dimensions.height,
      ),
    }
    : null;

  const analyzePrompt =
    `You are an expert architectural facade and shutter analyzer.
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

  const analysisResult = await analyzeScene({
    systemPrompt:
      "You are a senior architectural facade and shutter visual analyst. Return only grounded JSON.",
    userPrompt: analyzePrompt,
    imageDataUrl: `data:${mimeType};base64,${base64}`,
    metadata: {
      task_kind: "render_scene_analysis",
      company_id: params.companyId,
      session_id: params.sessionId,
    },
    maxOutputTokens: 1600,
    timeoutMs: 90_000,
  });

  const analysis = normalizePersianeSceneAnalysis(
    analysisResult.parsed,
    photoMeta,
  ) as unknown as Record<string, unknown>;
  return analysis;
}

async function loadSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<PersianeSessionRow | null> {
  const { data, error } = await supabase
    .from("render_persiane_sessions")
    .select("id, company_id, original_photo_url, config, status, result_urls")
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
        return jsonResponse({
          error: "validation_error",
          message: "image_url is required for analyze",
        }, 400);
      }

      let analysisImageUrl = image_url;
      if (session_id) {
        const session = await loadSession(supabase, session_id);
        if (!session) {
          return jsonResponse({
            error: "not_found",
            message: "Sessione non trovata",
          }, 404);
        }
        const allowed = await canAccessCompany(
          supabase,
          user.id,
          session.company_id,
        );
        if (!allowed) {
          return jsonResponse({
            error: "forbidden",
            message: "Accesso negato alla sessione render persiane",
          }, 403);
        }

        if (session.original_photo_url) {
          const prepared = await prepareInputImage({
            supabase,
            bucket: "persiane-originals",
            originalPath: session.original_photo_url,
            hintWidth: target_width,
            hintHeight: target_height,
          });
          analysisImageUrl = prepared.url;
        }
      }

      const analysis = await runPersianeAnalysis({
        imageUrl: analysisImageUrl,
        companyId: session_id
          ? (await loadSession(supabase, session_id))?.company_id ?? null
          : null,
        sessionId: session_id ?? null,
      });
      return jsonResponse({
        success: true,
        analisi_persiane: analysis,
        provider: "openrouter",
      });
    }

    if (!session_id) {
      return jsonResponse({
        error: "validation_error",
        message: "session_id is required",
      }, 400);
    }

    const session = await loadSession(supabase, session_id);
    if (!session) {
      return jsonResponse({
        error: "not_found",
        message: "Sessione non trovata",
      }, 404);
    }
    refundableCompanyId = session.company_id;

    const allowed = await canAccessCompany(
      supabase,
      user.id,
      session.company_id,
    );
    if (!allowed) {
      return jsonResponse({
        error: "forbidden",
        message: "Accesso negato alla sessione render persiane",
      }, 403);
    }

    if (session.status === "processing") {
      return jsonResponse({
        success: true,
        processing: true,
        session_id,
        message: "Render persiane gia in elaborazione",
      }, 202);
    }

    if (
      session.status === "completed" && Array.isArray(session.result_urls) &&
      session.result_urls.length > 0
    ) {
      return jsonResponse({
        success: true,
        result_url: session.result_urls[0],
        result_urls: session.result_urls,
        session_id,
        cached: true,
      });
    }

    const { data: lockRow, error: lockError } = await supabase
      .from("render_persiane_sessions")
      .update({
        status: "processing",
        processing_started_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", session_id)
      .or("status.is.null,status.eq.pending,status.eq.failed")
      .select("id")
      .maybeSingle();

    if (lockError) throw lockError;

    if (!lockRow) {
      return jsonResponse({
        success: true,
        processing: true,
        session_id,
        message: "Render persiane gia preso in carico",
      }, 202);
    }

    const deductResult = await deductRenderCreditSafe(supabase, {
      companyId: session.company_id,
      sessionId: session_id,
      userId: user.id,
      reasonMeta: { vertical: "persiane", edge_fn: "generate-shutter-render" },
      logTag: "generate-shutter-render",
    });

    if (deductResult.status === "insufficient") {
      await supabase
        .from("render_persiane_sessions")
        .update({
          status: "failed",
          error_message: "Crediti render insufficienti",
          processing_completed_at: new Date().toISOString(),
        })
        .eq("id", session_id);
      return jsonResponse({
        error: "insufficient_credits",
        message: "Crediti render insufficienti",
      }, 402);
    }
    creditDeducted = true;

    const originalPath = session.original_photo_url;
    if (!originalPath) {
      throw new Error("Foto originale della sessione mancante");
    }

    const prepared = await prepareInputImage({
      supabase,
      bucket: "persiane-originals",
      originalPath,
      hintWidth: target_width,
      hintHeight: target_height,
    });
    const imageUrl = prepared.url;

    const originalImage = await downloadImageAsInlineData(imageUrl);
    const sourceDimensions =
      prepared.effective_width && prepared.effective_height
        ? { width: prepared.effective_width, height: prepared.effective_height }
        : detectImageDimensions(originalImage.bytes);

    const photoMeta: PersianePhotoMeta | null = sourceDimensions
      ? {
        width: sourceDimensions.width,
        height: sourceDimensions.height,
        orientation: orientationFromDimensions(
          sourceDimensions.width,
          sourceDimensions.height,
        ),
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
        provider_key: "openrouter_image",
        config: promptResult.normalizedConfig,
      })
      .eq("id", session_id);

    const imageBlob = new Blob([
      originalImage.bytes.buffer.slice(
        originalImage.bytes.byteOffset,
        originalImage.bytes.byteOffset + originalImage.bytes.byteLength,
      ) as ArrayBuffer,
    ], { type: originalImage.mimeType || "image/jpeg" });

    // F1-parity (audit 16/07) — 1 tentativo per tier: 75s × 3 retry interni
    // arrivava a ~225s contro il cap 150s. Il fallback è il Tier 2.
    const jobStartMs = Date.now();
    const jobElapsed = () => Date.now() - jobStartMs;
    const generateCandidate = (prompt: string, soloProviderDiretto = false) =>
      editImage({
        prompt,
        sourceImageBlob: imageBlob,
        effectiveWidth: sourceDimensions?.width,
        effectiveHeight: sourceDimensions?.height,
        openaiQuality: "medium",
        timeoutMs: 70_000,
        directProviderOnly: soloProviderDiretto,
        maxRetries: 0,
        metadata: {
          task_kind: "render_image_edit",
          company_id: session.company_id,
          session_id,
        },
      });

    // Il primo tentativo va SOLO sul provider diretto: il secondo tier e'
    // OpenRouter, che ignora la size e restituisce un quadrato, e per riempirlo
    // il modello inventa scena ai lati ridisegnando la facciata intorno alle
    // persiane. Il fallback resta come rete sull'errore.
    let providerResult: Awaited<ReturnType<typeof generateCandidate>>;
    try {
      providerResult = await generateCandidate(combinedPrompt, true);
    } catch (primoErr) {
      console.warn(JSON.stringify({
        lvl: "warn", fn: "generate-shutter-render", session_id,
        msg: "provider_diretto_fallito_si_passa_alla_catena",
        error: String((primoErr as Error)?.message ?? primoErr).substring(0, 200),
        nota: "il formato potrebbe non essere rispettato dal fallback",
      }));
      providerResult = await generateCandidate(combinedPrompt, false);
    }

    // ── QA VISION persiane (audit 16/07) ─────────────────────────────────
    // Difetti tipici: persiane su finestre che non ne avevano (o mancanti
    // su finestre che dovevano averle), numero ante sbagliato, facciata
    // ridipinta quando erano richieste SOLO le persiane, geometria cambiata.
    try {
      const qaPrompt = [
        "You are a LENIENT quality inspector for a window-shutter (persiane) replacement render.",
        "Image 1 = SOURCE photo of the real facade. Image 2 = CANDIDATE render (same facade, ONLY the shutters replaced/recolored per brief).",
        'Answer STRICT JSON only: {"pass": boolean, "issues": [{"category": string, "detail": string}]}.',
        "Fail ONLY on clear, unambiguous violations:",
        "- shutter_count_mismatch: shutters appear on windows that had none in the source, or windows that clearly had shutters now have none (unless removal was the brief).",
        "- invented_openings: windows or doors added, removed or relocated compared to the source.",
        "- non_target_change: the facade wall clearly repainted/replastered even though only the SHUTTERS had to change.",
        "- geometry_change: camera angle, perspective or crop clearly different from the source.",
        ...QA_BLOCCO_RICOMPOSIZIONE,
        "When in doubt, PASS. Shutter color/style CHANGES are expected — only count errors, non-target changes and geometry breaks fail.",
      ].join("\n");

      const sourceDataUrl = `data:${
        originalImage.mimeType || "image/jpeg"
      };base64,${originalImage.base64}`;

      const qaResult = await callVisionQa({
        sourceImageDataUrl: sourceDataUrl,
        candidateImageDataUrl: providerResult.imageDataUrl,
        qaPrompt,
        metadata: {
          task_kind: "render_image_qa",
          company_id: session.company_id,
          session_id,
        },
      });

      const qaIssues = (qaResult.issues ?? []).map((raw) => {
        if (typeof raw === "string") return { category: "unspecified", detail: raw };
        const r = raw as { category?: string; detail?: string };
        return { category: r.category ?? "unspecified", detail: r.detail ?? "" };
      });

      if (qaResult.checked && !qaResult.pass && qaIssues.length > 0 && jobElapsed() < 95_000) {
        console.log(JSON.stringify({
          fn: "generate-shutter-render",
          msg: "qa_failed_retry_corrective",
          session_id,
          issues: qaIssues.map((i) => i.category),
        }));
        const primoTentativo = providerResult;
        // Il retry va anch'esso sul solo provider diretto. Se finisse su OpenRouter
        // tornerebbe un quadrato, e un retry che rompe il formato consegna un render
        // peggiore di quello che stava correggendo — pagandolo. Se il diretto non ce
        // la fa, si tiene il primo tentativo senza spendere altro.
        //
        // Vincolare il provider non basta pero' a garantire il formato: il
        // diretto puo' rispondere senza errore e ignorare comunque la size, e
        // un `catch` non intercetta una risposta riuscita ma quadrata. Si
        // misura quindi il formato delle due immagini e si scarta il retry se
        // rompe un formato che il primo tentativo aveva azzeccato.
        const primoDim = detectImageDimensions(
          dataUrlToBytes(primoTentativo.imageDataUrl).bytes,
        );
        const primoFormatoOk = !describeFormatMismatch(
          sourceDimensions ?? null,
          primoDim,
        );
        try {
          const retryResult = await generateCandidate(`${combinedPrompt}

[QC FAILURE — MANDATORY CORRECTIONS]
The previous attempt failed quality control with these violations:
${qaIssues.map((i) => `- ${i.category}: ${i.detail}`).join("\n")}
Regenerate applying the FULL brief. ABSOLUTE rules: shutters ONLY on the windows that have them per source/brief, same windows and doors in the same positions, facade wall untouched, same camera and crop.`, true);
          const retryDim = detectImageDimensions(
            dataUrlToBytes(retryResult.imageDataUrl).bytes,
          );
          const retryMismatch = describeFormatMismatch(
            sourceDimensions ?? null,
            retryDim,
          );
          if (retryMismatch && primoFormatoOk) {
            console.warn(JSON.stringify({
              lvl: "warn", fn: "generate-shutter-render", session_id,
              msg: "qa_retry_scartato_formato_peggiore",
              motivo: retryMismatch,
              primo: primoDim ? `${primoDim.width}x${primoDim.height}` : null,
              retry: retryDim ? `${retryDim.width}x${retryDim.height}` : null,
            }));
            providerResult = primoTentativo;
          } else {
            providerResult = retryResult;
          }
        } catch (retryErr) {
          console.warn(JSON.stringify({
            lvl: "warn", fn: "generate-shutter-render", session_id,
            msg: "qa_retry_fallito_si_tiene_il_primo",
            error: String((retryErr as Error)?.message ?? retryErr).substring(0, 200),
          }));
          providerResult = primoTentativo;
        }
      } else if (qaResult.checked && !qaResult.pass) {
        console.warn(JSON.stringify({
          fn: "generate-shutter-render",
          msg: "qa_failed_retry_skipped_budget",
          session_id,
          issues: qaIssues.map((i) => i.category),
          elapsed_ms: jobElapsed(),
        }));
      }
    } catch (qaErr) {
      console.warn(
        "[generate-shutter-render] QA vision error (ignored):",
        qaErr instanceof Error ? qaErr.message : String(qaErr),
      );
    }

    const providerKey = providerResult.providerUsed === "openrouter"
      ? "openrouter_image"
      : "openai";
    const modelUsed = providerResult.modelUsed;
    const providerRawResponse = {
      ...providerResult.rawResponse,
      _provider_used: providerResult.providerUsed,
      _model_used: modelUsed,
      _cost_usd: providerResult.costUsd ?? null,
      _cost_is_estimated: providerResult.costIsEstimated,
      _latency_ms: providerResult.latencyMs,
    };

    const uploadPayload = dataUrlToBytes(providerResult.imageDataUrl);
    const resultPath =
      `${session.company_id}/${session_id}/render_persiane_${Date.now()}.${uploadPayload.extension}`;

    const { error: uploadErr } = await supabase.storage
      .from("persiane-results")
      .upload(resultPath, uploadPayload.bytes, {
        contentType: uploadPayload.mimeType,
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Errore upload risultato: ${uploadErr.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from("persiane-results")
      .getPublicUrl(resultPath);

    const resultUrl = publicUrlData.publicUrl;
    const capture = await captureRealCost({
      supabase,
      providerKey,
      model: modelUsed,
      rawResponse: providerRawResponse,
      legacyFallbackEur: Number(providerRawResponse._cost_usd ?? 0) > 0
        ? Number(providerRawResponse._cost_usd) * 0.92
        : 0.039,
    });
    const { data: billingConfig } = await supabase
      .from("render_provider_config")
      .select("id, cost_billed_per_render, renders_generated")
      .eq("provider_key", providerKey)
      .maybeSingle();
    const costBilled = Number(billingConfig?.cost_billed_per_render ?? 0.10);

    await supabase
      .from("render_persiane_sessions")
      .update({
        status: "completed",
        config: promptResult.normalizedConfig,
        result_urls: [resultUrl],
        prompt_used: combinedPrompt.substring(0, 10000),
        prompt_version: promptResult.promptVersion,
        provider_key: providerKey,
        model_used: modelUsed,
        cost_real: capture.cost_eur,
        cost_billed: costBilled,
        processing_completed_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    if (billingConfig?.id) {
      await supabase
        .from("render_provider_config")
        .update({
          renders_generated: Number(billingConfig.renders_generated ?? 0) + 1,
        })
        .eq("id", billingConfig.id);
    }

    return jsonResponse({
      success: true,
      result_url: resultUrl,
      result_urls: [resultUrl],
      session_id,
      provider: providerKey,
      model: modelUsed,
      attempts: providerResult.attempts,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    const message = err instanceof Error
      ? err.message
      : "Errore interno sconosciuto";
    console.error("[generate-shutter-render] error:", message);

    try {
      if (requestSessionId) {
        if (creditDeducted && refundableCompanyId) {
          await supabase.rpc("refund_render_credit_all", {
            _company_id: refundableCompanyId,
            _session_id: requestSessionId,
            _reason_meta: {
              vertical: "persiane",
              edge_fn: "generate-shutter-render",
              error: message.substring(0, 500),
            },
          });
        }
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
