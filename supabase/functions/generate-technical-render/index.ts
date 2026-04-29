// generate-technical-render — Edge Function EiC
// Generic production backend for technical render modules:
// ristrutturazioni, pavimenti-esterni, giardini, porte-blindate, porte-interne.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe, refundRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";
import { bytesToBase64 } from "../_shared/base64.ts";
import { pickProviderSize, prepareInputImage } from "../_shared/renderImage.ts";
import {
  openAIImageEditResultToDataUrl,
  runOpenAIImageEditWithFallback,
} from "../_shared/openaiImageEdit.ts";
import { buildInteriorDoorPrompt } from "../../../shared/render-interior-door/interiorDoorPromptBuilder.ts";
import { buildSecurityDoorPrompt } from "../../../shared/render-security-door/securityDoorPromptBuilder.ts";

type TechnicalModuleId =
  | "ristrutturazioni"
  | "pavimenti-esterni"
  | "giardini"
  | "porte-blindate"
  | "porte-interne";

const MODULE_IDS: TechnicalModuleId[] = [
  "ristrutturazioni",
  "pavimenti-esterni",
  "giardini",
  "porte-blindate",
  "porte-interne",
];

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

declare const EdgeRuntime: { waitUntil?: (promise: Promise<unknown>) => void } | undefined;

function runInBackground(promise: Promise<unknown>) {
  if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime?.waitUntil === "function") {
    EdgeRuntime.waitUntil(promise);
    return;
  }

  promise.catch((err) => {
    console.error("[generate-technical-render] background fallback error:", err);
  });
}

function acceptedRenderResponse(sessionId: string) {
  return jsonResponse({
    success: true,
    accepted: true,
    session_id: sessionId,
    status: "processing",
  }, 202);
}

const MODULE_RULES: Record<TechnicalModuleId, {
  label: string;
  mission: string;
  sceneInventory: string[];
  targetMap: string[];
  buildability: string[];
  specification: string[];
  negative: string[];
}> = {
  ristrutturazioni: {
    label: "Renovation orchestration",
    mission: "surgical photorealistic renovation orchestration of only the visible and compatible systems in the same photographed scene",
    sceneInventory: [
      "classify the photo first: bathroom, room, kitchen-room, facade, roof, outdoor or mixed compatible scene",
      "do not combine domains that cannot coexist in this single photo",
      "read architecture shell, openings, fixed functional anchors, visible surfaces, movable objects, context, light and shadows",
    ],
    targetMap: [
      "global target zones must distinguish primary, secondary, untouched, forbidden and ambiguous zones",
      "every active domain must have a visible target zone",
      "systems outside the visible photo must be excluded rather than hallucinated",
    ],
    buildability: [
      "resolve domain dependencies before visual editing: demolition/removal first, surfaces second, openings/fixtures third, furniture/accessories later, decor last",
      "preserve geometry when a system is color-only or refinish-only",
      "if unresolved conflict remains, do not force an impossible hybrid final scene",
    ],
    specification: [
      "produce one coherent final renovated scene, not stacked prompts",
      "coordinate materials, finishes, target zones and preservation rules across all active systems",
      "remove old/new hybrid states completely where a system is replaced",
    ],
    negative: [
      "do not generate bathroom plus roof, interior plus exterior facade, or other incompatible single-photo combinations",
      "do not invent systems outside the photographed scope",
      "do not change non-target architecture, openings, crop or perspective",
    ],
  },
  "pavimenti-esterni": {
    label: "Exterior flooring",
    mission: "surgical photorealistic exterior flooring replacement on the same photographed property",
    sceneInventory: [
      "read patio, terrace, path, driveway, pool edge, steps, thresholds, lawn, deck, facade and visible level changes",
      "identify current paving pattern, joints, borders, wear, slope impression and drainage cues",
      "preserve house, openings, non-target garden, pool basin, pergola and outdoor furniture",
    ],
    targetMap: [
      "target surface map must specify exact front/back/left/right limits and adjacent surfaces to preserve",
      "include thresholds, steps, pool coping, occluded zones and crisp material transition lines",
      "do not spread new material onto walls, doors, lawn, pool water or non-target deck",
    ],
    buildability: [
      "new surface thickness must align with doors, thresholds, steps and existing ground plane",
      "show plausible slope/runoff behavior for outdoor use",
      "large slabs need sparse joints, deck needs board direction/open gaps, pavers need stable modular pattern",
    ],
    specification: [
      "material must read as exterior-grade and installable, not indoor texture pasted outside",
      "remove all old paving grid, grout or texture ghosts when replacing",
      "build clean perimeter cuts, borders, coping and junctions",
    ],
    negative: [
      "do not create floating pavement or impossible threshold heights",
      "do not change pool basin unless explicitly requested",
      "do not leave hybrid old/new paving states",
    ],
  },
  giardini: {
    label: "Garden redesign",
    mission: "surgical photorealistic garden redesign on the same photographed property",
    sceneInventory: [
      "read lawn, existing beds, hedges, trees, paths, hardscape, pool/pergola if present, fences, walls, furniture and view corridors",
      "preserve house, facade, non-target hardscape, pool/pergola, important trees, sky and neighboring context",
      "identify visual scale, maintenance level, sun/shadow and passage routes",
    ],
    targetMap: [
      "target zones must distinguish main lawn, perimeter beds, border-house zones, poolside green zones, paths, relax areas and untouched zones",
      "maintain no-plant zones around doors, paths, pool water, technical passages and visual corridors",
      "keep breathing space; do not overfill the garden",
    ],
    buildability: [
      "planting envelope must control plausible heights, density, distances from facade/windows/paths/pool/pergola and maintenance intent",
      "trees must be scaled to the visible garden and cast coherent shadows",
      "hedges must screen realistically without becoming artificial green walls unless explicitly intended",
    ],
    specification: [
      "selected garden style must appear through plant palette, density, borders, materials and path logic",
      "declutter removes only superfluous objects and never empties the garden unnaturally",
      "paths and ground covers must follow useful circulation, not random curves",
    ],
    negative: [
      "do not add random nursery-catalog plants",
      "do not invent pools, pergolas or luxury resort staging",
      "do not block windows, doors, paths or pool coping with vegetation unless selected",
    ],
  },
  "porte-blindate": {
    label: "Security door replacement",
    mission: "surgical photorealistic security door replacement on the same photographed entrance",
    sceneInventory: [
      "read entrance side, target opening, existing door, frame/casing, wall, floor, skirting, threshold, adjacent switches/intercom/furniture and light",
      "preserve surrounding walls, floor, skirting, corridor/facade context and all non-target fixtures",
      "detect whether the visible side is internal, external, landing or villa entrance",
    ],
    targetMap: [
      "target opening map must distinguish leaf, frame, casing, threshold, sidelights/transom if selected and adjacent preserved wall/floor areas",
      "new system must occupy the existing opening unless an explicit plausible side-light/transom conversion is selected",
      "intervention limits must be clean: no spill onto adjacent walls or floor",
    ],
    buildability: [
      "door proportions, frame thickness, handle/knob/pull-bar scale, defender and peephole must be plausible",
      "rasomuro requires minimal casing and flush-wall logic; double leaf and side-light require opening plausibility",
      "threshold and floor junction must look installed, not pasted",
    ],
    specification: [
      "remove old door, old frame ghosts, incompatible glass/panels and trim remnants completely when replacing",
      "visible-side finish must match the photographed side; do not mix internal/external panels illogically",
      "make the door look solid, premium and security-grade without turning it into a technical diagram",
    ],
    negative: [
      "do not move the doorway or redesign the entrance",
      "do not create impossible sidelights, oversized hardware or hybrid old/new frames",
      "do not alter non-target walls, floors or fixtures",
    ],
  },
  "porte-interne": {
    label: "Interior door replacement",
    mission: "surgical photorealistic interior door replacement on the same photographed room/interior",
    sceneInventory: [
      "read room type, target doorway, existing door, wall, floor, skirting, ceiling, nearby furniture, switches, radiators and light",
      "preserve surrounding walls, floor, skirting, ceiling, non-target furniture and adjacent visible room",
      "detect available wall space for sliding systems and ceiling relation for full-height doors",
    ],
    targetMap: [
      "target opening map must distinguish leaf, frame/casing, threshold/passage, wall-sliding area if needed and preserved adjacent surfaces",
      "external sliding rail can appear only if wall space is plausibly free",
      "pocket sliding must not show an external rail and must remove old swing-door traces",
    ],
    buildability: [
      "door type must be compatible with opening width, height, ceiling, skirting and nearby objects",
      "flush doors require minimal/no casing; glazed doors require realistic glass, frame and privacy behavior",
      "handles, hinges and hardware must be correctly scaled and positioned",
    ],
    specification: [
      "remove old door and incompatible frame/casing when replacing",
      "finish-only changes preserve exact geometry and opening mechanism",
      "opening mechanism must be readable: hinged, pocket sliding, wall sliding, folding, flush or glazed, never mixed",
    ],
    negative: [
      "do not redesign the room or move the doorway",
      "do not create sliding doors without available wall space",
      "do not leave old trim, swing traces or hybrid mechanisms",
    ],
  },
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function bullets(lines: Array<string | null | undefined>): string {
  return lines.filter((line): line is string => Boolean(line && line.trim())).map((line) => `- ${line}`).join("\n");
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 120_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 2, delayMs = 2000): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || i === retries || res.status < 500) return res;
    } catch (err) {
      if (i === retries) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
  }
  throw new Error("fetchWithRetry: all retries exhausted");
}

function looksLikeStructuredDoorConfig(config: Record<string, unknown>): boolean {
  const interventi = (config as { interventi?: unknown }).interventi;
  const apertura = (config as { apertura?: unknown }).apertura;
  return Array.isArray(interventi) && interventi.length > 0
    && typeof apertura === "object" && apertura !== null
    && typeof (config as { door_type?: unknown }).door_type === "string";
}

function buildRichDoorPrompt(
  moduleType: "porte-interne" | "porte-blindate",
  config: Record<string, unknown>,
) {
  const rawAnalysis = (config as { scene_analysis?: unknown }).scene_analysis;
  const photoMeta = (config as { photo_meta?: { width?: number; height?: number; orientation?: "portrait" | "landscape" | "square" | "unknown" } }).photo_meta ?? null;
  if (moduleType === "porte-interne") {
    const built = buildInteriorDoorPrompt(config, rawAnalysis, photoMeta);
    return {
      systemPrompt: built.systemPrompt,
      userPrompt: built.userPrompt,
      finalPrompt: `${built.systemPrompt}\n\n${built.userPrompt}`,
      promptVersion: built.promptVersion,
      promptPayload: {
        scene_analysis: built.normalizedConfig.scene_analysis,
        target_map: built.normalizedConfig.target_opening_map,
        replacement_manifest: built.normalizedConfig.replacement_manifest,
        validation: {
          is_valid: built.validation.isValid,
          warnings: built.validation.warnings,
          errors: [
            ...built.validation.missingSections.map((section) => `Missing section: ${section}`),
            ...built.validation.missingBusinessRules.map((rule) => `Missing rule: ${rule}`),
          ],
          required_blocks: Object.keys(built.blocks),
          missing_blocks: [] as string[],
        },
        blocks: built.blocks,
      },
    };
  }
  const built = buildSecurityDoorPrompt(config, rawAnalysis, photoMeta);
  return {
    systemPrompt: built.systemPrompt,
    userPrompt: built.userPrompt,
    finalPrompt: `${built.systemPrompt}\n\n${built.userPrompt}`,
    promptVersion: built.promptVersion,
    promptPayload: {
      scene_analysis: built.normalizedConfig.scene_analysis,
      target_map: built.normalizedConfig.target_opening_map,
      replacement_manifest: built.normalizedConfig.replacement_manifest,
      validation: {
        is_valid: built.validation.isValid,
        warnings: built.validation.warnings,
        errors: [
          ...built.validation.missingSections.map((section) => `Missing section: ${section}`),
          ...built.validation.missingBusinessRules.map((rule) => `Missing rule: ${rule}`),
        ],
        required_blocks: Object.keys(built.blocks),
        missing_blocks: [] as string[],
      },
      blocks: built.blocks,
    },
  };
}

function buildTechnicalPrompt(args: {
  moduleType: TechnicalModuleId;
  config: Record<string, unknown>;
}) {
  const { moduleType, config } = args;
  if ((moduleType === "porte-interne" || moduleType === "porte-blindate") && looksLikeStructuredDoorConfig(config)) {
    return buildRichDoorPrompt(moduleType, config);
  }
  const rules = MODULE_RULES[moduleType];
  const interventionPreset = text(config.interventionPreset, "technical_render");
  const targetArea = text(config.targetArea, "visible target area in the uploaded photo");
  const materialOrSystem = text(config.materialOrSystem, "selected technical system");
  const colorAndFinish = text(config.colorAndFinish, "selected color and finish");
  const technicalDetails = text(config.technicalDetails, "follow all selected technical details");
  const preserveNotes = text(config.preserveNotes, "preserve all non-target elements");
  const intensity = text(config.intensity, "media");

  const sceneAnalysis = {
    module_type: moduleType,
    label: rules.label,
    preset: interventionPreset,
    single_photo_scope: true,
    scene_inventory_required: rules.sceneInventory,
  };

  const targetMap = {
    target_area: targetArea,
    target_rules: rules.targetMap,
    untouched_context: preserveNotes,
  };

  const replacementManifest = {
    action: interventionPreset,
    material_or_system: materialOrSystem,
    color_and_finish: colorAndFinish,
    intensity,
    additions: ["add only selected visible systems/details"],
    removals: ["remove incompatible old elements and ghost traces only when the selected intervention requires replacement"],
    replacements: [`apply ${materialOrSystem} to ${targetArea}`],
    preserve_exactly: preserveNotes.split(",").map((item) => item.trim()).filter(Boolean),
    technical_details: technicalDetails,
  };

  const blocks: Record<string, string> = {
    A: `[BLOCK A - MISSION]\nYou are a professional image-editing renderer for ${rules.mission}. Mandatory: same property/room, same camera angle, same perspective, same image dimensions, same photographed context, no artistic reinterpretation and no different-scene generation.`,
    B: `[BLOCK B - EXISTING SCENE INVENTORY]\nInfer the photographed scene carefully before editing.\n${bullets(rules.sceneInventory)}`,
    C: `[BLOCK C - TARGET MAP]\nTarget area: ${targetArea}\n${bullets(rules.targetMap)}`,
    D: `[BLOCK D - BUILDABILITY / COMPATIBILITY ENVELOPE]\n${bullets(rules.buildability)}\nSelected intensity: ${intensity}`,
    E: `[BLOCK E - REPLACEMENT MANIFEST]\nPreset/action: ${interventionPreset}\nSystem/material: ${materialOrSystem}\nColor/finish: ${colorAndFinish}\nTechnical details: ${technicalDetails}\nPreserve exactly: ${preserveNotes}`,
    F: `[BLOCK F - TECHNICAL SPECIFICATION]\n${bullets(rules.specification)}`,
    G: `[BLOCK G - INTEGRATION AND RESTORATION RULES]\nAll new elements must be physically integrated into the original scene. Rebuild junctions, edges, contact shadows and surface continuity cleanly. Remove incompatible old traces completely. Do not leave hybrid old/new states.`,
    H: `[BLOCK H - PROPERTY / ROOM INTEGRITY]\nPreserve non-target architecture, openings, surrounding surfaces, furniture/objects, sky/context where visible, crop, perspective, proportions and lighting direction. ${preserveNotes}`,
    I: `[BLOCK I - PHOTOREALISM RULES]\nRealistic materials, realistic scale, contact occlusion, shadows, reflections and installation details. Avoid pasted overlays, warped geometry, fake CGI showroom look and decorative inventions unrelated to the selected intervention.`,
    J: `[BLOCK J - NEGATIVE CONSTRAINTS]\n${bullets(rules.negative)}\n- do not show prompt text or technical notes in the image\n- do not alter non-target systems\n- do not invent unrelated luxury staging or extra products`,
    K: `[BLOCK K - QUALITY BAR]\nProfessional commercial renovation visualization, high-trust same-scene realism, selected system clearly recognizable, technically plausible and suitable for sales/preventivi.`,
  };

  const userPrompt = Object.values(blocks).slice(1).join("\n\n");
  const finalPrompt = `${blocks.A}\n\n${userPrompt}`;
  const requiredBlocks = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"] as const;
  const missingBlocks = requiredBlocks.filter((key) => !blocks[key]?.includes(`[BLOCK ${key}`));
  const validation = {
    is_valid: missingBlocks.length === 0,
    warnings: [] as string[],
    errors: missingBlocks.map((key) => `Missing or malformed BLOCK ${key}`),
    required_blocks: Object.keys(blocks),
    missing_blocks: missingBlocks,
  };

  return {
    systemPrompt: blocks.A,
    userPrompt,
    finalPrompt,
    promptVersion: `technical-${moduleType}-v1.0.0`,
    promptPayload: {
      scene_analysis: sceneAnalysis,
      target_map: targetMap,
      replacement_manifest: replacementManifest,
      validation,
      blocks,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  let supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let currentSessionId: string | null = null;
  let refundableCompanyId: string | null = null;
  let requestUserId: string | null = null;
  let refundableVertical = "technical";
  let creditDeducted = false;

  try {
    const auth = await requireAuth(req, CORS);
    supabase = auth.supabaseAdmin;
    const userId = auth.userId;
    requestUserId = userId;

    const body = await req.json().catch(() => ({}));
    const { session_id, config, target_width, target_height } = body as {
      session_id?: string;
      config?: Record<string, unknown>;
      target_width?: number;
      target_height?: number;
    };
    currentSessionId = session_id ?? null;

    if (!session_id) {
      return jsonResponse({ error: "validation_error", message: "session_id is required" }, 400);
    }

    const { data: session, error: sessionErr } = await supabase
      .from("render_technical_sessions")
      .select("*")
      .eq("id", session_id)
      .single();

    if (sessionErr || !session) {
      return jsonResponse({ error: "not_found", message: "Sessione render non trovata" }, 404);
    }
    refundableCompanyId = session.company_id as string;

    const moduleType = session.module_type as TechnicalModuleId;
    refundableVertical = moduleType;
    if (!MODULE_IDS.includes(moduleType)) {
      return jsonResponse({ error: "validation_error", message: "Modulo render tecnico non supportato" }, 400);
    }

    const allowed = await canAccessCompany(supabase, userId, session.company_id as string);
    if (!allowed) {
      return jsonResponse({ error: "forbidden", message: "Accesso negato alla sessione render" }, 403);
    }

    const existingResults = Array.isArray(session.result_urls) ? session.result_urls : [];
    if (session.status === "completed" && existingResults.length) {
      return jsonResponse({
        success: true,
        session_id,
        result_url: existingResults[0],
        result_urls: existingResults,
        already_completed: true,
      });
    }
    if (session.status === "processing") {
      return acceptedRenderResponse(session_id);
    }

    const deductResult = await deductRenderCreditSafe(supabase, {
      companyId: session.company_id as string,
      sessionId: session_id,
      userId,
      reasonMeta: { vertical: moduleType, edge_fn: "generate-technical-render" },
      logTag: "generate-technical-render",
    });

    if (deductResult.status === "insufficient") {
      return jsonResponse({ error: "insufficient_credits", message: "Crediti render insufficienti" }, 402);
    }
    creditDeducted = true;

    await supabase
      .from("render_technical_sessions")
      .update({ status: "processing", processing_started_at: new Date().toISOString(), error_message: null })
      .eq("id", session_id);

    const renderJob = (async () => {
    const originalPath = session.original_photo_url as string;
    if (!originalPath) throw new Error("Foto originale mancante");

    const prepared = await prepareInputImage({
      supabase,
      bucket: "render-originals",
      originalPath,
      hintWidth: target_width ?? null,
      hintHeight: target_height ?? null,
    });

    const rawConfig = (config || (session.config as Record<string, unknown>) || {}) as Record<string, unknown>;
    const { finalPrompt, userPrompt, promptVersion, promptPayload } = buildTechnicalPrompt({ moduleType, config: rawConfig });

    if (!promptPayload.validation.is_valid) {
      const missing = promptPayload.validation.errors?.join(", ") || "blocchi obbligatori mancanti";
      console.error("[generate-technical-render] prompt validation failed:", {
        moduleType,
        session_id,
        missing_blocks: promptPayload.validation.missing_blocks,
      });
      throw new Error(`Prompt tecnico non valido: ${missing}`);
    }

    const { data: providerConfig } = await supabase
      .from("render_provider_config")
      .select("*")
      .eq("is_default", true)
      .eq("is_active", true)
      .single();

    if (!providerConfig) throw new Error("Nessun provider render attivo. Configurare in Admin > Impostazioni AI > Render.");

    const platformKeyName = `render_${providerConfig.provider_key}_api_key`;
    const { data: keyRow } = await supabase.from("platform_settings").select("value").eq("key", platformKeyName).maybeSingle();
    const envName = `${String(providerConfig.provider_key).toUpperCase()}_API_KEY`;
    const apiKey = (keyRow as { value: string } | null)?.value?.trim() || Deno.env.get(envName)?.trim() || "";
    if (!apiKey) throw new Error(`API key mancante per provider '${providerConfig.provider_key}'.`);

    let imageData: string | null = null;
    let modelUsed = String(providerConfig.model || "");

    if (providerConfig.provider_key === "openai") {
      const imgResp = await fetchWithTimeout(prepared.url, {}, 30_000);
      if (!imgResp.ok) throw new Error(`Impossibile leggere la foto originale (${imgResp.status})`);
      const imgBlob = await imgResp.blob();
      const openaiResult = await runOpenAIImageEditWithFallback({
        apiKey,
        prompt: finalPrompt,
        image: imgBlob,
        filename: "photo.jpg",
        size: pickProviderSize(prepared.effective_width, prepared.effective_height, "openai") ?? "1024x1024",
        configuredModel: providerConfig.model,
        fetcher: fetchWithRetry,
      });
      modelUsed = openaiResult.modelUsed;
      if (openaiResult.fallbackErrors.length > 0) {
        console.warn("[generate-technical-render] OpenAI model fallback:", openaiResult.fallbackErrors.join(" | "));
      }
      imageData = await openAIImageEditResultToDataUrl(
        openaiResult.data,
        (url, options = {}) => fetchWithTimeout(url, options, 30_000),
      );
    } else if (providerConfig.provider_key === "gemini") {
      const imgResp = await fetchWithTimeout(prepared.url, {}, 30_000);
      if (!imgResp.ok) throw new Error(`Impossibile leggere la foto originale (${imgResp.status})`);
      const imgBuffer = await imgResp.arrayBuffer();
      const imgB64 = bytesToBase64(imgBuffer);
      const geminiBody = {
        contents: [{ parts: [{ text: finalPrompt }, { inline_data: { mime_type: "image/jpeg", data: imgB64 } }] }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"], temperature: 0.48 },
      };
      const geminiUrl = `${providerConfig.api_endpoint}/${providerConfig.model}:generateContent?key=${apiKey}`;
      const resp = await fetchWithRetry(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      });
      if (!resp.ok) throw new Error(`Gemini error ${resp.status}: ${(await resp.text()).substring(0, 300)}`);
      const gemData = await resp.json();
      const parts = gemData.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith("image/")) {
          imageData = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }
    } else {
      throw new Error(`Provider '${providerConfig.provider_key}' non supportato. Selezionare OpenAI o Gemini.`);
    }

    if (!imageData) throw new Error("Nessuna immagine ricevuta dal provider AI");

    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const uint8 = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const resultPath = `${session.company_id}/${moduleType}/${session_id}/render_${moduleType}_${Date.now()}.png`;
    const { error: uploadErr } = await supabase.storage.from("render-results").upload(resultPath, uint8, {
      contentType: "image/png",
      upsert: true,
    });
    if (uploadErr) throw new Error(`Errore upload risultato: ${uploadErr.message}`);

    const { data: publicUrlData } = supabase.storage.from("render-results").getPublicUrl(resultPath);
    const resultUrl = publicUrlData.publicUrl;
    const costReal = providerConfig.cost_real_per_render ?? 0.04;
    const costBilled = providerConfig.cost_billed_per_render ?? 0.10;

    await supabase
      .from("render_technical_sessions")
      .update({
        status: "completed",
        result_urls: [resultUrl],
        prompt_used: userPrompt,
        prompt_version: promptVersion,
        prompt_char_count: finalPrompt.length,
        provider_key: providerConfig.provider_key,
        cost_real: costReal,
        cost_billed: costBilled,
        scene_analysis: promptPayload.scene_analysis,
        target_map: promptPayload.target_map,
        replacement_manifest: promptPayload.replacement_manifest,
        validation_result: promptPayload.validation,
        config_snapshot: {
          ...rawConfig,
          technical_render_payload: promptPayload,
          input_image_meta: prepared.meta,
          provider_model_used: modelUsed,
        },
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
      result_urls: [resultUrl],
      prompt_version: promptVersion,
      prompt_char_count: finalPrompt.length,
    });
    })().catch(async (jobErr: unknown) => {
      const msg = jobErr instanceof Error ? jobErr.message : String(jobErr);
      console.error("[generate-technical-render] background error:", msg);
      await refundRenderCreditSafe(supabase, {
        companyId: session.company_id as string,
        sessionId: session_id,
        userId,
        reasonMeta: { vertical: moduleType, edge_fn: "generate-technical-render", error: msg.substring(0, 500) },
        logTag: "generate-technical-render",
      });
      await supabase
        .from("render_technical_sessions")
        .update({ status: "failed", error_message: msg, processing_completed_at: new Date().toISOString() })
        .eq("id", session_id);
    });

    runInBackground(renderJob);
    return acceptedRenderResponse(session_id);
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-technical-render] error:", msg);
    if (currentSessionId) {
      if (creditDeducted && refundableCompanyId) {
        await refundRenderCreditSafe(supabase, {
          companyId: refundableCompanyId,
          sessionId: currentSessionId,
          userId: requestUserId,
          reasonMeta: { vertical: refundableVertical, edge_fn: "generate-technical-render", error: msg.substring(0, 500) },
          logTag: "generate-technical-render",
        });
      }
      await supabase
        .from("render_technical_sessions")
        .update({ status: "failed", error_message: msg, processing_completed_at: new Date().toISOString() })
        .eq("id", currentSessionId);
    }
    return jsonResponse({ error: "render_failed", message: msg }, 500);
  }
});
