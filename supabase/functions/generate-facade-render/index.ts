// generate-facade-render — Edge Function EiC
// Render Facciata AI — Gemini via Lovable Gateway
// Prompt Engine v1 for facade renovation rendering

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";

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
    const { session_id, config } = body as {
      session_id?: string;
      config?: Record<string, unknown>;
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

    // ── Signed URL for original photo ────────────────────────────────────
    const originalPath = session.original_photo_url as string;
    let imageUrl = originalPath;

    if (originalPath && !originalPath.startsWith("http")) {
      const { data: signed } = await supabase.storage
        .from("facciata-originals")
        .createSignedUrl(originalPath, 600);
      if (signed?.signedUrl) imageUrl = signed.signedUrl;
    }

    // ── Build prompt ─────────────────────────────────────────────────────
    const renderConfig = config || (session.config as Record<string, unknown>) || {};
    const sessionLike = {
      ...session,
      config: renderConfig,
      foto_analisi: (session as Record<string, unknown>).foto_analisi || {},
    };

    const { systemPrompt, userPrompt, promptVersion, blocks } = buildFacadePrompt(sessionLike);

    // ── Call AI via Lovable Gateway (Gemini) ─────────────────────────────
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")?.trim();
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY non configurata come Supabase edge secret.");
    }

    const imgResp = await fetchWithTimeout(imageUrl, {}, 30_000);
    const imgBuffer = await imgResp.arrayBuffer();
    const imgB64 = btoa(String.fromCharCode(...new Uint8Array(imgBuffer)));

    const gatewayBody = {
      model: "google/gemini-2.5-flash-image",
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            {
              type: "image_url",
              image_url: { url: `data:image/jpeg;base64,${imgB64}` },
            },
          ],
        },
      ],
      max_tokens: 4096,
    };

    const gatewayResp = await fetchWithRetry(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        },
        body: JSON.stringify(gatewayBody),
      },
    );

    if (!gatewayResp.ok) {
      const errText = await gatewayResp.text();
      throw new Error(`Gateway error ${gatewayResp.status}: ${errText.substring(0, 300)}`);
    }

    const gatewayData = await gatewayResp.json();

    // ── Extract image from response ──────────────────────────────────────
    let imageData: string | null = null;
    const choices = gatewayData.choices || [];
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
        }
        if (imageData) break;
      }
    }

    // Fallback: check inline_data in Gemini-style response
    if (!imageData) {
      const parts = gatewayData.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith("image/")) {
          imageData = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!imageData) {
      throw new Error("Nessuna immagine ricevuta dal provider AI");
    }

    // ── Upload result to Storage ─────────────────────────────────────────
    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const uint8 = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const resultPath = `${session.company_id}/${session_id}/render_${Date.now()}.png`;

    const { error: uploadErr } = await supabase.storage
      .from("facciata-results")
      .upload(resultPath, uint8, { contentType: "image/png", upsert: true });

    if (uploadErr) {
      throw new Error(`Errore upload risultato: ${uploadErr.message}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from("facciata-results")
      .getPublicUrl(resultPath);

    const resultUrl = publicUrlData.publicUrl;

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
        provider_key: "gemini_gateway",
        cost_real: 0.04,
        cost_billed: 0.10,
        config_snapshot: renderConfig,
        processing_completed_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    return new Response(
      JSON.stringify({
        success: true,
        session_id,
        result_url: resultUrl,
        provider: "gemini_gateway",
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
