// generate-bathroom-render — Edge Function EiC
// Render Bagno AI — Lovable Gateway (Gemini Flash Image)
// Prompt Engine v1 — bathroom-specific blocks

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";

// ── CORS ──────────────────────────────────────────────────────────────
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── fetchWithTimeout ──────────────────────────────────────────────────
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

// ── fetchWithRetry ───────────────────────────────────────────────────
// P1 FIX: usa fetchWithTimeout anche in fetchWithRetry per evitare che
// l'AI gateway possa "hangarsi" silenziosamente per > 2 minuti bloccando
// l'utente (e causando double-click con doppia deduzione crediti).
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = 2,
  delayMs = 2000,
  timeoutMs = 120_000,
): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetchWithTimeout(url, options, timeoutMs);
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

// ── Inline prompt builder (server-side, mirrors client module) ────────
// We inline a simplified version to avoid import issues in Deno edge functions.
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

  // Helper to extract nested config
  const getSection = (key: string) => (config[key] || {}) as Record<string, unknown>;

  const pp = getSection("piastrelle_parete");
  const pv = getSection("pavimento");
  const doccia = getSection("doccia");
  const vasca = getSection("vasca");
  const vanity = getSection("vanity");
  const sanitari = getSection("sanitari");
  const rubinetteria = getSection("rubinetteria");
  const parete = getSection("parete");

  const systemPrompt = `You are a SURGICAL PHOTOREALISTIC IMAGE EDITOR specialized in bathroom renovation visualization. Your ONLY task: replace EXACTLY the specified bathroom elements while leaving EVERYTHING ELSE 100% pixel-perfect identical. This is PRECISE SURGICAL REPLACEMENT, not artistic interpretation.

CRITICAL RENDERING RULES:
1. Replaced tiles must show physically correct material properties — veining direction, surface reflectivity, grout line width and color, tile format proportions.
2. Laying pattern must be geometrically precise.
3. Fixtures must appear as real commercial products with correct proportions and material reflectivity.
4. All shadows, reflections, and ambient occlusion must be physically correct.
5. Elements marked as "keep" MUST remain pixel-identical to the original.
6. Camera perspective, room geometry, lighting, and image dimensions must remain exactly as original.
7. Output image dimensions must match input image dimensions exactly.`;

  const blocks: string[] = [];

  // Inventory
  blocks.push(`[EXISTING BATHROOM]
Room: ${analisi.tipo_stanza || "bathroom"}
Size: ${analisi.dimensione_stimata || "unknown"}
Current wall tiles: ${analisi.piastrelle_parete_attuali || "unknown"}
Current floor: ${analisi.pavimento_attuale || "unknown"}
Shower: ${analisi.presenza_doccia ? "YES" : "NO"}
Bathtub: ${analisi.presenza_vasca ? "YES" : "NO"}
Vanity: ${analisi.presenza_mobile ? "YES" : "NO"}
Conservation: ${analisi.stato_conservazione || "unknown"}`);

  // Intervention
  const interventionLabels: Record<string, string> = {
    restyling_piastrelle: "Tile restyling only",
    restyling_completo: "Complete restyling — tiles + fixtures + furniture",
    demolizione_parziale: "Partial demolition — structural changes to some elements",
    demolizione_completa: "Complete demolition & rebuild",
  };
  blocks.push(`[INTERVENTION] ${interventionLabels[tipoIntervento] || tipoIntervento}`);

  // Manifest
  const manifest: string[] = ["[REPLACEMENT MANIFEST]"];
  manifest.push(`Wall tiles: ${sost.piastrelle_parete ? "REPLACE" : "KEEP"}`);
  manifest.push(`Floor: ${sost.pavimento ? "REPLACE" : "KEEP"}`);
  manifest.push(`Shower: ${sost.doccia ? "REPLACE" : "KEEP"}`);
  manifest.push(`Bathtub: ${sost.vasca ? "REPLACE" : "KEEP"}`);
  manifest.push(`Vanity: ${sost.mobile_bagno ? "REPLACE" : "KEEP"}`);
  manifest.push(`Toilet/Bidet: ${sost.sanitari ? "REPLACE" : "KEEP"}`);
  manifest.push(`Faucets: ${sost.rubinetteria ? "REPLACE" : "KEEP"}`);
  manifest.push(`Non-tiled walls: ${sost.parete_colore ? "REPAINT" : "KEEP"}`);
  blocks.push(manifest.join("\n"));

  // Wall tiles
  if (sost.piastrelle_parete && pp.attivo) {
    blocks.push(`[NEW WALL TILES]
Effect: ${pp.effetto}
Format: ${pp.formato}
Laying pattern: ${pp.posa}
Grout color: ${pp.fuga_colore}
Height coverage: ${pp.altezza_rivestimento || "full height"}`);
  }

  // Floor
  if (sost.pavimento && pv.attivo) {
    blocks.push(`[NEW FLOOR]
Effect: ${pv.effetto}
Format: ${pv.formato}
Laying pattern: ${pv.posa}
Grout color: ${pv.fuga_colore}`);
  }

  // Shower
  if (sost.doccia && doccia.attivo) {
    blocks.push(`[NEW SHOWER]
Type: ${doccia.tipo}
Glass: ${doccia.box_vetro}
Shower tray: ${doccia.piatto}
Profile: ${doccia.profilo}
Shower head: ${doccia.soffione}`);
  }

  // Bathtub
  if (sost.vasca && vasca.attivo) {
    blocks.push(`[NEW BATHTUB]
Type: ${vasca.tipo}
Material: ${vasca.materiale}
Faucet: ${vasca.rubinetteria_vasca}`);
  }

  // Vanity
  if (sost.mobile_bagno && vanity.attivo) {
    blocks.push(`[NEW VANITY]
Style: ${vanity.stile}
Color: ${vanity.colore}
Countertop: ${vanity.piano}
Basin: ${vanity.lavabo}
Width: ${vanity.larghezza_cm}cm`);
  }

  // Sanitari
  if (sost.sanitari && sanitari.attivo) {
    blocks.push(`[NEW SANITARI]
WC: ${sanitari.azione_wc === "mantieni" ? "KEEP" : sanitari.tipo_wc}
Bidet: ${sanitari.azione_bidet === "rimuovi" ? "REMOVE" : sanitari.azione_bidet === "mantieni" ? "KEEP" : sanitari.tipo_bidet}
Color: ${sanitari.colore}`);
  }

  // Faucets
  if (sost.rubinetteria && rubinetteria.attivo) {
    blocks.push(`[NEW FAUCETS]
Finish: ${rubinetteria.finitura}
Style: ${rubinetteria.stile}
ALL visible fixtures must match this finish.`);
  }

  // Non-tiled walls
  if (sost.parete_colore && parete.attivo) {
    blocks.push(`[NON-TILED WALLS]
Action: ${parete.azione}
Color: ${parete.colore_hex || "keep current"}`);
  }

  // Preservation
  blocks.push(`[PRESERVATION]
Room geometry, camera perspective, lighting, all non-replaced elements, and image dimensions must remain 100% identical to the original photograph.
NEVER add elements not in the original. NEVER produce cartoon/CGI artifacts. NEVER add watermarks.`);

  if (notes) {
    blocks.push(`[ADDITIONAL NOTES]\n${notes}`);
  }

  return {
    systemPrompt,
    userPrompt: blocks.join("\n\n"),
    promptVersion: "1.0.0",
  };
}

// ── Main handler ──────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // ── Auth ────────────────────────────────────────────────────────
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

    // ── Parse request ───────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { session_id } = body as { session_id?: string };

    if (!session_id) {
      return new Response(
        JSON.stringify({ error: "validation_error", message: "session_id is required" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // ── Get session ─────────────────────────────────────────────────
    const { data: session, error: sessionErr } = await supabase
      .from("render_bagno_sessions")
      .select("*")
      .eq("id", session_id)
      .single();

    if (sessionErr || !session) {
      return new Response(
        JSON.stringify({ error: "not_found", message: "Sessione non trovata" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // ── Ownership check (impersonation-aware, FIX P1.3) ─────────────
    const allowed = await canAccessCompany(
      supabase,
      user.id,
      session.company_id as string,
    );
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "forbidden", message: "Accesso negato alla sessione render bagno" }),
        { status: 403, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // ── Credit pre-flight (v3 → v2 → v1 fallback + audit ledger) ─────
    const deductResult = await deductRenderCreditSafe(supabase, {
      companyId:  session.company_id as string,
      sessionId:  session_id,
      userId:     user.id,
      reasonMeta: { vertical: "bagno", edge_fn: "generate-bathroom-render" },
      logTag:     "generate-bathroom-render",
    });

    if (deductResult.status === "insufficient") {
      return new Response(
        JSON.stringify({ error: "insufficient_credits", message: "Crediti render insufficienti" }),
        { status: 402, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // ── Update status → processing ──────────────────────────────────
    await supabase
      .from("render_bagno_sessions")
      .update({
        stato: "processing",
        processing_started_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    // ── Get signed URL for original photo ───────────────────────────
    const originalPath = session.foto_originale_path as string;
    let imageUrl = originalPath;

    if (originalPath && !originalPath.startsWith("http")) {
      const { data: signed } = await supabase.storage
        .from("bagno-originals")
        .createSignedUrl(originalPath, 600);
      if (signed?.signedUrl) imageUrl = signed.signedUrl;
    }

    // ── Build prompt ────────────────────────────────────────────────
    const { systemPrompt, userPrompt, promptVersion } = buildBathroomPromptServer(
      session as Record<string, unknown>,
    );

    // ── Call AI via Lovable Gateway ─────────────────────────────────
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY not configured");
    }

    // Download original image and convert to base64
    const imgResp = await fetchWithTimeout(imageUrl, {}, 30_000);
    const imgBuffer = await imgResp.arrayBuffer();
    const imgB64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));
    const mimeType = imgResp.headers.get("content-type") || "image/jpeg";

    const aiBody = {
      model: "google/gemini-2.5-flash-image",
      messages: [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            {
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imgB64}` },
            },
          ],
        },
      ],
    };

    const aiResp = await fetchWithRetry(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify(aiBody),
      },
    );

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      throw new Error(`AI gateway error ${aiResp.status}: ${errText.substring(0, 300)}`);
    }

    const aiData = await aiResp.json();

    // ── Extract image from response (3 formats supported) ───────────
    let imageData: string | null = null;

    // Format 1: OpenAI-style choices with content array
    const choices = aiData.choices || [];
    for (const choice of choices) {
      const content = choice.message?.content;
      if (typeof content === "string" && content.startsWith("data:image/")) {
        imageData = content;
        break;
      }
      if (Array.isArray(content)) {
        for (const part of content) {
          if (part.type === "image_url" && part.image_url?.url) {
            imageData = part.image_url.url;
            break;
          }
          if (part.type === "image" && part.source?.data) {
            imageData = `data:${part.source.media_type || "image/png"};base64,${part.source.data}`;
            break;
          }
        }
        if (imageData) break;
      }
    }

    // Format 2: Gemini native candidates
    if (!imageData) {
      const parts = aiData.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith("image/")) {
          imageData = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    // Format 3: direct data field
    if (!imageData && aiData.data?.[0]?.b64_json) {
      imageData = `data:image/png;base64,${aiData.data[0].b64_json}`;
    }

    if (!imageData) {
      throw new Error("Nessuna immagine ricevuta dal provider AI");
    }

    // ── Upload result to storage ────────────────────────────────────
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const uint8 = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const resultPath = `${session.company_id}/${session_id}/render_bagno_${Date.now()}.png`;

    const { error: uploadErr } = await supabase.storage
      .from("bagno-results")
      .upload(resultPath, uint8, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Upload risultato fallito: ${uploadErr.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from("bagno-results")
      .getPublicUrl(resultPath);

    const resultUrl = publicUrlData.publicUrl;

    // ── Update session → completato ─────────────────────────────────
    await supabase
      .from("render_bagno_sessions")
      .update({
        stato: "completato",
        render_result_path: resultPath,
        render_result_url: resultUrl,
        prompt_usato: userPrompt,
        prompt_version: promptVersion,
        provider_key: "lovable_gemini_flash",
        model_used: "google/gemini-2.5-flash-image",
        cost_real: 0.04,
        cost_billed: 0.10,
        processing_completed_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    return new Response(
      JSON.stringify({
        success: true,
        session_id,
        result_url: resultUrl,
        prompt_version: promptVersion,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-bathroom-render] error:", msg);

    try {
      const body2 = await req.clone().json().catch(() => ({}));
      const sid = (body2 as { session_id?: string }).session_id;
      if (sid) {
        await supabase
          .from("render_bagno_sessions")
          .update({ stato: "errore" })
          .eq("id", sid);
      }
    } catch { /* ignore */ }

    return new Response(
      JSON.stringify({ error: "render_failed", message: msg }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
