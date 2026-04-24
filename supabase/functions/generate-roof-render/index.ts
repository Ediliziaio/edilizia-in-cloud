// generate-roof-render — Edge Function EiC
// Render Tetto AI — Multi-Provider (OpenAI / Gemini)
// Prompt Engine v2.0 — surgical roof renovation visualization

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";
import { bytesToBase64 } from "../_shared/base64.ts";

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

const FINITURA_DESC: Record<string, string> = {
  opaco: "matte finish with no unrealistic specular glare",
  semi_lucido: "semi-gloss finish with controlled soft highlights",
  lucido: "glossier finish with visible but physically plausible sky reflections",
};

const INTERVENTO_DESC: Record<string, string> = {
  sostituzione_manto: "replace the roof covering system while preserving roof geometry and untouched accessories",
  solo_colore: "recolor/refinish the existing covering only; preserve module geometry, ridges, gutters, skylights and accessories",
  lattonerie_accessori: "work only on selected accessories such as gutters, skylights, downpipes or photovoltaic elements; preserve the covering unless local flashing is required",
  sovracopertura_coibentata: "add an insulated over-roof/secondary package with realistic edge thickness, eaves, flashings and gutter adaptation",
  rifacimento_completo: "coordinate covering, insulation, gutters, flashings, skylights and photovoltaic elements as one buildable roof renovation",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function bullets(lines: Array<string | null | undefined>): string {
  return lines
    .filter((line): line is string => Boolean(line && line.trim()))
    .map((line) => `- ${line}`)
    .join("\n");
}

function isMetalOrMembrane(tipoManto: string): boolean {
  return tipoManto.startsWith("lamiera") || tipoManto.startsWith("guaina");
}

// ── buildRoofPrompt ──────────────────────────────────────────────────────────
function buildRoofPrompt(session: Record<string, unknown>): {
  systemPrompt: string;
  userPrompt: string;
  promptVersion: string;
  promptPayload: Record<string, unknown>;
} {
  const config = asRecord(session.config);
  const manto = asRecord(config.manto);
  const isolamento = asRecord(config.isolamento);
  const target = asRecord(config.target);
  const grondaie = asRecord(config.grondaie);
  const lucernari = asRecord(config.lucernari);
  const pannelli = asRecord(config.pannelli_solari);
  const notesRaw = text(config.note_libere);

  const tipoIntervento = text(config.tipo_intervento, "sostituzione_manto");
  const scope = text(target.scope, "tutto_tetto");
  const targetDescriptionMap: Record<string, string> = {
    tutto_tetto: "all visible roof planes / the complete roof visible in the photo",
    falda_principale: "main visible roof slope only",
    falda_frontale: "front-facing roof slope only",
    falda_laterale: "side roof slope only",
    zona_specifica: text(target.descrizione_zona, "specific user-described roof zone"),
  };
  const targetDescription = targetDescriptionMap[scope] || targetDescriptionMap.tutto_tetto;
  const untouchedSlopes = scope === "tutto_tetto" ? "none; entire visible roof is in scope" : "all non-target visible roof planes must remain unchanged";

  const tipoManto = text(manto.tipo, "tegole_coppi");
  const mantoDesc = ROOF_PHYSICS[tipoManto] || tipoManto;
  const coloreHex = text(manto.colore_hex, "#b5651d");
  const coloreNome = text(manto.colore_nome, coloreHex);
  const finitura = FINITURA_DESC[text(manto.finitura, "opaco")] || FINITURA_DESC.opaco;
  const coveringActive = ["sostituzione_manto", "sovracopertura_coibentata", "rifacimento_completo"].includes(tipoIntervento);

  const scene = {
    buildingType: "same photographed building, infer residential/commercial type from the image",
    roofType: "existing roof geometry visible in the photo",
    currentCovering: "current photographed roof covering",
    visibleSlopes: scope === "tutto_tetto" ? "all visible roof planes" : targetDescription,
    contextToPreserve: ["facade", "windows", "doors", "sky", "vegetation", "street", "neighboring buildings", "people/vehicles if present"],
  };

  const replacements: string[] = [];
  const additions: string[] = [];
  const removals: string[] = [];
  const conversionRules: string[] = [
    "Preserve exact roof pitch, ridge lines, hip/valley geometry, eaves, building proportions, camera angle and image dimensions.",
  ];

  if (coveringActive) {
    replacements.push(`Replace roof covering on ${targetDescription} with ${mantoDesc}; color ${coloreNome} (${coloreHex}); finish ${finitura}.`);
    conversionRules.push("Remove incompatible details from the previous covering and rebuild ridge caps, flashings, valleys, hips, eaves and drip edges coherently for the selected system.");
    if (isMetalOrMembrane(tipoManto)) {
      conversionRules.push("If the original roof has coppi/tiles, remove all visible coppi/tiles, tile rows, tile overlaps and old ridge tile logic; introduce coherent metal/membrane panels, seams/laps, cappings, fasteners or heat-welded joints with no hybrid remnants.");
    }
  } else if (tipoIntervento === "solo_colore") {
    replacements.push(`Recolor/refinish the existing roof covering on ${targetDescription} to ${coloreNome} (${coloreHex}), ${finitura}; do not change tile/panel geometry, module size, ridges, skylights, gutters, chimneys or accessories.`);
    conversionRules.push("Color-only operation: only surface color/finish changes; no new thickness, no new modules, no new panels, no new architectural details.");
  } else {
    replacements.push("Keep the existing roof covering unchanged except for small local flashing adjustments required by selected accessories.");
  }

  if (bool(isolamento.attivo) || tipoIntervento === "sovracopertura_coibentata") {
    additions.push(`Add realistic insulated over-roof package (${text(isolamento.tipo, "sarking_legno").replace(/_/g, " ")}, about ${Number(isolamento.spessore_cm || 10)} cm): visible only as plausible build-up thickness at eaves/edges, with adapted fascia, drip edges, flashings and gutter relationship; do not deform the building.`);
  }

  if (bool(grondaie.attivo)) {
    const grMat = text(grondaie.materiale, "alluminio");
    replacements.push(`Replace gutters and downpipes only with ${GRONDAIA_DESC[grMat] || grMat}; gutter color ${text(grondaie.colore_hex, "#8b4513")}${text(grondaie.colore_pluviale_hex) ? `; downpipe color ${text(grondaie.colore_pluviale_hex)}` : ""}.`);
    conversionRules.push("Gutter/downpipe replacement must not change roof covering, facade, eave geometry or downpipe path except for material/color/detail of gutters, brackets, elbows and joints.");
  }

  if (bool(lucernari.attivo)) {
    const azione = text(lucernari.azione, "mantieni");
    if (azione === "rimuovi") {
      removals.push("Remove existing skylights/dormers completely and rebuild continuous roof covering at their former positions, with no ghost outline, frame, curb, flashing or color scar.");
    } else if (azione === "aggiungi") {
      const tipo = text(lucernari.tipo, "piatto");
      additions.push(`Add ${Number(lucernari.quantita || 1)} ${LUCERNARIO_DESC[tipo] || tipo} at ${text(lucernari.posizione, "centrale").replace(/_/g, " ")} on the target slope, with frame color ${text(lucernari.colore_telaio_hex, "#3c3c3c")}; integrate with correct opening cut, waterproof flashing kit, material returns, shadows and scale.`);
    } else {
      conversionRules.push("Keep existing skylights/dormers in place and adapt only their flashing if surrounding covering changes.");
    }
  }

  if (bool(pannelli.attivo)) {
    const tipoP = text(pannelli.tipo, "fotovoltaico_nero");
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
    const pos = text(pannelli.posizione, "falda_principale").replace(/_/g, " ");
    const mounting = tipoP === "tegola_solare_integrata"
      ? "flush integrated into the covering, without raised rails"
      : "mounted on realistic rails/standoffs aligned to the roof slope";
    additions.push(`Add photovoltaic on ${pos}: ${tipoMap[tipoP] || tipoP}; ${qtyMap[text(pannelli.quantita, "medi")] || "medium array"}; ${mounting}; modules must align perfectly with roof plane, rows, perspective and shadows.`);
  }

  const preserve = [
    "facade walls and facade finish",
    "windows and doors",
    "building proportions",
    "roof planes outside target scope",
    "chimneys, antennas, life lines and roof devices unless explicitly modified",
    "sky, vegetation, street, neighboring buildings, vehicles and people",
    "image dimensions, crop and orientation",
  ];

  const blocks: Record<string, string> = {
    A: `[BLOCK A - MISSION]\nYou are a SURGICAL PHOTOREALISTIC ROOF RENOVATION IMAGE EDITOR. Apply exactly the selected roof intervention while preserving the same photographed building: same roof geometry, same camera angle, same facade, same context, same lighting and same image dimensions. No artistic reinterpretation and no different-building generation.`,
    B: `[BLOCK B - EXISTING ROOF INVENTORY]\nBuilding: ${scene.buildingType}\nRoof type: ${scene.roofType}\nVisible slopes: ${scene.visibleSlopes}\nCurrent covering: ${scene.currentCovering}\nContext to preserve: ${scene.contextToPreserve.join(", ")}\nRead all chimneys, skylights, dormers, gutters, ridges, hips, valleys, eaves, flashings, antennas and photovoltaic elements directly from the uploaded photo.`,
    C: `[BLOCK C - TARGET SLOPES MAP]\nScope: ${scope}\nTarget slopes: ${targetDescription}\nUntouched slopes: ${untouchedSlopes}\nAccessory zone: gutters, downpipes, skylights, dormers, ridges, hips, valleys and flashings only where explicitly active.`,
    D: `[BLOCK D - REPLACEMENT MANIFEST]\nIntervention: ${INTERVENTO_DESC[tipoIntervento] || INTERVENTO_DESC.sostituzione_manto}\nReplacements / refinishes:\n${bullets(replacements)}\nAdditions:\n${bullets(additions.length ? additions : ["no roof additions unless explicitly selected"])}\nRemovals:\n${bullets(removals.length ? removals : ["remove only construction details made incompatible by selected interventions"])}\nPreserve exactly:\n${bullets(preserve)}`,
    E: `[BLOCK E - NEW ROOF SPECIFICATION]\nCovering active: ${coveringActive ? "yes" : tipoIntervento === "solo_colore" ? "recolor only" : "no"}\nCovering type: ${tipoManto}\nMaterial / construction: ${mantoDesc}\nColor / finish: ${coloreNome} (${coloreHex}), ${finitura}\nRidge logic: coherent ridge caps, metal cappings or membrane cappings for the selected system.\nEdge logic: eaves, fascia, drip edges and roof borders stay aligned to the original geometry.\nFlashing logic: chimney, skylight, valley and wall flashings must be plausible for the selected covering.\nProfile/module geometry: tiles, seams, ribs, panels or membrane laps must follow the real roof plane with correct scale and perspective.`,
    F: `[BLOCK F - ACCESSORY RULES]\nGutters/downpipes: ${bool(grondaie.attivo) ? GRONDAIA_DESC[text(grondaie.materiale, "alluminio")] || text(grondaie.materiale, "alluminio") : "keep existing gutters and downpipes unchanged"}\nSkylights/dormers: ${bool(lucernari.attivo) ? text(lucernari.azione, "mantieni") : "unchanged"}\nPhotovoltaic: ${bool(pannelli.attivo) ? "active; see replacement manifest" : "do not add photovoltaic panels"}\nInsulation / over-roof: ${bool(isolamento.attivo) || tipoIntervento === "sovracopertura_coibentata" ? "active; adapt thickness, eaves, flashings and gutters realistically" : "not active"}\nChimneys / antennas / life lines: preserve unless explicitly listed, but update only necessary local flashings around them when covering changes.`,
    G: `[BLOCK G - REMOVAL / CONVERSION RULES]\n${bullets(conversionRules)}\n${removals.length ? bullets(removals) : "- Do not leave hybrid old/new roof states, ghost outlines, incompatible old rows, wrong flashings or random patches."}`,
    H: `[BLOCK H - BUILDING INTEGRITY]\n${bullets(["preserve facade, wall color, windows, doors, balconies and architectural proportions", "preserve roof shape, pitch, ridge line, hip/valley geometry and eave overhang unless insulation requires only realistic edge thickness", "preserve sky, vegetation, street, neighboring buildings, vehicles and people", "preserve exact camera perspective, crop, image dimensions and orientation", "do not alter non-target roof planes or non-target roof accessories"])}`,
    I: `[BLOCK I - PHOTOREALISM RULES]\n${bullets(["material response must be physically plausible: clay, slate, metal, membrane, glass and photovoltaic surfaces must look different", "shadows, contact shadows, roof-plane perspective and overlap depths must match the original lighting", "all added elements must look installed and buildable, with correct mounting, flashing, trim, edge and waterproofing details", "no floating panels, no warped seams, no random tile scales, no fake CGI showroom look"])}`,
    J: `[BLOCK J - NEGATIVE CONSTRAINTS]\n${bullets(["do not redesign the building", "do not change facade color, windows, doors or wall geometry", "do not change non-target roof planes", "do not invent balconies, dormers, skylights, chimneys, photovoltaic panels or antennas unless selected", "do not leave traces of removed skylights or old covering systems", "do not mix tile rows with metal/membrane systems on the same target slope unless explicitly selected", "do not change sky, vegetation, neighboring buildings, street or context", "do not stylize, illustrate, over-beautify or create a different house"])}`,
    K: `[BLOCK K - QUALITY BAR]\n${bullets(["professional architectural roof renovation visualization", "same-building realism suitable for sales/preventivi", "precise interpretation of selected roof system, target slopes and accessories"])}`,
  };

  const notes = notesRaw ? `[ADDITIONAL USER NOTES]\n${notesRaw}` : "";
  const userPrompt = [blocks.B, blocks.C, blocks.D, blocks.E, blocks.F, blocks.G, blocks.H, blocks.I, blocks.J, blocks.K, notes]
    .filter(Boolean)
    .join("\n\n");

  return {
    systemPrompt: blocks.A,
    userPrompt,
    promptVersion: "roof-v2.0.0",
    promptPayload: {
      scene_analysis: scene,
      target_slopes: { scope, target_description: targetDescription, untouched_slopes: untouchedSlopes },
      replacement_manifest: { intervention: tipoIntervento, replacements, additions, removals, conversion_rules: conversionRules, preserve },
      final_prompt_version: "roof-v2.0.0",
    },
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

    const { systemPrompt, userPrompt, promptVersion, promptPayload } = buildRoofPrompt(sessionLike);
    const finalProviderPrompt = `${systemPrompt}\n\n${userPrompt}`;

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
      form.append("prompt", finalProviderPrompt);
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
      const imgB64 = bytesToBase64(imgBuffer);

      const geminiBody = {
        contents: [{
          parts: [
            { text: systemPrompt + "\n\n" + userPrompt },
            { inline_data: { mime_type: "image/jpeg", data: imgB64 } },
          ],
        }],
        generationConfig: {
          responseModalities: ["IMAGE", "TEXT"],
          temperature: 0.65,
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
        prompt_char_count: finalProviderPrompt.length,
        provider_key: providerConfig.provider_key,
        cost_real: costReal,
        cost_billed: costBilled,
        config_snapshot: {
          ...rawConfig,
          roof_render_payload: promptPayload,
        },
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
        prompt_version: promptVersion,
        prompt_char_count: finalProviderPrompt.length,
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
