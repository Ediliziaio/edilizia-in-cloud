// generate-shutter-render — Edge Function EiC
// Render Persiane AI — Multi-Provider (OpenAI / Gemini)
// Prompt Engine v1 per Persiane (shutters)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";

// ── SHUTTER_PHYSICS ──────────────────────────────────────────────────────────
const SHUTTER_PHYSICS: Record<string, string> = {
  veneziana_classica: "Traditional Venetian shutters — rectangular frame with horizontal tilting louvers/slats 40-60mm wide, each slat pivots on pins in vertical stiles, slats overlap when closed creating characteristic horizontal shadow lines, bottom rail heavier acting as closing bar",
  veneziana_esterna: "External Venetian blind — precision-extruded aluminum or PVC horizontal slats 60-80mm wide on fabric tapes, visible guide rails on jamb faces, head box at top housing the rolled-up blind, modern clean aesthetic",
  scuro_pieno: "Solid panel shutters — single solid wood or composite panel per leaf, no louvers, tongue-and-groove boards or flat panel with cross-battens, wrought-iron pintles hinge system, heavy espagnolette bolt",
  scuro_cornice: "Framed panel shutters — raised or recessed decorative panels within frame-and-rail structure, classic architectural style, mortise-and-tenon joinery at corners",
  gelosia: "Fixed louver screen — dense array of thin horizontal slats 20-35mm fixed at permanent 30-45 degree angle, no tilting, traditional Mediterranean element",
  avvolgibile_esterno: "External roller shutter — horizontal interlocking extruded slats that roll into head box above window, side guide channels, operated by strap/crank/motor",
  a_libro: "Bi-fold accordion shutters — multiple narrow panels connected by hinges that fold flat against wall when open, folding track at top",
  griglia_sicurezza: "Security grille — steel or aluminum grille with vertical bars at regular spacing, horizontal cross-members, powder-coated or galvanized",
  brise_soleil: "Brise-soleil sun louvers — large-format horizontal or vertical aluminum blades on outrigger brackets, fixed or motorized, contemporary architectural element",
};

// ── MATERIAL_DESC ────────────────────────────────────────────────────────────
const MATERIAL_DESC: Record<string, string> = {
  legno_naturale: "Solid natural wood — visible grain, warm organic color, traditional hand-crafted appearance",
  legno_composito: "Wood-polymer composite — uniform color, smooth factory finish, no natural grain variation",
  alluminio: "Extruded aluminum — powder-coated or anodized, sharp precise edges, modern industrial precision",
  pvc: "PVC — smooth matte surface, uniform color, rounded edge profiles from extrusion",
  acciaio: "Steel — powder-coated or galvanized, heavy gauge, industrial robust appearance",
  fibra_vetro: "Fiberglass GRP — smooth gel-coat surface, can mimic wood grain, corrosion-proof",
};

// ── STATO_APERTURA_DESC ──────────────────────────────────────────────────────
const STATO_DESC: Record<string, string> = {
  chiuso: "Shutters fully CLOSED — leaves pulled shut, no gap, continuous plane parallel to wall",
  socchiuso: "Shutters AJAR — slightly open 10-15 degrees, narrow sliver of light visible",
  aperto_45: "Shutters OPEN at 45 degrees — each leaf swung outward approximately 45 degrees",
  aperto_90: "Shutters FULLY OPEN at 90 degrees — perpendicular to wall, flat against adjacent wall",
  anta_singola_aperta: "ONE leaf OPEN, one CLOSED — asymmetric configuration",
};

// ── OPERAZIONE_DESC ──────────────────────────────────────────────────────────
const OPERAZIONE_DESC: Record<string, string> = {
  sostituisci: "REPLACE existing shutters with new ones — remove current, install specified new type",
  cambia_colore: "CHANGE COLOR ONLY — keep existing type/style/hardware, only repaint to specified color",
  aggiungi: "ADD NEW shutters where none exist — install on bare windows",
  rimuovi: "REMOVE all shutters — remove shutters, hinges, hardware, patch mounting holes",
};

// ── APERTURA_LAMELLE_DESC ────────────────────────────────────────────────────
const APERTURA_LAMELLE_DESC: Record<string, string> = {
  chiuse: "Louvers CLOSED — maximum overlap, opaque surface, thin horizontal shadow lines",
  parzialmente_aperte: "Louvers PARTIALLY OPEN — 30-45 degree tilt, filtered light, stripe pattern",
  completamente_aperte: "Louvers FULLY OPEN — near-horizontal, maximum ventilation and light",
};

const TIPI_CON_LAMELLE = new Set(["veneziana_classica", "veneziana_esterna", "gelosia", "brise_soleil"]);

// ── buildShutterPrompt ───────────────────────────────────────────────────────
function buildShutterPrompt(config: Record<string, unknown>): {
  systemPrompt: string;
  userPrompt: string;
  promptVersion: string;
} {
  const operazione = String(config.operazione || "sostituisci");
  const tipo = String(config.tipo || "veneziana_classica");
  const materiale = String(config.materiale || "legno_naturale");
  const coloreMode = String(config.colore_mode || "ral");
  const statoApertura = String(config.stato_apertura || "chiuso");
  const applicaTutte = config.applica_tutte_finestre !== false;
  const noteFree = String(config.note_libere || "");

  const blocks: string[] = [];

  // [OPERAZIONE]
  blocks.push(`[OPERAZIONE]\nAzione: ${operazione.toUpperCase()}\n${OPERAZIONE_DESC[operazione] || ""}\nScope: ${applicaTutte ? "Apply to ALL visible windows" : "Apply to main/central window only"}`);

  // [TIPO]
  if (operazione !== "rimuovi") {
    blocks.push(`[TIPO PERSIANA]\nTipo: ${tipo}\n${SHUTTER_PHYSICS[tipo] || ""}`);
  }

  // [MATERIALE]
  if (operazione !== "rimuovi" && operazione !== "cambia_colore") {
    blocks.push(`[MATERIALE]\nMateriale: ${materiale}\n${MATERIAL_DESC[materiale] || ""}`);
  }

  // [COLORE]
  if (operazione !== "rimuovi") {
    const coloreLines = ["[COLORE]"];
    if (coloreMode === "ral") {
      coloreLines.push(`Modalita: RAL color`);
      if (config.colore_ral) coloreLines.push(`RAL: ${config.colore_ral}`);
      if (config.colore_nome) coloreLines.push(`Nome: ${config.colore_nome}`);
      if (config.colore_hex) coloreLines.push(`Hex: ${config.colore_hex}`);
      coloreLines.push("Render in EXACT uniform solid color — no wood grain, no texture variation.");
    } else {
      coloreLines.push(`Modalita: Wood effect`);
      if (config.effetto_legno) coloreLines.push(`Effetto: ${config.effetto_legno}`);
      coloreLines.push("Render with realistic wood grain pattern and natural color variation.");
    }
    if (config.colore_profilo_diverso && config.colore_profilo_hex) {
      coloreLines.push(`Frame profile color (different from slats): ${config.colore_profilo_hex}`);
    }
    blocks.push(coloreLines.join("\n"));
  }

  // [STATO APERTURA]
  if (operazione !== "rimuovi") {
    blocks.push(`[STATO APERTURA]\nStato: ${statoApertura}\n${STATO_DESC[statoApertura] || ""}`);
  }

  // [LAMELLE]
  const lamelle = config.lamelle as Record<string, unknown> | undefined;
  if (operazione !== "rimuovi" && TIPI_CON_LAMELLE.has(tipo) && lamelle) {
    const larghezza = lamelle.larghezza_mm || 50;
    const apertura = String(lamelle.apertura || "chiuse");
    blocks.push(`[LAMELLE]\nLarghezza: ${larghezza}mm\nApertura: ${apertura}\n${APERTURA_LAMELLE_DESC[apertura] || ""}\nRender correct number of ${larghezza}mm slats to fill shutter height.`);
  }

  // [VINCOLI]
  const vincoli = [
    "[VINCOLI CRITICI]",
    "1. PRESERVE exact perspective, camera angle, lighting, wall texture, wall color, window proportions, and all non-shutter elements pixel-perfect.",
    "2. Shadows from shutters must be physically accurate for depicted sun position.",
    "3. Mounting hardware (hinges, brackets, guides) must be realistic for selected type.",
    "4. If REMOVE: fill mounting points with matching wall surface, no holes or marks.",
    "5. Output dimensions must match input exactly.",
    "6. Maintain photorealistic quality.",
  ];
  if (noteFree) vincoli.push(`\nUSER NOTES: ${noteFree}`);
  blocks.push(vincoli.join("\n"));

  const systemPrompt = [
    "You are a SURGICAL PHOTOREALISTIC IMAGE EDITOR specialized in architectural shutter (persiane) visualization.",
    "Your ONLY task: modify EXACTLY the shutters/persiane on the building facade as specified, while leaving EVERYTHING ELSE 100% pixel-perfect identical.",
    "CRITICAL: If RAL color mode, render uniform flat color with NO wood grain. If wood effect, render realistic grain.",
    "Shutter hardware (hinges, bolts, stays) must be realistic. Shadows must be physically correct.",
    "Wall, windows, frames, sills — ALL unchanged. Output resolution must match input.",
  ].join("\n");

  return {
    systemPrompt,
    userPrompt: blocks.join("\n\n"),
    promptVersion: "1.0.0",
  };
}

// ── resolveRenderSize ────────────────────────────────────────────────────────
function resolveRenderSize(w?: number, h?: number): string {
  if (!w || !h) return "1024x1024";
  const ratio = w / h;
  if (ratio > 1.4) return "1792x1024";
  if (ratio < 0.7) return "1024x1792";
  return "1024x1024";
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
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: CORS });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // ── Auth ──────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({
          error: "missing_auth",
          message: "Authorization header required",
        }),
        {
          status: 401,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
    }

    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) {
      return new Response(
        JSON.stringify({
          error: "invalid_auth",
          message: "Invalid or expired token",
        }),
        {
          status: 401,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
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
        JSON.stringify({
          error: "validation_error",
          message: "session_id is required",
        }),
        {
          status: 400,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
    }

    // ── Legge la sessione ────────────────────────────────────────────────
    const { data: session, error: sessionErr } = await supabase
      .from("render_persiane_sessions")
      .select("*")
      .eq("id", session_id)
      .single();

    if (sessionErr || !session) {
      return new Response(
        JSON.stringify({
          error: "not_found",
          message: "Sessione non trovata",
        }),
        {
          status: 404,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
    }

    // Verifica company_id (impersonation-aware, FIX P1.3)
    const allowed = await canAccessCompany(
      supabase,
      user.id,
      session.company_id as string,
    );
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "forbidden", message: "Accesso negato alla sessione render persiane" }),
        {
          status: 403,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
    }

    // ── Controlla crediti (v3 → v2 → v1 fallback + audit ledger) ──────────
    const deductResult = await deductRenderCreditSafe(supabase, {
      companyId:  session.company_id as string,
      sessionId:  session_id,
      userId:     user.id,
      reasonMeta: { vertical: "persiane", edge_fn: "generate-shutter-render" },
      logTag:     "generate-shutter-render",
    });

    if (deductResult.status === "insufficient") {
      return new Response(
        JSON.stringify({
          error: "insufficient_credits",
          message: "Crediti render insufficienti",
        }),
        {
          status: 402,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
    }

    // ── Aggiorna sessione: processing ────────────────────────────────────
    await supabase
      .from("render_persiane_sessions")
      .update({
        status: "processing",
        processing_started_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    // ── Signed URL per foto originale ────────────────────────────────────
    const originalPath = session.original_photo_url as string;
    let imageUrl = originalPath;

    if (originalPath && !originalPath.startsWith("http")) {
      const { data: signed } = await supabase.storage
        .from("persiane-originals")
        .createSignedUrl(originalPath, 600);
      if (signed?.signedUrl) imageUrl = signed.signedUrl;
    }

    // ── Build prompt ─────────────────────────────────────────────────────
    const renderConfig = (config ||
      (session.config as Record<string, unknown>) ||
      {}) as Record<string, unknown>;
    const { systemPrompt, userPrompt, promptVersion } =
      buildShutterPrompt(renderConfig);

    // ── Legge provider config ────────────────────────────────────────────
    const { data: providerConfig } = await supabase
      .from("render_provider_config")
      .select("*")
      .eq("is_default", true)
      .eq("is_active", true)
      .single();

    if (!providerConfig) {
      throw new Error(
        "Nessun provider render attivo. Configurare in Admin > Impostazioni AI > Render.",
      );
    }

    const platformKeyName = `render_${providerConfig.provider_key}_api_key`;
    const { data: keyRow } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", platformKeyName)
      .maybeSingle();

    // Fallback: DB → Supabase edge secret (OPENAI_API_KEY, GEMINI_API_KEY, ...)
    const envName = `${providerConfig.provider_key.toUpperCase()}_API_KEY`;
    const apiKey =
      (keyRow as { value: string } | null)?.value?.trim() ||
      Deno.env.get(envName)?.trim() ||
      "";
    if (!apiKey) {
      throw new Error(
        `API key mancante per provider '${providerConfig.provider_key}'. Configurarla in Admin > Impostazioni AI > Render o come Supabase secret ${envName}.`,
      );
    }

    // ── Chiama provider AI ───────────────────────────────────────────────
    let imageData: string | null = null;

    if (providerConfig.provider_key === "openai") {
      const imgResp = await fetchWithTimeout(imageUrl, {}, 30_000);
      const imgBlob = await imgResp.blob();

      const form = new FormData();
      form.append("model", providerConfig.model);
      form.append("prompt", userPrompt);
      form.append("image[]", imgBlob, "photo.jpg");
      form.append("n", "1");
      const renderSize = resolveRenderSize(target_width, target_height);
      form.append("size", renderSize);
      form.append("response_format", "b64_json");

      const resp = await fetchWithRetry(
        "https://api.openai.com/v1/images/edits",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: form,
        },
      );

      if (!resp.ok) {
        const err = await resp.text();
        throw new Error(
          `OpenAI error ${resp.status}: ${err.substring(0, 300)}`,
        );
      }

      const oaiData = await resp.json();
      const b64 = oaiData.data?.[0]?.b64_json;
      if (b64) imageData = `data:image/png;base64,${b64}`;
    } else if (providerConfig.provider_key === "gemini") {
      const imgResp = await fetchWithTimeout(imageUrl, {}, 30_000);
      const imgBuffer = await imgResp.arrayBuffer();
      const imgB64 = btoa(
        String.fromCharCode(...new Uint8Array(imgBuffer)),
      );

      const geminiBody = {
        contents: [
          {
            parts: [
              { text: systemPrompt + "\n\n" + userPrompt },
              {
                inline_data: { mime_type: "image/jpeg", data: imgB64 },
              },
            ],
          },
        ],
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
        throw new Error(
          `Gemini error ${resp.status}: ${err.substring(0, 300)}`,
        );
      }

      const gemData = await resp.json();
      const parts = gemData.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith("image/")) {
          imageData = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }
    } else {
      throw new Error(
        `Provider '${providerConfig.provider_key}' non supportato.`,
      );
    }

    if (!imageData) {
      throw new Error("Nessuna immagine ricevuta dal provider AI");
    }

    // ── Upload risultato ─────────────────────────────────────────────────
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const uint8 = Uint8Array.from(atob(base64Data), (c) =>
      c.charCodeAt(0),
    );
    const resultPath = `${session.company_id}/${session_id}/render_persiane_${Date.now()}.png`;

    const { error: uploadErr } = await supabase.storage
      .from("persiane-results")
      .upload(resultPath, uint8, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Errore upload risultato: ${uploadErr.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from("persiane-results")
      .getPublicUrl(resultPath);

    const resultUrl = publicUrlData.publicUrl;

    // ── Aggiorna sessione: completed ─────────────────────────────────────
    const costReal = providerConfig.cost_real_per_render ?? 0.04;
    const costBilled = providerConfig.cost_billed_per_render ?? 0.10;

    await supabase
      .from("render_persiane_sessions")
      .update({
        status: "completed",
        result_urls: [resultUrl],
        prompt_used: userPrompt.substring(0, 10000),
        prompt_version: promptVersion,
        provider_key: providerConfig.provider_key,
        model_used: providerConfig.model,
        cost_real: costReal,
        cost_billed: costBilled,
        processing_completed_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    return new Response(
      JSON.stringify({
        success: true,
        result_url: resultUrl,
        result_urls: [resultUrl],
        session_id,
      }),
      {
        status: 200,
        headers: { ...CORS, "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Errore interno sconosciuto";
    console.error("generate-shutter-render error:", message);

    // Aggiorna sessione: failed (best effort)
    try {
      const body = await req
        .clone()
        .json()
        .catch(() => ({}));
      if (body.session_id) {
        await supabase
          .from("render_persiane_sessions")
          .update({
            status: "failed",
            error_message: message.substring(0, 500),
            processing_completed_at: new Date().toISOString(),
          })
          .eq("id", body.session_id);
      }
    } catch (_) {
      /* ignore */
    }

    return new Response(
      JSON.stringify({ error: "internal_error", message }),
      {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      },
    );
  }
});
