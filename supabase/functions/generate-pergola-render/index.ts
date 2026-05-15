// generate-pergola-render — Edge Function EiC
// Render Pergole AI — Provider unificato OpenRouter + fallback
// Prompt Engine v1.0 — surgical outdoor pergola installation visualization

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import {
  deductRenderCreditSafe,
  refundRenderCreditSafe,
} from "../_shared/renderCreditDeduct.ts";
import { captureRealCost } from "../_shared/renderCost.ts";
import { prepareInputImage } from "../_shared/renderImage.ts";
import { editImage } from "../_shared/ai-provider/image.ts";

const PERGOLA_TYPE: Record<string, string> = {
  addossata:
    "wall-mounted pergola attached to the facade with a rear beam/ledger and front support posts",
  autoportante:
    "freestanding pergola with independent post-and-beam structure, no wall dependency",
  bioclimatica_addossata:
    "wall-mounted bioclimatic pergola with technical aluminum frame and orientable roof louvers",
  bioclimatica_autoportante:
    "freestanding bioclimatic pergola with independent aluminum frame and orientable roof louvers",
  telo_addossata:
    "wall-mounted pergola with retractable technical fabric canopy and visible tension/track logic",
  telo_autoportante:
    "freestanding pergola with retractable technical fabric canopy and independent posts",
  vetro_addossata:
    "wall-mounted glass-roof pergola with transparent roof panels, structural profiles and drainage edges",
  vetro_autoportante:
    "freestanding glass-roof pergola with transparent roof panels and independent structural supports",
  legno_addossata:
    "wall-mounted laminated timber pergola with warm structural beams and realistic carpentry joints",
  legno_autoportante:
    "freestanding laminated timber pergola with robust posts, beams and realistic outdoor joinery",
};

const MATERIAL: Record<string, string> = {
  alluminio:
    "powder-coated aluminum profiles, crisp edges, slim technical sections and modern outdoor durability",
  alluminio_effetto_legno:
    "powder-coated aluminum with credible wood-effect finish, visible grain direction but crisp metal profile geometry",
  legno_lamellare:
    "laminated timber with believable grain, warm tone, structural beams and realistic outdoor protective finish",
  acciaio:
    "painted steel structure with slightly heavier sections, welded/bolted details and durable outdoor coating",
  misto:
    "mixed aluminum/wood structure with coherent material junctions and no random hybrid detailing",
};

const COVER: Record<string, string> = {
  lamelle_orientabili:
    "bioclimatic orientable aluminum louvers, repeated blades in a precise roof grid, integrated perimeter frame",
  telo_retraibile:
    "retractable technical fabric cover with visible textile tension, tracks and collection logic",
  vetro:
    "glass roof panels with transparent/reflection behavior, structural rafters and realistic seals",
  policarbonato:
    "polycarbonate roof panels with translucent light diffusion, panel ribs and realistic edge seals",
  listelli_legno:
    "slatted timber sunshade roof with repeated battens, partial shade and visible gaps",
  copertura_opaca_tecnica:
    "technical opaque insulated cover with clean planar panels, edge trims and drainage logic",
};

const COVER_STATE: Record<string, string> = {
  chiusa:
    "roof cover closed; shade/water protection visually active and continuous",
  semi_aperta:
    "roof cover partially open with clear intermediate state and realistic light stripes",
  aperta:
    "roof cover open enough to reveal sky/light path through the structure",
  lamelle_15:
    "louvers tilted about 15 degrees, almost closed with narrow light gaps",
  lamelle_30:
    "louvers tilted about 30 degrees with directional light filtering",
  lamelle_45:
    "louvers tilted about 45 degrees, visibly bioclimatic and semi-open",
  lamelle_90:
    "louvers vertical/open at about 90 degrees, roof visibly open between blades",
  telo_raccolto:
    "fabric canopy retracted and collected at one side/box, leaving roof mostly open",
  telo_disteso:
    "fabric canopy fully extended and tensioned, textile surface continuous and credible",
};

const SIDE: Record<string, string> = {
  nessuna: "no side closures; perimeter stays open and airy",
  vetrata_slide:
    "sliding glass side panels with transparent reflections, slim tracks and realistic overlap",
  screen_zip:
    "technical ZIP screens in side tracks, taut textile screen surface, not decorative curtains",
  tenda_tecnica:
    "technical side curtains with outdoor fabric, controlled folds and track/guide logic",
  frangivento:
    "windbreak panels with transparent or translucent outdoor barrier behavior",
  pannelli_fissi:
    "fixed side panels attached to posts with coherent frame and anchoring",
  brise_soleil:
    "architectural brise-soleil side blades with repeated lamellas and structural supports",
};

const LIGHTS: Record<string, string> = {
  nessuna: "no added lighting fixtures",
  strip_led_perimetrale:
    "warm-white integrated LED strip along inner perimeter profiles, subtle realistic glow",
  spot_integrati:
    "small recessed spotlights integrated into beams or roof frame, evenly spaced and buildable",
  downlight_lineari:
    "linear downlights integrated into structural beams with clean modern light distribution",
  applique_coordinate:
    "coordinated wall or post-mounted outdoor applique lights, sparse and realistic",
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function bool(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function bullets(lines: Array<string | null | undefined>): string {
  return lines.filter((line): line is string => Boolean(line && line.trim()))
    .map((line) => `- ${line}`).join("\n");
}

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

function dataUrlToBytes(
  dataUrl: string,
): { bytes: Uint8Array; mimeType: string; extension: string } {
  const match = dataUrl.match(
    /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/,
  );
  if (!match) {
    throw new Error("Formato immagine provider non valido");
  }

  const mimeType = match[1];
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  const extension = mimeType.includes("png")
    ? "png"
    : mimeType.includes("webp")
    ? "webp"
    : mimeType.includes("jpeg") || mimeType.includes("jpg")
    ? "jpg"
    : "png";

  return { bytes, mimeType, extension };
}

function buildPergolaPrompt(session: Record<string, unknown>) {
  const config = asRecord(session.config);
  const install = asRecord(config.installazione);
  const struttura = asRecord(config.struttura);
  const copertura = asRecord(config.copertura);
  const chiusure = asRecord(config.chiusure_laterali);
  const arredo = asRecord(config.arredo);

  const operation = text(config.operazione, "add_new_pergola");
  const zone = text(install.zona, "addossata_facciata");
  const wallMounted = bool(
    install.addossata_si_no,
    text(struttura.tipo).includes("addossata"),
  );
  const tipoPergola = text(
    struttura.tipo,
    wallMounted ? "bioclimatica_addossata" : "bioclimatica_autoportante",
  );
  const material = text(struttura.materiale, "alluminio");
  const coverType = text(copertura.tipo, "lamelle_orientabili");
  const coverState = text(copertura.stato, "lamelle_45");
  const sideType = text(chiusure.tipo, "nessuna");
  const sideState = text(chiusure.stato, "aperte");
  const lighting = text(config.illuminazione, "nessuna");
  const colorName = text(struttura.colore_nome, "Antracite RAL 7016");
  const colorHex = text(struttura.colore_hex, "#30343B");
  const notes = text(config.note_libere);

  const targetMap = {
    zone,
    target_description: zone === "custom"
      ? text(
        install.descrizione_zona,
        "user-described outdoor installation zone",
      )
      : zone.replace(/_/g, " "),
    footprint: `${text(install.larghezza_apparente, "media")} width x ${
      text(install.profondita_apparente, "standard")
    } depth apparent footprint, scaled to the photographed outdoor area and never oversized`,
    rear_attachment_line: wallMounted
      ? "rear beam/ledger follows the facade plane at a buildable height above doors/windows without cutting frames, shutters, eaves or gutters"
      : "no rear wall attachment; structure stands independently inside the target footprint",
    clearances: [
      "doors and door-windows remain operable",
      "shutters, windows, handles, thresholds, gutters, eaves and parapets are not blocked",
      "walkable passages remain plausible",
    ],
  };

  const postCount = Number(install.numero_montanti || (wallMounted ? 2 : 4));
  const envelope = {
    structural_height: text(
      install.altezza_apparente,
      "standard buildable clear height",
    ),
    post_count: postCount,
    post_positions: wallMounted
      ? ["front-left grounded post", "front-right grounded post"]
      : ["four grounded corner posts aligned to perspective"],
    anchoring_logic: `${
      text(
        install.ancoraggio_a_terra,
        zone === "giardino_relax" ? "prato_con_plinti" : "pavimento",
      ).replace(/_/g, " ")
    } anchoring with believable foot plates / concealed anchors / foundations`,
    facade_relation: wallMounted
      ? "explicit wall-mounted relation with credible facade attachment and waterproof rear junction"
      : "freestanding independent structure; no fake wall brackets",
    drainage_logic:
      "integrated water management: perimeter gutter/profile or slight pitch must make rainwater runoff plausible; downpipe only if visible/selected and coherent",
  };

  const additions: string[] = [];
  const replacements: string[] = [];
  const recolors: string[] = [];
  const removals: string[] = [];
  const conversions: string[] = [
    "Respect target installation map and installability envelope.",
    envelope.drainage_logic,
    "No floating posts, no impossible spans, no blocked doors/windows, no collision with shutters/gutters/parapets/pool edge.",
  ];

  const pergolaSpec = `${PERGOLA_TYPE[tipoPergola] || tipoPergola}; ${
    MATERIAL[material] || material
  }; color ${colorName} (${colorHex}); cover ${
    COVER[coverType] || coverType
  }; state ${COVER_STATE[coverState] || coverState}`;

  if (operation === "replace_existing_awning_with_pergola") {
    removals.push(
      "Remove existing awning / tenda da sole / cassette / articulated arms / brackets / fabric tracks completely if visible.",
    );
    removals.push(
      "Patch the facade and contact points cleanly where old awning brackets or cassettes were removed.",
    );
    replacements.push(
      `Replace the old shading system with the selected pergola: ${pergolaSpec}.`,
    );
    conversions.push(
      "No old awning arms, fabric, cassette or support brackets may remain.",
    );
  } else if (operation === "replace_existing_pergola") {
    removals.push(
      "Remove the existing pergola/canopy/tettoia completely, including incompatible posts, beams, roof panels, brackets and floor anchors.",
    );
    replacements.push(
      `Install only the newly selected pergola system: ${pergolaSpec}.`,
    );
    conversions.push("Do not mix old and new pergola structures.");
  } else if (operation === "recolor_only") {
    recolors.push(
      `Change only the existing pergola structure finish/color to ${colorName} (${colorHex}).`,
    );
    conversions.push(
      "Recolor-only: preserve exact footprint, post positions, beam geometry, cover type, side closures and structural proportions.",
    );
  } else if (operation === "change_cover_only") {
    replacements.push(
      `Keep existing pergola structure and replace only the roof/cover system with ${
        COVER[coverType] || coverType
      }; ${COVER_STATE[coverState] || coverState}.`,
    );
    conversions.push(
      "Cover-only: do not move posts or beams; only cover, edge trims and drainage details may adapt.",
    );
  } else if (operation === "add_side_closures") {
    additions.push(
      `Add side closures: ${SIDE[sideType] || sideType}; state ${
        sideState.replace(/_/g, " ")
      }.`,
    );
    conversions.push(
      "Side closure addition must not change structure, cover or footprint except required tracks/guides.",
    );
  } else if (operation === "remove_side_closures") {
    removals.push(
      "Remove side closures, screens, curtains, panels and visible tracks/guides where incompatible with an open pergola perimeter.",
    );
    conversions.push(
      "Restore clean open perimeter with no dangling rails or fabric.",
    );
  } else if (operation === "change_open_state") {
    replacements.push(
      `Change only the cover/opening state: ${
        COVER_STATE[coverState] || coverState
      }.`,
    );
    conversions.push(
      "Open-state change preserves structure, footprint, material, side closures and mounting.",
    );
  } else {
    additions.push(
      `Install a new ${
        tipoPergola.replace(/_/g, " ")
      } in the target zone: ${pergolaSpec}.`,
    );
    conversions.push(
      "Do not remove existing architecture; adapt only contact shadows and realistic installation junctions.",
    );
  }

  if (sideType !== "nessuna" && operation !== "remove_side_closures") {
    additions.push(
      `Include side closure system only where selected: ${
        SIDE[sideType] || sideType
      }; state ${
        sideState.replace(/_/g, " ")
      }; avoid generic decorative curtains.`,
    );
  }
  if (lighting !== "nessuna") {
    additions.push(
      `Add integrated lighting: ${
        LIGHTS[lighting] || lighting
      }; sparse, buildable and consistent with the pergola profiles.`,
    );
  }
  if (text(arredo.gestisci_arredo, "mantieni") === "mantieni") {
    conversions.push(
      "Preserve existing outdoor furniture in place; adapt only pergola shadows and light interaction over it.",
    );
  } else if (text(arredo.gestisci_arredo) === "aggiungi_minimo") {
    additions.push(
      `Add only sparse coherent outdoor furniture for ${
        text(arredo.uso_area, "relax").replace(/_/g, " ")
      } use below pergola, avoiding showroom staging.`,
    );
  } else if (text(arredo.gestisci_arredo) === "rimuovi_superfluo") {
    removals.push(
      "Declutter only small non-essential outdoor objects; do not remove primary functional furniture unless listed.",
    );
  }

  const preserve = [
    "same house, facade, doors, windows and shutters unless explicitly targeted",
    "paving outside pergola footprint",
    "garden, pool, parapets, railings, walls, fences and neighboring buildings",
    "outdoor furniture unless explicitly changed",
    "sky, weather, camera angle, perspective, crop, image dimensions and orientation",
  ];

  const blocks: Record<string, string> = {
    A: `[BLOCK A - MISSION]\nYou are a SURGICAL PHOTOREALISTIC PERGOLA INSTALLATION IMAGE EDITOR. Insert, replace, recolor or update exactly the requested pergola / outdoor shading system on the same photographed property. Mandatory: same house, same facade, same patio / terrace / garden, same camera angle, same perspective, same openings, same paving, same surrounding context, same image dimensions, no artistic reinterpretation and no different-property generation.`,
    B: `[BLOCK B - EXISTING OUTDOOR SCENE INVENTORY]\nOutdoor area: infer from photo (${
      zone.replace(/_/g, " ")
    }). Facade/openings: read all doors, windows, shutters, thresholds, eaves and gutters from the image. Existing paving, pool, parapets, garden, furniture, walls, fences and neighboring context must be preserved unless explicitly selected. Preserve original light and shadows.`,
    C: `[BLOCK C - TARGET INSTALLATION MAP]\nZone: ${targetMap.target_description}\nFootprint: ${targetMap.footprint}\nRear attachment line: ${targetMap.rear_attachment_line}\nClearances:\n${
      bullets(targetMap.clearances)
    }\nNo-occupy zones: inside pool water, outside terrace parapet, through facade openings, over neighboring property, through furniture legs.`,
    D: `[BLOCK D - INSTALLABILITY ENVELOPE]\nStructural height: ${envelope.structural_height}\nPost count: ${envelope.post_count}\nPost positions:\n${
      bullets(envelope.post_positions)
    }\nAnchoring: ${envelope.anchoring_logic}\nFacade relation: ${envelope.facade_relation}\nDrainage: ${envelope.drainage_logic}\nForbidden placements: floating posts, impossible spans, rear beam cutting windows/doors, roof with no drainage, oversized boxy structure.`,
    E: `[BLOCK E - REPLACEMENT MANIFEST]\nOperation: ${operation}\nAdditions:\n${
      bullets(
        additions.length
          ? additions
          : ["no additions unless explicitly selected"],
      )
    }\nReplacements:\n${
      bullets(
        replacements.length
          ? replacements
          : ["no replacement unless explicitly selected"],
      )
    }\nRecolors:\n${
      bullets(
        recolors.length ? recolors : ["no recolor unless explicitly selected"],
      )
    }\nRemovals:\n${
      bullets(
        removals.length ? removals : [
          "remove only incompatible elements if required by selected operation",
        ],
      )
    }\nConversion rules:\n${bullets(conversions)}\nPreserve exactly:\n${
      bullets(preserve)
    }`,
    F: `[BLOCK F - PERGOLA STRUCTURE SPECIFICATION]\nTypology: ${tipoPergola}; ${
      PERGOLA_TYPE[tipoPergola] || tipoPergola
    }\nWall-mounted: ${
      wallMounted ? "yes" : "no, freestanding independent"
    }\nMaterial: ${
      MATERIAL[material] || material
    }\nColor/finish: ${colorName} (${colorHex})\nPosts and beams: grounded, proportional to span, believable joints, no floating or impossible structure.`,
    G: `[BLOCK G - ROOF / COVER SYSTEM SPECIFICATION]\nCover type: ${coverType}; ${
      COVER[coverType] || coverType
    }\nOpen state: ${
      COVER_STATE[coverState] || coverState
    }\nCover must read as selected system, not a generic canopy; align modules/blades/fabric/glass panels to the same perspective and light.`,
    H: `[BLOCK H - SIDE CLOSURES SPECIFICATION]\nSide closure: ${sideType}; ${
      SIDE[sideType] || sideType
    }; state ${
      sideState.replace(/_/g, " ")
    }. Must attach to posts/beams with tracks, guides or panels where relevant; no random curtains unless selected.`,
    I: `[BLOCK I - DRAINAGE / WATER MANAGEMENT RULES]\n${
      bullets([
        envelope.drainage_logic,
        "wall-mounted pergolas need plausible rear waterproof junction and front/side runoff logic",
        "glass, polycarbonate and opaque covers need visible edge profiles, seals and drainage-compatible slope",
        "bioclimatic louvers need integrated perimeter water channel logic",
        "fabric covers need believable tension/collection profile, not water-heavy sagging textile",
      ])
    }`,
    J: `[BLOCK J - INSTALLATION REALISM RULES]\n${
      bullets([
        envelope.anchoring_logic,
        "wall attachments, post foot plates, profile transitions and contact shadows must be credible",
        "no blocked door/window operation unless explicitly accepted",
        "no collision with shutters, windows, eaves, gutters, parapets, pool edge or furniture",
        "new shadows and reflected light must match original sun direction and outdoor context",
      ])
    }`,
    K: `[BLOCK K - UNDER-PERGOLA AREA RULES]\nPreserve existing outdoor furniture unless replacement/addition/declutter is explicitly selected. If furniture is below the pergola, keep it in place and adapt only shadows/light interaction. Preserve paving geometry, pool edge, terrace parapet and garden boundaries. Do not create random luxury staging.`,
    L: `[BLOCK L - REMOVAL / CONVERSION RULES]\n${
      bullets([
        ...removals,
        ...conversions,
        "if replacing an existing awning/pergola, remove old brackets/cassettes/arms/posts/rails/supports completely",
        "patch facade and floor contact points cleanly",
        "do not leave hybrid old/new systems",
        "if recolor-only, do not alter geometry, cover type, footprint or post positions",
      ])
    }`,
    M: `[BLOCK M - PROPERTY INTEGRITY]\n${bullets(preserve)}`,
    N: `[BLOCK N - PHOTOREALISM RULES]\nRealistic aluminum/wood/steel/glass/fabric/polycarbonate materials; realistic shadows, contact occlusion and reflected light; realistic scale and profile thickness; believable installation details, brackets, foot plates, seals, tracks and drainage; no warped geometry, no fake CGI showroom look.`,
    O: `[BLOCK O - NEGATIVE CONSTRAINTS]\nDo not redesign the house. Do not move windows or doors. Do not change facade unless cleanup requires tiny patching. Do not alter non-target paving, garden, pool or parapets. Do not add unrelated outdoor structures. Do not invent luxury furniture, plants, pools or decor. Do not create impossible spans, floating structures or a different property.`,
    P: `[BLOCK P - QUALITY BAR]\nProfessional pergola sales visualization; same-property realism; technically plausible installation; clearly recognizable selected pergola system; trustworthy output for commercial use.`,
  };

  const userPrompt = [
    blocks.B,
    blocks.C,
    blocks.D,
    blocks.E,
    blocks.F,
    blocks.G,
    blocks.H,
    blocks.I,
    blocks.J,
    blocks.K,
    blocks.L,
    blocks.M,
    blocks.N,
    blocks.O,
    blocks.P,
    notes ? `[ADDITIONAL USER NOTES]\n${notes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    systemPrompt: blocks.A,
    userPrompt,
    promptVersion: "pergola-v1.0.0",
    promptPayload: {
      scene_analysis: { outdoor_area: zone, wall_mounted: wallMounted },
      target_installation_map: targetMap,
      installability_envelope: envelope,
      replacement_manifest: {
        operation,
        additions,
        replacements,
        recolors,
        removals,
        conversions,
        preserve,
      },
      technical_specification: {
        tipoPergola,
        material,
        coverType,
        coverState,
        sideType,
        sideState,
        lighting,
        colorName,
        colorHex,
      },
      validation: { is_valid: true },
    },
  };
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

declare const EdgeRuntime:
  | { waitUntil?: (promise: Promise<unknown>) => void }
  | undefined;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function acceptedRenderResponse(sessionId: string) {
  return jsonResponse({
    success: true,
    accepted: true,
    session_id: sessionId,
    status: "processing",
  }, 202);
}

function runInBackground(promise: Promise<unknown>) {
  if (
    typeof EdgeRuntime !== "undefined" &&
    typeof EdgeRuntime?.waitUntil === "function"
  ) {
    EdgeRuntime.waitUntil(promise);
    return;
  }
  promise.catch((err) =>
    console.error("[generate-pergola-render] background fallback error:", err)
  );
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  let supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  let user = { id: "" };
  let refundableSessionId: string | null = null;
  let refundableCompanyId: string | null = null;
  let creditDeducted = false;

  try {
    const auth = await requireAuth(req, CORS);
    supabase = auth.supabaseAdmin;
    user = { id: auth.userId };

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
    refundableSessionId = session_id;

    const { data: session, error: sessionErr } = await supabase
      .from("render_pergole_sessions")
      .select("*")
      .eq("id", session_id)
      .single();

    if (sessionErr || !session) {
      return new Response(
        JSON.stringify({ error: "not_found", message: "Sessione non trovata" }),
        {
          status: 404,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
    }
    refundableCompanyId = session.company_id as string;

    const allowed = await canAccessCompany(
      supabase,
      user.id,
      session.company_id as string,
    );
    if (!allowed) {
      return new Response(
        JSON.stringify({
          error: "forbidden",
          message: "Accesso negato alla sessione render pergola",
        }),
        {
          status: 403,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
    }

    const existingResults = Array.isArray(session.result_urls)
      ? session.result_urls
      : [];
    if (session.status === "completed" && existingResults.length) {
      return jsonResponse({
        success: true,
        session_id,
        result_url: existingResults[0],
        result_urls: existingResults,
        already_completed: true,
      });
    }
    if (session.status === "processing") {
      return acceptedRenderResponse(session_id);
    }

    const deductResult = await deductRenderCreditSafe(supabase, {
      companyId: session.company_id as string,
      sessionId: session_id,
      userId: user.id,
      reasonMeta: { vertical: "pergole", edge_fn: "generate-pergola-render" },
      logTag: "generate-pergola-render",
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
    creditDeducted = true;

    await supabase
      .from("render_pergole_sessions")
      .update({
        status: "processing",
        processing_started_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    const renderJob = (async () => {
      const originalPath = session.original_photo_url as string;
      let imageUrl = originalPath;
      let effectiveWidth = target_width ?? undefined;
      let effectiveHeight = target_height ?? undefined;
      if (originalPath && !originalPath.startsWith("http")) {
        const prepared = await prepareInputImage({
          supabase,
          bucket: "pergole-originals",
          originalPath,
          hintWidth: target_width ?? null,
          hintHeight: target_height ?? null,
        });
        imageUrl = prepared.url;
        effectiveWidth = prepared.effective_width ?? effectiveWidth;
        effectiveHeight = prepared.effective_height ?? effectiveHeight;
      }

      const rawConfig =
        (config || (session.config as Record<string, unknown>) || {}) as Record<
          string,
          unknown
        >;
      const { systemPrompt, userPrompt, promptVersion, promptPayload } =
        buildPergolaPrompt({ ...session, config: rawConfig });
      const finalProviderPrompt = `${systemPrompt}\n\n${userPrompt}`;

      const imgResp = await fetchWithTimeout(imageUrl, {}, 30_000);
      if (!imgResp.ok) {
        throw new Error(
          `Impossibile leggere la foto originale (${imgResp.status})`,
        );
      }
      const imgBlob = await imgResp.blob();
      const providerResult = await editImage({
        prompt: finalProviderPrompt,
        sourceImageBlob: imgBlob,
        effectiveWidth,
        effectiveHeight,
        openaiQuality: "medium",
        timeoutMs: 180_000,
        metadata: {
          task_kind: "render_image_edit",
          company_id: session.company_id as string,
          session_id,
        },
      });
      const providerKey = providerResult.providerUsed === "gemini_direct"
        ? "gemini"
        : providerResult.providerUsed === "openrouter"
        ? "openrouter_image"
        : "openai";
      const modelUsed = providerResult.modelUsed;
      const providerRawResponse = {
        ...providerResult.rawResponse,
        _provider_used: providerResult.providerUsed,
        _model_used: modelUsed,
        _cost_usd: providerResult.costUsd ?? null,
        _cost_is_estimated: providerResult.costIsEstimated,
        _latency_ms: providerResult.latencyMs,
      };

      const uploadPayload = dataUrlToBytes(providerResult.imageDataUrl);
      const resultPath =
        `${session.company_id}/${session_id}/render_pergole_${Date.now()}.${uploadPayload.extension}`;
      const { error: uploadErr } = await supabase.storage.from(
        "pergole-results",
      ).upload(resultPath, uploadPayload.bytes, {
        contentType: uploadPayload.mimeType,
        upsert: true,
      });
      if (uploadErr) {
        throw new Error(`Errore upload risultato: ${uploadErr.message}`);
      }

      const { data: publicUrlData } = supabase.storage.from("pergole-results")
        .getPublicUrl(resultPath);
      const resultUrl = publicUrlData.publicUrl;
      const capture = await captureRealCost({
        supabase,
        providerKey,
        model: modelUsed,
        rawResponse: providerRawResponse,
        legacyFallbackEur: Number(providerRawResponse._cost_usd ?? 0) > 0
          ? Number(providerRawResponse._cost_usd) * 0.92
          : 0.039,
      });
      const { data: providerConfig } = await supabase
        .from("render_provider_config")
        .select("id, cost_billed_per_render, renders_generated")
        .eq("provider_key", providerKey)
        .maybeSingle();
      const costReal = capture.cost_eur;
      const costBilled = Number(providerConfig?.cost_billed_per_render ?? 0.10);

      await supabase
        .from("render_pergole_sessions")
        .update({
          status: "completed",
          result_urls: [resultUrl],
          prompt_used: userPrompt,
          prompt_version: promptVersion,
          prompt_char_count: finalProviderPrompt.length,
          provider_key: providerKey,
          cost_real: costReal,
          cost_billed: costBilled,
          config_snapshot: {
            ...rawConfig,
            pergole_render_payload: promptPayload,
            provider_model_used: modelUsed,
            provider_attempts: providerResult.attempts,
          },
          processing_completed_at: new Date().toISOString(),
        })
        .eq("id", session_id);

      if (providerConfig?.id) {
        await supabase
          .from("render_provider_config")
          .update({
            renders_generated: Number(providerConfig.renders_generated ?? 0) +
              1,
          })
          .eq("id", providerConfig.id);
      }

      return new Response(
        JSON.stringify({
          success: true,
          session_id,
          result_url: resultUrl,
          provider: providerKey,
          model: modelUsed,
          attempts: providerResult.attempts,
          prompt_version: promptVersion,
          prompt_char_count: finalProviderPrompt.length,
        }),
        {
          status: 200,
          headers: { ...CORS, "Content-Type": "application/json" },
        },
      );
    })().catch(async (jobErr: unknown) => {
      const msg = jobErr instanceof Error ? jobErr.message : String(jobErr);
      console.error("[generate-pergola-render] background error:", msg);
      await refundRenderCreditSafe(supabase, {
        companyId: session.company_id as string,
        sessionId: session_id,
        userId: user.id,
        reasonMeta: {
          vertical: "pergole",
          edge_fn: "generate-pergola-render",
          error: msg.substring(0, 500),
        },
        logTag: "generate-pergola-render",
      });
      await supabase
        .from("render_pergole_sessions")
        .update({
          status: "failed",
          error_message: msg,
          processing_completed_at: new Date().toISOString(),
        })
        .eq("id", session_id);
    });

    runInBackground(renderJob);
    return acceptedRenderResponse(session_id);
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-pergola-render] error:", msg);
    try {
      const body2 = await req.clone().json().catch(() => ({}));
      const sid = (body2 as { session_id?: string }).session_id;
      if (sid) {
        if (creditDeducted && refundableCompanyId && refundableSessionId) {
          await refundRenderCreditSafe(supabase, {
            companyId: refundableCompanyId,
            sessionId: refundableSessionId,
            userId: user.id,
            reasonMeta: {
              vertical: "pergole",
              edge_fn: "generate-pergola-render",
              error: msg.substring(0, 500),
            },
            logTag: "generate-pergola-render",
          });
        }
        await supabase.from("render_pergole_sessions").update({
          status: "failed",
          error_message: msg,
        }).eq("id", sid);
      }
    } catch { /* ignore */ }

    return new Response(
      JSON.stringify({ error: "render_failed", message: msg }),
      {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      },
    );
  }
});
