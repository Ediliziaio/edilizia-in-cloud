// generate-bathroom-render — Edge Function EiC
// Render Bagno AI — Gemini direct (analysis + generation)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";

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

async function getGeminiApiKey(
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  const { data: keyRow } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", "render_gemini_api_key")
    .maybeSingle();

  return (
    (keyRow as { value?: string } | null)?.value?.trim() ||
    Deno.env.get("RENDER_GEMINI_API_KEY")?.trim() ||
    Deno.env.get("GEMINI_API_KEY")?.trim() ||
    Deno.env.get("GOOGLE_AI_API_KEY")?.trim() ||
    ""
  );
}

async function downloadImageAsInlineData(imageUrl: string): Promise<{
  mimeType: string;
  base64: string;
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
  };
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

  const systemPrompt = `You are a SURGICAL PHOTOREALISTIC IMAGE EDITOR specialized in bathroom renovation visualization. Your only task is to replace exactly the requested bathroom elements while leaving everything else identical to the original photo.

NON-NEGOTIABLE RULES:
1. Keep the same camera angle, lens, room proportions, lighting direction, and framing.
2. Keep all non-selected elements pixel-consistent with the source photo.
3. Preserve the exact environment: walls not selected for edit, windows, doors, ceiling, accessories, reflections, shadows, and perspective.
4. The output must keep the same overall composition and aspect ratio as the input image.
5. Materials must look physically real: tile joints, reflections, grout, ceramic, glass, metal, and stone must behave correctly.
6. Never invent extra furniture, decor, or architectural changes not explicitly requested.
7. Never produce CGI, illustration, or stylized output. The image must look like a real bathroom photograph after renovation.`;

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
Effect: ${pp.effetto}
Format: ${pp.formato}
Laying pattern: ${pp.posa}
Grout color: ${pp.fuga_colore}
Coverage height: ${pp.altezza_rivestimento || "full height"}`);
  }

  if (sost.pavimento && pv.attivo) {
    blocks.push(`[NEW FLOOR]
Effect: ${pv.effetto}
Format: ${pv.formato}
Laying pattern: ${pv.posa}
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
Countertop: ${vanity.piano}
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
Finish: ${rubinetteria.finitura}
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
Do not widen the room, do not move sanitary positions unless the intervention explicitly requires replacement, and do not change doors, windows, ceiling, or decorative accessories.`);

  if (notes) {
    blocks.push(`[ADDITIONAL NOTES]
${notes}`);
  }

  return {
    systemPrompt,
    userPrompt: blocks.join("\n\n"),
    promptVersion: "1.1.0",
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
    } = body as {
      action?: string;
      session_id?: string;
      image_url?: string;
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

    await supabase
      .from("render_bagno_sessions")
      .update({
        stato: "processing",
        processing_started_at: new Date().toISOString(),
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

    const { systemPrompt, userPrompt, promptVersion } = buildBathroomPromptServer({
      ...session,
      configurazione: session.configurazione || {},
      analisi_bagno: session.analisi_bagno || {},
    });

    const geminiApiKey = await getGeminiApiKey(supabase);
    if (!geminiApiKey) {
      throw new Error("Gemini API key non configurata. Configurarla in Admin > Impostazioni AI > Render.");
    }

    const originalImage = await downloadImageAsInlineData(imageUrl);
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
        responseModalities: ["TEXT", "IMAGE"],
        temperature: 1,
      },
    };

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image-generation:generateContent?key=${geminiApiKey}`;
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
    const generatedDataUrl = extractGeneratedImageData(aiData);

    if (!generatedDataUrl) {
      const providerText = extractTextParts(aiData);
      throw new Error(
        providerText
          ? `Il provider non ha restituito un'immagine renderizzabile: ${providerText.substring(0, 240)}`
          : "Nessuna immagine ricevuta dal provider AI",
      );
    }

    const uploadPayload = dataUrlToBytes(generatedDataUrl);
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

    await supabase
      .from("render_bagno_sessions")
      .update({
        stato: "completato",
        render_result_path: resultPath,
        render_result_url: resultUrl,
        prompt_usato: userPrompt,
        prompt_version: promptVersion,
        provider_key: "gemini",
        model_used: "gemini-2.5-flash-image-generation",
        cost_real: 0.04,
        cost_billed: 0.10,
        processing_completed_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    return jsonResponse({
      success: true,
      session_id,
      result_url: resultUrl,
      provider: "gemini",
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
