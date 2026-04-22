// generate-floor-render — Edge Function EiC
// Render Pavimento AI — Gemini (google/gemini-2.5-flash-image)
// Same pattern as generate-render but for floor replacement

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";
import { captureRealCost } from "../_shared/renderCost.ts";
import { pickProviderSize, prepareInputImage } from "../_shared/renderImage.ts";

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

// ── FLOOR_PHYSICS ─────────────────────────────────────────────────────────────
const FLOOR_PHYSICS: Record<string, string> = {
  parquet_massello: "solid hardwood parquet — natural wood grain visible, color variation between planks, subtle knot patterns, beveled edges, warm finish",
  parquet_prefinito: "pre-finished engineered wood — real wood top layer with visible grain, factory-applied uniform finish, tight seams, consistent surface quality",
  laminato: "laminate flooring — high-resolution photographic wood-grain surface, uniform pattern, V-groove beveled edges, matte or semi-gloss",
  gres_porcellanato: "porcelain stoneware — dense ceramic, can imitate marble/stone/concrete/wood, large formats possible, very thin grout lines, precise edges",
  ceramica: "ceramic tile — glazed surface, wider grout lines than porcelain, many colors and patterns, standard formats",
  marmo: "natural marble — distinctive veining patterns, high-gloss polished with deep reflections, subtle color gradients, luxury appearance",
  pietra_naturale: "natural stone — irregular texture, fossil marks, grain patterns, natural color variation, honed/brushed/tumbled finishes possible",
  vinile_lvt: "luxury vinyl tile — realistic embossed texture imitating wood or stone, uniform surface, thin or zero visible joints, waterproof",
  cotto: "terracotta — warm earth-toned handmade clay tiles, irregular surface, natural color variation orange to deep red-brown, unglazed matte, rustic",
  cemento_resina: "continuous resin/microcement — perfectly seamless NO joints NO tiles NO grout, subtle trowel texture, uniform color, industrial-modern",
  moquette: "wall-to-wall carpet — continuous soft textile, NO joints or seams, uniform pile texture, consistent color, soft light absorption",
  terrazzo_veneziano: "Venetian terrazzo — polished composite with visible aggregate chips in cement/resin matrix, high gloss, seamless continuous surface",
};

// ── POSA_PHYSICS ──────────────────────────────────────────────────────────────
const POSA_PHYSICS: Record<string, string> = {
  rettilineo_dritto: "straight linear — tiles/planks aligned parallel with NO offset, continuous straight grid lines",
  a_correre: "running bond 50% offset — classic brick-like stagger pattern",
  sfalsato_33: "one-third offset bond — 33% cascade staircase joints",
  spina_di_pesce: "herringbone — V-shaped zigzag at 90-degree angles, continuous chevron weave",
  spina_ungherese: "Hungarian herringbone — 45-degree angled ends forming sharp V-pattern",
  diagonale_45: "diagonal 45-degree — tiles rotated 45 degrees, diamond-shaped pattern",
  cassero_irregolare: "irregular staggered — random offset, natural organic appearance",
  opus_romanum: "opus romanum — multi-format modular layout, classical geometric pattern",
  doppia_fila: "double-strip — paired planks in running bond rhythm",
  modulare: "modular — mixed sizes creating basket-weave or pinwheel effect",
  esagonale: "hexagonal — six-sided honeycomb tessellation",
};

// ── FINITURA_DESC ─────────────────────────────────────────────────────────────
const FINITURA_DESC: Record<string, string> = {
  lucido: "high-gloss polished — strong specular reflections, mirror-like",
  opaco: "matte — no specular highlights, flat non-reflective",
  satinato: "satin — subtle soft sheen, gentle reflections",
  spazzolato: "brushed — directional micro-texture, soft tactile grain",
  boccardato: "bush-hammered — rough textured, anti-slip",
  anticato: "aged/antiqued — worn edges, patina effect, vintage",
  levigato: "honed — perfectly flat with subtle matte sheen",
  naturale: "natural — untreated original texture",
  cerato: "wax finish — warm soft sheen with depth",
};

// ── FUGA_COLORE_DESC ──────────────────────────────────────────────────────────
const FUGA_COLORE_DESC: Record<string, string> = {
  bianco: "white grout",
  grigio_chiaro: "light grey grout",
  grigio_scuro: "dark grey grout",
  nero: "black grout",
  beige: "beige grout",
  tono_su_tono: "color-matched grout — same tone as tile",
};

// ── BATTISCOPA_DESC ───────────────────────────────────────────────────────────
const BATTISCOPA_DESC: Record<string, string> = {
  coordinato_pavimento: "baseboard matching floor material",
  bianco: "white painted baseboard",
  legno: "natural wood baseboard",
  alluminio: "brushed aluminum baseboard",
};

// ── buildFloorPrompt ──────────────────────────────────────────────────────────
function buildFloorPrompt(session: Record<string, unknown>): {
  systemPrompt: string;
  userPrompt: string;
  promptVersion: string;
} {
  const config = (session.config || {}) as Record<string, unknown>;
  const analisi = (session.analisi_pavimento || {}) as Record<string, unknown>;

  const a = {
    tipo_stanza: "stanza generica",
    pavimento_attuale: "non identificato",
    colore_attuale: "non identificato",
    dimensione_stimata: "non identificata",
    stato_conservazione: "non identificato",
    battiscopa_presente: false,
    ...analisi,
  };

  const tipo = (config.tipo as string) || "gres_porcellanato";
  const finitura = (config.finitura as string) || "opaco";
  const pattern = (config.pattern_posa as string) || "a_correre";

  let colorDesc = (config.colore_nome as string) || "grigio chiaro";
  if (config.colore_hex) colorDesc += ` (hex: ${config.colore_hex})`;
  if (config.colore_ral) colorDesc += ` (RAL ${config.colore_ral})`;

  let formatoDesc = "";
  if (config.formato_piastrella) formatoDesc = `\nTile format: ${config.formato_piastrella} cm`;
  if (config.larghezza_listello_mm && config.lunghezza_listello_mm) {
    formatoDesc += `\nPlank dimensions: ${config.larghezza_listello_mm}mm x ${config.lunghezza_listello_mm}mm`;
  }

  let fugaDesc = "";
  if (config.fuga_larghezza_mm != null) {
    const fugaColore = FUGA_COLORE_DESC[config.fuga_colore as string] || "standard grout";
    if (Number(config.fuga_larghezza_mm) === 0) {
      fugaDesc = "\nGrout: NONE — seamless joint";
    } else {
      fugaDesc = `\nGrout width: ${config.fuga_larghezza_mm}mm, Color: ${fugaColore}`;
    }
  }

  // Battiscopa
  const batt = config.battiscopa as Record<string, unknown> | undefined;
  let battiscopaBlock = "";
  if (batt) {
    if (batt.azione === "rimuovi") {
      battiscopaBlock = "\n\n[BATTISCOPA — REMOVE]\nRemove all baseboard. Show clean wall-to-floor junction.";
    } else if (batt.azione === "sostituisci" && batt.tipo) {
      const desc = BATTISCOPA_DESC[batt.tipo as string] || String(batt.tipo);
      const h = batt.altezza_cm || 8;
      battiscopaBlock = `\n\n[BATTISCOPA — REPLACE]\nReplace with: ${desc}, Height: ${h}cm. Must run along ALL visible wall-floor junctions.`;
    } else {
      battiscopaBlock = "\n\n[BATTISCOPA — KEEP]\nKeep existing baseboard exactly as-is.";
    }
  }

  const systemPrompt = `You are a SURGICAL PHOTOREALISTIC IMAGE EDITOR specialized in floor replacement for architectural visualization. Your ONLY task: replace EXACTLY the floor surface in the photograph with the specified new flooring material, while leaving EVERYTHING ELSE 100% pixel-perfect identical.

CRITICAL FLOOR RENDERING RULES:
1. The new floor MUST cover the ENTIRE visible floor area — no gaps, no patches of old floor.
2. Floor perspective MUST be geometrically correct — tiles/planks converge toward the room's vanishing points.
3. The laying pattern MUST be consistent and accurate across the whole surface.
4. Reflections on the new floor must match the room's existing light sources.
5. Where furniture touches the floor, render correct contact shadows.
6. Grout lines and joints must follow correct perspective diminution.
7. Material texture must be photorealistic — not flat, not cartoonish.
8. Floor edges at walls must be clean and precise.
9. Output image dimensions MUST match input image dimensions exactly.
10. This is PRECISE SURGICAL REPLACEMENT — do NOT artistically reinterpret the room.`;

  const userPrompt = `[CONTESTO — ROOM ANALYSIS]
Room type: ${a.tipo_stanza}
Current floor: ${a.pavimento_attuale} (${a.colore_attuale})
Estimated size: ${a.dimensione_stimata}
Condition: ${a.stato_conservazione}
Baseboard present: ${a.battiscopa_presente ? "YES" : "NO"}

[NEW FLOOR SPECIFICATION]
Material: ${FLOOR_PHYSICS[tipo] || tipo}
Finish: ${FINITURA_DESC[finitura] || finitura}
Color: ${colorDesc}
Laying pattern: ${POSA_PHYSICS[pattern] || pattern}${formatoDesc}${fugaDesc}

PATTERN RULES:
- Pattern MUST be geometrically accurate across ENTIRE floor
- Perspective must follow room vanishing points
- Joints must be consistently spaced
- If seamless material (cemento_resina, moquette), NO tile joints or grout${battiscopaBlock}

[PRESERVATION — ABSOLUTE RULES]
The following MUST remain 100% pixel-identical:
- ALL walls, ceiling, furniture, appliances, objects
- ALL doors, door frames, windows, window frames
- ALL lighting conditions, shadows, ambient light
- Camera perspective and lens distortion
- Any visible pipes, cables, outlets, radiators
- Objects on the floor must appear naturally on the NEW surface with correct shadows

NEVER:
- Change any wall color or decoration
- Move, remove, or add any furniture
- Alter the ceiling
- Change any window or door
- Add/remove any architectural element not floor-related
- Produce cartoon/illustration/CGI artifacts
- Add watermarks or text
- Change camera angle or image dimensions
- Show old floor anywhere
${config.note_libere ? `\n[ADDITIONAL NOTES]\n${config.note_libere}` : ""}

[FINAL CHECKLIST]
- New floor covers 100% of visible floor area
- Laying pattern is geometrically correct in perspective
- Floor color and material match specification
- ALL walls, ceiling, furniture UNCHANGED
- Image dimensions match original exactly`;

  return { systemPrompt, userPrompt, promptVersion: "1.0.0" };
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  try {
    // ── Auth ────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "missing_auth", message: "Authorization header required" }),
        { status: 401, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: "invalid_auth", message: "Invalid or expired token" }),
        { status: 401, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // ── Parse request ───────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { action, session_id, config, image_url, target_width, target_height } = body as {
      action?: string;
      session_id?: string;
      config?: Record<string, unknown>;
      image_url?: string;
      target_width?: number;
      target_height?: number;
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
      const imgB64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));

      const analyzePrompt = `Analyze this interior photograph and identify the floor. Return a JSON object with exactly these fields:
{
  "tipo_stanza": "type of room (cucina, soggiorno, bagno, camera, corridoio, ufficio, etc.)",
  "pavimento_attuale": "current floor material (parquet, piastrelle, marmo, moquette, etc.)",
  "colore_attuale": "current floor color description",
  "dimensione_stimata": "estimated room size",
  "stato_conservazione": "floor condition (buono, discreto, da ristrutturare)",
  "battiscopa_presente": true/false,
  "note": "any additional observations about the floor"
}
Return ONLY the JSON, no other text.`;

      const geminiBody = {
        contents: [{
          parts: [
            { text: analyzePrompt },
            { inline_data: { mime_type: "image/jpeg", data: imgB64 } },
          ],
        }],
        generationConfig: { temperature: 0.3 },
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
        } catch (_) {
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
    const sessionForPrompt = {
      ...session,
      config: activeConfig,
    } as Record<string, unknown>;

    const { systemPrompt, userPrompt, promptVersion } = buildFloorPrompt(sessionForPrompt);
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
        form.append("prompt", userPrompt);
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
        prompt_used: userPrompt,
        prompt_version: promptVersion,
        prompt_char_count: (systemPrompt + userPrompt).length,
        provider_key: providerConfig.provider_key,
        cost_real: costReal,
        cost_billed: costBilled,
        config_snapshot: activeConfig,
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
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } }
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-floor-render] error:", msg);

    try {
      const body2 = await req.clone().json().catch(() => ({}));
      const sid = (body2 as { session_id?: string }).session_id;
      if (sid) {
        await supabase
          .from("render_pavimento_sessions")
          .update({
            status: "failed",
            error_message: msg.substring(0, 500),
            processing_completed_at: new Date().toISOString(),
          })
          .eq("id", sid);
      }
    } catch (_) { /* best-effort */ }

    return new Response(
      JSON.stringify({ error: "internal_error", message: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
