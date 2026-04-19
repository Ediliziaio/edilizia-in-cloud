// generate-room-render — Edge Function EiC
// Render Stanza (Room/Interiors) AI — Multi-Provider (OpenAI / Gemini)
// Prompt Engine stanza-v1.0.0

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";

// ── STYLE GUIDE (mirrored from stanzaPromptBuilder) ──────────────────────────
const STYLE_GUIDE: Record<string, string> = {
  moderno: "Modern interior design: clean geometric lines, neutral palette with bold accent color pops, open-plan feel, flush cabinetry, large-format tiles or polished concrete, minimalist furniture, recessed LED lighting.",
  scandinavo: "Scandinavian interior: warm whites, natural light wood, cozy wool and linen textiles in muted tones, clean simple silhouettes, hygge atmosphere, pendant lights with organic shapes.",
  industriale: "Industrial interior: exposed brick/concrete, visible metal ductwork, dark metal furniture, Edison-bulb pendants, reclaimed wood, leather seating, muted palette.",
  classico: "Classic traditional interior: elegant crown moldings, rich warm colors, solid wood furniture with carved details, crystal chandeliers, symmetrical arrangement, Persian rugs.",
  rustico: "Rustic country interior: exposed ceiling beams, terracotta/stone flooring, solid wood farm furniture, wrought-iron fixtures, earthy warm palette.",
  minimalista: "Minimalist interior: ultra-clean surfaces, monochromatic palette, hidden storage, single statement pieces, indirect cove lighting, seamless floors.",
  mediterraneo: "Mediterranean interior: sun-bleached white with blue accents, terracotta tiles, arched doorways, ceramic backsplashes, wrought-iron details, warm golden light.",
  art_deco: "Art Deco interior: geometric patterns, jewel tones, lacquered surfaces, velvet upholstery, brass/chrome hardware, statement geometric lights.",
  giapponese: "Japanese-inspired interior (Japandi): natural materials, minimalist decluttered spaces, earth-tone palette, low furniture profiles, indirect warm lighting, wabi-sabi aesthetic.",
  provenzale: "Provencal French country: soft lavender/sage/butter palette, distressed painted wood, toile de Jouy fabrics, exposed beams, terracotta tiles, linen curtains.",
  eclettico: "Eclectic interior: curated style mix, bold pattern mixing, rich saturated colors, gallery-wall art, vintage mixed with contemporary, maximalist yet intentional.",
  luxe_contemporaneo: "Luxury contemporary: premium materials (marble, onyx, brushed brass), neutral sophisticated palette with metallic accents, bespoke furniture, designer lighting.",
};

const INTENSITY_MAP: Record<string, string> = {
  leggero: "LIGHT: Only modify explicitly requested elements. Keep ALL existing furniture, layout, architectural features EXACTLY as they are.",
  medio: "MEDIUM: Modify requested elements AND harmonize surrounding elements. Adjust furniture colors/textures to complement while maintaining same layout.",
  radicale: "RADICAL: Complete room redesign following target style. Replace all furniture, decor, finishes with new ones while keeping architectural shell intact.",
};

const TIPO_STANZA_LABEL: Record<string, string> = {
  cucina: "kitchen", soggiorno: "living room", camera_da_letto: "bedroom",
  bagno: "bathroom", studio: "home office / study", ingresso: "entrance hallway",
  taverna: "basement / rec room", sala_da_pranzo: "dining room",
  corridoio: "corridor / hallway", altro: "interior room",
};

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
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const { data: { user }, error: authErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (authErr || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { session_id, config, target_width, target_height } = body;
    if (!session_id) throw new Error("session_id required");

    // Get session
    const { data: session, error: sessErr } = await supabase
      .from("render_stanza_sessions")
      .select("*")
      .eq("id", session_id)
      .single();
    if (sessErr || !session) throw new Error("Session not found");

    const companyId = session.company_id;

    // FIX P1.3: ownership check impersonation-aware. In precedenza il file
    // assumeva che chiunque con il session_id potesse avviare il render: una
    // vulnerabilità tenant. Ora controlliamo esplicitamente tramite helper
    // che rispetta super_admin + active_impersonations + profiles.company_id.
    const allowed = await canAccessCompany(
      supabase,
      user.id,
      companyId as string,
    );
    if (!allowed) {
      throw new Error("forbidden: accesso negato alla sessione render stanza");
    }

    // FIX P2.1 + P3.1: credito deduct atomico PRE-flight con audit ledger.
    // Prima il codice faceva SELECT balance (non atomico) e poi
    // decrement_render_credits a render completato → race condition +
    // impossibile tracciare in ledger la sessione consumatrice.
    const deductResult = await deductRenderCreditSafe(supabase, {
      companyId:  companyId as string,
      sessionId:  session_id,
      userId:     user.id,
      reasonMeta: { vertical: "stanza", edge_fn: "generate-room-render" },
      logTag:     "generate-room-render",
    });
    if (deductResult.status === "insufficient") {
      throw new Error("insufficient_credits");
    }

    // Get default provider
    const { data: provider } = await supabase
      .from("render_provider_config")
      .select("*")
      .eq("is_active", true)
      .eq("is_default", true)
      .single();
    if (!provider) throw new Error("No active render provider configured");

    // Get API key from platform_settings (schema: key TEXT PK, value TEXT NOT NULL)
    // Fallback chain: DB → Supabase edge secret (OPENAI_API_KEY / GEMINI_API_KEY).
    const platformKeyName = `render_${provider.provider_key}_api_key`;
    const { data: keyRow } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", platformKeyName)
      .maybeSingle();
    const envName = `${provider.provider_key.toUpperCase()}_API_KEY`;
    const apiKey =
      (keyRow as { value: string } | null)?.value?.trim() ||
      Deno.env.get(envName)?.trim() ||
      "";
    if (!apiKey) throw new Error(`API key not configured for ${provider.provider_key}. Configurarla in Admin > Impostazioni AI > Render o come Supabase secret ${envName}.`);

    // Update session status
    await supabase
      .from("render_stanza_sessions")
      .update({
        status: "processing",
        processing_started_at: new Date().toISOString(),
        provider_key: provider.provider_key,
      })
      .eq("id", session_id);

    // Get signed URL for original photo
    const { data: signedData } = await supabase.storage
      .from("stanza-originals")
      .createSignedUrl(session.original_photo_url, 600);
    const imageUrl = signedData?.signedUrl;
    if (!imageUrl) throw new Error("Cannot get signed URL for original photo");

    // Build prompt
    const cfg = config || session.config;
    const roomLabel = TIPO_STANZA_LABEL[cfg?.tipo_stanza] ?? "interior room";
    const stileTarget = cfg?.stile_target ?? "moderno";
    const intensita = cfg?.intensita ?? "medio";

    const styleDesc = STYLE_GUIDE[stileTarget] ?? STYLE_GUIDE.moderno;
    const intensityDesc = INTENSITY_MAP[intensita] ?? INTENSITY_MAP.medio;

    // Collect active interventions for prompt
    const interventionBlocks: string[] = [];

    if (cfg?.verniciatura?.attivo) {
      interventionBlocks.push(
        `WALL PAINT: Apply ${cfg.verniciatura.colore_nome || cfg.verniciatura.colore_hex || "neutral"} paint, ` +
        `finish ${cfg.verniciatura.finitura || "satin"}, ` +
        `apply to ${cfg.verniciatura.applica_a === "parete_principale" ? "main wall only" : cfg.verniciatura.applica_a === "parete_accento" ? "accent wall" : "all walls"}.`
      );
    }
    if (cfg?.pavimento?.attivo) {
      interventionBlocks.push(
        `FLOORING: Replace with ${cfg.pavimento.tipo || "porcelain tile"}, ` +
        `color ${cfg.pavimento.colore_hex || "neutral"}, pattern ${cfg.pavimento.pattern || "straight"}, finish ${cfg.pavimento.finitura || "matte"}.`
      );
    }
    if (cfg?.arredo?.attivo) {
      interventionBlocks.push(
        `FURNITURE: ${cfg.arredo.intensita_cambio === "arredo_completo" ? "Replace all furniture" : cfg.arredo.intensita_cambio === "colore_sola" ? "Change furniture colors only" : "Change style keeping layout"}, ` +
        `material ${(cfg.arredo.materiale || "wood").replace(/_/g, " ")}.` +
        `${cfg.arredo.mantieni_elettrodomestici ? " Keep all appliances as-is." : ""}`
      );
    }
    if (cfg?.soffitto?.attivo) {
      interventionBlocks.push(
        `CEILING: ${cfg.soffitto.tipo === "travi_legno" ? "Add exposed wood beams" : cfg.soffitto.tipo === "controsoffitto_cartongesso" ? "Add dropped plasterboard ceiling" : "Modify ceiling"}, ` +
        `color ${cfg.soffitto.colore_hex || "white"}.`
      );
    }
    if (cfg?.illuminazione?.attivo) {
      interventionBlocks.push(
        `LIGHTING: ${(cfg.illuminazione.tipo || "mixed").replace(/_/g, " ")}, ` +
        `temperature ${cfg.illuminazione.temperatura || "warm"}, intensity ${cfg.illuminazione.intensita_luce || "normal"}.`
      );
    }
    if (cfg?.carta_da_parati?.attivo) {
      interventionBlocks.push(
        `WALLPAPER: ${(cfg.carta_da_parati.stile_pattern || "geometric").replace(/_/g, " ")} pattern on ${cfg.carta_da_parati.applica_a === "tutte" ? "all walls" : "main wall"}.`
      );
    }
    if (cfg?.rivestimento_pareti?.attivo) {
      interventionBlocks.push(
        `WALL CLADDING: ${(cfg.rivestimento_pareti.tipo || "wood paneling").replace(/_/g, " ")} on ${cfg.rivestimento_pareti.applica_a === "tutte" ? "all walls" : "main wall"}.`
      );
    }
    if (cfg?.tende?.attivo) {
      interventionBlocks.push(
        `CURTAINS: ${(cfg.tende.tipo || "classic curtains").replace(/_/g, " ")}, color ${cfg.tende.colore_nome || cfg.tende.colore_hex || "neutral"}.`
      );
    }
    if (cfg?.tipo_stanza === "cucina" && cfg?.restyling_cucina?.attivo) {
      interventionBlocks.push(
        `KITCHEN: ${(cfg.restyling_cucina.materiale_frontali || "lacquered").replace(/_/g, " ")} cabinets, ` +
        `color ${cfg.restyling_cucina.colore_frontali_hex || "white"}, ` +
        `countertop ${(cfg.restyling_cucina.piano_lavoro_materiale || "quartz").replace(/_/g, " ")}, ` +
        `handles ${(cfg.restyling_cucina.maniglie || "handleless").replace(/_/g, " ")}.`
      );
    }

    const interventionsText = interventionBlocks.length > 0
      ? interventionBlocks.join("\n")
      : "Apply the target style globally to all room elements.";

    const fullPrompt =
      `Transform this ${roomLabel} photo into a ${stileTarget.replace(/_/g, " ")} style interior.\n\n` +
      `STYLE: ${styleDesc}\n\n` +
      `INTENSITY: ${intensityDesc}\n\n` +
      `INTERVENTIONS:\n${interventionsText}\n\n` +
      `${cfg?.note_libere ? `ADDITIONAL NOTES: ${cfg.note_libere}\n\n` : ""}` +
      `PRESERVATION RULES:\n` +
      `- Keep room dimensions, perspective, camera angle IDENTICAL.\n` +
      `- Keep window/door positions unchanged.\n` +
      `- Keep natural light direction consistent.\n` +
      `- Elements NOT targeted for change must remain EXACTLY as in original.\n` +
      `- Output must be PHOTOREALISTIC — like a real interior photograph.\n` +
      `- Maintain same resolution and aspect ratio as input.`;

    // Store prompt
    await supabase
      .from("render_stanza_sessions")
      .update({
        prompt_used: fullPrompt,
        prompt_version: "stanza-v1.0.0",
        prompt_char_count: fullPrompt.length,
        config_snapshot: cfg,
      })
      .eq("id", session_id);

    // ── Call provider ────────────────────────────────────────────────────────
    let resultImageUrl: string | null = null;

    if (provider.provider_key === "openai") {
      // OpenAI Images Edit / gpt-image-1
      const openaiResp = await fetchWithRetry("https://api.openai.com/v1/images/edits", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
        },
        body: await (async () => {
          // Download original image
          const imgResp = await fetch(imageUrl);
          const imgBlob = await imgResp.blob();

          const formData = new FormData();
          formData.append("image", imgBlob, "room.png");
          formData.append("prompt", fullPrompt);
          formData.append("model", provider.model || "gpt-image-1");
          formData.append("n", "1");
          formData.append("quality", provider.quality || "high");
          if (target_width && target_height) {
            // OpenAI accepts size as WxH string
            const size = target_width <= 1024 && target_height <= 1024
              ? "1024x1024"
              : "1536x1024";
            formData.append("size", size);
          }
          return formData;
        })(),
      });

      if (!openaiResp.ok) {
        const errBody = await openaiResp.text();
        throw new Error(`OpenAI API error: ${openaiResp.status} ${errBody}`);
      }

      const openaiData = await openaiResp.json();

      // Handle both b64_json and url response formats
      if (openaiData.data?.[0]?.b64_json) {
        // Upload base64 to storage
        const b64 = openaiData.data[0].b64_json;
        const binaryStr = atob(b64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const resultPath = `${companyId}/${session_id}_result.png`;
        const { error: uploadErr } = await supabase.storage
          .from("stanza-results")
          .upload(resultPath, bytes, { contentType: "image/png", upsert: true });
        if (uploadErr) throw new Error(`Upload result failed: ${uploadErr.message}`);

        const { data: publicUrl } = supabase.storage
          .from("stanza-results")
          .getPublicUrl(resultPath);
        resultImageUrl = publicUrl.publicUrl;
      } else if (openaiData.data?.[0]?.url) {
        // Download and re-upload
        const dlResp = await fetch(openaiData.data[0].url);
        const dlBlob = await dlResp.blob();
        const resultPath = `${companyId}/${session_id}_result.png`;
        const { error: uploadErr } = await supabase.storage
          .from("stanza-results")
          .upload(resultPath, dlBlob, { contentType: "image/png", upsert: true });
        if (uploadErr) throw new Error(`Upload result failed: ${uploadErr.message}`);

        const { data: publicUrl } = supabase.storage
          .from("stanza-results")
          .getPublicUrl(resultPath);
        resultImageUrl = publicUrl.publicUrl;
      }
    } else if (provider.provider_key === "gemini") {
      // Google Gemini Imagen
      const imgResp = await fetch(imageUrl);
      const imgBlob = await imgResp.blob();
      const imgArrayBuffer = await imgBlob.arrayBuffer();
      const imgBase64 = btoa(String.fromCharCode(...new Uint8Array(imgArrayBuffer)));

      const geminiResp = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${provider.model || "gemini-2.0-flash-exp"}:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: fullPrompt },
                {
                  inlineData: {
                    mimeType: imgBlob.type || "image/jpeg",
                    data: imgBase64,
                  },
                },
              ],
            }],
            generationConfig: {
              responseModalities: ["IMAGE", "TEXT"],
              temperature: 0.4,
            },
          }),
        }
      );

      if (!geminiResp.ok) {
        const errBody = await geminiResp.text();
        throw new Error(`Gemini API error: ${geminiResp.status} ${errBody}`);
      }

      const geminiData = await geminiResp.json();
      const parts = geminiData.candidates?.[0]?.content?.parts ?? [];
      const imagePart = parts.find((p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData?.mimeType?.startsWith("image/"));

      if (imagePart?.inlineData?.data) {
        const b64 = imagePart.inlineData.data;
        const binaryStr = atob(b64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) {
          bytes[i] = binaryStr.charCodeAt(i);
        }
        const mimeType = imagePart.inlineData.mimeType || "image/png";
        const ext = mimeType.includes("jpeg") ? "jpg" : "png";
        const resultPath = `${companyId}/${session_id}_result.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from("stanza-results")
          .upload(resultPath, bytes, { contentType: mimeType, upsert: true });
        if (uploadErr) throw new Error(`Upload result failed: ${uploadErr.message}`);

        const { data: publicUrl } = supabase.storage
          .from("stanza-results")
          .getPublicUrl(resultPath);
        resultImageUrl = publicUrl.publicUrl;
      }
    }

    if (!resultImageUrl) {
      throw new Error("No image generated by provider");
    }

    // ── Update session as completed ──────────────────────────────────────────
    await supabase
      .from("render_stanza_sessions")
      .update({
        status: "completed",
        result_urls: [resultImageUrl],
        processing_completed_at: new Date().toISOString(),
        cost_real: provider.cost_real_per_render,
        cost_billed: provider.cost_billed_per_render,
      })
      .eq("id", session_id);

    // Credit già dedotto pre-flight via deductRenderCreditSafe (atomico + audit).
    // NON chiamare decrement_render_credits qui: causerebbe doppio addebito.

    // Update provider stats
    await supabase
      .from("render_provider_config")
      .update({ renders_generated: (provider.renders_generated || 0) + 1 })
      .eq("id", provider.id);

    return new Response(
      JSON.stringify({
        success: true,
        session_id,
        result_url: resultImageUrl,
        result_urls: [resultImageUrl],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("generate-room-render error:", message);

    // Try to mark session as failed
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      const supabase = createClient(supabaseUrl, serviceKey);
      const body = await req.clone().json().catch(() => ({}));
      if (body.session_id) {
        await supabase
          .from("render_stanza_sessions")
          .update({
            status: "failed",
            error_message: message,
            processing_completed_at: new Date().toISOString(),
          })
          .eq("id", body.session_id);
      }
    } catch (_) { /* best effort */ }

    return new Response(
      JSON.stringify({ error: message }),
      {
        status: message.includes("insufficient_credits") ? 402 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
