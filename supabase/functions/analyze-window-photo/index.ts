// analyze-window-photo — Edge Function EiC
// Analizza foto finestre con OpenAI Vision (gpt-4o-mini default)
// Restituisce FotoAnalisi JSON per il wizard RenderNew
// v8.6.32 — Gemini eliminato.

import { requireAuth, requireCompanyAccess } from "../_shared/auth.ts";
import { getCorsHeaders } from "../_shared/headers.ts";
import { bytesToBase64 } from "../_shared/base64.ts";
import { chargeDirectAiCall, estimateTokenCostUsd } from "../_shared/directAiLedger.ts";
import { normalizeWindowSceneAnalysis } from "../../../shared/render-window/windowSceneAnalysis.ts";

const SYSTEM_PROMPT = `You are an expert Italian window and door analyzer.
Analyze the provided image and extract a structured SCENE ANALYSIS for premium replacement-window rendering.
You MUST respond with a valid JSON object only — no markdown, no explanation, just pure JSON.`;

const USER_PROMPT = `Analyze this window/door photo and return ONLY a JSON object with these exact fields.
Use left-to-right labels A, B, C... for visible openings.
If only one opening is visible, still use opening id "A".

{
  "environment_type": one of: "living_room"|"kitchen"|"bedroom"|"bathroom"|"staircase"|"office"|"facade"|"balcony"|"interior_generic"|"exterior_generic"|"mixed"|"unknown",
  "view_mode": one of: "interior"|"exterior"|"mixed"|"unknown",
  "openings_count_visible": number,
  "camera_angle": string,
  "lighting_direction": string,
  "lighting_quality": string,
  "environment_summary": string,
  "wall_material": string,
  "wall_color": string,
  "floor_visible": boolean,
  "curtains_present": boolean,
  "radiator_present": boolean,
  "furniture_context": array of short strings,
  "untouched_elements": array of short strings,
  "outdoor_view_summary": string,
  "primary_target_hint": string or null,
  "openings": [
    {
      "id": "A",
      "position": one of: "far_left"|"left"|"center"|"right"|"far_right"|"full_width"|"unknown",
      "approximate_placement": string,
      "type_current": one of: "battente_1_anta"|"battente_2_ante"|"battente_3_ante"|"scorrevole"|"scorrevole_alzante"|"vasistas"|"anta_ribalta"|"bilico"|"fisso"|"portafinestra",
      "perceived_element": one of: "window"|"door_window"|"sliding_panel"|"fixed_light"|"unknown",
      "sash_count": number,
      "material_perceived": one of: "pvc"|"alluminio"|"legno"|"legno_alluminio"|"acciaio_corten"|"acciaio_minimale"|"unknown",
      "color_perceived": string,
      "condition": one of: "buone"|"usurato"|"danneggiato"|"fatiscente"|"unknown",
      "has_cassonetto": boolean,
      "cassonetto_type": string or null,
      "cassonetto_style": one of: "external_box"|"internal_monoblocco"|"absent"|"unknown",
      "has_roller_shutter": boolean,
      "has_belt": boolean,
      "has_belt_box": boolean,
      "belt_placement": one of: "left_wall"|"right_wall"|"left_reveal"|"right_reveal"|"center"|"unknown",
      "belt_placement_notes": string,
      "roller_control_type": one of: "manual_belt"|"motorized"|"chain"|"crank"|"none"|"unknown",
      "roller_curtain_state": one of: "fully_raised_hidden"|"top_recessed_band"|"partially_lowered"|"fully_lowered"|"not_visible"|"unknown",
      "roller_curtain_position_notes": string,
      "has_horizontal_transom": boolean,
      "transom_position_pct": number or null,
      "transom_panel_below_type": one of: "glass"|"solid_panel"|"louvered"|"unknown",
      "estimated_height_cm": number or null,
      "has_persiane": boolean,
      "has_scuri": boolean,
      "has_grates": boolean,
      "has_sill": boolean,
      "has_curtains": boolean,
      "radiator_nearby": boolean,
      "cassonetto_geometry_notes": string,
      "surrounding_elements": array of short strings,
      "light_notes": string,
      "reflection_notes": string,
      "shadow_notes": string,
      "geometry_notes": string,
      "outdoor_view_notes": string,
      "preserve_notes": string
    }
  ],

  "tipo_apertura": one of: "battente_1_anta"|"battente_2_ante"|"battente_3_ante"|"scorrevole"|"scorrevole_alzante"|"vasistas"|"anta_ribalta"|"bilico"|"fisso"|"portafinestra",
  "materiale_attuale": one of: "pvc"|"alluminio"|"legno"|"legno_alluminio"|"acciaio_corten"|"acciaio_minimale"|"unknown",
  "colore_attuale": string,
  "condizioni": one of: "buone"|"usurato"|"danneggiato"|"fatiscente"|"unknown",
  "stile_edificio": string,
  "num_ante_attuale": number,
  "presenza_cassonetto": boolean,
  "presenza_davanzale": boolean,
  "presenza_inferriata": boolean,
  "larghezza_stimata_cm": number or null,
  "altezza_stimata_cm": number or null,
  "cinghia_attuale": one of: "con_cinghia"|"senza_cinghia"|"unknown",
  "note_analisi": string
}

═══ CRITICAL CLASSIFICATION RULES — READ CAREFULLY ═══

[1] HOW TO COUNT SASHES (sash_count)
Count the VERTICAL GLAZED PANELS separated by VERTICAL MULLIONS in the frame.
- 1 single vertical pane = 1 anta
- 2 vertical panes separated by 1 central mullion = 2 ante
- 3 vertical panes separated by 2 mullions = 3 ante
- 4 vertical panes separated by 3 mullions = 4 ante
Count ONLY vertical subdivisions for the sash count. A horizontal transom does
NOT add to sash_count (it adds a transom, see point [4]).

[2] HOW TO DISTINGUISH BATTENTE vs SCORREVOLE vs PORTAFINESTRA
- BATTENTE (casement): vertical panes hinged on the lateral stiles. You can see
  hinges on the left or right edge of each pane. Each pane has compact European
  hinges (2 per sash typically). The pane opens INWARD or OUTWARD on a hinge.
- SCORREVOLE (sliding): panes slide horizontally on visible tracks at top and
  bottom of the frame. NO hinges visible on lateral stiles. Often one pane
  visibly overlaps the other (offset depth).
- PORTAFINESTRA (door-window / french door): a BATTENTE/SCORREVOLE that extends
  to the floor (no sill/parapet break). Estimated height ≥ 200cm. Usually has
  a railing/balcony outside. Use "portafinestra" for type_current AND set
  perceived_element="door_window".

IMPORTANT: when in doubt between battente and scorrevole, check for HINGES on
the lateral stiles. Hinges visible = battente. Smooth stiles + tracks = scorrevole.
Most Italian residential portefinestre are BATTENTE (3 ante battenti is common).

[3] EXAMPLES (use these as reference)
- 1 vertical pane + hinges left + height 150cm + sill → "battente_1_anta", sash_count=1
- 2 vertical panes + central mullion + hinges on outer stiles + height 150cm
  → "battente_2_ante", sash_count=2
- 3 vertical panes + 2 mullions + hinges on outer stiles + height 230cm + railing
  → "portafinestra", perceived_element="door_window", sash_count=3
- 2 vertical panes + visible bottom track + no hinges + smooth stiles
  → "scorrevole", sash_count=2

[4] TRANSOMS
- has_horizontal_transom=true ONLY when a REAL horizontal frame bar divides
  upper/lower glazed area (typical on tall portefinestre).
- A transom does NOT change sash_count. A portafinestra 3 ante with transom
  has sash_count=3 + has_horizontal_transom=true.
- transom_position_pct: vertical position from top=0 to bottom=100.

═══ CASSONETTO DETECTION (CRITICAL — v8.6.28) ═══

Italian portafinestre have THREE possible cassonetto configurations. Choose ONE precisely:

CASE A — "external_box":
  Set has_cassonetto=true AND cassonetto_style="external_box" if you can see:
  1. A volumetric 3D BOX above the window frame, with visible DEPTH (front face, bottom edge, sometimes side edges). It is NOT flush with the wall — there is a clear edge/shadow line where the box meets the wall above and the frame below.
  2. The box width matches (or closely matches) the window opening width.
  3. (Optional) Different material visible (wood grain, PVC texture, aluminum surface). Note: a real cassonetto CAN be painted the same color as the wall — what matters is the volumetric shape, not the color contrast. If you see a distinct edge/shadow line outlining a rectangular box above the frame, it IS an external_box even if it's painted to match the wall.

CASE B — "internal_monoblocco" (the most common in modern Italian housing):
  Set has_cassonetto=true AND cassonetto_style="internal_monoblocco" if:
  - You see roller shutter slats stored INSIDE the window opening (typically as a horizontal band at the top of each sash, visible through the glass or just below the inner frame head), AND
  - You do NOT see any external box projecting from the wall above the frame.
  This means the cassonetto exists but is RECESSED INSIDE THE WALL (incassato/monoblocco). The slats are visible from inside the room as a striped band at the top of each glazed sash.

CASE C — "absent":
  Set has_cassonetto=false AND cassonetto_style="absent" if:
  - No roller shutter slats visible anywhere.
  - No box above the frame.
  - The wall above the frame is plain wall (paint, plaster, lintel, cornice — none of these is a cassonetto).

If uncertain between cases:
- See clear edges/shadows of a 3D box above the frame? → "external_box" (even if same color as wall)
- See roller shutter slats but NO volumetric box edges? → "internal_monoblocco"
- See no box AND no slats? → "absent"

False external_box on a flat wall is bad (AI invents a projecting box). False internal_monoblocco on a real external box is also bad (AI hides the box that should be visible). Use the volumetric/edge criteria above to decide.

DO NOT confuse with:
- Window header / lintel (structural wall element above frame) → "absent" if no slats, "internal_monoblocco" if slats visible
- Decorative cornice or crown moulding → "absent"
- Curtain rod or valance → "absent"
- Shadow band from overhanging element → "absent"
- Painted accent strip on wall → "absent"

═══ ROLLER SHUTTER DETECTION ═══

has_roller_shutter: true if you see actual roller shutter slats (the curtain) ANYWHERE — either fully lowered, partially lowered, or as a "stored" striped band at the top of the sash interior (typical of internal_monoblocco). The slats are recognizable by their horizontal striped/dotted pattern.

If has_roller_shutter=true, the cassonetto MUST exist somewhere — choose external_box if you see a projecting box, or internal_monoblocco if shutters are visible but no external box.

═══ OTHER NOTES ═══

- If a cassonetto is visible (meeting all criteria above), describe its apparent envelope/proportions in "cassonetto_geometry_notes".
- If the roller shutter curtain is not visibly lowered, use "fully_raised_hidden" or "not_visible" instead of inventing a visible band.
- If only a small recessed top band is visible, use "top_recessed_band".
- Detect manual belt and wall winder carefully: if visible, set both "has_belt" and "has_belt_box" consistently.
- If a manual belt/winder is visible, localize it precisely with "belt_placement" and "belt_placement_notes" (for example right_wall, left_reveal, etc.). Treat a vertical manual control on the wall beside the window as a manual belt system.
- Estimate "estimated_height_cm" when possible. Portafinestra ≈ 210-250 cm; finestra normale ≈ 120-170 cm. Use null if uncertain.

Respond with ONLY the JSON object. No extra text.`;

const BATHROOM_SYSTEM_PROMPT = `You are an expert Italian bathroom analyzer.
Analyze the provided bathroom image and extract structured information about the visible room.
You MUST respond with a valid JSON object only — no markdown, no explanation, just pure JSON.`;

const BATHROOM_USER_PROMPT = `Analyze this bathroom photo and return ONLY a JSON object with these exact fields:

{
  "tipo_stanza": string,
  "dimensione_stimata": string,
  "altezza_stimata": string,
  "piastrelle_parete_attuali": string,
  "pavimento_attuale": string,
  "colori_dominanti": array of short color strings,
  "presenza_doccia": boolean,
  "tipo_doccia": string or null,
  "presenza_vasca": boolean,
  "presenza_mobile": boolean,
  "tipo_mobile": string or null,
  "sanitari_tipo": string or null,
  "rubinetteria_attuale": string or null,
  "illuminazione_attuale": string or null,
  "stato_conservazione": one of: "buono"|"discreto"|"da_ristrutturare",
  "note": string
}

Respond with ONLY the JSON object. No extra text.`;

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

function normalizeBathroomAnalysis(input: Record<string, unknown>): Record<string, unknown> {
  const colors = Array.isArray(input.colori_dominanti)
    ? input.colori_dominanti.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];

  const conservation = typeof input.stato_conservazione === "string"
    ? input.stato_conservazione.trim().toLowerCase().replace(/\s+/g, "_")
    : "";

  return {
    tipo_stanza: stringOrDefault(input.tipo_stanza, "bagno"),
    dimensione_stimata: stringOrDefault(input.dimensione_stimata, "dimensione non identificata"),
    altezza_stimata: stringOrDefault(input.altezza_stimata, "altezza non identificata"),
    piastrelle_parete_attuali: stringOrDefault(input.piastrelle_parete_attuali, "non identificabili"),
    pavimento_attuale: stringOrDefault(input.pavimento_attuale, "non identificabile"),
    colori_dominanti: colors.slice(0, 8),
    presenza_doccia: booleanOrDefault(input.presenza_doccia, false),
    tipo_doccia: stringOrUndefined(input.tipo_doccia),
    presenza_vasca: booleanOrDefault(input.presenza_vasca, false),
    presenza_mobile: booleanOrDefault(input.presenza_mobile, false),
    tipo_mobile: stringOrUndefined(input.tipo_mobile),
    sanitari_tipo: stringOrUndefined(input.sanitari_tipo),
    rubinetteria_attuale: stringOrUndefined(input.rubinetteria_attuale),
    illuminazione_attuale: stringOrUndefined(input.illuminazione_attuale),
    stato_conservazione: conservation === "buono" || conservation === "da_ristrutturare" ? conservation : "discreto",
    note: stringOrUndefined(input.note),
  };
}

Deno.serve(async (req: Request) => {
  const corsH = getCorsHeaders(req);

  // ── CORS preflight ──────────────────────────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsH });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsH, "Content-Type": "application/json" },
    });
  }

  try {
    // ── Auth ────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "missing_auth", message: "Authorization header required" }),
        { status: 401, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    const auth = await requireAuth(req, corsH);
    const supabase = auth.supabaseAdmin;
    const user = { id: auth.userId };

    // ── Parse body ──────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { image_url, session_id, mode } = body as { image_url?: string; session_id?: string; mode?: string };
    const analyzeMode = (mode || "window").trim().toLowerCase();

    if (!image_url) {
      return new Response(
        JSON.stringify({ error: "validation_error", message: "image_url is required" }),
        { status: 400, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }
    if (!session_id) {
      return new Response(
        JSON.stringify({
          error: "validation_error",
          message: "session_id is required for tenant-scoped render analysis",
        }),
        { status: 400, headers: { ...corsH, "Content-Type": "application/json" } },
      );
    }

    const sessionTable = analyzeMode === "bathroom" ? "render_bagno_sessions" : "render_sessions";
    const analysisColumn = analyzeMode === "bathroom" ? "analisi_bagno" : "foto_analisi";

    // v8.6.22 — Selezioniamo anche la colonna analisi: se esiste già contenuto
    // valido, possiamo restituirlo senza richiamare Gemini/OpenAI (risparmio
    // 3-6s sulla rigenerazione e zero spreco di token Gemini).
    // Il client può forzare la rianalisi passando `force=true` nel body.
    const { data: sess } = await supabase
      .from(sessionTable)
      .select(`company_id, ${analysisColumn}`)
      .eq("id", session_id)
      .maybeSingle();

    const sessionCompanyId = (sess as { company_id?: string } | null)?.company_id;
    if (!sessionCompanyId) {
      return new Response(
        JSON.stringify({
          error: "session_not_found",
          message: "Sessione render non trovata per il session_id fornito.",
        }),
        { status: 404, headers: { ...corsH, "Content-Type": "application/json" } },
      );
    }

    await requireCompanyAccess(supabase, user.id, sessionCompanyId, corsH);

    // Early-return su analisi già esistente (v8.6.22):
    // Solo se non è stata richiesta una rianalisi esplicita (force=true)
    // E il payload analisi è non-null e ha le sezioni minime (oggetto con
    // almeno una proprietà). Esclude null/{} / "Unknown" fallback.
    const force = body.force === true;
    // deno-lint-ignore no-explicit-any
    const existingAnalysis = (sess as any)?.[analysisColumn];
    const hasValidExistingAnalysis = existingAnalysis &&
      typeof existingAnalysis === "object" &&
      Object.keys(existingAnalysis).length > 0;
    if (!force && hasValidExistingAnalysis) {
      console.log(JSON.stringify({
        lvl: "info",
        fn: "analyze-window-photo",
        msg: "analyze_skipped_cached_in_session",
        session_id,
        analyze_mode: analyzeMode,
      }));
      return new Response(
        JSON.stringify(
          analyzeMode === "bathroom"
            ? { success: true, analisi_bagno: existingAnalysis, cached: true }
            : { success: true, foto_analisi: existingAnalysis, cached: true },
        ),
        { status: 200, headers: { ...corsH, "Content-Type": "application/json" } },
      );
    }

    // v8.6.32 — Gemini eliminato. Solo OpenAI Vision per scene analysis.
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")?.trim() ?? "";

    if (!openaiApiKey) {
      return new Response(
        JSON.stringify({
          error: "config_error",
          message: "OPENAI_API_KEY non configurata. Configurare in Admin > Impostazioni AI > Render.",
        }),
        { status: 503, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // ── Scarica immagine e converte in base64 ───────────────────────────────
    const imgController = new AbortController();
    const imgTimeout = setTimeout(() => imgController.abort(), 30_000);
    let imgB64 = "";
    let mimeType = "image/jpeg";

    try {
      const imgResp = await fetch(image_url, { signal: imgController.signal });
      clearTimeout(imgTimeout);
      if (!imgResp.ok) throw new Error(`Fetch immagine fallito: ${imgResp.status}`);
      const contentType = imgResp.headers.get("content-type") ?? "image/jpeg";
      mimeType = contentType.split(";")[0] ?? "image/jpeg";
      const imgBuffer = await imgResp.arrayBuffer();
      imgB64 = bytesToBase64(imgBuffer);
    } catch (err) {
      clearTimeout(imgTimeout);
      return new Response(
        JSON.stringify({ error: "image_fetch_error", message: `Impossibile scaricare l'immagine: ${String(err)}` }),
        { status: 400, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // v8.6.32 — Solo OpenAI Vision (Gemini eliminato).
    const promptText = analyzeMode === "bathroom"
      ? `${BATHROOM_SYSTEM_PROMPT}\n\n${BATHROOM_USER_PROMPT}`
      : `${SYSTEM_PROMPT}\n\n${USER_PROMPT}`;

    const openaiModel = Deno.env.get("OPENAI_ANALYZE_MODEL")?.trim() ||
      "gpt-4o-mini";

    let rawText = "";
    let inputTokens = 0;
    let outputTokens = 0;
    const providerUsed: "openai" = "openai";
    let modelUsed = openaiModel;
    const providerErrors: string[] = [];

    if (openaiApiKey) {
      const openaiController = new AbortController();
      const openaiTimeout = setTimeout(() => openaiController.abort(), 60_000);
      try {
        const openaiResp = await fetch(
          "https://api.openai.com/v1/chat/completions",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${openaiApiKey}`,
            },
            body: JSON.stringify({
              model: openaiModel,
              messages: [{
                role: "user",
                content: [
                  { type: "text", text: promptText },
                  {
                    type: "image_url",
                    image_url: { url: `data:${mimeType};base64,${imgB64}` },
                  },
                ],
              }],
              temperature: 0.1,
              max_tokens: 1024,
              response_format: { type: "json_object" },
            }),
            signal: openaiController.signal,
          },
        );
        clearTimeout(openaiTimeout);
        if (!openaiResp.ok) {
          const errText = await openaiResp.text();
          throw new Error(`OpenAI ${openaiResp.status}: ${errText.substring(0, 200)}`);
        }
        const openaiData = await openaiResp.json();
        rawText = openaiData.choices?.[0]?.message?.content ?? "";
        inputTokens = Number(openaiData.usage?.prompt_tokens ?? 0);
        outputTokens = Number(openaiData.usage?.completion_tokens ?? 0);
        if (!rawText.trim()) throw new Error("OpenAI ritorna response vuota");
        modelUsed = openaiModel;
        console.log(JSON.stringify({
          lvl: "info",
          fn: "analyze-window-photo",
          msg: "openai_vision_success",
          tokens_in: inputTokens,
          tokens_out: outputTokens,
        }));
      } catch (err) {
        clearTimeout(openaiTimeout);
        const msg = err instanceof Error ? err.message : String(err);
        providerErrors.push(`openai: ${msg}`);
      }
    }

    // ── Se il provider è fallito ────────────────────────────────
    if (!rawText) {
      return new Response(
        JSON.stringify({
          error: "ai_error",
          message: `Analisi AI fallita su tutti i provider: ${providerErrors.join(" | ")}`,
        }),
        { status: 502, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    // ── Charge billing per provider usato ──────────────────────────────────
    await chargeDirectAiCall({
      supabase,
      idempotencyKey: `render_photo_analysis_${sessionCompanyId}_${user.id}_${session_id}_${analyzeMode}`,
      companyId: sessionCompanyId,
      userId: user.id,
      taskKey: analyzeMode === "bathroom" ? "render_bathroom_photo_analysis" : "render_window_photo_analysis",
      tierKey: "t2_vision",
      modelUsed,
      tokensIn: inputTokens,
      tokensOut: outputTokens,
      costRealUsd: estimateTokenCostUsd({
        provider: providerUsed,
        inputTokens,
        outputTokens,
        fallbackCostUsd: 0.002,
      }),
      metadata: { session_id, mode: analyzeMode, provider_used: providerUsed },
    });

    // ── Parse JSON dalla risposta ───────────────────────────────────────────
    let fotoAnalisi: Record<string, unknown> = {};
    try {
      // Estrai JSON anche se c'è testo extra o markdown code block
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("Nessun JSON trovato nella risposta");
      fotoAnalisi = JSON.parse(jsonMatch[0]);
      if (analyzeMode === "bathroom") {
        fotoAnalisi = normalizeBathroomAnalysis(fotoAnalisi);
      } else {
        fotoAnalisi = normalizeWindowSceneAnalysis(fotoAnalisi) as unknown as Record<string, unknown>;
      }
    } catch {
      return new Response(
        JSON.stringify({
          error: "parse_error",
          message: "Impossibile analizzare la risposta AI",
          raw: rawText.substring(0, 500),
        }),
        { status: 422, headers: { ...corsH, "Content-Type": "application/json" } }
      );
    }

    await supabase
      .from(sessionTable)
      .update({ [analysisColumn]: fotoAnalisi })
      .eq("id", session_id)
      .eq("company_id", sessionCompanyId);

    return new Response(
      JSON.stringify(
        analyzeMode === "bathroom"
          ? { success: true, analisi_bagno: fotoAnalisi }
          : { success: true, foto_analisi: fotoAnalisi },
      ),
      { status: 200, headers: { ...corsH, "Content-Type": "application/json" } }
    );

  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[analyze-window-photo] Unhandled error:", err);
    return new Response(
      JSON.stringify({ error: "internal_error", message: String(err) }),
      { status: 500, headers: { ...corsH, "Content-Type": "application/json" } }
    );
  }
});
