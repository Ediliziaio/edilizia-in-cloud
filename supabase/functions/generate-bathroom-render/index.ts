// generate-bathroom-render — Edge Function EiC
// Render Bagno AI — pipeline unificata via OpenRouter + fallback OpenAI.

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import {
  describeFormatMismatch,
  detectImageDimensions,
  expectedOutputSize,
  orientationFromDimensions,
} from "../_shared/imageDimensions.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";
import { captureRealCost } from "../_shared/renderCost.ts";
import { prepareInputImage } from "../_shared/renderImage.ts";
import { editImage } from "../_shared/ai-provider/image.ts";
import { callVisionQa, QA_BLOCCO_RICOMPOSIZIONE, QA_BLOCCO_RICOMPOSIZIONE_RESTYLING } from "../_shared/ai-provider/visionQa.ts";
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
    // 1200 token non bastavano: lo schema v2 dell'analisi bagno chiede decine di
    // campi (wallTiles, floor, shower, vanity, sanitaryWare, lighting,
    // preserveRigidly, demolitionSensitiveAreas...) e la risposta veniva
    // TRONCATA a meta' — JSON non chiuso, parse fallito, modello scartato.
    // Visto in prod: claude-haiku, primo della chain, tagliato su
    // "camera_perspective": "fro". Ogni analisi pagava un modello sprecato.
    maxOutputTokens: 3000,
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
      const generateCandidate = (prompt: string, soloProviderDiretto = false) => {
        const remaining = BAGNO_BUDGET_MS - jobElapsed() - 20_000;
        const perAttemptTimeout = Math.max(
          30_000,
          Math.min(75_000, Math.floor(remaining / (soloProviderDiretto ? 1 : 2))),
        );
        return editImage({
          prompt,
          sourceImageBlob,
          effectiveWidth: sourceDimensions?.width ?? undefined,
          effectiveHeight: sourceDimensions?.height ?? undefined,
          openaiQuality: "medium",
          timeoutMs: perAttemptTimeout,
          directProviderOnly: soloProviderDiretto,
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

            // Il primo tentativo va SOLO sul provider diretto, con tutto il budget.
      //
      // Dividere il tempo a meta' per finanziare il secondo tier sembra
      // prudente, ma il secondo tier e' OpenRouter — che riceve la size come
      // semplice testo nel prompt e la ignora, restituendo un 1024x1024. Da una
      // foto verticale il quadrato costringe il modello a inventare scena ai
      // lati: allarga il soggetto e ridisegna quello che ha intorno. Si stava
      // quindi togliendo tempo al provider buono per pagare un ripiego che
      // rovina il render.
      // Misurato su infissi (sessione d655a562): diretto abortito a 53s quando
      // ne servivano ~60, quadrato consegnato con QA a zero segnalazioni.
      // Col diretto a budget pieno: 146s -> 58s e formato corretto.
      let renderResult: Awaited<ReturnType<typeof generateCandidate>>;
      try {
        renderResult = await generateCandidate(composedPrompt, true);
      } catch (primoErr) {
        console.warn(JSON.stringify({
          lvl: "warn", fn: "generate-bathroom-render", session_id,
          msg: "provider_diretto_fallito_si_passa_alla_catena",
          error: String((primoErr as Error)?.message ?? primoErr).substring(0, 200),
          nota: "il formato potrebbe non essere rispettato dal fallback",
        }));
        renderResult = await generateCandidate(composedPrompt, false);
      }
      let generationAttempts = 1;

      // Il render esce sempre in una delle tre size OpenAI, mai nelle
      // proporzioni esatte della foto: confrontarlo con la SORGENTE lo dichiara
      // sbagliato quasi sempre. Una foto 4:3 (1.333) contro il suo contenitore
      // 1536x1024 (1.5) sfora la soglia dell'8% e faceva scattare una seconda
      // generazione completa su ogni bagno in 4:3, senza che ci fosse nulla da
      // correggere. Il termine di paragone giusto e' la size richiesta.
      const formatoAtteso = expectedOutputSize(
        sourceDimensions?.width,
        sourceDimensions?.height,
      );
      let uploadPayload = dataUrlToBytes(renderResult.imageDataUrl);
      const firstAttemptDimensions = detectImageDimensions(uploadPayload.bytes);
      const firstMismatch = describeFormatMismatch(
        formatoAtteso,
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

        // Cio' che il cliente HA ORDINATO. Senza questo elenco il QA bocciava
        // proprio il lavoro richiesto: sessione 9703a2bd, brief con vasca
        // freestanding al posto della doccia -> "invented_objects: freestanding
        // bathtub not in source", "geometry_change: shower location moved".
        // Stessa classe del falso positivo sul cassonetto infissi. Ogni falso
        // positivo costa una generazione in piu' e ~40s.
        const modificheAutorizzate: string[] = [];
        if (showerToTub) {
          modificheAutorizzate.push(
            "the existing SHOWER is REMOVED and a NEW BATHTUB" +
              (qaSpec.bathtub.type ? ` (${String(qaSpec.bathtub.type).replace(/_/g, " ")})` : "") +
              " takes its place: the tub is ordered work, never an invented object, and the shower's disappearance is never a geometry change",
          );
        }
        if (tubToShower) {
          modificheAutorizzate.push(
            "the existing BATHTUB is REMOVED and a NEW SHOWER takes its place: the shower is ordered work, never an invented object",
          );
        }
        if (qaSpec.sanitaryWare.replace) {
          modificheAutorizzate.push(
            "the WC" + (wallHungSelected ? " (now WALL-HUNG)" : "") +
              " and the other sanitary ware are REPLACED one-for-one with new models",
          );
        }
        const bidetAction = String(qaSpec.sanitaryWare.bidetAction ?? "");
        if (bidetAction === "aggiungi") {
          modificheAutorizzate.push(
            "a NEW BIDET is ADDED beside the WC: a bidet is NOT a second toilet and must never be reported as a duplicated fixture",
          );
        } else if (bidetAction === "rimuovi") {
          modificheAutorizzate.push("the existing BIDET is REMOVED");
        } else if (bidetAction === "sostituisci" || qaScene.sanitaryWare.bidetPresent) {
          modificheAutorizzate.push(
            "a bidet is present beside the WC (as in the source, or replaced): a bidet is NOT a second toilet",
          );
        }
        if (qaSpec.vanity.replace) modificheAutorizzate.push("the VANITY/washbasin unit is replaced");
        if (qaSpec.wallTiles.replace) modificheAutorizzate.push("the WALL TILES/cladding are replaced");
        if (qaSpec.floor.replace) modificheAutorizzate.push("the FLOOR finish is replaced");
        if (qaSpec.faucets.replace) modificheAutorizzate.push("taps and fittings are replaced");
        if (qaSpec.lighting.replace) modificheAutorizzate.push("the lighting fixtures are replaced");

        const qaPrompt = [
          "You are a LENIENT quality inspector for a bathroom renovation render.",
          "Image 1 = SOURCE photo of the real bathroom. Image 2 = CANDIDATE render.",
          modificheAutorizzate.length > 0
            ? "AUTHORISED CHANGES — the customer ordered these. A difference here is the requested work and must NEVER be reported under any category:\n" +
              modificheAutorizzate.map((r) => `- ${r}`).join("\n")
            : "",
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
          "- invented_objects: fixtures, windows or furniture that are in neither the source photo nor the renovation brief. Small decorative props — a plant, towels, bottles, a soap dish — are STYLING, not invented objects: never report them.",
          "- geometry_change: camera angle, perspective or crop clearly different from the source.",
          // Su un restyling completo il layout cambia per definizione (vasca al
          // posto della doccia, mobile nuovo): il blocco generico "ogni oggetto
          // deve esserci ancora" bocciava il lavoro ordinato (85c7d727:
          // "dramatically expanded space, vanity repositioned"). L'ancora giusta
          // e' l'architettura (pareti, aperture, soffitto, camera), come su
          // stanza. Per gli interventi leggeri resta il blocco generico.
          ...(String(session.tipo_intervento ?? "") === "restyling_completo"
            ? QA_BLOCCO_RICOMPOSIZIONE_RESTYLING
            : QA_BLOCCO_RICOMPOSIZIONE),
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

        // Il retry parte solo se ha budget per riuscire davvero. Con la soglia
        // precedente (95s) gli restavano ~30s — il minimo consentito — e il
        // modello diretto andava in timeout nel 50% dei casi (misurato: 5 abort
        // su 10 render), finendo sul fallback che non rispetta il formato.
        // A 75s restano ~45s: o si fa, o si tiene la prima immagine.
        const budgetPerRetry = BAGNO_BUDGET_MS - jobElapsed() - 20_000;
        if (qaResult.checked && !qaResult.pass && qaIssues.length > 0 && budgetPerRetry >= 45_000) {
          console.log(JSON.stringify({
            fn: "generate-bathroom-render",
            msg: "qa_failed_retry_corrective",
            session_id,
            qa_model: qaResult.modelUsed,
            issues: qaIssues.map((i) => i.category),
            // il testo, non solo la categoria: e' cio' che ha permesso di capire
            // che la bocciatura colpiva il lavoro ordinato
            dettagli: qaIssues.map((i) => `${i.category}: ${i.detail}`.substring(0, 300)),
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
          const primoOk = !describeFormatMismatch(formatoAtteso, primoDim);

          // Vincolato al diretto se il primo formato era giusto: un retry che
          // torna quadrato viene comunque scartato dalla guardia — pagarlo e'
          // inutile (visto in prod su 85c7d727: retry 1024x1024 scartato).
          const retryResult = await generateCandidate(composedPrompt, primoOk);
          generationAttempts += 1;
          const retryPayload = dataUrlToBytes(retryResult.imageDataUrl);
          const retryDim = detectImageDimensions(retryPayload.bytes);
          const retryMismatch = describeFormatMismatch(formatoAtteso, retryDim);

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
        } else if (qaResult.checked && qaResult.pass) {
          // Il QA promosso non lasciava traccia: si deduceva dall'ASSENZA della
          // riga di bocciatura. Silenzio = successo e' una pessima proprieta'.
          console.log(JSON.stringify({
            fn: "generate-bathroom-render",
            msg: "qa_passed_first_attempt",
            session_id,
            qa_model: qaResult.modelUsed,
          }));
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
