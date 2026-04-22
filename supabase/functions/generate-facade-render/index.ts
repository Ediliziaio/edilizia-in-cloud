// generate-facade-render — Edge Function EiC
// Render Facciata AI — Gemini via Lovable Gateway
// Prompt Engine v1 for facade renovation rendering

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";
import { captureRealCost } from "../_shared/renderCost.ts";
import { pickProviderSize, prepareInputImage } from "../_shared/renderImage.ts";

// ── FINISH_PHYSICS ───────────────────────────────────────────────────────────
const FINISH_PHYSICS: Record<string, string> = {
  liscio: "smooth troweled plaster — perfectly flat surface with subtle steel-trowel marks, uniform matte reflectance",
  graffiato_fine: "fine scratched plaster — light parallel grooves 0.5-1mm deep at random angles",
  graffiato_medio: "medium scratched plaster — clearly visible parallel grooves 1-2mm deep",
  rasato: "skim-coat smooth plaster — ultra-smooth surface, almost glass-like flatness",
  bucciato: "orange-peel textured plaster — evenly distributed rounded bumps 2-4mm",
  strutturato_grosso: "heavy structured plaster — bold aggregate texture 3-6mm embedded particles",
  rustico: "rustic rough-cast plaster — thrown-coat finish with irregular surface 3-8mm bumps",
  veneziana: "Venetian polished plaster — multi-layered burnished surface with marble-like veining",
  bugnato: "rusticated ashlar plaster — geometric raised rectangular blocks with 10-15mm deep channels",
};

// ── CLADDING_PHYSICS ─────────────────────────────────────────────────────────
const CLADDING_PHYSICS: Record<string, string> = {
  pietra_serena: "Pietra Serena blue-grey sandstone, smooth honed surface, Tuscan stone slabs with thin mortar joints",
  travertino: "Travertine warm beige-cream limestone with pitted surface and linear veining",
  arenaria_beige: "beige sandstone with visible stratification and warm golden tones",
  luserna: "Luserna dark grey-green gneiss with silver mica flecks, naturally split rough surface",
  splitface_grigio: "split-face grey stone, machine-split rough surface protruding 10-20mm",
  pietra_rustica: "rustic fieldstone, irregular natural pieces of varying sizes in earth tones",
  cotto_rosso: "red terracotta brick with warm red-orange tones, running bond pattern",
  clinker_rosso: "red clinker brick, deep red-burgundy, smooth dense surface with thin joints",
  clinker_grigio: "grey clinker brick in anthracite grey, contemporary industrial aesthetic",
  clinker_beige: "beige clinker brick in warm sand tone, Scandinavian-influenced modern look",
};

// ── hexToColorName ───────────────────────────────────────────────────────────
function hexToColorName(hex: string): string {
  const colors: Record<string, string> = {
    "#FFFFFF": "pure white", "#F5F5DC": "beige", "#FAF0E6": "linen white",
    "#FFFDD0": "cream", "#D2B48C": "tan", "#808080": "medium grey",
    "#A9A9A9": "dark grey", "#D3D3D3": "light grey",
  };
  return colors[hex?.toUpperCase()] || `color ${hex}`;
}

// ── buildFacadePrompt ────────────────────────────────────────────────────────
function buildFacadePrompt(session: Record<string, unknown>): {
  systemPrompt: string;
  userPrompt: string;
  promptVersion: string;
  blocks: Record<string, string>;
} {
  const config = (session.config || {}) as Record<string, unknown>;
  const analisi = (session.foto_analisi || {}) as Record<string, unknown>;

  const blocks: Record<string, string> = {};

  const systemPrompt = `You are an expert PHOTOREALISTIC FACADE RENOVATION RENDERER. Your ONLY task: apply the specified facade treatments to the building photograph while keeping EVERYTHING ELSE 100% pixel-perfect identical.

CRITICAL RULES:
1. Plaster finishes must be physically accurate with correct texture characteristics.
2. Cladding must show correct stone/brick texture, joint patterns, and natural color variation.
3. Cappotto (thermal insulation) adds 10-15cm depth at window edges and reveals.
4. Zone transitions must have clean architectural demarcation lines.
5. Sky, road, vegetation, neighboring buildings MUST remain 100% unchanged.
6. Window frames and glass remain identical unless explicitly changed.
7. Maintain exact camera perspective and lighting.
8. Output image dimensions must match input exactly.
9. Result must look like a real photograph, not CGI.`;

  // CONTESTO
  blocks.CONTESTO = `[CONTESTO]
Edificio: ${analisi.tipo_edificio || "residenziale"}, Piani: ${analisi.numero_piani || 3}
Intonaco attuale: ${analisi.intonaco_attuale || "intonaco civile"} (${hexToColorName(String(analisi.colore_attuale_hex || "#D3D3D3"))})
Conservazione: ${analisi.stato_conservazione || "usura media"}
Intervento: ${String(config.tipo_intervento || "tinteggiatura").replace(/_/g, " ")}`;

  // INTONACO
  const intonaco = (config.intonaco || {}) as Record<string, unknown>;
  if (intonaco.attivo) {
    const finish = FINISH_PHYSICS[String(intonaco.finitura || "liscio")] || String(intonaco.finitura);
    const colorName = intonaco.colore_nome || hexToColorName(String(intonaco.colore_hex || "#F5F5DC"));
    const zona = String(intonaco.zona || "tutta") === "tutta"
      ? "Apply to ENTIRE facade"
      : `Apply ONLY to: ${String(intonaco.zona).replace(/_/g, " ")}`;
    blocks.INTONACO = `[INTONACO]
Color: ${colorName} (${intonaco.colore_hex})
Finish: ${finish}
Zone: ${zona}
RULES: Uniform color, physically accurate texture, fresh professional finish.`;
  } else {
    blocks.INTONACO = `[INTONACO] INACTIVE — keep existing surface as-is.`;
  }

  // RIVESTIMENTO
  const riv = (config.rivestimento || {}) as Record<string, unknown>;
  if (riv.attivo) {
    const cladding = CLADDING_PHYSICS[String(riv.tipo || "pietra_serena")] || String(riv.tipo);
    const zona = String(riv.zona || "tutta") === "tutta"
      ? "Apply to ENTIRE facade"
      : `Apply ONLY to: ${String(riv.zona).replace(/_/g, " ")}`;
    blocks.RIVESTIMENTO = `[RIVESTIMENTO]
Material: ${cladding}
Zone: ${zona}
RULES: Natural texture, correct joint patterns, 15-30mm depth visible at edges.`;
  } else {
    blocks.RIVESTIMENTO = `[RIVESTIMENTO] INACTIVE — no cladding.`;
  }

  // CAPPOTTO
  const cap = (config.cappotto || {}) as Record<string, unknown>;
  if (cap.attivo) {
    const sistemaMap: Record<string, string> = {
      eps: "EPS external thermal insulation (ETICS)",
      lana_roccia: "mineral wool external thermal insulation",
      fibra_legno: "wood fiber external thermal insulation",
    };
    blocks.CAPPOTTO = `[CAPPOTTO TERMICO]
System: ${sistemaMap[String(cap.sistema || "eps")] || cap.sistema}
Thickness: ${cap.spessore_cm || 10}cm
Finish color: ${hexToColorName(String(cap.colore_finitura_hex || "#F5F5DC"))} (${cap.colore_finitura_hex})
CRITICAL: Window reveals MUST show ${cap.spessore_cm || 10}cm deep insets. Corner edge profiles visible.`;
  } else {
    blocks.CAPPOTTO = `[CAPPOTTO] INACTIVE — facade depth unchanged.`;
  }

  // ELEMENTI
  const elem = (config.elementi || {}) as Record<string, unknown>;
  const elemLines: string[] = ["[ELEMENTI ARCHITETTONICI]"];
  const cornici = (elem.cornici_finestre || {}) as Record<string, unknown>;
  if (cornici.azione === "aggiungi") {
    elemLines.push(`Window cornices: ADD in ${hexToColorName(String(cornici.colore_hex || "#FFFFFF"))}`);
  } else if (cornici.azione === "rimuovi") {
    elemLines.push(`Window cornices: REMOVE — show flush wall`);
  }
  const marc = (elem.marcapiani || {}) as Record<string, unknown>;
  if (marc.azione === "aggiungi") {
    elemLines.push(`String courses: ADD in ${hexToColorName(String(marc.colore_hex || "#FFFFFF"))}`);
  }
  const dav = (elem.davanzali || {}) as Record<string, unknown>;
  if (dav.azione === "sostituisci") {
    elemLines.push(`Window sills: REPLACE with ${dav.materiale || "stone"} in ${hexToColorName(String(dav.colore_hex || "#FFFFFF"))}`);
  }
  const zoc = (elem.zoccolatura || {}) as Record<string, unknown>;
  if (zoc.azione === "aggiungi") {
    elemLines.push(`Base course: ADD ${zoc.tipo || "intonaco"}, height ${zoc.altezza_cm || 40}cm`);
  }
  const gro = (elem.gronde || {}) as Record<string, unknown>;
  if (gro.azione === "sostituisci") {
    elemLines.push(`Gutters: REPLACE with ${gro.materiale || "alluminio"}`);
  }
  const bal = (elem.balconi_ringhiere || {}) as Record<string, unknown>;
  if (bal.azione === "vernicia") {
    elemLines.push(`Railings: REPAINT in ${hexToColorName(String(bal.colore_hex || "#000000"))}`);
  }
  blocks.ELEMENTI = elemLines.join("\n");

  // NOTE
  const notes = String(config.note_libere || "");
  if (notes) {
    blocks.NOTE = `[NOTE]\n${notes}`;
  }

  // VINCOLI
  blocks.VINCOLI = `[PRESERVATION CONSTRAINTS]
MUST remain unchanged: sky, road, vegetation, neighbors, vehicles, people, window glass/frames (unless specified).
NEVER: change sky, add/remove vegetation, produce CGI artifacts, add watermarks, distort proportions.`;

  const userParts = [blocks.CONTESTO, blocks.INTONACO, blocks.RIVESTIMENTO, blocks.CAPPOTTO, blocks.ELEMENTI];
  if (blocks.NOTE) userParts.push(blocks.NOTE);
  userParts.push(blocks.VINCOLI);

  return {
    systemPrompt,
    userPrompt: userParts.join("\n\n"),
    promptVersion: "1.0.0",
    blocks,
  };
}

// ── fetchWithTimeout ─────────────────────────────────────────────────────────
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

// ── fetchWithRetry ──────────────────────────────────────────────────────────
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

// ── CORS ─────────────────────────────────────────────────────────────────────
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

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "missing_auth", message: "Authorization header required" }),
        { status: 401, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: "invalid_auth", message: "Invalid or expired token" }),
        { status: 401, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // ── Parse request ────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { session_id, config, target_width, target_height } = body as {
      session_id?: string;
      config?: Record<string, unknown>;
      target_width?: number;
      target_height?: number;
    };

    if (!session_id) {
      return new Response(
        JSON.stringify({ error: "validation_error", message: "session_id is required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // ── Load session ─────────────────────────────────────────────────────
    const { data: session, error: sessionErr } = await supabase
      .from("render_facciata_sessions")
      .select("*")
      .eq("id", session_id)
      .single();

    if (sessionErr || !session) {
      return new Response(
        JSON.stringify({ error: "not_found", message: "Sessione non trovata" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // Verify ownership (impersonation-aware, FIX P1.3)
    const allowed = await canAccessCompany(
      supabase,
      user.id,
      session.company_id as string,
    );
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "forbidden", message: "Accesso negato alla sessione render facciata" }),
        { status: 403, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // ── Deduct credits (v3 → v2 → v1 fallback + audit ledger) ─────────────
    const deductResult = await deductRenderCreditSafe(supabase, {
      companyId:  session.company_id as string,
      sessionId:  session_id,
      userId:     user.id,
      reasonMeta: { vertical: "facciata", edge_fn: "generate-facade-render" },
      logTag:     "generate-facade-render",
    });

    if (deductResult.status === "insufficient") {
      return new Response(
        JSON.stringify({ error: "insufficient_credits", message: "Crediti render insufficienti" }),
        { status: 402, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // ── Update session: processing ───────────────────────────────────────
    await supabase
      .from("render_facciata_sessions")
      .update({ status: "processing", processing_started_at: new Date().toISOString() })
      .eq("id", session_id);

    const originalPath = session.original_photo_url as string;
    if (!originalPath) {
      throw new Error("Foto originale della sessione mancante");
    }

    const prepared = await prepareInputImage({
      supabase,
      bucket: "facciata-originals",
      originalPath,
      hintWidth: target_width,
      hintHeight: target_height,
    });
    const originalImage = await downloadImageAsInlineData(prepared.url);

    // ── Build prompt ─────────────────────────────────────────────────────
    const renderConfig = config || (session.config as Record<string, unknown>) || {};
    const sessionLike = {
      ...session,
      config: renderConfig,
      foto_analisi: (session as Record<string, unknown>).foto_analisi || {},
    };

    const { systemPrompt, userPrompt, promptVersion, blocks } = buildFacadePrompt(sessionLike);

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
        form.append("prompt", `${systemPrompt}\n\n${userPrompt}`);
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
        const isModelAccessIssue =
          errText.includes("invalid_value") && errText.includes("\"model\"");
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
            { text: `${systemPrompt}\n\n${userPrompt}` },
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
        const errText = await resp.text();
        throw new Error(`Gemini error ${resp.status}: ${errText.substring(0, 300)}`);
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

    // ── Upload result to Storage ─────────────────────────────────────────
    const uploadPayload = dataUrlToBytes(imageData);
    const resultPath = `${session.company_id}/${session_id}/render_${Date.now()}.${uploadPayload.extension}`;

    const { error: uploadErr } = await supabase.storage
      .from("facciata-results")
      .upload(resultPath, uploadPayload.bytes, {
        contentType: uploadPayload.mimeType,
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Errore upload risultato: ${uploadErr.message}`);
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
    const costBilled = Number(providerConfig.cost_billed_per_render ?? 0.10);

    // ── Update session: completed ────────────────────────────────────────
    await supabase
      .from("render_facciata_sessions")
      .update({
        status: "completed",
        result_urls: [resultUrl],
        prompt_used: userPrompt,
        prompt_blocks: blocks,
        prompt_version: promptVersion,
        prompt_char_count: (systemPrompt + userPrompt).length,
        provider_key: providerConfig.provider_key,
        cost_real: costReal,
        cost_billed: costBilled,
        config_snapshot: renderConfig,
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
        prompt_version: promptVersion,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-facade-render] error:", msg);

    try {
      const body2 = await req.clone().json().catch(() => ({}));
      const sid = (body2 as { session_id?: string }).session_id;
      if (sid) {
        await supabase
          .from("render_facciata_sessions")
          .update({ status: "failed", error_message: msg })
          .eq("id", sid);
      }
    } catch { /* ignore */ }

    return new Response(
      JSON.stringify({ error: "render_failed", message: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
