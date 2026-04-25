// generate-pool-render - Edge Function EiC
// Render Piscine AI - Multi-provider (OpenAI / Gemini)
// Prompt Engine v1.0 - surgical outdoor pool insertion / replacement

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";
import { bytesToBase64 } from "../_shared/base64.ts";
import { prepareInputImage } from "../_shared/renderImage.ts";
import {
  openAIImageEditResultToDataUrl,
  runOpenAIImageEditWithFallback,
} from "../_shared/openaiImageEdit.ts";

const POOL_TYPE: Record<string, string> = {
  interrata_rettangolare: "in-ground rectangular residential pool with crisp straight geometry and buildable proportions",
  interrata_organica: "in-ground freeform organic pool integrated into the garden landscape with a natural curved perimeter",
  lap_pool: "long narrow lap pool, linear and proportional, clearly designed for swimming lanes",
  plunge_pool: "compact premium plunge pool, small but architectural, integrated into patio/garden",
  sfioro_rettangolare: "rectangular overflow pool with continuous premium edge and water close to upper coping level",
  infinity_pool: "infinity-edge pool only where view/level context supports it, with one readable vanishing overflow edge",
  semi_incassata: "semi-inground premium pool with visible raised edge and clean deck/landscape integration",
  fuori_terra_premium: "premium above-ground pool with architectural cladding/base, never inflatable or cheap-looking",
  minipiscina: "compact spa-like mini pool integrated into terrace/patio with precise coping and technical details",
  terrazzo_compatta: "compact terrace/rooftop-compatible pool only if the scene visually supports it",
};

const WATER_SYSTEM: Record<string, string> = {
  skimmer: "traditional premium skimmer system: waterline sits slightly below coping; no overflow or infinity-edge behavior",
  sfioro: "overflow system: water level very close to the upper edge with a continuous premium perimeter",
  infinity_edge: "infinity edge: one edge visually spills toward a lower/view side only if the scene supports a drop, view or terrace edge",
  sfioro_nascosto: "hidden overflow system: clean flush waterline with very discreet channel detail and no visible skimmer look",
};

const INTERIOR_FINISH: Record<string, string> = {
  mosaico_bianco: "white pool mosaic, bright base tone, high water clarity and luminous light-blue reflections",
  mosaico_azzurro: "classic light-blue mosaic, familiar clear-blue water tone with small tesserae visible only where close enough",
  mosaico_grigio: "contemporary grey mosaic, elegant muted blue-grey water, controlled reflections and premium tone",
  mosaico_antracite: "dark anthracite mosaic, deeper dramatic water color with more mirror-like reflections and visible depth gradient",
  gres_effetto_pietra: "stone-effect porcelain pool finish, natural mineral base, refined water tone, not a flat blue texture",
  gres_effetto_sabbia: "sand-effect porcelain pool finish, pale beach-like base, turquoise/sandy shallow water perception",
  liner_chiaro: "premium light liner, clean uniform base and soft clear water, no cheap plastic appearance",
  liner_scuro: "premium dark liner, deep blue/charcoal water with stronger reflection and depth shading",
  resina_premium: "premium continuous resin pool finish, seamless surface, soft reflections and no visible tile grid",
  pietra_naturale_pool_finish: "natural stone pool finish, subtle mineral irregularity and luxurious grounded water tone",
};

const WATER_LOOK: Record<string, string> = {
  cristallina_chiara: "crystal-clear light water with realistic transparency and visible shallow-depth gradient",
  azzurra_classica: "classic residential blue water, natural under sunlight, not neon or fantasy",
  turchese: "turquoise water influenced by light interior finish and sky reflection, realistic and premium",
  grigio_verde_naturale: "natural grey-green water tone, refined and landscape-integrated, not dirty",
  blu_profondo: "deeper blue water tone with believable depth shading and reflective highlights",
  sabbia_chiara: "light sandy water tone for beach-entry/shallow areas, transparent and warm",
};

const COPING: Record<string, string> = {
  pietra_chiara: "light natural-stone coping with visible thickness, soft bevel and continuous perimeter",
  pietra_grigia: "grey stone coping, contemporary tactile slabs, consistent size and clean junctions",
  gres_2cm: "2 cm outdoor porcelain coping, thin modern slabs, crisp rectified edges and precise joints",
  travertino: "travertine coping with warm beige tone, natural pores, believable thickness and premium edge profile",
  legno_wpc: "WPC/wood deck coping transition, warm board direction and realistic outdoor plank joints",
  cemento_spazzolato: "brushed concrete coping, modern matte texture, realistic formed edge and subtle variation",
  bordo_sottile_moderno: "thin modern coping edge, minimal profile, precise continuous line around the pool",
  bordo_massivo_classico: "thicker classic coping, substantial edge profile and traditional residential character",
};

const AREA: Record<string, string> = {
  mantieni_esistente: "preserve existing surrounding lawn/deck/paving except precise pool insertion junctions",
  deck_wpc: "WPC/wood-look solarium deck around the pool, boards aligned to perspective with real plank joints",
  solarium_gres: "outdoor porcelain solarium paving, slip-resistant slabs, realistic joints and clean perimeter",
  pietra_naturale: "natural-stone poolside paving with believable slabs, thickness and material variation",
  prato_raccordato: "lawn restored and cleanly cut around coping, no muddy AI-smudged edge",
  ghiaia_drenante: "draining gravel perimeter, controlled texture, realistic containment edge",
};

const ACCESS: Record<string, string> = {
  nessuno: "no added access feature; do not invent stairs, ladder or beach shelf",
  scala_inox: "stainless-steel pool ladder, properly anchored to coping with realistic metal reflections",
  gradini_angolo: "corner entry steps, visible below water, proportional and integrated into pool geometry",
  gradini_frontali: "front entry steps, clearly readable through water and aligned to the main pool axis",
  gradoni_lounge: "wide internal lounge steps / seating ledge, shallow zone clearly visible and integrated",
  spiaggetta: "baja shelf / tanning ledge, broad shallow area with thinner transparent water and clear level transition",
  beach_entry: "beach entry sloped shallow access, gradual water depth and natural walk-in geometry",
};

const ACCESSORY: Record<string, string> = {
  illuminazione_subacquea: "subtle underwater lights integrated into pool walls, realistic soft glow only if lighting conditions support visibility",
  lama_dacqua: "linear water blade feature, physically attached to wall/edge and flowing into pool, not decorative fantasy",
  cascata: "small architectural waterfall feature, scale-appropriate and connected to pool edge/wall",
  idromassaggio_integrato: "integrated spa/hydromassage zone, visible jets and seating only if selected, coherent with pool geometry",
  copertura_isotermica: "thermal pool cover only if requested, physically aligned with water surface and stored/closed coherently",
  copertura_rigida: "rigid pool cover with believable panels or shuttered surface, no arbitrary tarp look",
  doccia_esterna: "outdoor shower near poolside, sparse and buildable, not a random decorative object",
  zona_prendisole: "minimal sunbathing area with restrained loungers only if space supports it",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

declare const EdgeRuntime: { waitUntil?: (promise: Promise<unknown>) => void } | undefined;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function acceptedRenderResponse(sessionId: string) {
  return jsonResponse({ success: true, accepted: true, session_id: sessionId, status: "processing" }, 202);
}

function runInBackground(promise: Promise<unknown>) {
  if (typeof EdgeRuntime !== "undefined" && typeof EdgeRuntime?.waitUntil === "function") {
    EdgeRuntime.waitUntil(promise);
    return;
  }
  promise.catch((err) => console.error("[generate-pool-render] background fallback error:", err));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function bullets(lines: Array<string | null | undefined>): string {
  return lines.filter((line): line is string => Boolean(line && line.trim())).map((line) => `- ${line}`).join("\n");
}

function resolveRenderSize(w?: number, h?: number): string {
  if (!w || !h) return "1024x1024";
  const ratio = w / h;
  if (ratio > 1.4) return "1792x1024";
  if (ratio < 0.7) return "1024x1792";
  return "1024x1024";
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeoutMs = 120_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 2, delayMs = 2000): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || i === retries || res.status < 500) return res;
    } catch (err) {
      if (i === retries) throw err;
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs * (i + 1)));
  }
  throw new Error("fetchWithRetry: all retries exhausted");
}

function inferInfinityFeasibility(zone: string, insertion: Record<string, unknown>, piscina: Record<string, unknown>): "plausible" | "limited" | "not_plausible" {
  const context = `${zone} ${text(insertion.posizione_descrittiva)} ${text(insertion.rapporto_con_casa)} ${text(insertion.interferenze_note)}`.toLowerCase();
  if (context.includes("senza vista") || context.includes("senza disliv") || context.includes("flat enclosed") || context.includes("piatto chiuso") || context.includes("nessun disliv")) {
    return text(piscina.sistema_bordo) === "infinity_edge" ? "limited" : "not_plausible";
  }
  if (context.includes("panoram") || context.includes("vista") || context.includes("terraz") || context.includes("disliv") || context.includes("slope") || context.includes("edge") || zone === "vista_panoramica" || zone === "bordo_terrazza") {
    return "plausible";
  }
  return text(piscina.sistema_bordo) === "infinity_edge" ? "limited" : "not_plausible";
}

function buildPoolPrompt(session: Record<string, unknown>, photoMeta: { width?: number; height?: number } = {}) {
  const config = asRecord(session.config);
  const insertion = asRecord(config.inserimento);
  const piscina = asRecord(config.piscina);
  const finiture = asRecord(config.finiture);
  const comfort = asRecord(config.comfort);

  const operation = text(config.operazione, "add_new_pool");
  const zone = text(insertion.zona, "giardino_centrale");
  const poolType = text(piscina.tipo, "interrata_rettangolare");
  const shape = text(piscina.forma, "rettangolare");
  const size = text(piscina.dimensione_apparente, text(insertion.footprint_apparente, "media"));
  const waterSystem = text(piscina.sistema_bordo, "skimmer");
  const interiorFinish = text(finiture.rivestimento_interno, "mosaico_grigio");
  const waterLook = text(piscina.colore_acqua, "cristallina_chiara");
  const coping = text(finiture.coping, "travertino");
  const deck = text(finiture.area_perimetrale, "prato_raccordato");
  const access = text(comfort.accesso, "gradini_angolo");
  const accessories = list(comfort.accessori);
  const lighting = text(comfort.illuminazione, "nessuna");
  const furniture = text(comfort.arredo, "mantieni");
  const notes = text(config.note_libere);
  const preserveUser = list(config.elementi_da_preservare);
  const removeUser = list(config.elementi_da_rimuovere);

  const infinityFeasibility = inferInfinityFeasibility(zone, insertion, piscina);
  const isAboveGround = ["fuori_terra_premium", "semi_incassata", "terrazzo_compatta", "minipiscina"].includes(poolType);
  const orientation = photoMeta.width && photoMeta.height
    ? photoMeta.width > photoMeta.height ? "landscape" : photoMeta.width < photoMeta.height ? "portrait" : "square"
    : "unknown";

  const targetMap = {
    zone,
    targetDescription: text(insertion.posizione_descrittiva) || zone.replace(/_/g, " "),
    footprint: `${size.replace(/_/g, " ")} ${shape.replace(/_/g, " ")} footprint, width ${text(insertion.larghezza_apparente, "media")}, length ${text(insertion.lunghezza_apparente, "media")}, scaled to visible outdoor area and never oversized`,
    orientation: "align pool long axis, coping lines, deck joints and water plane to the photographed ground perspective and visible vanishing points",
    limits: "keep realistic margins from house, doors, paths, walls, fences, trees, parapets and neighboring property",
    circulation: [
      "keep a plausible walking strip around visible pool edges",
      "do not block doors, windows, paths, stairs, gate access or existing patio circulation",
      "do not invade mature trees, walls, fences, parapets or neighboring property",
    ],
  };

  const envelope = {
    plausibleSize: `${targetMap.footprint}; pool must fit the visible space and must not dominate the garden unless the photo supports a large pool`,
    plausibleDepth: `${text(insertion.profondita_apparente, "standard")} apparent depth; show believable depth gradient, floor visibility and wall/floor junctions`,
    copingThickness: "visible coping thickness must be plausible: neither paper-thin nor oversized",
    deckMargins: `${deck.replace(/_/g, " ")} perimeter must create clean transitions to lawn/patio/deck with crisp, buildable edges`,
    groundPlaneRelation: isAboveGround
      ? "premium above-ground/semi-inground relation: show architectural base, cladding, support and deck integration; never cheap/inflatable"
      : "in-ground relation: basin and coping are integrated into the ground plane with believable excavation; no floating shell",
    houseAndPathRelation: text(insertion.rapporto_con_casa, "pool respects house access, doors/windows, paths and outdoor circulation"),
    infinityFeasibility,
  };

  const technical = {
    poolGeometry: `${POOL_TYPE[poolType] || poolType}; shape ${shape.replace(/_/g, " ")}; apparent size ${size.replace(/_/g, " ")}`,
    waterSystem: WATER_SYSTEM[waterSystem] || waterSystem,
    interiorFinish: INTERIOR_FINISH[interiorFinish] || interiorFinish,
    waterLook: `${WATER_LOOK[waterLook] || waterLook}; consistent with ${INTERIOR_FINISH[interiorFinish] || interiorFinish}`,
    access: ACCESS[access] || access,
    coping: COPING[coping] || coping,
    deck: AREA[deck] || deck,
    lighting: lighting === "nessuna"
      ? "no added pool lighting"
      : `${lighting.replace(/_/g, " ")} lighting, subtle, realistic, no fantasy glow`,
    accessories: accessories.map((item) => ACCESSORY[item] || item),
  };

  const additions: string[] = [];
  const replacements: string[] = [];
  const recolors: string[] = [];
  const removals: string[] = [];
  const conversions: string[] = [
    "Respect the target pool insertion map and buildability envelope.",
    envelope.groundPlaneRelation,
    "Pool edges, coping, water level and surrounding deck/lawn transitions must be clean, buildable and perspective-correct.",
  ];

  const poolSummary = `${technical.poolGeometry}; ${technical.waterSystem}; ${technical.interiorFinish}; ${technical.waterLook}; coping ${technical.coping}; surrounding ${technical.deck}.`;

  switch (operation) {
    case "replace_existing_pool":
      removals.push("Remove the existing pool completely: old basin/water plane, coping, incompatible deck edges, skimmers, ladders, pool lights and outdated visible pool details.");
      replacements.push(`Replace it with only the newly selected pool system: ${poolSummary}`);
      conversions.push("No hybrid state: no old pool perimeter, old coping, old waterline or old deck scars may remain.");
      break;
    case "remove_existing_pool":
      removals.push("Remove the existing pool completely: water, basin, coping, ladder, skimmer/overflow details, pool lights and incompatible deck edges.");
      replacements.push("Restore the target area as coherent lawn, patio, deck or hardscape matching the photographed context.");
      conversions.push("No residual basin ghost, blue water patch, coping outline or excavation scar may remain.");
      break;
    case "recolor_waterlook_or_liner_only":
      recolors.push(`Change only the perceived interior finish/water look to ${technical.interiorFinish} and ${technical.waterLook}.`);
      conversions.push("Waterlook/liner-only: preserve exact pool shape, footprint, coping, surrounding deck and visible pool geometry.");
      break;
    case "change_coping_only":
      replacements.push(`Preserve basin geometry and water; replace only coping/immediate pool edge with ${technical.coping}.`);
      conversions.push("Coping-only: no footprint change, no water-system change, no basin shape change.");
      break;
    case "add_access_system":
      additions.push(`Add selected pool access feature: ${technical.access}.`);
      conversions.push("Access system must be integrated into the basin shape, visible through water when underwater, and not randomly placed.");
      break;
    case "add_pool_features":
      additions.push(...technical.accessories);
      conversions.push("Pool features must appear only if selected, attached to real pool edges/walls/deck and scaled plausibly.");
      break;
    default:
      additions.push(`Insert a new pool in ${targetMap.targetDescription}: ${poolSummary}`);
      conversions.push("Integrate the basin into existing ground/patio/deck; do not leave a pasted-on blue rectangle.");
  }

  if (access !== "nessuno" && operation !== "remove_existing_pool") additions.push(`Access detail: ${technical.access}.`);
  if (lighting !== "nessuna" && operation !== "remove_existing_pool") additions.push(`Lighting detail: ${technical.lighting}.`);
  if (furniture === "aggiungi_minimo") additions.push("Add only sparse coherent poolside furniture / sun loungers if there is enough visible space; avoid resort staging.");
  if (furniture === "rimuovi_superfluo") removals.push("Declutter only small non-essential outdoor objects; do not remove fixed landscape or main furniture unless explicitly listed.");
  if (furniture === "mantieni") conversions.push("Preserve existing outdoor furniture in place; adapt only water/deck reflections and shadows around it.");
  for (const item of removeUser) removals.push(`Remove user-listed incompatible element: ${item}.`);

  const waterRealism = [
    "water must show realistic specular reflections, not flat painted blue",
    "water transparency must depend on depth, interior finish and scene lighting",
    "depth gradient and shadow inside the basin must be physically plausible",
    "subtle caustics are allowed only when natural and restrained",
    "reflections of sky, facade and vegetation must follow the original camera angle",
    "avoid neon-blue fantasy water and fake resort CGI look",
    waterSystem === "skimmer"
      ? "skimmer pool: waterline must sit slightly below coping; do not render overflow or infinity-edge behavior"
      : waterSystem === "infinity_edge"
        ? "infinity pool: use one plausible edge only if visual drop/view supports it; if context is flat/enclosed, render a safer premium flush overflow edge instead"
        : "overflow pool: water level nearly flush with edge, continuous premium perimeter, no skimmer ambiguity",
    access === "spiaggetta" || access === "beach_entry"
      ? "shallow zone must be clearly readable with thinner transparent water and a smooth depth transition"
      : access.includes("grad")
        ? "steps must be visible, proportional, aligned to pool geometry and readable through the water"
        : "do not invent access features beyond selected configuration",
  ];

  const preserve = [
    "same house, facade, windows, doors and outdoor architecture",
    "non-target lawn, paving, deck, patio and garden areas",
    "trees, important vegetation, fences, walls, boundaries and neighboring buildings",
    "existing outdoor furniture unless explicitly changed or decluttered",
    "sky, weather, camera angle, perspective, crop, image dimensions and orientation",
    ...preserveUser,
  ];

  const negative = [
    "do not redesign the house",
    "do not move windows, doors, fences, walls or fixed outdoor structures",
    "do not alter non-target garden, lawn, paving, deck, patio or neighboring property",
    "do not invent random resort furniture, palm trees, fountains or luxury styling not requested",
    "do not create impossible infinity-edge conditions",
    "do not create a floating, pasted-on or badly merged pool",
    "do not leave traces of removed pools, coping, deck edges or old water features",
    "do not generate a different property or generic outdoor catalog scene",
  ];

  const validation = {
    is_valid: !(waterSystem === "infinity_edge" && infinityFeasibility === "limited"),
    warnings: waterSystem === "infinity_edge" && infinityFeasibility === "limited"
      ? ["Infinity edge selected in a limited context: constrain the output to a plausible premium flush overflow if no drop/view is visible."]
      : [],
    required_sections: [
      "target pool insertion map",
      "buildability envelope",
      "replacement manifest",
      "pool geometry specification",
      "water system specification",
      "interior finish and water look",
      "coping and deck rules",
      "water realism rules",
      "property integrity constraints",
    ],
  };

  const blocks: Record<string, string> = {
    A: `[BLOCK A - MISSION]\nYou are a SURGICAL PHOTOREALISTIC POOL INSERTION / REPLACEMENT IMAGE EDITOR. Add, replace, remove or refine exactly the requested swimming pool system on the same photographed property. Mandatory: same house, same garden/patio/outdoor space, same camera angle, same perspective, same surrounding structures, same openings, same context, same image dimensions, no artistic reinterpretation and no different-property generation.`,
    B: `[BLOCK B - EXISTING OUTDOOR SCENE INVENTORY]\nInfer the photographed outdoor scene precisely: property type, visible house/facade, existing lawn/patio/deck/hardscape, current topography/levels, existing pool or water if any, furniture, walls/fences/boundaries, vegetation, paths/circulation, light and shadow direction. Photo orientation: ${orientation}. Preserve all non-target context.`,
    C: `[BLOCK C - TARGET POOL INSERTION MAP]\nZone: ${targetMap.zone}\nTarget description: ${targetMap.targetDescription}\nFootprint: ${targetMap.footprint}\nOrientation: ${targetMap.orientation}\nLimits: ${targetMap.limits}\nCirculation:\n${bullets(targetMap.circulation)}`,
    D: `[BLOCK D - BUILDABILITY ENVELOPE]\nPlausible size: ${envelope.plausibleSize}\nPlausible depth: ${envelope.plausibleDepth}\nCoping thickness: ${envelope.copingThickness}\nDeck/perimeter margins: ${envelope.deckMargins}\nGround-plane relation: ${envelope.groundPlaneRelation}\nHouse/path relation: ${envelope.houseAndPathRelation}\nInfinity feasibility: ${envelope.infinityFeasibility}\nForbidden placements:\n${bullets(["floating or pasted-on pool shell", "pool crossing house walls, doors, thresholds, fences, major trees or non-target stairs", "oversized pool leaving no circulation in a compact garden", "infinity edge in a flat enclosed garden with no visual drop/view support", "water plane with no coping, depth, shadow or edge logic"])}`,
    E: `[BLOCK E - REPLACEMENT MANIFEST]\nOperation: ${operation}\nAdditions:\n${bullets(additions.length ? additions : ["no additions unless explicitly selected"])}\nReplacements:\n${bullets(replacements.length ? replacements : ["no replacement unless explicitly selected"])}\nRecolors:\n${bullets(recolors.length ? recolors : ["no recolor unless explicitly selected"])}\nRemovals:\n${bullets(removals.length ? removals : ["remove only incompatible elements if required by selected operation"])}\nConversion rules:\n${bullets(conversions)}\nPreserve exactly:\n${bullets(preserve)}`,
    F: `[BLOCK F - POOL GEOMETRY SPECIFICATION]\nPool typology: ${poolType}\nGeometry: ${technical.poolGeometry}\nInstallation type: ${isAboveGround ? "premium above-ground / semi-inground / compact system with visible base and edge integration" : "in-ground pool inserted into terrain with believable excavation and coping"}\nScale rule: pool must look proportionate to the photographed outdoor space, with readable basin walls/floor and no pasted-on footprint.`,
    G: `[BLOCK G - WATER SYSTEM SPECIFICATION]\nWater system: ${waterSystem}\nRules: ${technical.waterSystem}\nNo hybrid ambiguity: skimmer, overflow and infinity-edge behavior must not be mixed unless explicitly selected.`,
    H: `[BLOCK H - INTERIOR FINISH AND WATER LOOK]\nInterior finish: ${interiorFinish}\nFinish behavior: ${technical.interiorFinish}\nWater look: ${technical.waterLook}\nWater must not be a flat blue fill; it must respond to finish, depth, sky, facade, vegetation, shadows and camera angle.`,
    I: `[BLOCK I - ACCESS AND COMFORT FEATURES]\nAccess system: ${technical.access}\nAccessories:\n${bullets(technical.accessories.length ? technical.accessories : ["no extra water features, spa, shower or cover unless explicitly selected"])}\nLighting: ${technical.lighting}\nIf not selected, do not invent ladders, stairs, beach entry, jets, waterfalls, covers or resort furniture.`,
    J: `[BLOCK J - COPING AND SURROUNDING DECK RULES]\nCoping: ${technical.coping}\nSurrounding area: ${technical.deck}\nRules:\n${bullets(["coping must be visible with plausible thickness and clean continuous perimeter", "deck/lawn/patio transitions must have crisp material junctions, not AI-smudged edges", "cut lines, joints, slab/plank direction and grass cuts must follow perspective", "surrounding deck/paving must not randomly expand into non-target garden areas"])}`,
    K: `[BLOCK K - WATER REALISM RULES]\n${bullets(waterRealism)}`,
    L: `[BLOCK L - INSTALLATION AND LANDSCAPE INTEGRATION RULES]\n${bullets([envelope.groundPlaneRelation, envelope.houseAndPathRelation, "no floating shell, no impossible excavation lines, no pool crossing non-target structures", "preserve trees and non-target landscape; adapt only pool footprint and immediate junctions", "poolside shadows, contact occlusion and water reflections must match original sun direction"])}`,
    M: `[BLOCK M - REMOVAL / CONVERSION RULES]\n${bullets([...removals, ...conversions, "if replacing an existing pool, remove old water plane, coping, deck scars, ladders, skimmers and incompatible details completely", "if recolor-only, do not alter pool geometry, footprint, coping or surrounding deck", "if changing coping only, do not alter basin geometry or water-system behavior", "do not leave hybrid old/new pool states"])}`,
    N: `[BLOCK N - PROPERTY INTEGRITY]\n${bullets(preserve)}`,
    O: `[BLOCK O - PHOTOREALISM RULES]\n${bullets(["realistic pool materials, coping, deck, lawn and hardscape junctions", "realistic water behavior, reflections, transparency, depth gradient and shadowing", "realistic scale relative to house, paths, furniture and vegetation", "no warped geometry, no fake CGI resort look, premium residential architectural outdoor visualization quality"])}`,
    P: `[BLOCK P - NEGATIVE CONSTRAINTS]\n${bullets(negative)}`,
    Q: `[BLOCK Q - QUALITY BAR]\n${bullets(["professional pool sales visualization", "same-property realism", "technically plausible pool insertion", "clearly recognizable selected pool system", "water, coping, deck transitions, shadows and contact occlusion must look photographic"])}\nValidation: ${validation.is_valid ? "passed" : validation.warnings.join(" ")}`,
  };

  const userPrompt = [
    blocks.B, blocks.C, blocks.D, blocks.E, blocks.F, blocks.G, blocks.H, blocks.I,
    blocks.J, blocks.K, blocks.L, blocks.M, blocks.N, blocks.O, blocks.P, blocks.Q,
    notes ? `[ADDITIONAL USER NOTES]\n${notes}` : "",
  ].filter(Boolean).join("\n\n");

  return {
    systemPrompt: blocks.A,
    userPrompt,
    promptVersion: "pool-v1.0.0",
    promptPayload: {
      scene_analysis: { inferred_from_photo: true, orientation },
      target_pool_insertion_map: targetMap,
      buildability_envelope: envelope,
      replacement_manifest: { operation, additions, replacements, recolors, removals, conversions, preserve },
      pool_geometry_specification: { poolType, shape, size, install: isAboveGround ? "above_or_semi_inground" : "inground" },
      water_system_specification: { waterSystem, description: technical.waterSystem },
      interior_finish_specification: { interiorFinish, waterLook, description: technical.waterLook },
      access_features_specification: { access, lighting, accessories },
      coping_deck_rules: { coping, deck, copingDescription: technical.coping, deckDescription: technical.deck },
      water_realism_rules: waterRealism,
      property_integrity_constraints: preserve,
      validation,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  let supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  let currentSessionId = "";

  try {
    const auth = await requireAuth(req, CORS);
    supabase = auth.supabaseAdmin;
    const userId = auth.userId;

    const body = await req.json().catch(() => ({}));
    const { session_id, config, target_width, target_height } = body as {
      session_id?: string;
      config?: Record<string, unknown>;
      target_width?: number;
      target_height?: number;
    };
    currentSessionId = session_id ?? "";

    if (!session_id) {
      return new Response(JSON.stringify({ error: "validation_error", message: "session_id is required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const { data: session, error: sessionErr } = await supabase
      .from("render_piscine_sessions")
      .select("*")
      .eq("id", session_id)
      .single();

    if (sessionErr || !session) {
      return new Response(JSON.stringify({ error: "not_found", message: "Sessione non trovata" }), {
        status: 404,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const allowed = await canAccessCompany(supabase, userId, session.company_id as string);
    if (!allowed) {
      return new Response(JSON.stringify({ error: "forbidden", message: "Accesso negato alla sessione render piscina" }), {
        status: 403,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const existingResults = Array.isArray(session.result_urls) ? session.result_urls : [];
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
      userId,
      reasonMeta: { vertical: "piscine", edge_fn: "generate-pool-render" },
      logTag: "generate-pool-render",
    });

    if (deductResult.status === "insufficient") {
      return new Response(JSON.stringify({ error: "insufficient_credits", message: "Crediti render insufficienti" }), {
        status: 402,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    await supabase
      .from("render_piscine_sessions")
      .update({ status: "processing", processing_started_at: new Date().toISOString() })
      .eq("id", session_id);

    const renderJob = (async () => {
    const originalPath = session.original_photo_url as string;
    let imageUrl = originalPath;
    if (originalPath && !originalPath.startsWith("http")) {
      const prepared = await prepareInputImage({
        supabase,
        bucket: "piscine-originals",
        originalPath,
        hintWidth: target_width ?? null,
        hintHeight: target_height ?? null,
      });
      imageUrl = prepared.url;
    }

    const rawConfig = (config || (session.config as Record<string, unknown>) || {}) as Record<string, unknown>;
    const { systemPrompt, userPrompt, promptVersion, promptPayload } = buildPoolPrompt(
      { ...session, config: rawConfig },
      { width: target_width, height: target_height },
    );
    const finalProviderPrompt = `${systemPrompt}\n\n${userPrompt}`;

    const { data: providerConfig } = await supabase
      .from("render_provider_config")
      .select("*")
      .eq("is_default", true)
      .eq("is_active", true)
      .single();

    if (!providerConfig) throw new Error("Nessun provider render attivo. Configurare in Admin > Impostazioni AI > Render.");

    const platformKeyName = `render_${providerConfig.provider_key}_api_key`;
    const { data: keyRow } = await supabase.from("platform_settings").select("value").eq("key", platformKeyName).maybeSingle();
    const envName = `${providerConfig.provider_key.toUpperCase()}_API_KEY`;
    const apiKey = (keyRow as { value: string } | null)?.value?.trim() || Deno.env.get(envName)?.trim() || "";
    if (!apiKey) throw new Error(`API key mancante per provider '${providerConfig.provider_key}'.`);

    let imageData: string | null = null;
    let modelUsed = String(providerConfig.model || "");

    if (providerConfig.provider_key === "openai") {
      const imgResp = await fetchWithTimeout(imageUrl, {}, 30_000);
      if (!imgResp.ok) throw new Error(`Impossibile leggere la foto originale (${imgResp.status})`);
      const imgBlob = await imgResp.blob();
      const openaiResult = await runOpenAIImageEditWithFallback({
        apiKey,
        prompt: finalProviderPrompt,
        image: imgBlob,
        filename: "photo.jpg",
        size: resolveRenderSize(target_width, target_height),
        configuredModel: providerConfig.model,
        fetcher: fetchWithRetry,
      });
      modelUsed = openaiResult.modelUsed;
      if (openaiResult.fallbackErrors.length > 0) {
        console.warn("[generate-pool-render] OpenAI model fallback:", openaiResult.fallbackErrors.join(" | "));
      }
      imageData = await openAIImageEditResultToDataUrl(
        openaiResult.data,
        (url, options = {}) => fetchWithTimeout(url, options, 30_000),
      );
    } else if (providerConfig.provider_key === "gemini") {
      const imgResp = await fetchWithTimeout(imageUrl, {}, 30_000);
      const imgBuffer = await imgResp.arrayBuffer();
      const imgB64 = bytesToBase64(imgBuffer);
      const geminiBody = {
        contents: [{ parts: [{ text: finalProviderPrompt }, { inline_data: { mime_type: "image/jpeg", data: imgB64 } }] }],
        generationConfig: { responseModalities: ["IMAGE", "TEXT"], temperature: 0.55 },
      };
      const geminiUrl = `${providerConfig.api_endpoint}/${providerConfig.model}:generateContent?key=${apiKey}`;
      const resp = await fetchWithRetry(geminiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
      });
      if (!resp.ok) throw new Error(`Gemini error ${resp.status}: ${(await resp.text()).substring(0, 300)}`);
      const gemData = await resp.json();
      const parts = gemData.candidates?.[0]?.content?.parts ?? [];
      for (const part of parts) {
        if (part.inlineData?.mimeType?.startsWith("image/")) {
          imageData = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
          break;
        }
      }
    } else {
      throw new Error(`Provider '${providerConfig.provider_key}' non supportato. Selezionare OpenAI o Gemini.`);
    }

    if (!imageData) throw new Error("Nessuna immagine ricevuta dal provider AI");

    const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
    const uint8 = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
    const resultPath = `${session.company_id}/${session_id}/render_piscine_${Date.now()}.png`;
    const { error: uploadErr } = await supabase.storage.from("piscine-results").upload(resultPath, uint8, {
      contentType: "image/png",
      upsert: true,
    });
    if (uploadErr) throw new Error(`Errore upload risultato: ${uploadErr.message}`);

    const { data: publicUrlData } = supabase.storage.from("piscine-results").getPublicUrl(resultPath);
    const resultUrl = publicUrlData.publicUrl;
    const costReal = providerConfig.cost_real_per_render ?? 0.04;
    const costBilled = providerConfig.cost_billed_per_render ?? 0.10;

    await supabase
      .from("render_piscine_sessions")
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
          pool_render_payload: promptPayload,
          provider_model_used: modelUsed,
        },
        analisi_piscine: promptPayload.scene_analysis,
        processing_completed_at: new Date().toISOString(),
      })
      .eq("id", session_id);

    await supabase
      .from("render_provider_config")
      .update({ renders_generated: (providerConfig.renders_generated ?? 0) + 1 })
      .eq("id", providerConfig.id);

    return new Response(JSON.stringify({ success: true, session_id, result_url: resultUrl, result_urls: [resultUrl], prompt_version: promptVersion, prompt_char_count: finalProviderPrompt.length }), {
      status: 200,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
    })().catch(async (jobErr: unknown) => {
      const msg = jobErr instanceof Error ? jobErr.message : String(jobErr);
      console.error("[generate-pool-render] background error:", msg);
      await supabase
        .from("render_piscine_sessions")
        .update({ status: "failed", error_message: msg, processing_completed_at: new Date().toISOString() })
        .eq("id", session_id);
    });

    runInBackground(renderJob);
    return acceptedRenderResponse(session_id);
  } catch (err: unknown) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[generate-pool-render] error:", msg);
    try {
      if (currentSessionId) {
        await supabase.from("render_piscine_sessions").update({ status: "failed", error_message: msg }).eq("id", currentSessionId);
      }
    } catch { /* ignore */ }

    return new Response(JSON.stringify({ error: "render_failed", message: msg }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
