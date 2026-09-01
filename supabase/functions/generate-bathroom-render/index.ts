// generate-bathroom-render — Edge Function EiC
// Render Bagno AI — pipeline unificata via OpenRouter + fallback OpenAI.

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";
import { captureRealCost } from "../_shared/renderCost.ts";
import { prepareInputImage } from "../_shared/renderImage.ts";
import { editImage } from "../_shared/ai-provider/image.ts";
import { callVisionQa } from "../_shared/ai-provider/visionQa.ts";
import { analyzeScene } from "../_shared/ai-provider/sceneAnalysis.ts";
import { buildBathroomPrompt } from "../../../shared/render-bathroom/bathroomPromptBuilder.ts";
import { rewriteDomainPrompt } from "../_shared/ai-provider/domainRewriter.ts";
import { BATHROOM_REWRITER_PROFILE } from "../_shared/ai-provider/bathroomRewriterProfile.ts";
import { normalizeBathroomSceneAnalysis } from "../../../shared/render-bathroom/bathroomSceneAnalysis.ts";
import type { BathroomPhotoMeta } from "../../../shared/render-bathroom/types.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

type BathroomSessionRow = {
  id: string;
  company_id: string;
  stato: string | null;
  foto_originale_path: string | null;
  configurazione: Record<string, unknown> | null;
  analisi_bagno: Record<string, unknown> | null;
  tipo_intervento: string | null;
  render_result_url: string | null;
  provider_key: string | null;
  prompt_version: string | null;
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

declare const EdgeRuntime:
  | { waitUntil?: (promise: Promise<unknown>) => void }
  | undefined;

function acceptedRenderResponse(sessionId: string): Response {
  return jsonResponse({
    success: true,
    accepted: true,
    session_id: sessionId,
    status: "processing",
  }, 202);
}

function runInBackground(promise: Promise<unknown>) {
  if (
    typeof EdgeRuntime !== "undefined" &&
    typeof EdgeRuntime?.waitUntil === "function"
  ) {
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

function orientationFromDimensions(
  width: number,
  height: number,
): "portrait" | "landscape" | "square" {
  if (width === height) return "square";
  return width > height ? "landscape" : "portrait";
}

function describeFormatMismatch(
  expected: { width: number; height: number } | null,
  actual: { width: number; height: number } | null,
): string | null {
  if (!expected || !actual) return null;

  const expectedOrientation = orientationFromDimensions(
    expected.width,
    expected.height,
  );
  const actualOrientation = orientationFromDimensions(
    actual.width,
    actual.height,
  );
  if (
    expectedOrientation !== actualOrientation &&
    expectedOrientation !== "square"
  ) {
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

async function loadBathroomSession(
  supabase: SupabaseClient,
  sessionId: string,
): Promise<BathroomSessionRow | null> {
  const { data: session } = await supabase
    .from("render_bagno_sessions")
    .select(
      "id, company_id, stato, foto_originale_path, configurazione, analisi_bagno, tipo_intervento, render_result_url, provider_key, prompt_version",
    )
    .eq("id", sessionId)
    .maybeSingle();

  return session as BathroomSessionRow | null;
}

async function runBathroomAnalysis(params: {
  supabase: SupabaseClient;
  userId: string;
  imageUrl: string;
  sessionId?: string;
}): Promise<Record<string, unknown>> {
  const { supabase, userId, imageUrl, sessionId } = params;
  let companyId: string | null = null;

  if (sessionId) {
    const session = await loadBathroomSession(supabase, sessionId);
    if (!session) {
      throw new Error("Sessione render bagno non trovata");
    }
    companyId = session.company_id;

    const allowed = await canAccessCompany(
      supabase,
      userId,
      session.company_id,
    );
    if (!allowed) {
      throw new Error("Accesso negato alla sessione render bagno");
    }

    await supabase
      .from("render_bagno_sessions")
      .update({ stato: "analyzing" })
      .eq("id", sessionId);
  }

  const { mimeType, base64, bytes } = await downloadImageAsInlineData(imageUrl);
  const dimensions = detectImageDimensions(bytes);
  const photoMeta: BathroomPhotoMeta | null = dimensions
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
    `Analyze this bathroom photo and return ONLY one raw JSON object.

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

  const analysisResult = await analyzeScene({
    systemPrompt:
      "You are a senior bathroom renovation visual analyst. Return only grounded JSON. Do not invent hidden elements.",
    userPrompt: analyzePrompt,
    imageDataUrl: `data:${mimeType};base64,${base64}`,
    metadata: {
      task_kind: "render_scene_analysis",
      company_id: companyId,
      session_id: sessionId ?? null,
    },
    maxOutputTokens: 1200,
    timeoutMs: 90_000,
  });
  const analysis = normalizeBathroomSceneAnalysis(
    analysisResult.parsed,
    photoMeta,
  ) as unknown as Record<string, unknown>;

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
          {
            error: "validation_error",
            message: "image_url is required for analyze",
          },
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
          provider: "openrouter",
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

    const allowed = await canAccessCompany(
      supabase,
      user.id,
      session.company_id,
    );
    if (!allowed) {
      return jsonResponse(
        {
          error: "forbidden",
          message: "Accesso negato alla sessione render bagno",
        },
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
    // ── F1-parity (audit 16/07) — CLAIM ATOMICO come per gli infissi ──────
    // Il vecchio guard read-then-act ("stato === processing → accepted")
    // lasciava passare due invocation simultanee → doppio deduct + doppio
    // costo provider. Il claim serializza con FOR UPDATE: una sola vince.
    const { data: bagnoClaimRaw, error: bagnoClaimErr } = await supabase.rpc(
      "claim_render_bagno_session",
      { _session_id: session_id, _stale_seconds: 170 },
    );
    if (bagnoClaimErr) {
      throw new Error(`claim_render_bagno_session failed: ${bagnoClaimErr.message}`);
    }
    const bagnoClaim = bagnoClaimRaw as {
      claimed: boolean;
      reason?: string;
      stale_takeover?: boolean;
    };
    if (!bagnoClaim?.claimed) {
      // In-flight legittimo: il client si aggancia alla sessione in corso.
      return acceptedRenderResponse(session_id);
    }
    if (bagnoClaim.stale_takeover) {
      // Tentativo morto (isolate killata): rimborsa il consume orfano PRIMA
      // del nuovo deduct, o l'utente paga 2 crediti per 1 render.
      await supabase.rpc("refund_render_credit_all", {
        _company_id: session.company_id,
        _session_id: session_id,
        _reason_meta: { source: "stale_takeover", edge_fn: "generate-bathroom-render" },
      });
    }

    const deductResult = await deductRenderCreditSafe(supabase, {
      companyId: session.company_id,
      sessionId: session_id,
      userId: user.id,
      reasonMeta: { vertical: "bagno", edge_fn: "generate-bathroom-render" },
      logTag: "generate-bathroom-render",
    });

    if (deductResult.status === "insufficient") {
      // Rilascia il claim: la sessione torna disponibile dopo la ricarica.
      await supabase.rpc("release_render_bagno_session", { _session_id: session_id });
      return jsonResponse(
        {
          error: "insufficient_credits",
          message: "Crediti render insufficienti",
        },
        402,
      );
    }
    creditDeducted = true;

    await supabase
      .from("render_bagno_sessions")
      .update({ provider_key: "openrouter_image" })
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
      const sourceDimensions = Number.isFinite(Number(target_width)) &&
          Number.isFinite(Number(target_height)) &&
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
          orientation: orientationFromDimensions(
            sourceDimensions.width,
            sourceDimensions.height,
          ),
        }
        : null;

      const { systemPrompt, userPrompt, promptVersion, normalizedConfig } =
        buildBathroomPrompt(
          (session.configurazione || {}) as Record<string, unknown>,
          session.analisi_bagno || {},
          photoMetaForPrompt,
        );

      const sourceImageBlob = new Blob([
        originalImage.bytes.buffer.slice(
          originalImage.bytes.byteOffset,
          originalImage.bytes.byteOffset + originalImage.bytes.byteLength,
        ) as ArrayBuffer,
      ], {
        type: originalImage.mimeType || "image/jpeg",
      });
      // F1-parity (audit 16/07) — Budget deadline-aware: il vecchio timeout
      // fisso 180s per tentativo (con 3 retry interni) superava DA SOLO il
      // cap 150s dell'isolate → morte a metà, sessione zombie, credito perso.
      // Ora: 1 tentativo per tier, timeout ricavato dal budget residuo.
      const BAGNO_BUDGET_MS = 140_000;
      const jobStartMs = Date.now();
      const jobElapsed = () => Date.now() - jobStartMs;
      const generateCandidate = (prompt: string) => {
        const remaining = BAGNO_BUDGET_MS - jobElapsed() - 20_000;
        const perAttemptTimeout = Math.max(
          30_000,
          Math.min(75_000, Math.floor(remaining / 2)),
        );
        return editImage({
          prompt,
          sourceImageBlob,
          effectiveWidth: sourceDimensions?.width ?? undefined,
          effectiveHeight: sourceDimensions?.height ?? undefined,
          openaiQuality: "medium",
          timeoutMs: perAttemptTimeout,
          maxRetries: 0,
          metadata: {
            task_kind: "render_image_edit",
            company_id: session.company_id,
            session_id,
          },
        });
      };

      let composedPrompt = `${systemPrompt}\n\n${userPrompt}`;

      // META-PROMPT REWRITER (stesso path di qualita' degli infissi): un LLM
      // testuale riscrive il config in prosa breve, che i modelli immagine
      // rendono meglio dei blocchi di regole. Se fallisce, si resta sul prompt
      // a blocchi qui sopra (fallback silenzioso). Il prompt effettivo viene
      // salvato in render_bagno_sessions.prompt_usato per poter debuggare cosa
      // e' stato davvero mandato al modello.
      try {
        const meta = await rewriteDomainPrompt(
          {
            config: {
              configurazione: session.configurazione ?? {},
              analisi_bagno: session.analisi_bagno ?? {},
            },
            metadata: {
              task_kind: "render_prompt_rewrite",
              company_id: session.company_id,
              session_id,
            },
          },
          BATHROOM_REWRITER_PROFILE,
        );
        if (meta) {
          composedPrompt = [
            "You are an expert photorealistic Italian bathroom-renovation render artist. Edit the source photo as instructed below. Output a clean photograph-quality result.",
            meta.userPrompt,
            "Avoid: cartoon, painterly, fake CGI, AI restyling, warped geometry, swatch rectangles, invented objects, extra or moved sanitary fixtures.",
          ].join("\n\n");
          try {
            await supabase
              .from("render_bagno_sessions")
              .update({ prompt_usato: composedPrompt })
              .eq("id", session_id);
          } catch (_saveErr) { /* non bloccare il render */ }
          console.log(JSON.stringify({
            lvl: "info", fn: "generate-bathroom-render", session_id,
            msg: "meta_prompt_active", rewriter_model: meta.modelUsed,
            rewriter_latency_ms: meta.latencyMs, prose_length: meta.userPrompt.length,
          }));
        } else {
          console.warn(JSON.stringify({
            lvl: "warn", fn: "generate-bathroom-render", session_id,
            msg: "meta_prompt_fallback_to_blocks",
          }));
        }
      } catch (e) {
        console.warn(JSON.stringify({
          lvl: "warn", fn: "generate-bathroom-render", session_id,
          msg: "meta_prompt_rewriter_threw", error: String((e as Error)?.message ?? e),
        }));
      }

      let renderResult = await generateCandidate(composedPrompt);
      let generationAttempts = 1;

      let uploadPayload = dataUrlToBytes(renderResult.imageDataUrl);
      const firstAttemptDimensions = detectImageDimensions(uploadPayload.bytes);
      const firstMismatch = describeFormatMismatch(
        sourceDimensions ?? null,
        firstAttemptDimensions,
      );

      if (firstMismatch) {
        composedPrompt = `${composedPrompt}

[FORMAT CORRECTION]
The previous attempt was not acceptable because of ${firstMismatch}.
Regenerate the image keeping EXACT same orientation, framing, crop, visible room size, and apparent camera distance as the source photo.
The bathroom must occupy the same image area as the source. No zooming out, no zooming in, no padding, no crop change.`;
        renderResult = await generateCandidate(composedPrompt);
        generationAttempts = 2;
        uploadPayload = dataUrlToBytes(renderResult.imageDataUrl);
      }

      // ── QA VISION anti-duplicati (audit 16/07) ─────────────────────────
      // Il difetto n.1 dei render bagno è la violazione dei CONTEGGI: due
      // water, la vasca rimasta dopo la conversione in doccia, un secondo
      // mobile. Il check vision costa ~€0.002 (Claude Haiku) contro €0.05+
      // di un render inutilizzabile consegnato al cliente. 1 retry max,
      // budget-gated. Graceful: se il provider vision fallisce, il render
      // passa comunque (callVisionQa ritorna {checked:false}).
      try {
        const qaSpec = normalizedConfig.technical_specification;
        const qaScene = normalizedConfig.scene_analysis;
        const wallHungSelected = qaSpec.sanitaryWare.replace &&
          String(qaSpec.sanitaryWare.toiletType ?? "").includes("sospeso");
        const tubToShower = qaSpec.shower.replace && !qaSpec.bathtub.replace &&
          qaScene.bathtub.present;
        const showerToTub = qaSpec.bathtub.replace && !qaSpec.shower.replace &&
          qaScene.shower.present;

        const qaPrompt = [
          "You are a LENIENT quality inspector for a bathroom renovation render.",
          "Image 1 = SOURCE photo of the real bathroom. Image 2 = CANDIDATE render.",
          'Answer STRICT JSON only: {"pass": boolean, "issues": [{"category": string, "detail": string}]}.',
          "Fail ONLY on clear, unambiguous violations of these categories:",
          "- duplicated_wc: the candidate shows TWO OR MORE toilets (a real bathroom has exactly one).",
          "- duplicated_fixture: two bathtubs, two showers, or two vanity/basin units.",
          tubToShower
            ? "- leftover_bathtub: the old bathtub is still visible even though it must be REPLACED by the new shower (tub-to-shower conversion)."
            : "",
          showerToTub
            ? "- leftover_shower: the old shower is still visible even though it must be REPLACED by the new bathtub."
            : "",
          wallHungSelected
            ? "- wallhung_violation: the WC has a floor pedestal, monobloc base or exposed external cistern despite the selected WALL-HUNG WC."
            : "",
          "- invented_objects: fixtures, windows or furniture that are in neither the source photo nor the renovation brief.",
          "- geometry_change: camera angle, perspective or crop clearly different from the source.",
          "When in doubt, PASS. Minor styling differences are fine.",
        ].filter(Boolean).join("\n");

        const sourceBuf = originalImage.bytes.buffer.slice(
          originalImage.bytes.byteOffset,
          originalImage.bytes.byteOffset + originalImage.bytes.byteLength,
        ) as ArrayBuffer;
        const sourceDataUrl = `data:${
          originalImage.mimeType || "image/jpeg"
        };base64,${arrayBufferToBase64(sourceBuf)}`;

        const qaResult = await callVisionQa({
          sourceImageDataUrl: sourceDataUrl,
          candidateImageDataUrl: renderResult.imageDataUrl,
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
            fn: "generate-bathroom-render",
            msg: "qa_failed_retry_corrective",
            session_id,
            qa_model: qaResult.modelUsed,
            issues: qaIssues.map((i) => i.category),
          }));
          composedPrompt = `${composedPrompt}

[QC FAILURE — MANDATORY CORRECTIONS]
The previous attempt failed quality control with these violations:
${qaIssues.map((i) => `- ${i.category}: ${i.detail}`).join("\n")}
Regenerate applying the FULL brief. The FIXTURE COUNT CONTRACT is ABSOLUTE: exactly ONE toilet, no duplicated fixtures, no leftover bathtub or shower after a conversion, no invented objects. Fix every violation listed above.`;
          // Il retry puo' PEGGIORARE: se il modello diretto va in timeout, la
          // catena ripiega su OpenRouter che non rispetta il formato e
          // restituisce un quadrato. Visto in prod: prima immagine 1536x1024
          // corretta, retry correttivo -> 1024x1024, e il quadrato sostituiva
          // quella buona. Si tiene il ritentativo solo se non rompe il formato.
          const primoTentativo = renderResult;
          const primoPayload = uploadPayload;
          const primoDim = detectImageDimensions(primoPayload.bytes);
          const primoOk = !describeFormatMismatch(sourceDimensions ?? null, primoDim);

          const retryResult = await generateCandidate(composedPrompt);
          generationAttempts += 1;
          const retryPayload = dataUrlToBytes(retryResult.imageDataUrl);
          const retryDim = detectImageDimensions(retryPayload.bytes);
          const retryMismatch = describeFormatMismatch(sourceDimensions ?? null, retryDim);

          if (retryMismatch && primoOk) {
            console.warn(JSON.stringify({
              fn: "generate-bathroom-render",
              msg: "qa_retry_scartato_formato_peggiore",
              session_id,
              motivo: retryMismatch,
              primo: primoDim ? `${primoDim.width}x${primoDim.height}` : null,
              retry: retryDim ? `${retryDim.width}x${retryDim.height}` : null,
            }));
            renderResult = primoTentativo;
            uploadPayload = primoPayload;
          } else {
            renderResult = retryResult;
            uploadPayload = retryPayload;
          }
        } else if (qaResult.checked && !qaResult.pass) {
          console.warn(JSON.stringify({
            fn: "generate-bathroom-render",
            msg: "qa_failed_retry_skipped_budget",
            session_id,
            issues: qaIssues.map((i) => i.category),
            elapsed_ms: jobElapsed(),
          }));
        }
      } catch (qaErr) {
        // La QA non deve MAI far fallire un render riuscito.
        console.warn(
          "[generate-bathroom-render] QA vision error (ignored):",
          qaErr instanceof Error ? qaErr.message : String(qaErr),
        );
      }

      const resultPath =
        `${session.company_id}/${session_id}/render_bagno_${Date.now()}.${uploadPayload.extension}`;

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
      const providerKey = renderResult.providerUsed === "openrouter"
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
      const costReal = capture.cost_eur * generationAttempts;
      const { data: providerConfig } = await supabase
        .from("render_provider_config")
        .select("id, cost_billed_per_render, renders_generated")
        .eq("provider_key", providerKey)
        .maybeSingle();
      const costBilled = Number(providerConfig?.cost_billed_per_render ?? 0.10);

      await supabase
        .from("render_bagno_sessions")
        .update({
          stato: "completato",
          render_result_path: resultPath,
          render_result_url: resultUrl,
          prompt_usato: composedPrompt,
          prompt_version: promptVersion,
          provider_key: providerKey,
          model_used: modelUsed,
          cost_real: costReal,
          cost_billed: costBilled,
          processing_completed_at: new Date().toISOString(),
        })
        .eq("id", session_id);

      if (providerConfig?.id) {
        await supabase
          .from("render_provider_config")
          .update({
            renders_generated: Number(providerConfig.renders_generated ?? 0) +
              1,
          })
          .eq("id", providerConfig.id);
      }

      return jsonResponse({
        success: true,
        session_id,
        result_url: resultUrl,
        provider: providerKey,
        model: modelUsed,
        attempts: generationAttempts,
        prompt_version: promptVersion,
      });
    })().catch(async (jobErr: unknown) => {
      const message = jobErr instanceof Error ? jobErr.message : String(jobErr);
      console.error("[generate-bathroom-render] background error:", message);
      // F1-parity — refund_all: rimborsa TUTTI i consume scoperti della
      // sessione (v1 si bloccava se esisteva già un refund di un ciclo prima).
      await supabase.rpc("refund_render_credit_all", {
        _company_id: session.company_id,
        _session_id: session_id,
        _reason_meta: {
          vertical: "bagno",
          edge_fn: "generate-bathroom-render",
          error: message.substring(0, 500),
          background_failure: true,
        },
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
          await supabase.rpc("refund_render_credit_all", {
            _company_id: refundableCompanyId,
            _session_id: refundableSessionId,
            _reason_meta: {
              vertical: "bagno",
              edge_fn: "generate-bathroom-render",
              error: message.substring(0, 500),
            },
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
