// generate-roof-render — Edge Function EiC
// Render Tetto AI — Multi-Provider (OpenAI / Gemini)
// Prompt Engine v1.0 — Roof renovation visualization

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";

// ── ROOF_PHYSICS ─────────────────────────────────────────────────────────────
const ROOF_PHYSICS: Record<string, string> = {
  tegole_coppi: "traditional curved terracotta coppi tiles (barrel tiles) — hand-formed half-cylinder profile, warm terracotta red-orange with natural color variation, rough matte porous surface, overlapping rows alternating concave-down and concave-up",
  tegole_marsigliesi: "Marseille interlocking clay tiles — flat body with single raised central rib, ~420x240mm, interlocking laps with visible overlap shadow lines, smooth matte ceramic surface",
  tegole_portoghesi: "Portuguese S-profile clay tiles — distinctive undulating S-curve cross-section, ~420x260mm, alternating convex/concave channels, deeper shadow lines creating strong visual rhythm",
  tegole_piane: "flat interlocking concrete or clay tiles — minimal profile with clean planar surface, very low raised edges, modern geometric appearance with tight joint lines",
  ardesia_naturale: "natural slate roofing tiles — hand-split natural stone slabs, dark blue-grey to charcoal, fine laminar surface texture, installed in courses with copper/stainless nails",
  ardesia_sintetica: "synthetic slate tiles — fiber-cement or recycled composite replicating natural slate, uniform 5mm thickness, consistent matte dark grey, embossed grain texture",
  lamiera_grecata: "trapezoidal corrugated metal sheet roofing — pre-painted galvanized steel with regular trapezoidal rib profile 35-55mm tall, continuous panels, visible screw fixings, crisp industrial shadow pattern",
  lamiera_aggraffata: "standing seam metal roofing — flat panels 400-530mm wide joined by raised vertical seams 25-38mm tall, no exposed fasteners, elegant modern minimalist appearance",
  lamiera_zinco_titanio: "zinc-titanium roofing — natural zinc alloy developing blue-grey patina, standing seam or flat-lock installation, subtle directional surface grain, premium contemporary material",
  guaina_bituminosa: "bituminous membrane flat roofing — multi-layer modified bitumen with mineral granule surface, visible torch-applied lap seams, slightly rough granular texture",
  guaina_tpo: "TPO single-ply membrane roofing — white/light-grey thermoplastic membrane, smooth slightly glossy surface, heat-welded lap seams, highly reflective for energy efficiency",
  tegole_fotovoltaiche: "solar roof tiles — building-integrated photovoltaic tiles, monocrystalline cells behind tempered glass, dark black or blue surface with subtle cell grid, flush-mounted",
};

const GRONDAIA_DESC: Record<string, string> = {
  alluminio: "pre-painted aluminum half-round or box gutter — lightweight, clean sharp edges, powder-coated, matching downpipe",
  rame: "natural copper half-round gutter — bright orange-copper developing verdigris patina, soldered joints, matching copper downpipes",
  acciaio_zincato: "galvanized steel gutter — hot-dip zinc coating with bright silver metallic finish, standard half-round profile, matching downpipes",
  pvc: "PVC plastic half-round gutter — smooth matte surface, clip-together joints, matching round PVC downpipes",
  zinco_titanio: "zinc-titanium half-round gutter — natural zinc developing blue-grey patina, soldered joints, premium appearance",
};

const LUCERNARIO_DESC: Record<string, string> = {
  piatto: "flat roof window (velux-style) — flush-mounted rectangular window, low-profile aluminum frame, double/triple glazed, visible flashing kit",
  sporgente: "protruding skylight — raised dome or pyramid projecting 150-300mm above roof, polycarbonate or glass dome with curb frame",
  abbaino: "dormer window — small gabled structure projecting vertically from slope, own mini-roof, side cheeks clad in matching material, front vertical window",
};

// ── buildRoofPrompt ──────────────────────────────────────────────────────────
function buildRoofPrompt(session: Record<string, unknown>): {
  systemPrompt: string;
  userPrompt: string;
  promptVersion: string;
} {
  const config = (session.config || {}) as Record<string, unknown>;
  const manto = (config.manto || {}) as Record<string, unknown>;
  const grondaie = (config.grondaie || {}) as Record<string, unknown>;
  const lucernari = (config.lucernari || {}) as Record<string, unknown>;
  const pannelli = (config.pannelli_solari || {}) as Record<string, unknown>;
  const notesRaw = (config.note_libere as string) || "";

  const blocks: string[] = [];

  // [CONTESTO]
  blocks.push(`[CONTESTO]\nThis is a roof renovation visualization. Replace the roof covering and optionally gutters, skylights, and solar panels while keeping everything else identical.`);

  // [MANTO]
  const tipoManto = (manto.tipo as string) || "tegole_coppi";
  const mantoDesc = ROOF_PHYSICS[tipoManto] || tipoManto;
  const coloreHex = (manto.colore_hex as string) || "#b5651d";
  const coloreNome = (manto.colore_nome as string) || "";
  const finituraMap: Record<string, string> = {
    opaco: "matte finish with no specular highlights",
    semi_lucido: "semi-gloss finish with soft specular sheen",
    lucido: "high-gloss finish with visible specular reflections",
  };
  const finitura = finituraMap[(manto.finitura as string) || "opaco"] || "matte finish";
  blocks.push(`[MANTO]\nReplace the ENTIRE roof covering with: ${mantoDesc}\nColor: ${coloreNome || coloreHex} (hex ${coloreHex}). Finish: ${finitura}.\nThe new covering must follow the exact same roof geometry, slopes, ridges and hips. Maintain all existing chimneys, antennas and roof-mounted elements unless explicitly changed below.`);

  // [GRONDE]
  if (grondaie.attivo) {
    const grMat = (grondaie.materiale as string) || "alluminio";
    const grDesc = GRONDAIA_DESC[grMat] || grMat;
    const grColor = (grondaie.colore_hex as string) || "#8b4513";
    const pluvColor = grondaie.colore_pluviale_hex ? ` Downpipe color: ${grondaie.colore_pluviale_hex}.` : "";
    blocks.push(`[GRONDE]\nReplace gutters and downpipes with: ${grDesc}\nGutter color: ${grColor}.${pluvColor}\nAll brackets, end caps, joints and elbows must be rendered consistently.`);
  } else {
    blocks.push(`[GRONDE]\nKEEP existing gutters and downpipes exactly as in the original photo.`);
  }

  // [LUCERNARI]
  if (lucernari.attivo) {
    const azione = (lucernari.azione as string) || "mantieni";
    if (azione === "rimuovi") {
      blocks.push(`[LUCERNARI]\nREMOVE all existing skylights/dormers. Fill positions with continuous new roof covering.`);
    } else if (azione === "aggiungi") {
      const tipo = (lucernari.tipo as string) || "piatto";
      const lucDesc = LUCERNARIO_DESC[tipo] || tipo;
      const qty = (lucernari.quantita as number) || 1;
      const pos = (lucernari.posizione as string) || "centrale";
      const frameColor = (lucernari.colore_telaio_hex as string) || "#3c3c3c";
      blocks.push(`[LUCERNARI]\nADD ${qty} new skylight(s): ${lucDesc}\nPosition: ${pos} on the main visible slope. Frame color: ${frameColor}.\nFlashing kit must integrate seamlessly with the new roof covering.`);
    } else {
      blocks.push(`[LUCERNARI]\nKEEP existing skylights. Update flashing to match new roof covering.`);
    }
  } else {
    blocks.push(`[LUCERNARI]\nNo changes to skylights. Keep exactly as in original photo.`);
  }

  // [PANNELLI]
  if (pannelli.attivo) {
    const tipoP = (pannelli.tipo as string) || "fotovoltaico_nero";
    const tipoMap: Record<string, string> = {
      fotovoltaico_nero: "black monocrystalline photovoltaic panels with dark anti-reflective coating, slim aluminum frame",
      fotovoltaico_blu: "blue polycrystalline photovoltaic panels with characteristic blue shimmer, aluminum frame",
      tegola_solare_integrata: "building-integrated solar tiles replacing conventional tiles, flush-mounted, dark surface with subtle cell pattern",
    };
    const qtyMap: Record<string, string> = {
      pochi: "a small cluster of 4-6 panels (~20% of one slope)",
      medi: "a medium array of 8-14 panels (~40-50% of one slope)",
      tanti: "a large array of 16-24 panels (~70-90% of one slope)",
    };
    const posMap: Record<string, string> = {
      falda_sud: "on the south-facing/most sun-exposed slope",
      falda_principale: "on the main visible roof slope",
      distribuiti: "distributed across multiple visible slopes",
    };
    blocks.push(`[PANNELLI]\nADD solar panels: ${tipoMap[tipoP] || tipoP}.\nQuantity: ${qtyMap[(pannelli.quantita as string) || "medi"] || "medium array"}.\nPosition: ${posMap[(pannelli.posizione as string) || "falda_principale"] || "main slope"}.\nRender realistic glass reflections.`);
  } else {
    blocks.push(`[PANNELLI]\nNo solar panels. Do not add any.`);
  }

  // [NOTE]
  if (notesRaw.trim()) {
    blocks.push(`[NOTE]\nAdditional instructions: ${notesRaw.trim()}`);
  }

  // [VINCOLI]
  blocks.push(`[VINCOLI]\nCRITICAL RENDERING RULES:\n1. ONLY change roof elements specified above — walls, windows, doors, garden, sky must remain 100% pixel-identical.\n2. Maintain exact camera perspective, focal length, lighting direction, shadow angles.\n3. All ridges, hips, valleys must be properly finished with matching ridge tiles or metal cappings.\n4. Chimney flashings must integrate with new roof covering.\n5. Eave overhang, fascia boards and soffit must remain consistent.\n6. Output image dimensions must match input exactly.\n7. No watermarks, text overlays, artistic filters — photorealistic only.`);

  const systemPrompt = `You are a SURGICAL PHOTOREALISTIC IMAGE EDITOR specializing in ROOF RENOVATION visualization for the Italian construction industry. Your ONLY task: replace EXACTLY the specified roof elements while leaving EVERYTHING ELSE 100% pixel-perfect identical to the original photograph. This is PRECISE SURGICAL REPLACEMENT — not artistic interpretation.`;

  const userPrompt = blocks.join("\n\n");

  return { systemPrompt, userPrompt, promptVersion: "1.0.0" };
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
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Main handler ─────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  let supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  let user = { id: "" };

  try {
    const auth = await requireAuth(req, CORS);
    supabase = auth.supabaseAdmin;
    user = { id: auth.userId };

    // ── Parse request ────────────────────────────────────────────────────────
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

    // ── Legge la sessione ────────────────────────────────────────────────────
    const { data: session, error: sessionErr } = await supabase
      .from("render_tetto_sessions")
      .select("*")
      .eq("id", session_id)
      .single();

    if (sessionErr || !session) {
      return new Response(
        JSON.stringify({ error: "not_found", message: "Sessione non trovata" }),
        { status: 404, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // Verifica che la sessione appartenga all'utente (impersonation-aware, FIX P1.3)
    const allowed = await canAccessCompany(
      supabase,
      user.id,
      session.company_id as string,
    );
    if (!allowed) {
      return new Response(
        JSON.stringify({ error: "forbidden", message: "Accesso negato alla sessione render tetto" }),
        { status: 403, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // ── Controlla e deduce crediti (v3 → v2 → v1 fallback + audit ledger) ────
    const deductResult = await deductRenderCreditSafe(supabase, {
      companyId:  session.company_id as string,
      sessionId:  session_id,
      userId:     user.id,
      reasonMeta: { vertical: "tetto", edge_fn: "generate-roof-render" },
      logTag:     "generate-roof-render",
    });

    if (deductResult.status === "insufficient") {
      return new Response(
        JSON.stringify({ error: "insufficient_credits", message: "Crediti render insufficienti" }),
        { status: 402, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    // ── Aggiorna sessione: processing ────────────────────────────────────────
    await supabase
      .from("render_tetto_sessions")
      .update({ status: "processing", processing_started_at: new Date().toISOString() })
      .eq("id", session_id);

    // ── Genera signed URL per foto originale ─────────────────────────────────
    const originalPath = session.original_photo_url as string;
    let imageUrl = originalPath;

    if (originalPath && !originalPath.startsWith("http")) {
      const { data: signed } = await supabase.storage
        .from("tetto-originals")
        .createSignedUrl(originalPath, 600);
      if (signed?.signedUrl) imageUrl = signed.signedUrl;
    }

    // ── Build prompt ─────────────────────────────────────────────────────────
    const rawConfig = (config || (session.config as Record<string, unknown>) || {}) as Record<string, unknown>;
    const sessionLike = { ...session, config: rawConfig };

    const { systemPrompt, userPrompt, promptVersion } = buildRoofPrompt(sessionLike);

    // ── Legge provider config e API key ──────────────────────────────────────
    const { data: providerConfig } = await supabase
      .from("render_provider_config")
      .select("*")
      .eq("is_default", true)
      .eq("is_active", true)
      .single();

    if (!providerConfig) {
      throw new Error("Nessun provider render attivo. Configurare in Admin > Impostazioni AI > Render.");
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
        `API key mancante per provider '${providerConfig.provider_key}'.` +
        ` Configurarla in Admin > Impostazioni AI > Render o come Supabase secret ${envName}.`,
      );
    }

    // ── Chiama il provider AI ────────────────────────────────────────────────
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
        throw new Error(`OpenAI error ${resp.status}: ${err.substring(0, 300)}`);
      }

      const oaiData = await resp.json();
      const b64 = oaiData.data?.[0]?.b64_json;
      if (b64) imageData = `data:image/png;base64,${b64}`;

    } else if (providerConfig.provider_key === "gemini") {
      const imgResp = await fetchWithTimeout(imageUrl, {}, 30_000);
      const imgBuffer = await imgResp.arrayBuffer();
      const imgB64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));

      const geminiBody = {
        contents: [{
          parts: [
            { text: systemPrompt + "\n\n" + userPrompt },
            { inline_data: { mime_type: "image/jpeg", data: imgB64 } },
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
        `Provider '${providerConfig.provider_key}' non supportato. Selezionare OpenAI o Gemini.`,
      );
    }

    if (!imageData) {
      throw new Error("Nessuna immagine ricevuta dal provider AI");
    }

    // ── Upload risultato su Storage ──────────────────────────────────────────
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const uint8 = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const resultPath = `${session.company_id}/${session_id}/render_tetto_${Date.now()}.png`;

    const { error: uploadErr } = await supabase.storage
      .from("tetto-results")
      .upload(resultPath, uint8, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadErr) {
      throw new Error(`Errore upload risultato: ${uploadErr.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from("tetto-results")
      .getPublicUrl(resultPath);

    const resultUrl = publicUrlData.publicUrl;

    // ── Aggiorna render_tetto_sessions: completed ────────────────────────────
    const costReal = providerConfig.cost_real_per_render ?? 0.04;
    const costBilled = providerConfig.cost_billed_per_render ?? 0.10;

    await supabase
      .from("render_tetto_sessions")
      .update({
        status: "completed",
        result_urls: [resultUrl],
        prompt_used: userPrompt,
        prompt_version: promptVersion,
        prompt_char_count: (systemPrompt + userPrompt).length,
        provider_key: providerConfig.provider_key,
        cost_real: costReal,
        cost_billed: costBilled,
        config_snapshot: rawConfig,
        processing_completed_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    // ── Incrementa contatore provider ────────────────────────────────────────
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
        prompt_char_count: (systemPrompt + userPrompt).length,
      }),
      { status: 200, headers: { ...CORS, "Content-Type": "application/json" } },
    );

  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-roof-render] error:", msg);

    try {
      const body2 = await req.clone().json().catch(() => ({}));
      const sid = (body2 as { session_id?: string }).session_id;
      if (sid) {
        await supabase
          .from("render_tetto_sessions")
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
