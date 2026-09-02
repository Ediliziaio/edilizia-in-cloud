// generate-roof-render — Edge Function EiC
// Render Tetto AI — Provider unificato OpenRouter + fallback
// Prompt Engine v2.0 — surgical roof renovation visualization

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { rewriteDomainPrompt } from "../_shared/ai-provider/domainRewriter.ts";
import { ROOF_REWRITER_PROFILE } from "../_shared/ai-provider/roofRewriterProfile.ts";
import {
  describeFormatMismatch,
  detectImageDimensions,
} from "../_shared/imageDimensions.ts";
import { requireAuth } from "../_shared/auth.ts";
import { canAccessCompany } from "../_shared/effectiveCompany.ts";
import { deductRenderCreditSafe } from "../_shared/renderCreditDeduct.ts";
import { captureRealCost } from "../_shared/renderCost.ts";
import { prepareInputImage } from "../_shared/renderImage.ts";
import { bytesToBase64 } from "../_shared/base64.ts";
import { editImage } from "../_shared/ai-provider/image.ts";
import { callVisionQa, QA_BLOCCO_RICOMPOSIZIONE } from "../_shared/ai-provider/visionQa.ts";

// ── ROOF_PHYSICS ─────────────────────────────────────────────────────────────
const ROOF_PHYSICS: Record<string, string> = {
  tegole_coppi:
    "traditional curved terracotta coppi tiles (barrel tiles) — hand-formed half-cylinder profile, warm terracotta red-orange with natural color variation, rough matte porous surface, overlapping rows alternating concave-down and concave-up",
  tegole_marsigliesi:
    "Marseille interlocking clay tiles — flat body with single raised central rib, ~420x240mm, interlocking laps with visible overlap shadow lines, smooth matte ceramic surface",
  tegole_portoghesi:
    "Portuguese S-profile clay tiles — distinctive undulating S-curve cross-section, ~420x260mm, alternating convex/concave channels, deeper shadow lines creating strong visual rhythm",
  tegole_piane:
    "flat interlocking concrete or clay tiles — minimal profile with clean planar surface, very low raised edges, modern geometric appearance with tight joint lines",
  ardesia_naturale:
    "natural slate roofing tiles — hand-split natural stone slabs, dark blue-grey to charcoal, fine laminar surface texture, installed in courses with copper/stainless nails",
  ardesia_sintetica:
    "synthetic slate tiles — fiber-cement or recycled composite replicating natural slate, uniform 5mm thickness, consistent matte dark grey, embossed grain texture",
  lamiera_grecata:
    "trapezoidal corrugated metal sheet roofing — pre-painted galvanized steel with regular trapezoidal rib profile 35-55mm tall, continuous panels, visible screw fixings, crisp industrial shadow pattern",
  lamiera_aggraffata:
    "standing seam metal roofing — flat panels 400-530mm wide joined by raised vertical seams 25-38mm tall, no exposed fasteners, elegant modern minimalist appearance",
  lamiera_zinco_titanio:
    "zinc-titanium roofing — natural zinc alloy developing blue-grey patina, standing seam or flat-lock installation, subtle directional surface grain, premium contemporary material",
  guaina_bituminosa:
    "bituminous membrane flat roofing — multi-layer modified bitumen with mineral granule surface, visible torch-applied lap seams, slightly rough granular texture",
  guaina_tpo:
    "TPO single-ply membrane roofing — white/light-grey thermoplastic membrane, smooth slightly glossy surface, heat-welded lap seams, highly reflective for energy efficiency",
  tegole_fotovoltaiche:
    "solar roof tiles — building-integrated photovoltaic tiles, monocrystalline cells behind tempered glass, dark black or blue surface with subtle cell grid, flush-mounted",
};

const GRONDAIA_DESC: Record<string, string> = {
  alluminio:
    "pre-painted aluminum half-round or box gutter — lightweight, clean sharp edges, powder-coated, matching downpipe",
  rame:
    "natural copper half-round gutter — bright orange-copper developing verdigris patina, soldered joints, matching copper downpipes",
  acciaio_zincato:
    "galvanized steel gutter — hot-dip zinc coating with bright silver metallic finish, standard half-round profile, matching downpipes",
  pvc:
    "PVC plastic half-round gutter — smooth matte surface, clip-together joints, matching round PVC downpipes",
  zinco_titanio:
    "zinc-titanium half-round gutter — natural zinc developing blue-grey patina, soldered joints, premium appearance",
};

const LUCERNARIO_DESC: Record<string, string> = {
  piatto:
    "flat roof window (velux-style) — flush-mounted rectangular window, low-profile aluminum frame, double/triple glazed, visible flashing kit",
  sporgente:
    "protruding skylight — raised dome or pyramid projecting 150-300mm above roof, polycarbonate or glass dome with curb frame",
  abbaino:
    "dormer window — small gabled structure projecting vertically from slope, own mini-roof, side cheeks clad in matching material, front vertical window",
};

const FINITURA_DESC: Record<string, string> = {
  opaco: "matte finish with no unrealistic specular glare",
  semi_lucido: "semi-gloss finish with controlled soft highlights",
  lucido:
    "glossier finish with visible but physically plausible sky reflections",
};

const INTERVENTO_DESC: Record<string, string> = {
  sostituzione_manto:
    "replace the roof covering system while preserving roof geometry and untouched accessories",
  solo_colore:
    "recolor/refinish the existing covering only; preserve module geometry, ridges, gutters, skylights and accessories",
  lattonerie_accessori:
    "work only on selected accessories such as gutters, skylights, downpipes or photovoltaic elements; preserve the covering unless local flashing is required",
  sovracopertura_coibentata:
    "add an insulated over-roof/secondary package with realistic edge thickness, eaves, flashings and gutter adaptation",
  rifacimento_completo:
    "coordinate covering, insulation, gutters, flashings, skylights and photovoltaic elements as one buildable roof renovation",
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
    tutto_tetto:
      "all visible roof planes / the complete roof visible in the photo",
    falda_principale: "main visible roof slope only",
    falda_frontale: "front-facing roof slope only",
    falda_laterale: "side roof slope only",
    zona_specifica: text(
      target.descrizione_zona,
      "specific user-described roof zone",
    ),
  };
  const targetDescription = targetDescriptionMap[scope] ||
    targetDescriptionMap.tutto_tetto;
  const untouchedSlopes = scope === "tutto_tetto"
    ? "none; entire visible roof is in scope"
    : "all non-target visible roof planes must remain unchanged";

  const tipoManto = text(manto.tipo, "tegole_coppi");
  const mantoDesc = ROOF_PHYSICS[tipoManto] || tipoManto;
  const coloreHex = text(manto.colore_hex, "#b5651d");
  const coloreNome = text(manto.colore_nome, coloreHex);
  const finitura = FINITURA_DESC[text(manto.finitura, "opaco")] ||
    FINITURA_DESC.opaco;
  const coveringActive = [
    "sostituzione_manto",
    "sovracopertura_coibentata",
    "rifacimento_completo",
  ].includes(tipoIntervento);

  const scene = {
    buildingType:
      "same photographed building, infer residential/commercial type from the image",
    roofType: "existing roof geometry visible in the photo",
    currentCovering: "current photographed roof covering",
    visibleSlopes: scope === "tutto_tetto"
      ? "all visible roof planes"
      : targetDescription,
    contextToPreserve: [
      "facade",
      "windows",
      "doors",
      "sky",
      "vegetation",
      "street",
      "neighboring buildings",
      "people/vehicles if present",
    ],
  };

  const replacements: string[] = [];
  const additions: string[] = [];
  const removals: string[] = [];
  const conversionRules: string[] = [
    "Preserve exact roof pitch, ridge lines, hip/valley geometry, eaves, building proportions, camera angle and image dimensions.",
  ];
  const compatibilityAdjustments: string[] = [];
  const restorationRules: string[] = [];

  if (coveringActive) {
    replacements.push(
      `Replace roof covering on ${targetDescription} with ${mantoDesc}; color ${coloreNome} (${coloreHex}); finish ${finitura}.`,
    );
    conversionRules.push(
      "Remove incompatible details from the previous covering and rebuild ridge caps, flashings, valleys, hips, eaves and drip edges coherently for the selected system.",
    );
    compatibilityAdjustments.push(
      "Adapt ridge caps, valley/converse details, eaves, drip edges, flashings and local accessory returns to the selected covering family.",
    );
    if (isMetalOrMembrane(tipoManto)) {
      conversionRules.push(
        "If the original roof has coppi/tiles, remove all visible coppi/tiles, tile rows, tile overlaps and old ridge tile logic; introduce coherent metal/membrane panels, seams/laps, cappings, fasteners or heat-welded joints with no hybrid remnants.",
      );
      restorationRules.push(
        "Clear every trace of the previous tile/coppi rhythm before drawing metal seams or membrane laps on the same target roof plane.",
      );
    }
  } else if (tipoIntervento === "solo_colore") {
    replacements.push(
      `Recolor/refinish the existing roof covering on ${targetDescription} to ${coloreNome} (${coloreHex}), ${finitura}; do not change tile/panel geometry, module size, ridges, skylights, gutters, chimneys or accessories.`,
    );
    conversionRules.push(
      "Color-only operation: only surface color/finish changes; no new thickness, no new modules, no new panels, no new architectural details.",
    );
    compatibilityAdjustments.push(
      "No roof-system conversion, thickness change, new flashings, accessory relocation or geometry drift is allowed in color-only mode.",
    );
  } else {
    replacements.push(
      "Keep the existing roof covering unchanged except for small local flashing adjustments required by selected accessories.",
    );
    compatibilityAdjustments.push(
      "Accessory-only scope: preserve roof covering, facade, pitch, ridges and module geometry; update only selected accessory materials/details.",
    );
  }

  if (
    bool(isolamento.attivo) || tipoIntervento === "sovracopertura_coibentata"
  ) {
    additions.push(
      `Add realistic insulated over-roof package (${
        text(isolamento.tipo, "sarking_legno").replace(/_/g, " ")
      }, about ${
        Number(isolamento.spessore_cm || 10)
      } cm): visible only as plausible build-up thickness at eaves/edges, with adapted fascia, drip edges, flashings and gutter relationship; do not deform the building.`,
    );
    compatibilityAdjustments.push(
      "Resolve added roof package thickness at eaves, verges, wall abutments, ridge caps and gutter brackets; no floating or swollen roof edges.",
    );
  }

  if (bool(grondaie.attivo)) {
    const grMat = text(grondaie.materiale, "alluminio");
    replacements.push(
      `Replace gutters and downpipes only with ${
        GRONDAIA_DESC[grMat] || grMat
      }; gutter color ${text(grondaie.colore_hex, "#8b4513")}${
        text(grondaie.colore_pluviale_hex)
          ? `; downpipe color ${text(grondaie.colore_pluviale_hex)}`
          : ""
      }.`,
    );
    conversionRules.push(
      "Gutter/downpipe replacement must not change roof covering, facade, eave geometry or downpipe path except for material/color/detail of gutters, brackets, elbows and joints.",
    );
    compatibilityAdjustments.push(
      "Gutters/downpipes must align to the final drip edge and keep a plausible runoff path, bracket rhythm, joints, elbows and facade-mounted vertical line.",
    );
  }

  if (bool(lucernari.attivo)) {
    const azione = text(lucernari.azione, "mantieni");
    if (azione === "rimuovi") {
      removals.push(
        "Remove existing skylights/dormers completely and rebuild continuous roof covering at their former positions, with no ghost outline, frame, curb, flashing or color scar.",
      );
      restorationRules.push(
        "After skylight/dormer removal, restore the roof plane as uninterrupted covering: same module/seam rhythm, no rectangular scars, no old flashing shadow, no glass reflection.",
      );
    } else if (azione === "aggiungi") {
      const tipo = text(lucernari.tipo, "piatto");
      additions.push(
        `Add ${Number(lucernari.quantita || 1)} ${
          LUCERNARIO_DESC[tipo] || tipo
        } at ${
          text(lucernari.posizione, "centrale").replace(/_/g, " ")
        } on the target slope, with frame color ${
          text(lucernari.colore_telaio_hex, "#3c3c3c")
        }; integrate with correct opening cut, waterproof flashing kit, material returns, shadows and scale.`,
      );
      compatibilityAdjustments.push(
        "New skylights/dormers must avoid ridges, valleys, chimneys and photovoltaic arrays, and must show correct head/sill/side flashing for the selected roof system.",
      );
    } else {
      conversionRules.push(
        "Keep existing skylights/dormers in place and adapt only their flashing if surrounding covering changes.",
      );
      compatibilityAdjustments.push(
        "Existing skylight/dormer geometry remains fixed; only immediate local flashings may adapt to the new surrounding covering.",
      );
    }
  }

  if (bool(pannelli.attivo)) {
    const tipoP = text(pannelli.tipo, "fotovoltaico_nero");
    const tipoMap: Record<string, string> = {
      fotovoltaico_nero:
        "black monocrystalline photovoltaic panels with dark anti-reflective coating, slim aluminum frame",
      fotovoltaico_blu:
        "blue polycrystalline photovoltaic panels with characteristic blue shimmer, aluminum frame",
      tegola_solare_integrata:
        "building-integrated solar tiles replacing conventional tiles, flush-mounted, dark surface with subtle cell pattern",
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
    additions.push(
      `Add photovoltaic on ${pos}: ${tipoMap[tipoP] || tipoP}; ${
        qtyMap[text(pannelli.quantita, "medi")] || "medium array"
      }; ${mounting}; modules must align perfectly with roof plane, rows, perspective and shadows.`,
    );
    compatibilityAdjustments.push(
      "Photovoltaic modules must be rectangular, coplanar with the target slope, parallel to eaves/ridges, clear of skylights/chimneys/valleys, and mounted with credible rails or flush integration.",
    );
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

  const insulationActive = bool(isolamento.attivo) ||
    tipoIntervento === "sovracopertura_coibentata";
  const membrane = tipoManto.startsWith("guaina");
  const metal = tipoManto.startsWith("lamiera");
  const coveringFamily = isMetalOrMembrane(tipoManto)
    ? membrane ? "membrane/waterproofing roof system" : "metal roof system"
    : tipoManto === "tegole_fotovoltaiche"
    ? "building-integrated solar tile system"
    : "tile/slate roof system";
  const compatibilityWarnings = membrane
    ? [
      "Selected membrane covering requires low-slope-looking waterproofing logic: avoid tile-like pitched-roof texture and keep seams/laps technically plausible.",
    ]
    : [];
  const buildabilityEnvelope = {
    material_pitch_compatibility:
      `${coveringFamily} must follow the photographed roof pitch with correct module scale, eave-to-ridge direction and no roof-plane warping.`,
    insulation_thickness_effect: insulationActive
      ? `Insulated over-roof build-up is active: show about ${
        Number(isolamento.spessore_cm || 10)
      } cm only as plausible added thickness at eaves, verge/edge lines, flashings and gutter relationship; do not inflate or deform the house.`
      : "No insulation build-up is active: facade depth, eaves thickness and roof edge thickness remain unchanged.",
    eave_edge_adaptation: insulationActive
      ? "Eaves, fascia, verge trim, drip edges and gutter brackets must adapt to the new package thickness with crisp continuous lines."
      : "Eaves, fascia, verge trim, drip edges and gutter brackets preserve original depth unless material is explicitly replaced.",
    skylight_integration:
      bool(lucernari.attivo) && text(lucernari.azione) === "aggiungi"
        ? "New skylights require real opening cut, curb/frame, head/sill/side flashing and covering returns aligned to the target slope."
        : bool(lucernari.attivo) && text(lucernari.azione) === "rimuovi"
        ? "Removed skylights require continuous rebuilt covering, restored waterproofing and no frame, curb, flashing scar or ghost outline."
        : "Existing skylights/dormers are preserved unless explicitly active; adapt only immediate flashings if surrounding covering changes.",
    photovoltaic_integration: bool(pannelli.attivo)
      ? "Photovoltaic modules must fit within the visible slope plane, align in clean rows, use realistic rails/standoffs or flush integrated solar tiles, and never float above seams or ridges."
      : "No photovoltaic is added; preserve existing solar elements only if visible and not in scope.",
    gutter_compatibility: bool(grondaie.attivo)
      ? "New gutters/downpipes must connect credibly to the eave/drip-edge logic, with brackets, elbows and downpipe path aligned to the facade."
      : "Existing gutters/downpipes stay unchanged; only local relation to changed covering/insulation edge may adapt if physically necessary.",
    forbidden_results: [
      "floating over-roof thickness",
      "tile rows visible below a new metal or membrane system",
      "solar panels crossing ridges, valleys or skylights",
      "water-trap details around chimneys, skylights, valleys or wall abutments",
      "changed facade or changed building proportions",
      "mixed tile and metal module logic on the same target roof plane unless explicitly selected",
    ],
    compatibility_warnings: compatibilityWarnings,
  };

  const waterRules = {
    ridge_caps: metal
      ? "Use folded metal ridge/hip caps compatible with standing seam or corrugated sheet geometry; no clay ridge tiles remain on target slopes."
      : membrane
      ? "Use membrane-compatible cappings/termination bars at ridges, upstands or parapets; no tile ridge logic remains."
      : "Use coherent ridge/hip caps matching the selected tile/slate system, with realistic overlap and shadow.",
    valleys_hips:
      "Valleys, hips and converse lines remain aligned to the photographed roof geometry, with crisp waterproof transitions and no smeared AI seams.",
    eaves_drip_edges:
      "Eaves require believable drip edge, fascia/verge finish and runoff path into the gutter when present; no impossible water trap at roof edge.",
    flashings:
      "Chimneys, skylights, dormers and wall abutments need compatible step/apron/side flashings, correctly tucked under/over the selected covering.",
    gutters_downpipes: bool(grondaie.attivo)
      ? "New gutters/downpipes collect from the drip edge with plausible slope, brackets, joints, end caps, elbows and facade-mounted downpipe continuity."
      : "Existing gutters/downpipes remain as photographed unless an insulated edge requires a subtle physically necessary relationship update.",
    no_water_trap_rules: [
      "no open gaps uphill of skylights or chimneys",
      "no reverse-lap seams",
      "no valleys draining into blocked edges",
      "no decorative trims that would trap water",
      "no random gutter segments disconnected from downpipes",
    ],
  };

  const accessoryCompatibility = {
    preserve_accessories: [
      bool(grondaie.attivo) ? "" : "existing gutters/downpipes",
      bool(lucernari.attivo) ? "" : "existing skylights/dormers",
      "chimneys",
      "antennas",
      "life lines",
      "snow guards / paraneve if visible",
      "non-target photovoltaic if visible",
    ].filter(Boolean),
    replace_accessories: [
      bool(grondaie.attivo) ? "gutters and downpipes" : "",
      bool(lucernari.attivo) && text(lucernari.azione) === "aggiungi"
        ? "new skylight/dormer kit"
        : "",
      bool(pannelli.attivo) ? "photovoltaic mounting system" : "",
    ].filter(Boolean),
    remove_accessories: [
      bool(lucernari.attivo) && text(lucernari.azione) === "rimuovi"
        ? "existing skylights/dormers and their frames/curbs/flashings"
        : "",
    ].filter(Boolean),
    solar_compatibility: bool(pannelli.attivo)
      ? "Solar must be placed only on compatible visible roof planes, aligned to slope rows, with realistic mounting and no collision with skylights, chimneys, valleys or ridges."
      : "Solar state is preserved; do not invent photovoltaic panels.",
  };

  const executionPlan = [
    removals.length
      ? "1. Remove obsolete skylights/accessories and old incompatible covering details first."
      : "1. Lock original roof geometry and preserve non-target accessories first.",
    coveringActive
      ? "2. Rebuild target roof covering system with correct module/seam direction and roof-plane scale."
      : "2. Apply selected accessory/color intervention without changing covering system.",
    insulationActive
      ? "3. Resolve insulation thickness at eaves, verges, flashings and gutter relationship."
      : "",
    "4. Resolve waterproofing, ridges, hips, valleys, eaves and penetration flashings.",
    bool(grondaie.attivo)
      ? "5. Install/finish gutters and downpipes after edge/drip logic is defined."
      : "",
    bool(lucernari.attivo)
      ? "6. Integrate or remove skylights/dormers with restored roof-plane continuity."
      : "",
    bool(pannelli.attivo)
      ? "7. Place photovoltaic modules last, aligned to final roof plane and avoiding penetrations."
      : "",
  ].filter(Boolean);

  const blocks: Record<string, string> = {
    A: `[BLOCK A - MISSION]\nYou are a SURGICAL PHOTOREALISTIC ROOF RENOVATION IMAGE EDITOR. Apply exactly the selected roof intervention while preserving the same photographed building: same roof geometry, same camera angle, same facade, same context, same lighting and same image dimensions. No artistic reinterpretation and no different-building generation.`,
    B: `[BLOCK B - EXISTING ROOF INVENTORY]\nBuilding: ${scene.buildingType}\nRoof type: ${scene.roofType}\nVisible slopes: ${scene.visibleSlopes}\nCurrent covering: ${scene.currentCovering}\nContext to preserve: ${
      scene.contextToPreserve.join(", ")
    }\nRead all chimneys, skylights, dormers, gutters, ridges, hips, valleys, eaves, flashings, antennas and photovoltaic elements directly from the uploaded photo.`,
    C: `[BLOCK C - TARGET SLOPES MAP]\nScope: ${scope}\nTarget slopes: ${targetDescription}\nUntouched slopes: ${untouchedSlopes}\nAccessory zone: gutters, downpipes, skylights, dormers, ridges, hips, valleys and flashings only where explicitly active.`,
    D: `[BLOCK D - BUILDABILITY ENVELOPE]\nMaterial / pitch compatibility:\n- ${buildabilityEnvelope.material_pitch_compatibility}\nInsulation / over-roof thickness:\n- ${buildabilityEnvelope.insulation_thickness_effect}\nEave and edge adaptation:\n- ${buildabilityEnvelope.eave_edge_adaptation}\nSkylight / dormer integration:\n- ${buildabilityEnvelope.skylight_integration}\nPhotovoltaic integration:\n- ${buildabilityEnvelope.photovoltaic_integration}\nGutter compatibility:\n- ${buildabilityEnvelope.gutter_compatibility}\nForbidden impossible results:\n${
      bullets(buildabilityEnvelope.forbidden_results)
    }\n${
      buildabilityEnvelope.compatibility_warnings.length
        ? `Compatibility warnings:\n${
          bullets(buildabilityEnvelope.compatibility_warnings)
        }`
        : "Compatibility warnings: none."
    }`,
    E: `[BLOCK E - REPLACEMENT MANIFEST]\nIntervention: ${
      INTERVENTO_DESC[tipoIntervento] || INTERVENTO_DESC.sostituzione_manto
    }\nReplacements / refinishes:\n${bullets(replacements)}\nAdditions:\n${
      bullets(
        additions.length
          ? additions
          : ["no roof additions unless explicitly selected"],
      )
    }\nRemovals:\n${
      bullets(
        removals.length ? removals : [
          "remove only construction details made incompatible by selected interventions",
        ],
      )
    }\nCompatibility adjustments:\n${
      bullets(
        compatibilityAdjustments.length ? compatibilityAdjustments : [
          "no compatibility adjustments beyond physically necessary local flashings",
        ],
      )
    }\nRestoration rules:\n${
      bullets(
        restorationRules.length ? restorationRules : [
          "restore only surfaces directly affected by removals or conversion details",
        ],
      )
    }\nPreserve exactly:\n${bullets(preserve)}`,
    F: `[BLOCK F - NEW ROOF SYSTEM SPECIFICATION]\nCovering active: ${
      coveringActive
        ? "yes"
        : tipoIntervento === "solo_colore"
        ? "recolor only"
        : "no"
    }\nCovering type: ${tipoManto}\nMaterial / construction: ${mantoDesc}\nColor / finish: ${coloreNome} (${coloreHex}), ${finitura}\nRidge logic: coherent ridge caps, metal cappings or membrane cappings for the selected system.\nEdge logic: eaves, fascia, drip edges and roof borders stay aligned to the original geometry.\nFlashing logic: chimney, skylight, valley and wall flashings must be plausible for the selected covering.\nProfile/module geometry: tiles, seams, ribs, panels or membrane laps must follow the real roof plane with correct scale and perspective.`,
    G: `[BLOCK G - WATERPROOFING AND FLASHING RULES]\nRidge caps / cappings:\n- ${waterRules.ridge_caps}\nValleys / hips / converse:\n- ${waterRules.valleys_hips}\nEaves / drip edges:\n- ${waterRules.eaves_drip_edges}\nFlashings around penetrations:\n- ${waterRules.flashings}\nGutters / downpipes:\n- ${waterRules.gutters_downpipes}\nNo-water-trap rules:\n${
      bullets(waterRules.no_water_trap_rules)
    }`,
    H: `[BLOCK H - GUTTERS / DOWNPIPES / ACCESSORIES]\nGutters/downpipes: ${
      bool(grondaie.attivo)
        ? GRONDAIA_DESC[text(grondaie.materiale, "alluminio")] ||
          text(grondaie.materiale, "alluminio")
        : "keep existing gutters and downpipes unchanged"
    }\nSkylights/dormers: ${
      bool(lucernari.attivo) ? text(lucernari.azione, "mantieni") : "unchanged"
    }\nPhotovoltaic: ${
      bool(pannelli.attivo)
        ? "active; see replacement manifest and solar rules"
        : "do not add photovoltaic panels"
    }\nInsulation / over-roof: ${
      insulationActive
        ? "active; adapt thickness, eaves, flashings and gutters realistically"
        : "not active"
    }\nPreserve accessories:\n${
      bullets(accessoryCompatibility.preserve_accessories)
    }\nReplace accessories:\n${
      bullets(
        accessoryCompatibility.replace_accessories.length
          ? accessoryCompatibility.replace_accessories
          : ["no accessory replacement unless explicitly selected"],
      )
    }\nRemove accessories:\n${
      bullets(
        accessoryCompatibility.remove_accessories.length
          ? accessoryCompatibility.remove_accessories
          : ["no accessory removal unless explicitly selected"],
      )
    }\nSolar compatibility:\n- ${accessoryCompatibility.solar_compatibility}`,
    I: `[BLOCK I - SOLAR AND SKYLIGHT RULES]\n${
      bullets([
        bool(pannelli.attivo)
          ? "Photovoltaic panels/tiles must be coplanar with final roof plane, aligned parallel to eaves and ridges, mounted with realistic rails/standoffs or flush integrated solar-tile logic, and clear of chimneys, skylights, valleys and ridge caps."
          : "Do not add photovoltaic panels, solar tiles, rails, cables or mounting hardware.",
        bool(lucernari.attivo) && text(lucernari.azione) === "aggiungi"
          ? "Added skylights/dormers must show an actual roof cut, frame/curb, head/sill/side flashings, correct glass reflection and local covering returns."
          : "",
        bool(lucernari.attivo) && text(lucernari.azione) === "rimuovi"
          ? "Removed skylights/dormers must disappear completely; rebuild module/seam rhythm across the former opening with no ghost outline."
          : "",
        !bool(lucernari.attivo)
          ? "Do not invent skylights or dormers; preserve existing ones exactly if visible."
          : "",
      ])
    }`,
    J: `[BLOCK J - CONVERSION / REMOVAL RULES]\n${bullets(conversionRules)}\n${
      compatibilityAdjustments.length ? bullets(compatibilityAdjustments) : ""
    }\n${restorationRules.length ? bullets(restorationRules) : ""}\n${
      removals.length
        ? bullets(removals)
        : "- Do not leave hybrid old/new roof states, ghost outlines, incompatible old rows, wrong flashings or random patches."
    }`,
    K: `[BLOCK K - EXECUTION PRIORITY]\n${
      bullets(executionPlan)
    }\nPriority rules:\n${
      bullets([
        "Geometry and waterproofing constraints override decorative appearance.",
        "Covering replacement clears old incompatible roof-system details before new details are introduced.",
        "Accessory-only interventions must not drift into covering/facade redesign.",
        "Color-only interventions preserve exact module geometry and all accessories.",
      ])
    }`,
    L: `[BLOCK L - BUILDING INTEGRITY]\n${
      bullets([
        "preserve facade, wall color, windows, doors, balconies and architectural proportions",
        "preserve roof shape, pitch, ridge line, hip/valley geometry and eave overhang unless insulation requires only realistic edge thickness",
        "preserve sky, vegetation, street, neighboring buildings, vehicles and people",
        "preserve exact camera perspective, crop, image dimensions and orientation",
        "do not alter non-target roof planes or non-target roof accessories",
      ])
    }`,
    M: `[BLOCK M - PHOTOREALISM RULES]\n${
      bullets([
        "material response must be physically plausible: clay, slate, metal, membrane, glass and photovoltaic surfaces must look different",
        "shadows, contact shadows, roof-plane perspective and overlap depths must match the original lighting",
        "all added elements must look installed and buildable, with correct mounting, flashing, trim, edge and waterproofing details",
        "no floating panels, no warped seams, no random tile scales, no fake CGI showroom look",
      ])
    }`,
    N: `[BLOCK N - NEGATIVE CONSTRAINTS]\n${
      bullets([
        "do not redesign the building",
        "do not change facade color, windows, doors or wall geometry",
        "do not change non-target roof planes",
        "do not invent balconies, dormers, skylights, chimneys, photovoltaic panels or antennas unless selected",
        "do not leave traces of removed skylights or old covering systems",
        "do not mix tile rows with metal/membrane systems on the same target slope unless explicitly selected",
        "do not change sky, vegetation, neighboring buildings, street or context",
        "do not stylize, illustrate, over-beautify or create a different house",
      ])
    }`,
    O: `[BLOCK O - QUALITY BAR]\n${
      bullets([
        "professional architectural roof renovation visualization",
        "same-building realism suitable for sales/preventivi",
        "precise interpretation of selected roof system, target slopes and accessories",
        compatibilityWarnings.length
          ? `Compatibility warnings: ${compatibilityWarnings.join("; ")}`
          : "No unresolved roof compatibility warning.",
      ])
    }`,
  };

  const notes = notesRaw ? `[ADDITIONAL USER NOTES]\n${notesRaw}` : "";
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
    notes,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    systemPrompt: blocks.A,
    userPrompt,
    promptVersion: "roof-v2.1.0",
    promptPayload: {
      scene_analysis: scene,
      target_slopes: {
        scope,
        target_description: targetDescription,
        untouched_slopes: untouchedSlopes,
      },
      buildability_envelope: buildabilityEnvelope,
      water_management_rules: waterRules,
      accessory_compatibility: accessoryCompatibility,
      execution_priority_plan: executionPlan,
      replacement_manifest: {
        intervention: tipoIntervento,
        replacements,
        additions,
        removals,
        conversion_rules: conversionRules,
        compatibility_adjustments: compatibilityAdjustments,
        restoration_rules: restorationRules,
        preserve,
      },
      final_prompt_version: "roof-v2.1.0",
    },
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

// ── CORS ─────────────────────────────────────────────────────────────────────
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
    console.error("[generate-roof-render] background fallback error:", err)
  );
}

// ── Main handler ─────────────────────────────────────────────────────────────
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

    // ── Legge la sessione ────────────────────────────────────────────────────
    const { data: session, error: sessionErr } = await supabase
      .from("render_tetto_sessions")
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

    // Verifica che la sessione appartenga all'utente (impersonation-aware, FIX P1.3)
    const allowed = await canAccessCompany(
      supabase,
      user.id,
      session.company_id as string,
    );
    if (!allowed) {
      return new Response(
        JSON.stringify({
          error: "forbidden",
          message: "Accesso negato alla sessione render tetto",
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
    // ── F1-parity (audit 16/07) — CLAIM ATOMICO prima del deduct ─────────
    const { data: claimRaw, error: claimErr } = await supabase.rpc(
      "claim_render_vertical_session",
      {
        _table: "render_tetto_sessions",
        _session_id: session_id,
        _stale_seconds: 170,
      },
    );
    if (claimErr) {
      throw new Error(`claim_render_vertical_session failed: ${claimErr.message}`);
    }
    const claim = claimRaw as {
      claimed: boolean;
      reason?: string;
      stale_takeover?: boolean;
    };
    if (!claim?.claimed) {
      return acceptedRenderResponse(session_id);
    }
    if (claim.stale_takeover) {
      await supabase.rpc("refund_render_credit_all", {
        _company_id: session.company_id,
        _session_id: session_id,
        _reason_meta: { source: "stale_takeover", edge_fn: "generate-roof-render" },
      });
    }

    // ── Controlla e deduce crediti (v3 → v2 → v1 fallback + audit ledger) ────
    const deductResult = await deductRenderCreditSafe(supabase, {
      companyId: session.company_id as string,
      sessionId: session_id,
      userId: user.id,
      reasonMeta: { vertical: "tetto", edge_fn: "generate-roof-render" },
      logTag: "generate-roof-render",
    });

    if (deductResult.status === "insufficient") {
      await supabase.rpc("release_render_vertical_session", {
        _table: "render_tetto_sessions",
        _session_id: session_id,
      });
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

    const renderJob = (async () => {
      // ── Genera signed URL per foto originale ─────────────────────────────────
      const originalPath = session.original_photo_url as string;
      let imageUrl = originalPath;
      let effectiveWidth = target_width ?? undefined;
      let effectiveHeight = target_height ?? undefined;

      if (originalPath && !originalPath.startsWith("http")) {
        const prepared = await prepareInputImage({
          supabase,
          bucket: "tetto-originals",
          originalPath,
          hintWidth: target_width ?? null,
          hintHeight: target_height ?? null,
        });
        imageUrl = prepared.url;
        effectiveWidth = prepared.effective_width ?? effectiveWidth;
        effectiveHeight = prepared.effective_height ?? effectiveHeight;
      }

      // ── Build prompt ─────────────────────────────────────────────────────────
      const rawConfig =
        (config || (session.config as Record<string, unknown>) || {}) as Record<
          string,
          unknown
        >;
      const sessionLike = { ...session, config: rawConfig };

      const { systemPrompt, userPrompt, promptVersion, promptPayload } =
        buildRoofPrompt(sessionLike);
      let finalProviderPrompt = `${systemPrompt}\n\n${userPrompt}`;

      // META-PROMPT REWRITER: prosa di 300-450 parole al posto di ~10 800
      // caratteri di blocchi (il prompt piu' lungo di tutti i verticali).
      // Fallback silenzioso e loggato sui blocchi.
      try {
        const meta = await rewriteDomainPrompt(
          {
            config: { ...asRecord(session.config), __payload: promptPayload },
            metadata: { task_kind: "render_prompt_rewrite", company_id: session.company_id as string, session_id },
          },
          ROOF_REWRITER_PROFILE,
        );
        if (meta) {
          finalProviderPrompt = [
            "You are an expert photorealistic Italian roof-renovation render artist. Edit the source photo as instructed below. Output a clean photograph-quality result.",
            meta.userPrompt,
            "Avoid: cartoon, painterly, fake CGI, AI restyling, warped geometry, changed roof outline, invented dormers or chimneys, swatch rectangles, invented objects.",
          ].join("\n\n");
          console.log(JSON.stringify({ lvl: "info", fn: "generate-roof-render", session_id, msg: "meta_prompt_active", rewriter_model: meta.modelUsed, rewriter_latency_ms: meta.latencyMs, prose_length: meta.userPrompt.length }));
        } else {
          console.warn(JSON.stringify({ lvl: "warn", fn: "generate-roof-render", session_id, msg: "meta_prompt_fallback_to_blocks" }));
        }
      } catch (e) {
        console.warn(JSON.stringify({ lvl: "warn", fn: "generate-roof-render", session_id, msg: "meta_prompt_rewriter_threw", error: String((e as Error)?.message ?? e) }));
      }

      // ── Chiama il provider AI ────────────────────────────────────────────────
      const imgResp = await fetchWithTimeout(imageUrl, {}, 30_000);
      if (!imgResp.ok) {
        throw new Error(
          `Impossibile leggere la foto originale (${imgResp.status})`,
        );
      }
      const imgBlob = await imgResp.blob();
      // Rete di sicurezza sul formato: se il client non manda larghezza e altezza
      // e prepareInputImage non le ricava, il selettore della size non ha su cosa
      // decidere e ripiega sul quadrato 1024x1024 — che costringe il modello a
      // ricomporre la scena per riempirlo. Le dimensioni vere si leggono dai primi
      // byte del file, senza decodificare l'immagine.
      if (!effectiveWidth || !effectiveHeight) {
        try {
          const probe = new Uint8Array(await imgBlob.slice(0, 65536).arrayBuffer());
          const dim = detectImageDimensions(probe);
          if (dim) {
            effectiveWidth = dim.width;
            effectiveHeight = dim.height;
            console.log(JSON.stringify({
              lvl: "info", fn: "generate-roof-render", session_id,
              msg: "source_dimensions_detected_from_bytes",
              width: dim.width, height: dim.height,
            }));
          }
        } catch (_e) { /* formato non riconosciuto: si prosegue col default */ }
      }

      // F1-parity (audit 16/07) — budget deadline-aware: 180s fisso superava
      // da solo il cap 150s dell'isolate. 1 tentativo per tier.
      const TETTO_BUDGET_MS = 140_000;
      const jobStartMs = Date.now();
      const jobElapsed = () => Date.now() - jobStartMs;
      const generateCandidate = (prompt: string, soloProviderDiretto = false) => {
        const remaining = TETTO_BUDGET_MS - jobElapsed() - 20_000;
        const perAttemptTimeout = Math.max(
          30_000,
          Math.min(75_000, Math.floor(remaining / (soloProviderDiretto ? 1 : 2))),
        );
        return editImage({
          prompt,
          sourceImageBlob: imgBlob,
          effectiveWidth,
          effectiveHeight,
          openaiQuality: "medium",
          timeoutMs: perAttemptTimeout,
          directProviderOnly: soloProviderDiretto,
          maxRetries: 0,
          metadata: {
            task_kind: "render_image_edit",
            company_id: session.company_id as string,
            session_id,
          },
        });
      };

      // Il primo tentativo va SOLO sul provider diretto, con tutto il budget.
      // Il secondo tier e' OpenRouter, che riceve la size come semplice testo nel
      // prompt e la ignora: da una foto verticale restituisce un 1024x1024, e per
      // riempire il quadrato il modello inventa scena ai lati — allarga il soggetto
      // e ridisegna quello che ha intorno. Dividere il budget a meta' per tenerlo
      // pronto affamava il provider buono e faceva consegnare proprio quei quadrati.
      // Misurato su infissi (sessione d655a562): diretto abortito a 53s quando ne
      // servivano ~60. Col diretto a budget pieno: 146s -> 58s e formato corretto.
      let providerResult: Awaited<ReturnType<typeof generateCandidate>>;
      try {
        providerResult = await generateCandidate(finalProviderPrompt, true);
      } catch (primoErr) {
        console.warn(JSON.stringify({
          lvl: "warn", fn: "generate-roof-render", session_id,
          msg: "provider_diretto_fallito_si_passa_alla_catena",
          error: String((primoErr as Error)?.message ?? primoErr).substring(0, 200),
          nota: "il formato potrebbe non essere rispettato dal fallback",
        }));
        providerResult = await generateCandidate(finalProviderPrompt, false);
      }

      // ── QA VISION tetto (audit 16/07) ──────────────────────────────────
      // Difetti tipici: abbaini/camini/lucernari INVENTATI, pendenza o forma
      // della falda cambiata, facciata ridipinta quando era richiesto SOLO
      // il tetto, prospettiva cambiata. 1 retry correttivo budget-gated.
      try {
        const qaPrompt = [
          "You are a LENIENT quality inspector for a roof renovation render.",
          "Image 1 = SOURCE photo of the real building. Image 2 = CANDIDATE render (same building, ONLY the roof covering replaced per brief).",
          'Answer STRICT JSON only: {"pass": boolean, "issues": [{"category": string, "detail": string}]}.',
          "Fail ONLY on clear, unambiguous violations:",
          "- invented_roof_elements: dormers, chimneys, skylights or antennas added or removed compared to the source roof.",
          "- roof_geometry_change: roof pitch, ridge line or overall roof shape clearly different from the source.",
          "- non_target_change: facade walls, windows or surroundings clearly repainted/replaced even though only the ROOF had to change.",
          "- geometry_change: camera angle, perspective or crop clearly different from the source.",
          ...QA_BLOCCO_RICOMPOSIZIONE,
          "When in doubt, PASS. The roof covering material/color CHANGE is expected — only structural inventions and geometry breaks fail.",
        ].join("\n");

        const sourceDataUrl = `data:${
          imgBlob.type || "image/jpeg"
        };base64,${bytesToBase64(new Uint8Array(await imgBlob.arrayBuffer()))}`;

        const qaResult = await callVisionQa({
          sourceImageDataUrl: sourceDataUrl,
          candidateImageDataUrl: providerResult.imageDataUrl,
          qaPrompt,
          metadata: {
            task_kind: "render_image_qa",
            company_id: session.company_id as string,
            session_id,
          },
        });

        const qaIssues = (qaResult.issues ?? []).map((raw) => {
          if (typeof raw === "string") return { category: "unspecified", detail: raw };
          const r = raw as { category?: string; detail?: string };
          return { category: r.category ?? "unspecified", detail: r.detail ?? "" };
        });

        if (qaResult.checked && !qaResult.pass && qaIssues.length > 0 && jobElapsed() < 95_000) {
          console.log(JSON.stringify({
            fn: "generate-roof-render",
            msg: "qa_failed_retry_corrective",
            session_id,
            issues: qaIssues.map((i) => i.category),
          }));
          const primoTentativo = providerResult;
          // Il retry va anch'esso sul solo provider diretto. Se finisse su OpenRouter
          // tornerebbe un quadrato, e un retry che rompe il formato consegna un render
          // peggiore di quello che stava correggendo — pagandolo. Se il diretto non ce
          // la fa, si tiene il primo tentativo senza spendere altro.
          //
          // Vincolare il provider non basta pero' a garantire il formato: il
          // diretto puo' rispondere senza errore e ignorare comunque la size, e
          // un `catch` non intercetta una risposta riuscita ma quadrata. Si
          // misura quindi il formato delle due immagini e si scarta il retry se
          // rompe un formato che il primo tentativo aveva azzeccato.
          const formatoAtteso = effectiveWidth && effectiveHeight
            ? { width: effectiveWidth, height: effectiveHeight }
            : null;
          const primoDim = detectImageDimensions(
            dataUrlToBytes(primoTentativo.imageDataUrl).bytes,
          );
          const primoFormatoOk = !describeFormatMismatch(formatoAtteso, primoDim);
          try {
            const retryResult = await generateCandidate(`${finalProviderPrompt}

[QC FAILURE — MANDATORY CORRECTIONS]
The previous attempt failed quality control with these violations:
${qaIssues.map((i) => `- ${i.category}: ${i.detail}`).join("\n")}
Regenerate applying the FULL brief. ABSOLUTE rules: same roof shape/pitch/ridge as the source, same dormers/chimneys/skylights in the same positions, facade untouched, same camera and crop. Only the roof covering specified in the brief changes.`, true);
            const retryDim = detectImageDimensions(
              dataUrlToBytes(retryResult.imageDataUrl).bytes,
            );
            const retryMismatch = describeFormatMismatch(formatoAtteso, retryDim);
            if (retryMismatch && primoFormatoOk) {
              console.warn(JSON.stringify({
                lvl: "warn", fn: "generate-roof-render", session_id,
                msg: "qa_retry_scartato_formato_peggiore",
                motivo: retryMismatch,
                primo: primoDim ? `${primoDim.width}x${primoDim.height}` : null,
                retry: retryDim ? `${retryDim.width}x${retryDim.height}` : null,
              }));
              providerResult = primoTentativo;
            } else {
              providerResult = retryResult;
            }
          } catch (retryErr) {
            console.warn(JSON.stringify({
              lvl: "warn", fn: "generate-roof-render", session_id,
              msg: "qa_retry_fallito_si_tiene_il_primo",
              error: String((retryErr as Error)?.message ?? retryErr).substring(0, 200),
            }));
            providerResult = primoTentativo;
          }
        } else if (qaResult.checked && qaResult.pass) {
          // Il QA promosso non lasciava traccia: si deduceva dall'ASSENZA della
          // riga di bocciatura. Silenzio = successo e' una pessima proprieta'.
          console.log(JSON.stringify({
            fn: "generate-roof-render",
            msg: "qa_passed_first_attempt",
            session_id,
            qa_model: qaResult.modelUsed,
          }));
        } else if (qaResult.checked && !qaResult.pass) {
          console.warn(JSON.stringify({
            fn: "generate-roof-render",
            msg: "qa_failed_retry_skipped_budget",
            session_id,
            issues: qaIssues.map((i) => i.category),
            elapsed_ms: jobElapsed(),
          }));
        }
      } catch (qaErr) {
        console.warn(
          "[generate-roof-render] QA vision error (ignored):",
          qaErr instanceof Error ? qaErr.message : String(qaErr),
        );
      }
      const providerKey = providerResult.providerUsed === "openrouter"
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

      // ── Upload risultato su Storage ──────────────────────────────────────────
      const uploadPayload = dataUrlToBytes(providerResult.imageDataUrl);
      const resultPath =
        `${session.company_id}/${session_id}/render_tetto_${Date.now()}.${uploadPayload.extension}`;

      const { error: uploadErr } = await supabase.storage
        .from("tetto-results")
        .upload(resultPath, uploadPayload.bytes, {
          contentType: uploadPayload.mimeType,
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
        .from("render_tetto_sessions")
        .update({
          status: "completed",
          result_urls: [resultUrl],
          prompt_used: finalProviderPrompt,
          prompt_version: promptVersion,
          prompt_char_count: finalProviderPrompt.length,
          provider_key: providerKey,
          cost_real: costReal,
          cost_billed: costBilled,
          config_snapshot: {
            ...rawConfig,
            roof_render_payload: promptPayload,
            provider_model_used: modelUsed,
            provider_attempts: providerResult.attempts,
          },
          processing_completed_at: new Date().toISOString(),
        })
        .eq("id", session_id);

      // ── Incrementa contatore provider ────────────────────────────────────────
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
      console.error("[generate-roof-render] background error:", msg);
      await supabase.rpc("refund_render_credit_all", {
        _company_id: session.company_id as string,
        _session_id: session_id,
        _reason_meta: {
          vertical: "tetto",
          edge_fn: "generate-roof-render",
          error: msg.substring(0, 500),
        },
      });
      await supabase
        .from("render_tetto_sessions")
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
    console.error("[generate-roof-render] error:", msg);

    try {
      const body2 = await req.clone().json().catch(() => ({}));
      const sid = (body2 as { session_id?: string }).session_id;
      if (sid) {
        if (creditDeducted && refundableCompanyId && refundableSessionId) {
          await supabase.rpc("refund_render_credit_all", {
        _company_id: refundableCompanyId,
        _session_id: refundableSessionId,
        _reason_meta: {
              vertical: "tetto",
              edge_fn: "generate-roof-render",
              error: msg.substring(0, 500),
            },
      });
        }
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
