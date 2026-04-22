// generate-bathroom-render — Edge Function EiC
// Render Bagno AI — Multi-Provider (OpenAI / Gemini)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";
import { captureRealCost } from "../_shared/renderCost.ts";
import { pickProviderSize } from "../_shared/renderImage.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

type BathroomSessionRow = {
  id: string;
  company_id: string;
  foto_originale_path: string | null;
  configurazione: Record<string, unknown> | null;
  analisi_bagno: Record<string, unknown> | null;
  tipo_intervento: string | null;
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
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

async function getGeminiApiKey(
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  return await getProviderApiKey(supabase, "gemini");
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

async function remoteImageUrlToDataUrl(url: string): Promise<string> {
  const resp = await fetchWithTimeout(url, {}, 30_000);
  if (!resp.ok) {
    throw new Error(`Impossibile scaricare il risultato del provider (${resp.status})`);
  }

  const mimeType = (resp.headers.get("content-type") || "image/png").split(";")[0] || "image/png";
  const buffer = await resp.arrayBuffer();
  return `data:${mimeType};base64,${arrayBufferToBase64(buffer)}`;
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

function orientationFromDimensions(width: number, height: number): "portrait" | "landscape" | "square" {
  if (width === height) return "square";
  return width > height ? "landscape" : "portrait";
}

function describeFormatLock(width?: number | null, height?: number | null): {
  text: string;
  orientation: "portrait" | "landscape" | "square" | null;
} {
  if (!width || !height || width <= 0 || height <= 0) {
    return {
      text: "Keep exactly the same crop, orientation, visible room coverage, and aspect ratio as the source image.",
      orientation: null,
    };
  }

  const orientation = orientationFromDimensions(width, height);
  const orientationLabel =
    orientation === "portrait" ? "portrait / vertical" :
    orientation === "landscape" ? "landscape / horizontal" :
    "square";

  return {
    text: `Source image size is ${width}x${height}px (${orientationLabel}). Output MUST remain ${orientationLabel} with the same framing, visible wall/floor coverage, camera distance, and aspect ratio ${width}:${height}.`,
    orientation,
  };
}

function describeFormatMismatch(
  expected: { width: number; height: number } | null,
  actual: { width: number; height: number } | null,
): string | null {
  if (!expected || !actual) return null;

  const expectedOrientation = orientationFromDimensions(expected.width, expected.height);
  const actualOrientation = orientationFromDimensions(actual.width, actual.height);
  if (expectedOrientation !== actualOrientation && expectedOrientation !== "square") {
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

function extractTextParts(payload: Record<string, unknown>): string {
  const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
  const texts: string[] = [];

  for (const candidate of candidates) {
    const parts = (candidate as { content?: { parts?: Array<Record<string, unknown>> } }).content?.parts ?? [];
    for (const part of parts) {
      if (typeof part.text === "string" && part.text.trim()) {
        texts.push(part.text.trim());
      }
    }
  }

  return texts.join("\n");
}

function extractFirstJsonObject(rawText: string): Record<string, unknown> | null {
  const clean = rawText
    .replace(/```json\s*/gi, "")
    .replace(/```/g, "")
    .trim();

  if (!clean) return null;

  const match = clean.match(/\{[\s\S]*\}/);
  if (!match) return null;

  try {
    const parsed = JSON.parse(match[0]);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function stringOrDefault(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function booleanOrDefault(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "si", "sì", "yes", "1"].includes(normalized)) return true;
    if (["false", "no", "0"].includes(normalized)) return false;
  }
  if (typeof value === "number") return value !== 0;
  return fallback;
}

function normalizeConservation(value: unknown): "buono" | "discreto" | "da_ristrutturare" {
  const normalized = typeof value === "string"
    ? value.trim().toLowerCase().replace(/\s+/g, "_")
    : "";

  if (normalized === "buono") return "buono";
  if (normalized === "da_ristrutturare") return "da_ristrutturare";
  return "discreto";
}

function sanitizeBathroomAnalysis(input: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const source = input ?? {};
  const colors = Array.isArray(source.colori_dominanti)
    ? source.colori_dominanti.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  return {
    tipo_stanza: stringOrDefault(source.tipo_stanza, "bagno"),
    dimensione_stimata: stringOrDefault(source.dimensione_stimata, "dimensione non identificata"),
    altezza_stimata: stringOrDefault(source.altezza_stimata, "altezza non identificata"),
    piastrelle_parete_attuali: stringOrDefault(source.piastrelle_parete_attuali, "non identificabili"),
    pavimento_attuale: stringOrDefault(source.pavimento_attuale, "non identificabile"),
    colori_dominanti: colors.slice(0, 8),
    presenza_doccia: booleanOrDefault(source.presenza_doccia, false),
    tipo_doccia: stringOrUndefined(source.tipo_doccia),
    presenza_vasca: booleanOrDefault(source.presenza_vasca, false),
    presenza_mobile: booleanOrDefault(source.presenza_mobile, false),
    tipo_mobile: stringOrUndefined(source.tipo_mobile),
    sanitari_tipo: stringOrUndefined(source.sanitari_tipo),
    rubinetteria_attuale: stringOrUndefined(source.rubinetteria_attuale),
    illuminazione_attuale: stringOrUndefined(source.illuminazione_attuale),
    stato_conservazione: normalizeConservation(source.stato_conservazione),
    note: stringOrUndefined(source.note),
  };
}

function extractGeneratedImageData(aiData: Record<string, unknown>): string | null {
  const choices = Array.isArray(aiData.choices) ? aiData.choices : [];

  for (const choice of choices) {
    const content = (choice as { message?: { content?: unknown } }).message?.content;

    if (typeof content === "string" && content.startsWith("data:image/")) {
      return content;
    }

    if (Array.isArray(content)) {
      for (const part of content) {
        const typedPart = part as {
          type?: string;
          image_url?: { url?: string };
          source?: { media_type?: string; data?: string };
          b64_json?: string;
        };

        if (typedPart.type === "image_url" && typedPart.image_url?.url) {
          return typedPart.image_url.url;
        }

        if (typedPart.type === "image" && typedPart.source?.data) {
          return `data:${typedPart.source.media_type || "image/png"};base64,${typedPart.source.data}`;
        }

        if (typedPart.b64_json) {
          return `data:image/png;base64,${typedPart.b64_json}`;
        }
      }
    }
  }

  const candidates = Array.isArray(aiData.candidates) ? aiData.candidates : [];
  for (const candidate of candidates) {
    const parts = (candidate as { content?: { parts?: Array<Record<string, unknown>> } }).content?.parts ?? [];
    for (const part of parts) {
      const inlineData = part.inlineData as { mimeType?: string; data?: string } | undefined;
      if (inlineData?.mimeType?.startsWith("image/") && inlineData.data) {
        return `data:${inlineData.mimeType};base64,${inlineData.data}`;
      }
    }
  }

  const dataItems = Array.isArray(aiData.data) ? aiData.data : [];
  for (const item of dataItems) {
    const b64Json = (item as { b64_json?: string }).b64_json;
    if (typeof b64Json === "string" && b64Json) {
      return `data:image/png;base64,${b64Json}`;
    }
  }

  return null;
}

async function loadBathroomSession(
  supabase: ReturnType<typeof createClient>,
  sessionId: string,
): Promise<BathroomSessionRow | null> {
  const { data: session } = await supabase
    .from("render_bagno_sessions")
    .select("id, company_id, foto_originale_path, configurazione, analisi_bagno, tipo_intervento")
    .eq("id", sessionId)
    .maybeSingle();

  return session as BathroomSessionRow | null;
}

// Inline prompt builder to keep Edge self-contained.
function buildBathroomPromptServer(session: Record<string, unknown>): {
  systemPrompt: string;
  userPrompt: string;
  promptVersion: string;
}
function buildBathroomPromptServer(
  session: Record<string, unknown>,
  imageLock?: { width?: number | null; height?: number | null },
): {
  systemPrompt: string;
  userPrompt: string;
  promptVersion: string;
} {
  const config = (session.configurazione || session.config || {}) as Record<string, unknown>;
  const analisi = (session.analisi_bagno || {}) as Record<string, unknown>;

  const tipoIntervento = (config.tipo_intervento as string) || "restyling_completo";
  const sost = (config.sostituzione || {}) as Record<string, boolean>;
  const notes = (config.note_libere as string) || "";

  const getSection = (key: string) => (config[key] || {}) as Record<string, unknown>;

  const pp = getSection("piastrelle_parete");
  const pv = getSection("pavimento");
  const doccia = getSection("doccia");
  const vasca = getSection("vasca");
  const vanity = getSection("vanity");
  const sanitari = getSection("sanitari");
  const rubinetteria = getSection("rubinetteria");
  const parete = getSection("parete");
  const formatLock = describeFormatLock(imageLock?.width, imageLock?.height);

  const effectDescriptions: Record<string, string> = {
    marmo_carrara: "Carrara marble, soft white base with elegant grey veining, polished luxury finish",
    marmo_calacatta: "Calacatta marble, warm white base with bold gold-grey veining, premium statement look",
    marmo_sahara_noir: "Sahara Noir marble, deep black polished marble with dramatic gold veining",
    marmo_marquinia: "Nero Marquinia marble, black polished stone with crisp white veins",
    marmo_verde_guatemala: "Verde Guatemala marble, deep emerald green stone with natural veining",
    marmo_statuario: "Statuario marble, bright white slab with sweeping grey veining, very high-end look",
    marmo_emperador: "Emperador marble, rich brown marble with warm cream veining",
    cemento_grigio: "grey cement-effect porcelain, matte and contemporary",
    cemento_bianco: "white cement-effect porcelain, soft matte and luminous",
    cemento_antracite: "anthracite cement-effect porcelain, dark matte minimal look",
    legno_rovere_chiaro: "light oak wood-effect surface with realistic linear grain",
    legno_rovere_scuro: "dark oak wood-effect surface with richer warm grain",
    legno_wenge: "wenge dark wood-effect surface, dense grain and deep tone",
    ardesia: "slate stone effect, dark layered texture with subtle relief",
    travertino: "travertine stone effect, warm beige limestone with gentle movement",
    basalto: "basalt stone effect, compact volcanic dark stone look",
    mono_bianco: "solid monochrome white finish, uniform and clean",
    mono_nero: "solid monochrome black finish, deep and graphic",
    mono_grigio: "solid monochrome grey finish, neutral and modern",
    mono_verde_salvia: "solid sage-green finish, soft premium spa feeling",
    mono_blu_navy: "solid navy-blue finish, dramatic and elegant",
    mono_terracotta: "solid terracotta finish, warm Mediterranean character",
    mono_greige: "solid greige finish, refined warm neutral",
    mosaico_esagoni: "hexagonal mosaic with visible geometric grout grid",
    mosaico_penny: "penny mosaic with small round modules and clear grout rhythm",
    zellige: "handmade zellige ceramic with glossy irregular artisanal surface",
    cotto_toscano: "Tuscan cotto effect with warm earthy handcrafted tone",
    resina_spatolata: "continuous troweled resin surface with no visible joints",
    pietra_ardesia: "split-face slate wall texture with strong depth and relief",
  };

  const posaDescriptions: Record<string, string> = {
    dritta: "straight aligned grid layout",
    sfalsata: "running bond / offset layout",
    diagonale: "45-degree diagonal layout",
    spina_pesce: "herringbone layout",
    spina_ungherese: "Hungarian herringbone layout",
    chevron: "chevron layout",
    casuale: "mixed irregular layout",
  };

  const vanityTopDescriptions: Record<string, string> = {
    marmo_bianco: "white marble countertop with visible natural veining",
    marmo_nero: "black marble countertop with strong contrast veining",
    quarzo: "engineered quartz countertop, refined and uniform",
    legno: "sealed wood countertop with warm grain",
    ceramica: "ceramic countertop, clean and smooth glazed surface",
  };

  const faucetFinishDescriptions: Record<string, string> = {
    cromo: "polished chrome mirror finish",
    nero_opaco: "matte black powder-coated finish",
    oro_spazzolato: "brushed warm gold finish",
    oro_rosa: "rose gold satin metallic finish",
    acciaio_spazzolato: "brushed stainless steel finish",
  };

  const systemPrompt = `You are a SURGICAL PHOTOREALISTIC IMAGE EDITOR specialized in bathroom renovation visualization. Your only task is to replace exactly the requested bathroom elements while leaving everything else identical to the original photo.

NON-NEGOTIABLE RULES:
1. Keep the same camera angle, lens, room proportions, lighting direction, and framing.
2. Keep all non-selected elements pixel-consistent with the source photo.
3. Preserve the exact environment: walls not selected for edit, windows, doors, ceiling, accessories, reflections, shadows, and perspective.
4. ${formatLock.text}
5. The result must be the SAME real bathroom after renovation, not a different bathroom inspired by it.
6. Never zoom in, zoom out, widen the room, move wall corners, or reduce/enlarge visible floor and ceiling coverage.
7. Materials must look physically real: tile joints, reflections, grout, ceramic, glass, metal, and stone must behave correctly.
8. Never invent extra furniture, decor, or architectural changes not explicitly requested.
9. Never produce CGI, illustration, or stylized output. The image must look like a real bathroom photograph after renovation.`;

  const blocks: string[] = [];

  blocks.push(`[EXISTING BATHROOM]
Room: ${analisi.tipo_stanza || "bathroom"}
Estimated size: ${analisi.dimensione_stimata || "unknown"}
Estimated ceiling height: ${analisi.altezza_stimata || "unknown"}
Current wall tiles: ${analisi.piastrelle_parete_attuali || "unknown"}
Current floor: ${analisi.pavimento_attuale || "unknown"}
Dominant colors: ${Array.isArray(analisi.colori_dominanti) && analisi.colori_dominanti.length > 0 ? analisi.colori_dominanti.join(", ") : "unknown"}
Shower: ${analisi.presenza_doccia ? `YES${analisi.tipo_doccia ? ` — ${analisi.tipo_doccia}` : ""}` : "NO"}
Bathtub: ${analisi.presenza_vasca ? "YES" : "NO"}
Vanity: ${analisi.presenza_mobile ? `YES${analisi.tipo_mobile ? ` — ${analisi.tipo_mobile}` : ""}` : "NO"}
Sanitary type: ${analisi.sanitari_tipo || "unknown"}
Current faucets: ${analisi.rubinetteria_attuale || "unknown"}
Lighting: ${analisi.illuminazione_attuale || "unknown"}
Conservation: ${analisi.stato_conservazione || "unknown"}
${analisi.note ? `Notes: ${analisi.note}` : ""}`);

  blocks.push(`[FORMAT LOCK]
${formatLock.text}
Keep the same visible bathroom coverage in frame: same amount of floor, side walls, ceiling, shower zone, vanity zone, and sanitary positions unless replacement was explicitly requested.
Do NOT shrink the bathroom inside the frame, do NOT add empty margins, and do NOT crop any side differently from the source.`);

  const interventionLabels: Record<string, string> = {
    restyling_piastrelle: "Tile restyling only",
    restyling_completo: "Complete restyling — tiles + fixtures + furniture",
    demolizione_parziale: "Partial demolition — structural changes to selected elements",
    demolizione_completa: "Complete demolition and rebuild",
  };
  blocks.push(`[INTERVENTION]
${interventionLabels[tipoIntervento] || tipoIntervento}`);

  const manifest: string[] = ["[REPLACEMENT MANIFEST]"];
  manifest.push(`Wall tiles: ${sost.piastrelle_parete ? "REPLACE" : "KEEP"}`);
  manifest.push(`Floor: ${sost.pavimento ? "REPLACE" : "KEEP"}`);
  manifest.push(`Shower: ${sost.doccia ? "REPLACE" : "KEEP"}`);
  manifest.push(`Bathtub: ${sost.vasca ? "REPLACE" : "KEEP"}`);
  manifest.push(`Vanity: ${sost.mobile_bagno ? "REPLACE" : "KEEP"}`);
  manifest.push(`Toilet/Bidet: ${sost.sanitari ? "REPLACE" : "KEEP"}`);
  manifest.push(`Faucets: ${sost.rubinetteria ? "REPLACE" : "KEEP"}`);
  manifest.push(`Non-tiled walls: ${sost.parete_colore ? "REPAINT/RECLAD" : "KEEP"}`);
  blocks.push(manifest.join("\n"));

  if (sost.piastrelle_parete && pp.attivo) {
    blocks.push(`[NEW WALL TILES]
Effect: ${effectDescriptions[String(pp.effetto)] || pp.effetto}
Format: ${pp.formato}
Laying pattern: ${posaDescriptions[String(pp.posa)] || pp.posa}
Grout color: ${pp.fuga_colore}
Coverage height: ${pp.altezza_rivestimento || "full height"}`);
  }

  if (sost.pavimento && pv.attivo) {
    blocks.push(`[NEW FLOOR]
Effect: ${effectDescriptions[String(pv.effetto)] || pv.effetto}
Format: ${pv.formato}
Laying pattern: ${posaDescriptions[String(pv.posa)] || pv.posa}
Grout color: ${pv.fuga_colore}`);
  }

  if (sost.doccia && doccia.attivo) {
    blocks.push(`[NEW SHOWER]
Type: ${doccia.tipo}
Glass: ${doccia.box_vetro}
Tray: ${doccia.piatto}
Profile: ${doccia.profilo}
Shower head: ${doccia.soffione}`);
  }

  if (sost.vasca && vasca.attivo) {
    blocks.push(`[NEW BATHTUB]
Type: ${vasca.tipo}
Material: ${vasca.materiale}
Faucet: ${vasca.rubinetteria_vasca}`);
  }

  if (sost.mobile_bagno && vanity.attivo) {
    blocks.push(`[NEW VANITY]
Style: ${vanity.stile}
Color: ${vanity.colore}
Countertop: ${vanityTopDescriptions[String(vanity.piano)] || vanity.piano}
Basin: ${vanity.lavabo}
Width: ${vanity.larghezza_cm}cm`);
  }

  if (sost.sanitari && sanitari.attivo) {
    blocks.push(`[NEW SANITARY ELEMENTS]
WC: ${sanitari.azione_wc === "mantieni" ? "KEEP" : sanitari.tipo_wc}
Bidet: ${sanitari.azione_bidet === "rimuovi" ? "REMOVE" : sanitari.azione_bidet === "mantieni" ? "KEEP" : sanitari.tipo_bidet}
Color: ${sanitari.colore}`);
  }

  if (sost.rubinetteria && rubinetteria.attivo) {
    blocks.push(`[NEW FAUCETS]
Finish: ${faucetFinishDescriptions[String(rubinetteria.finitura)] || rubinetteria.finitura}
Style: ${rubinetteria.stile}
All visible faucets and shower fittings must share this finish.`);
  }

  if (sost.parete_colore && parete.attivo) {
    blocks.push(`[NON-TILED WALLS]
Action: ${parete.azione}
Color: ${parete.colore_hex || "keep current"}`);
  }

  blocks.push(`[ABSOLUTE PRESERVATION]
Keep room geometry, camera perspective, lighting, reflections, and all untouched elements consistent with the original.
Do not widen the room, do not move sanitary positions unless the intervention explicitly requires replacement, and do not change doors, windows, ceiling, or decorative accessories.
Do not alter image orientation, aspect ratio, or perceived camera distance.`);

  if (notes) {
    blocks.push(`[ADDITIONAL NOTES]
${notes}`);
  }

  return {
    systemPrompt,
    userPrompt: blocks.join("\n\n"),
    promptVersion: "1.2.0",
  };
}

async function requestBathroomRender(params: {
  providerConfig: RenderProviderConfig;
  apiKey: string;
  systemPrompt: string;
  userPrompt: string;
  originalImage: { mimeType: string; base64: string; bytes: Uint8Array };
  targetWidth?: number | null;
  targetHeight?: number | null;
  strictNote?: string;
}): Promise<{ dataUrl: string; aiData: Record<string, unknown>; modelUsed: string }> {
  const promptText = params.strictNote
    ? `${params.systemPrompt}\n\n${params.userPrompt}\n\n${params.strictNote}`
    : `${params.systemPrompt}\n\n${params.userPrompt}`;

  if (params.providerConfig.provider_key === "openai") {
    const renderSize = pickProviderSize(
      params.targetWidth ?? null,
      params.targetHeight ?? null,
      "openai",
    ) ?? "1024x1024";
    const imageBlob = new Blob([params.originalImage.bytes], {
      type: params.originalImage.mimeType || "image/jpeg",
    });
    const modelChain = [params.providerConfig.model || "gpt-image-1"];
    if (modelChain[0] !== "dall-e-2") modelChain.push("dall-e-2");

    const buildForm = (modelName: string) => {
      const form = new FormData();
      form.append("model", modelName);
      form.append("prompt", promptText);
      if (modelName === "dall-e-2") {
        form.append("image", imageBlob, "bathroom.png");
        form.append("size", "1024x1024");
        form.append("response_format", "b64_json");
      } else {
        form.append("image[]", imageBlob, "bathroom.jpg");
        form.append("size", renderSize);
        if (params.providerConfig.quality) {
          form.append("quality", params.providerConfig.quality);
        }
      }
      form.append("n", "1");
      return form;
    };

    let openAiResp: Response | null = null;
    let lastErr = "";
    let modelUsed = modelChain[0];

    for (const modelName of modelChain) {
      const resp = await fetchWithRetry(
        params.providerConfig.api_endpoint || "https://api.openai.com/v1/images/edits",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${params.apiKey}` },
          body: buildForm(modelName),
        },
        2,
        2000,
        120_000,
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

    const aiData = await openAiResp.json() as Record<string, unknown>;
    let dataUrl = extractGeneratedImageData(aiData);
    if (!dataUrl) {
      const remoteUrl = (aiData.data as Array<{ url?: string }> | undefined)?.[0]?.url;
      if (remoteUrl) {
        dataUrl = await remoteImageUrlToDataUrl(remoteUrl);
      }
    }

    if (!dataUrl) {
      throw new Error("Nessuna immagine ricevuta da OpenAI");
    }

    return {
      dataUrl,
      aiData: { ...aiData, _model_used: modelUsed },
      modelUsed,
    };
  }

  if (params.providerConfig.provider_key !== "gemini") {
    throw new Error(
      `Provider '${params.providerConfig.provider_key}' non supportato. Selezionare OpenAI o Gemini.`,
    );
  }

  const geminiBody = {
    contents: [{
      parts: [
        { text: promptText },
        {
          inline_data: {
            mime_type: params.originalImage.mimeType,
            data: params.originalImage.base64,
          },
        },
      ],
    }],
    generationConfig: {
      responseModalities: ["TEXT", "IMAGE"],
      temperature: 0.7,
    },
  };

  const geminiUrl = `${params.providerConfig.api_endpoint}/${params.providerConfig.model}:generateContent?key=${params.apiKey}`;
  const aiResp = await fetchWithRetry(
    geminiUrl,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(geminiBody),
    },
    2,
    2000,
    120_000,
  );

  if (!aiResp.ok) {
    const errText = await aiResp.text();
    throw new Error(`Gemini render error ${aiResp.status}: ${errText.substring(0, 300)}`);
  }

  const aiData = await aiResp.json() as Record<string, unknown>;
  const dataUrl = extractGeneratedImageData(aiData);

  if (!dataUrl) {
    const providerText = extractTextParts(aiData);
    throw new Error(
      providerText
        ? `Il provider non ha restituito un'immagine renderizzabile: ${providerText.substring(0, 240)}`
        : "Nessuna immagine ricevuta dal provider AI",
    );
  }

  return {
    dataUrl,
    aiData,
    modelUsed: params.providerConfig.model,
  };
}

async function runBathroomAnalysis(params: {
  supabase: ReturnType<typeof createClient>;
  userId: string;
  imageUrl: string;
  sessionId?: string;
}): Promise<Record<string, unknown>> {
  const { supabase, userId, imageUrl, sessionId } = params;

  if (sessionId) {
    const session = await loadBathroomSession(supabase, sessionId);
    if (!session) {
      throw new Error("Sessione render bagno non trovata");
    }

    const allowed = await canAccessCompany(supabase, userId, session.company_id);
    if (!allowed) {
      throw new Error("Accesso negato alla sessione render bagno");
    }

    await supabase
      .from("render_bagno_sessions")
      .update({ stato: "analyzing" })
      .eq("id", sessionId);
  }

  const geminiApiKey = await getGeminiApiKey(supabase);
  if (!geminiApiKey) {
    throw new Error("Gemini API key non configurata per il render bagno");
  }

  const { mimeType, base64 } = await downloadImageAsInlineData(imageUrl);
  const analyzePrompt = `Analyze this bathroom photo and return ONLY one JSON object with exactly these fields:
{
  "tipo_stanza": "string",
  "dimensione_stimata": "string",
  "altezza_stimata": "string",
  "piastrelle_parete_attuali": "string",
  "pavimento_attuale": "string",
  "colori_dominanti": ["string"],
  "presenza_doccia": true,
  "tipo_doccia": "string or null",
  "presenza_vasca": false,
  "presenza_mobile": true,
  "tipo_mobile": "string or null",
  "sanitari_tipo": "string or null",
  "rubinetteria_attuale": "string or null",
  "illuminazione_attuale": "string or null",
  "stato_conservazione": "buono|discreto|da_ristrutturare",
  "note": "string"
}

Rules:
- The room is a bathroom or bathroom-adjacent wet room.
- Be concrete and visually grounded.
- If uncertain, use short safe strings like "non identificabile".
- Return ONLY raw JSON, no markdown.`;

  const geminiBody = {
    contents: [{
      parts: [
        { text: analyzePrompt },
        { inline_data: { mime_type: mimeType, data: base64 } },
      ],
    }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 1200,
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
    throw new Error(`Analisi AI fallita (${resp.status}): ${errText.substring(0, 300)}`);
  }

  const geminiData = await resp.json() as Record<string, unknown>;
  const rawText = extractTextParts(geminiData);
  const analysis = sanitizeBathroomAnalysis(extractFirstJsonObject(rawText));

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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse(
        { error: "missing_auth", message: "Authorization header required" },
        401,
      );
    }

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );

    if (authErr || !user) {
      return jsonResponse(
        { error: "invalid_auth", message: "Invalid or expired token" },
        401,
      );
    }

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
          { error: "validation_error", message: "image_url is required for analyze" },
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
          provider: "gemini",
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

    const session = await loadBathroomSession(supabase, session_id);
    if (!session) {
      return jsonResponse(
        { error: "not_found", message: "Sessione non trovata" },
        404,
      );
    }

    const allowed = await canAccessCompany(supabase, user.id, session.company_id);
    if (!allowed) {
      return jsonResponse(
        { error: "forbidden", message: "Accesso negato alla sessione render bagno" },
        403,
      );
    }

    const deductResult = await deductRenderCreditSafe(supabase, {
      companyId: session.company_id,
      sessionId: session_id,
      userId: user.id,
      reasonMeta: { vertical: "bagno", edge_fn: "generate-bathroom-render" },
      logTag: "generate-bathroom-render",
    });

    if (deductResult.status === "insufficient") {
      return jsonResponse(
        { error: "insufficient_credits", message: "Crediti render insufficienti" },
        402,
      );
    }

    const { providerConfig, apiKey } = await loadRenderProviderWithKey(supabase);

    await supabase
      .from("render_bagno_sessions")
      .update({
        stato: "processing",
        processing_started_at: new Date().toISOString(),
        provider_key: providerConfig.provider_key,
      })
      .eq("id", session_id);

    const originalPath = session.foto_originale_path;
    if (!originalPath) {
      throw new Error("Foto originale della sessione mancante");
    }

    let imageUrl = originalPath;
    if (!originalPath.startsWith("http")) {
      const { data: signed, error: signedErr } = await supabase.storage
        .from("bagno-originals")
        .createSignedUrl(originalPath, 600);

      if (signedErr || !signed?.signedUrl) {
        throw new Error(`Signed URL originale non disponibile: ${signedErr?.message || "missing signed url"}`);
      }

      imageUrl = signed.signedUrl;
    }

    const originalImage = await downloadImageAsInlineData(imageUrl);
    const sourceDimensions =
      Number.isFinite(Number(target_width)) && Number.isFinite(Number(target_height)) &&
      Number(target_width) > 0 && Number(target_height) > 0
        ? { width: Number(target_width), height: Number(target_height) }
        : detectImageDimensions(originalImage.bytes);

    const { systemPrompt, userPrompt, promptVersion } = buildBathroomPromptServer(
      {
        ...session,
        configurazione: session.configurazione || {},
        analisi_bagno: session.analisi_bagno || {},
      },
      sourceDimensions ?? undefined,
    );

    let renderResult = await requestBathroomRender({
      providerConfig,
      apiKey,
      systemPrompt,
      userPrompt,
      originalImage,
      targetWidth: sourceDimensions?.width ?? null,
      targetHeight: sourceDimensions?.height ?? null,
    });

    let uploadPayload = dataUrlToBytes(renderResult.dataUrl);
    const firstAttemptDimensions = detectImageDimensions(uploadPayload.bytes);
    const firstMismatch = describeFormatMismatch(sourceDimensions ?? null, firstAttemptDimensions);

    if (firstMismatch) {
      renderResult = await requestBathroomRender({
        providerConfig,
        apiKey,
        systemPrompt,
        userPrompt,
        originalImage,
        targetWidth: sourceDimensions?.width ?? null,
        targetHeight: sourceDimensions?.height ?? null,
        strictNote: `[FORMAT CORRECTION]
The previous attempt was not acceptable because of ${firstMismatch}.
Regenerate the image keeping EXACT same orientation, framing, crop, visible room size, and apparent camera distance as the source photo.
The bathroom must occupy the same image area as the source. No zooming out, no zooming in, no padding, no crop change.`,
      });
      uploadPayload = dataUrlToBytes(renderResult.dataUrl);
    }

    const resultPath = `${session.company_id}/${session_id}/render_bagno_${Date.now()}.${uploadPayload.extension}`;

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
    const modelUsed = renderResult.modelUsed || providerConfig.model;
    const legacyCostReal = Number(providerConfig.cost_real_per_render ?? 0.04);
    const capture = await captureRealCost({
      supabase,
      providerKey: providerConfig.provider_key,
      model: modelUsed,
      rawResponse: renderResult.aiData,
      legacyFallbackEur: legacyCostReal,
    });
    const costReal = capture.cost_eur;
    const costBilled = Number(providerConfig.cost_billed_per_render ?? 0.10);

    await supabase
      .from("render_bagno_sessions")
      .update({
        stato: "completato",
        render_result_path: resultPath,
        render_result_url: resultUrl,
        prompt_usato: userPrompt,
        prompt_version: promptVersion,
        provider_key: providerConfig.provider_key,
        model_used: modelUsed,
        cost_real: costReal,
        cost_billed: costBilled,
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
      provider: providerConfig.provider_key,
      prompt_version: promptVersion,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[generate-bathroom-render] error:", message);

    try {
      const body = await req.clone().json().catch(() => ({}));
      const sid = (body as { session_id?: string }).session_id;

      if (sid) {
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
