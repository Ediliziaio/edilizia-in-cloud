import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";
import { captureRealCost } from "../_shared/renderCost.ts";
import { prepareInputImage } from "../_shared/renderImage.ts";
import { editImage } from "../_shared/ai-provider/image.ts";
import { callVisionQa } from "../_shared/ai-provider/visionQa.ts";
import { analyzeScene } from "../_shared/ai-provider/sceneAnalysis.ts";
import { buildFacciataPrompt } from "../../../shared/render-facciata/facciataPromptBuilder.ts";
import { ensureFacciataRenderConfig } from "../../../shared/render-facciata/facciataRenderConfig.ts";

import { normalizeFacciataSceneAnalysis } from "../../../shared/render-facciata/facciataSceneAnalysis.ts";
import type { FacciataPhotoMeta } from "../../../shared/render-facciata/types.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

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
    throw new Error(
      `Impossibile scaricare l'immagine (${imageResponse.status})`,
    );
  }
  const mimeType =
    (imageResponse.headers.get("content-type") || "image/jpeg").split(";")[0] ||
    "image/jpeg";
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

function detectImageDimensions(
  bytes: Uint8Array,
): { width: number; height: number } | null {
  if (bytes.length < 16) return null;

  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
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

      const isSofMarker = (marker >= 0xc0 && marker <= 0xc3) ||
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

function orientationFromDimensions(
  width: number,
  height: number,
): FacciataPhotoMeta["orientation"] {
  if (width === height) return "square";
  return width > height ? "landscape" : "portrait";
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

async function runFacadeAnalysis(params: {
  imageUrl: string;
  companyId: string | null;
  sessionId: string | null;
}): Promise<Record<string, unknown>> {
  const { mimeType, base64, bytes } = await downloadImageAsInlineData(
    params.imageUrl,
  );
  const dimensions = detectImageDimensions(bytes);
  const photoMeta: FacciataPhotoMeta | null = dimensions
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
    `You are an expert architectural facade renovation analyzer.
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

  const analysisResult = await analyzeScene({
    systemPrompt:
      "You are a senior exterior facade renovation visual analyst. Return only grounded JSON.",
    userPrompt: analyzePrompt,
    imageDataUrl: `data:${mimeType};base64,${base64}`,
    metadata: {
      task_kind: "render_scene_analysis",
      company_id: params.companyId,
      session_id: params.sessionId,
    },
    maxOutputTokens: 1400,
    timeoutMs: 90_000,
  });

  return normalizeFacciataSceneAnalysis(
    analysisResult.parsed,
    photoMeta,
  ) as unknown as Record<string, unknown>;
}

async function renderWithProvider(params: {
  prompt: string;
  preparedUrl: string;
  width?: number;
  height?: number;
  companyId: string;
  sessionId: string;
  timeoutMs?: number;
  /** Vieta il fallback su OpenRouter, che ignora la size e restituisce un
   *  quadrato: su una facciata il quadrato costringe il modello a ricomporre
   *  l'edificio, e cambiano piani, finestre e prospettiva. */
  directProviderOnly?: boolean;
}): Promise<
  {
    imageData: string;
    providerRawResponse: Record<string, unknown>;
    modelUsed: string;
    providerKey: string;
    attempts: number;
    sourceDataUrl: string;
  }
> {
  const originalImage = await downloadImageAsInlineData(params.preparedUrl);
  const imageBlob = new Blob([
    originalImage.bytes.buffer.slice(
      originalImage.bytes.byteOffset,
      originalImage.bytes.byteOffset + originalImage.bytes.byteLength,
    ) as ArrayBuffer,
  ], { type: originalImage.mimeType || "image/jpeg" });
  const result = await editImage({
    prompt: params.prompt,
    sourceImageBlob: imageBlob,
    effectiveWidth: params.width,
    effectiveHeight: params.height,
    openaiQuality: "medium",
    // F1-parity (audit 16/07) — timeout deadline-aware dal chiamante,
    // 1 tentativo per tier (il fallback è il Tier 2, non il retry).
    timeoutMs: params.timeoutMs ?? 75_000,
    directProviderOnly: params.directProviderOnly ?? false,
    maxRetries: 0,
    metadata: {
      task_kind: "render_image_edit",
      company_id: params.companyId,
      session_id: params.sessionId,
    },
  });
  const providerKey = result.providerUsed === "openrouter"
    ? "openrouter_image"
    : "openai";
  return {
    imageData: result.imageDataUrl,
    providerRawResponse: {
      ...result.rawResponse,
      _provider_used: result.providerUsed,
      _model_used: result.modelUsed,
      _cost_usd: result.costUsd ?? null,
      _cost_is_estimated: result.costIsEstimated,
      _latency_ms: result.latencyMs,
    },
    modelUsed: result.modelUsed,
    providerKey,
    attempts: result.attempts,
    sourceDataUrl: `data:${
      originalImage.mimeType || "image/jpeg"
    };base64,${originalImage.base64}`,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  let supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  let requestSessionId: string | null = null;
  let refundableCompanyId: string | null = null;
  let requestUserId: string | null = null;
  let creditDeducted = false;

  try {
    const auth = await requireAuth(req, CORS);
    supabase = auth.supabaseAdmin;
    const userId = auth.userId;
    requestUserId = userId;

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
      return jsonResponse({
        error: "validation_error",
        message: "session_id is required",
      }, 400);
    }

    const { data: session, error: sessionErr } = await supabase
      .from("render_facciata_sessions")
      .select("*")
      .eq("id", requestSessionId)
      .single();

    if (sessionErr || !session) {
      return jsonResponse({
        error: "not_found",
        message: "Sessione non trovata",
      }, 404);
    }

    const typedSession = session as
      & FacciataSessionRow
      & Record<string, unknown>;
    refundableCompanyId = typedSession.company_id;

    const allowed = await canAccessCompany(
      supabase,
      userId,
      typedSession.company_id,
    );
    if (!allowed) {
      return jsonResponse({
        error: "forbidden",
        message: "Accesso negato alla sessione render facciata",
      }, 403);
    }

    if (action === "analyze") {
      const signedUrl = typeof image_url === "string" && image_url
        ? image_url
        : await (async () => {
          if (!typedSession.original_photo_url) {
            throw new Error("Foto originale della sessione mancante");
          }
          const { data, error } = await supabase.storage
            .from("facciata-originals")
            .createSignedUrl(typedSession.original_photo_url, 600);
          if (error || !data?.signedUrl) {
            throw new Error(
              "Impossibile creare signed URL per la foto originale",
            );
          }
          return data.signedUrl;
        })();

      const analisi = await runFacadeAnalysis({
        imageUrl: signedUrl,
        companyId: typedSession.company_id,
        sessionId: requestSessionId,
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

    // ── F1-parity (audit 16/07) — CLAIM ATOMICO prima del deduct ─────────
    const { data: claimRaw, error: claimErr } = await supabase.rpc(
      "claim_render_vertical_session",
      {
        _table: "render_facciata_sessions",
        _session_id: requestSessionId,
        _stale_seconds: 170,
      },
    );
    if (claimErr) {
      throw new Error(`claim_render_vertical_session failed: ${claimErr.message}`);
    }
    const claim = claimRaw as {
      claimed: boolean;
      reason?: string;
      stale_takeover?: boolean;
    };
    if (!claim?.claimed) {
      return jsonResponse({
        error: "already_in_flight",
        message: "Render già in corso per questa sessione.",
        session_id: requestSessionId,
        status: "processing",
      }, 409);
    }
    if (claim.stale_takeover) {
      await supabase.rpc("refund_render_credit_all", {
        _company_id: typedSession.company_id,
        _session_id: requestSessionId,
        _reason_meta: { source: "stale_takeover", edge_fn: "generate-facade-render" },
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
      await supabase.rpc("release_render_vertical_session", {
        _table: "render_facciata_sessions",
        _session_id: requestSessionId,
      });
      return jsonResponse({
        error: "insufficient_credits",
        message: "Crediti render insufficienti",
      }, 402);
    }
    creditDeducted = true;

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

    // Le dimensioni della foto servono a due cose: scegliere il formato del
    // render e comporre `photoMeta`, che finisce nel prompt. Quando il client
    // non le manda e prepareInputImage non le ricava restavano entrambe nulle:
    // il selettore ripiegava sul quadrato 1024x1024 e su una facciata il
    // quadrato costringe il modello a ricomporre l'edificio — cambiano piani,
    // aperture e prospettiva.
    // Misurato sulla sessione 8d6dc18f: sorgente 800x600 (1.333), render
    // 1024x1024. Qui si leggono dai primi byte del file, come gia' fatto negli
    // altri verticali. Il ramo dell'analisi lo faceva gia'; quello del render no.
    let dimensions = target_width && target_height
      ? { width: target_width, height: target_height }
      : prepared.effective_width && prepared.effective_height
      ? { width: prepared.effective_width, height: prepared.effective_height }
      : null;
    if (!dimensions) {
      try {
        const testa = await fetch(prepared.url, {
          headers: { Range: "bytes=0-65535" },
        });
        if (testa.ok) {
          const rilevate = detectImageDimensions(
            new Uint8Array(await testa.arrayBuffer()),
          );
          if (rilevate) {
            dimensions = rilevate;
            console.log(JSON.stringify({
              lvl: "info",
              fn: "generate-facade-render",
              session_id: requestSessionId,
              msg: "source_dimensions_detected_from_bytes",
              width: rilevate.width,
              height: rilevate.height,
            }));
          }
        }
      } catch (_e) { /* formato non riconosciuto: si prosegue col default */ }
    }

    const photoMeta: FacciataPhotoMeta | null = dimensions
      ? {
        width: dimensions.width,
        height: dimensions.height,
        orientation: orientationFromDimensions(
          dimensions.width,
          dimensions.height,
        ),
      }
      : null;

    // `buildFacciataRenderConfig` legge SOLO la forma legacy della
    // configurazione (`intonaco.attivo`, `rivestimento.attivo`, ...). Ma il
    // primo render riscrive la configurazione della sessione nella forma v2,
    // dove quei campi stanno sotto `legacy_config` e i corrispondenti
    // top-level sono null. Rigenerare la stessa sessione — o rifinirla —
    // significava quindi rileggere una config v2 col lettore vecchio:
    // "Cannot read properties of undefined (reading 'attivo')", render fallito.
    // Verificato sulla sessione 4b506c6f. `ensureFacciataRenderConfig` accetta
    // entrambe le forme e va usata proprio in questo punto.
    const normalizedConfig = ensureFacciataRenderConfig(
      (config ?? typedSession.config ?? {}) as Record<string, unknown>,
      config?.scene_analysis ?? typedSession.foto_analisi ?? null,
      photoMeta,
    );

    const { systemPrompt, userPrompt, promptVersion, blocks } =
      buildFacciataPrompt(
        normalizedConfig as unknown as Record<string, unknown>,
      );

    const prompt = `${systemPrompt}\n\n${userPrompt}`;
    // Il primo tentativo va SOLO sul provider diretto, l'unico che riceve la
    // size come parametro vero. Il fallback resta come rete sull'errore: su una
    // facciata un quadrato non e' un dettaglio estetico, costringe il modello a
    // ricomporre l'edificio e a cambiare piani, aperture e prospettiva.
    // `requestSessionId` e' un `let` allargato a `string | null`: dentro una
    // closure TypeScript non puo' piu' fidarsi del controllo di non-nullita'
    // fatto sopra. Si fissa qui, dove il controllo e' ancora valido.
    const idSessione = requestSessionId;
    const primoTentativo = async () => {
      try {
        return await renderWithProvider({
          prompt,
          preparedUrl: prepared.url,
          width: dimensions?.width ?? undefined,
          height: dimensions?.height ?? undefined,
          companyId: typedSession.company_id,
          sessionId: idSessione,
          timeoutMs: 70_000,
          directProviderOnly: true,
        });
      } catch (primoErr) {
        console.warn(JSON.stringify({
          lvl: "warn",
          fn: "generate-facade-render",
          session_id: idSessione,
          msg: "provider_diretto_fallito_si_passa_alla_catena",
          error: String((primoErr as Error)?.message ?? primoErr).substring(0, 200),
          nota: "il formato potrebbe non essere rispettato dal fallback",
        }));
        return await renderWithProvider({
          prompt,
          preparedUrl: prepared.url,
          width: dimensions?.width ?? undefined,
          height: dimensions?.height ?? undefined,
          companyId: typedSession.company_id,
          sessionId: idSessione,
          timeoutMs: 70_000,
        });
      }
    };
    const { imageData, providerRawResponse, modelUsed, providerKey, attempts, sourceDataUrl } =
      await primoTentativo();

    // ── QA VISION facciata (audit 16/07) ─────────────────────────────────
    // Difetti tipici: PIANI aggiunti/tolti all'edificio, finestre/balconi
    // inventati o spostati, geometria/prospettiva cambiata. 1 retry budget.
    let finalImageData = imageData;
    let generationAttempts = 1;
    const facadeJobStartMs = Date.now();
    try {
      const qaPrompt = [
        "You are a LENIENT quality inspector for a building facade renovation render.",
        "Image 1 = SOURCE photo of the real building. Image 2 = CANDIDATE render (same building, new finishes per brief).",
        'Answer STRICT JSON only: {"pass": boolean, "issues": [{"category": string, "detail": string}]}.',
        "Fail ONLY on clear, unambiguous violations:",
        "- wrong_floor_count: the candidate building has MORE or FEWER storeys than the source.",
        "- invented_openings: windows, doors or balconies added, removed or relocated compared to the source facade.",
        "- geometry_change: camera angle, perspective, crop or building footprint clearly different from the source.",
        "- invented_objects: structures (canopies, extensions, vehicles, people) in neither the source nor the brief.",
        "When in doubt, PASS. Color/material/finish CHANGES are expected — only structural violations fail.",
      ].join("\n");

      const qaResult = await callVisionQa({
        sourceImageDataUrl: sourceDataUrl,
        candidateImageDataUrl: imageData,
        qaPrompt,
        metadata: {
          task_kind: "render_image_qa",
          company_id: typedSession.company_id,
          session_id: requestSessionId,
        },
      });

      const qaIssues = (qaResult.issues ?? []).map((raw) => {
        if (typeof raw === "string") return { category: "unspecified", detail: raw };
        const r = raw as { category?: string; detail?: string };
        return { category: r.category ?? "unspecified", detail: r.detail ?? "" };
      });

      if (
        qaResult.checked && !qaResult.pass && qaIssues.length > 0 &&
        Date.now() - facadeJobStartMs < 60_000
      ) {
        console.log(JSON.stringify({
          fn: "generate-facade-render",
          msg: "qa_failed_retry_corrective",
          session_id: requestSessionId,
          issues: qaIssues.map((i) => i.category),
        }));
        const retry = await renderWithProvider({
          prompt: `${prompt}

[QC FAILURE — MANDATORY CORRECTIONS]
The previous attempt failed quality control with these violations:
${qaIssues.map((i) => `- ${i.category}: ${i.detail}`).join("\n")}
Regenerate applying the FULL brief. ABSOLUTE rules: same number of storeys as the source, same windows/doors/balconies in the same positions, same camera and crop. Only the finishes/colors specified in the brief change.`,
          preparedUrl: prepared.url,
          width: dimensions?.width ?? undefined,
          height: dimensions?.height ?? undefined,
          companyId: typedSession.company_id,
          sessionId: requestSessionId,
          timeoutMs: 60_000,
          directProviderOnly: true,
        });
        finalImageData = retry.imageData;
        generationAttempts += 1;
      } else if (qaResult.checked && !qaResult.pass) {
        console.warn(JSON.stringify({
          fn: "generate-facade-render",
          msg: "qa_failed_retry_skipped_budget",
          session_id: requestSessionId,
          issues: qaIssues.map((i) => i.category),
        }));
      }
    } catch (qaErr) {
      console.warn(
        "[generate-facade-render] QA vision error (ignored):",
        qaErr instanceof Error ? qaErr.message : String(qaErr),
      );
    }

    const uploadPayload = dataUrlToBytes(finalImageData);
    const resultPath =
      `${typedSession.company_id}/${requestSessionId}/render_${Date.now()}.${uploadPayload.extension}`;

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

    const capture = await captureRealCost({
      supabase,
      providerKey,
      model: modelUsed,
      rawResponse: providerRawResponse,
      legacyFallbackEur: Number(providerRawResponse._cost_usd ?? 0) > 0
        ? Number(providerRawResponse._cost_usd) * 0.92
        : 0.039,
    });
    const costReal = capture.cost_eur;
    const { data: providerConfig } = await supabase
      .from("render_provider_config")
      .select("id, cost_billed_per_render, renders_generated")
      .eq("provider_key", providerKey)
      .maybeSingle();
    const costBilled = Number(providerConfig?.cost_billed_per_render ?? 0.1);

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
        provider_key: providerKey,
        cost_real: costReal,
        cost_billed: costBilled,
        config_snapshot: normalizedConfig,
        processing_completed_at: new Date().toISOString(),
      })
      .eq("id", requestSessionId);

    if (providerConfig?.id) {
      await supabase
        .from("render_provider_config")
        .update({
          renders_generated: Number(providerConfig.renders_generated ?? 0) + 1,
        })
        .eq("id", providerConfig.id);
    }

    return jsonResponse({
      success: true,
      session_id: requestSessionId,
      result_url: resultUrl,
      result_urls: [resultUrl],
      provider: providerKey,
      model: modelUsed,
      attempts,
      prompt_version: promptVersion,
    });
  } catch (error: unknown) {
    if (error instanceof Response) return error;
    const message = error instanceof Error ? error.message : String(error);
    console.error("[generate-facade-render] error:", message);

    if (requestSessionId) {
      try {
        if (creditDeducted && refundableCompanyId) {
          // F1-parity — refund_all: rimborsa TUTTI i consume scoperti.
          await supabase.rpc("refund_render_credit_all", {
            _company_id: refundableCompanyId,
            _session_id: requestSessionId,
            _reason_meta: {
              vertical: "facciata",
              edge_fn: "generate-facade-render",
              error: message.substring(0, 500),
            },
          });
        }
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
