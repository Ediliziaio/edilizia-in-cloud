import {
  BASIN_DESCRIPTIONS,
  BATHTUB_FAUCET_DESCRIPTIONS,
  BATHTUB_MATERIAL_DESCRIPTIONS,
  BATHTUB_TYPE_DESCRIPTIONS,
  FAUCET_FINISH_DESCRIPTIONS,
  FAUCET_STYLE_DESCRIPTIONS,
  FLUSH_PLATE_COLOR_DESCRIPTIONS,
  FLUSH_PLATE_DESCRIPTIONS,
  INTERVENTION_DESCRIPTIONS,
  POSA_DESCRIPTIONS,
  SANITARY_COLOR_DESCRIPTIONS,
  SANITARY_TYPE_DESCRIPTIONS,
  SHOWER_GLASS_DESCRIPTIONS,
  SHOWER_HEAD_DESCRIPTIONS,
  SHOWER_PROFILE_DESCRIPTIONS,
  SHOWER_TRAY_DESCRIPTIONS,
  SHOWER_TYPE_DESCRIPTIONS,
  SHOWER_TYPE_LABELS,
  TILE_EFFECT_DESCRIPTIONS,
  VANITY_MIRROR_DESCRIPTIONS,
  VANITY_STYLE_DESCRIPTIONS,
  VANITY_TOP_DESCRIPTIONS,
} from "./promptFragments.ts";
import { normalizeBathroomSceneAnalysis } from "./bathroomSceneAnalysis.ts";
import { buildBathroomReplacementManifest } from "./bathroomReplacementRules.ts";
import type {
  BathroomPhotoMeta,
  BathroomRenderConfig,
  ConfigurazioneBagno,
} from "./types.ts";

export interface BathroomRenderBuildOptions {
  notes?: string;
  sceneAnalysis?: unknown;
  photoMeta?: BathroomPhotoMeta | null;
}

function normalizeColorLabel(value: string): string {
  return value.trim() || "neutral finish";
}

function parseTileFormat(format: string): { width: number | null; height: number | null } {
  const match = format.match(/(\d+)\s*x\s*(\d+)/i);
  if (!match) return { width: null, height: null };
  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function categorizeTileFormat(
  format: string,
  effectId: string,
): "mosaic" | "standard" | "large_format" | "architectural_slab" | "plank" | "seamless" {
  if (effectId === "resina_spatolata") return "seamless";
  if (effectId === "mosaico_esagoni" || effectId === "mosaico_penny") return "mosaic";

  const { width, height } = parseTileFormat(format);
  if (!width || !height) return "standard";

  const longSide = Math.max(width, height);
  const shortSide = Math.min(width, height);
  if (longSide >= 200) return "architectural_slab";
  if (longSide >= 90 && longSide / shortSide >= 3) return "plank";
  if (longSide >= 120) return "large_format";
  if (longSide <= 20 && shortSide <= 20) return "mosaic";
  return "standard";
}

function inferTileScaleRules(
  format: string,
  effectId: string,
): {
  nominalWidthCm: number | null;
  nominalHeightCm: number | null;
  formatCategory: "mosaic" | "standard" | "large_format" | "architectural_slab" | "plank" | "seamless";
  moduleScaleRule: string;
  groutDensityRule: string;
  cutLayoutRule: string;
  realScaleLockRule: string;
  veinContinuityRule: string | null;
} {
  const parsedFormat = parseTileFormat(format);
  const formatCategory = categorizeTileFormat(format, effectId);
  const longSide = Math.max(parsedFormat.width ?? 0, parsedFormat.height ?? 0);
  const shortSide = Math.min(parsedFormat.width ?? 0, parsedFormat.height ?? 0);
  const realScaleLockRule = parsedFormat.width && parsedFormat.height
    ? `The selected module is ${parsedFormat.width}x${parsedFormat.height} cm in real life. Respect that exact visual scale: one module must look approximately ${shortSide} cm by ${longSide} cm, never like a smaller repeated tile.`
    : "Respect the selected product scale and do not invent a smaller repetitive module.";

  const commonVeinRule = effectId.startsWith("marmo_")
    ? "Marble veining must read as realistic slab or tile veining, not as a repeated synthetic texture or a random small-tile grid."
    : null;

  switch (formatCategory) {
    case "seamless":
      return {
        nominalWidthCm: parsedFormat.width,
        nominalHeightCm: parsedFormat.height,
        formatCategory,
        moduleScaleRule: "This finish must read as a continuous surface with no tile modules at all.",
        groutDensityRule: "No grout joints, no tile grid and no repeated module rhythm should be visible.",
        cutLayoutRule: "Keep the surface continuous around corners, drains and fixtures without introducing fake tile cuts.",
        realScaleLockRule: "This is a continuous finish: remove every old joint, module edge, ghost grid and tile rhythm from the replaced surface.",
        veinContinuityRule: null,
      };
    case "mosaic":
      return {
        nominalWidthCm: parsedFormat.width,
        nominalHeightCm: parsedFormat.height,
        formatCategory,
        moduleScaleRule: "This surface must read as a dense small-module mosaic with a deliberately fine repetitive rhythm.",
        groutDensityRule: "Frequent, clearly visible grout joints are expected because the selected format is intentionally small.",
        cutLayoutRule: "Small module cuts around fixtures and corners are acceptable but must remain clean and believable.",
        realScaleLockRule,
        veinContinuityRule: null,
      };
    case "plank":
      return {
        nominalWidthCm: parsedFormat.width,
        nominalHeightCm: parsedFormat.height,
        formatCategory,
        moduleScaleRule: "This surface must read as long elongated planks, not square tiles.",
        groutDensityRule: "Joint rhythm must be linear and relatively sparse, with long continuous modules dominating the view.",
        cutLayoutRule: "Keep plank direction consistent and avoid random short offcuts dominating visible areas.",
        realScaleLockRule,
        veinContinuityRule: commonVeinRule,
      };
    case "architectural_slab":
      return {
        nominalWidthCm: parsedFormat.width,
        nominalHeightCm: parsedFormat.height,
        formatCategory,
        moduleScaleRule:
          "This selection is an architectural slab. Each visible wall or floor plane must read as only a few very large modules, never as a patchwork of many small tiles.",
        groutDensityRule:
          "Grout density must be extremely low: only a handful of long joints should be visible, with very wide uninterrupted slab fields. Do not create a 60x60, 30x60 or medium-tile grid.",
        cutLayoutRule:
          "Cuts around corners, niches, drains and sanitary fixtures must stay minimal and strategic. On walls, a 240 cm slab should read almost floor-to-ceiling where feasible, with no repeated horizontal seams every 60 cm. Do not fragment the surface into many small pieces.",
        realScaleLockRule: parsedFormat.width && parsedFormat.height
          ? `${realScaleLockRule} For bathroom walls around 240-270 cm high, the ${longSide} cm side must feel close to floor-to-ceiling slab scale; show sparse vertical seams and at most necessary perimeter trims.`
          : realScaleLockRule,
        veinContinuityRule: effectId.startsWith("marmo_")
          ? "Because the selected format is slab-size, the marble veining must feel broad, continuous and slab-scaled, not broken into many tiny repeated tiles."
          : commonVeinRule,
      };
    case "large_format":
      return {
        nominalWidthCm: parsedFormat.width,
        nominalHeightCm: parsedFormat.height,
        formatCategory,
        moduleScaleRule:
          "This selection is large-format tiling. The room must show clearly oversized modules with a restrained number of joints.",
        groutDensityRule:
          "Joint density must stay low and refined, much sparser than in small residential ceramic tiling. Avoid any dense small-tile rhythm.",
        cutLayoutRule:
          "Keep edge cuts clean and controlled so the visible layout still reads as large-format material rather than small repeated modules.",
        realScaleLockRule,
        veinContinuityRule: commonVeinRule,
      };
    default:
      return {
        nominalWidthCm: parsedFormat.width,
        nominalHeightCm: parsedFormat.height,
        formatCategory,
        moduleScaleRule: "Keep a standard residential tile scale coherent with the selected format.",
        groutDensityRule: "Grout joints should be visible with a normal residential rhythm, neither oversized nor too dense.",
        cutLayoutRule: "Keep cut pieces and perimeter terminations neat and plausible around fixtures and corners.",
        realScaleLockRule,
        veinContinuityRule: commonVeinRule,
      };
  }
}

function describeWallPaintAction(action: string, colorHex?: string | null): string {
  if (action === "lastra_decorativa") {
    return colorHex
      ? `decorative slab or micro-surface treatment in tone ${colorHex}`
      : "decorative slab or micro-surface treatment";
  }
  if (action === "tinta_unita") {
    return colorHex ? `uniform paint finish in ${colorHex}` : "uniform paint finish";
  }
  return "keep current painted walls";
}

function inferMirrorLighting(mirrorType: string): string {
  if (mirrorType === "backlit mirror") return "integrated backlighting";
  if (mirrorType.includes("storage")) return "functional frontal lighting";
  return "soft integrated mirror lighting";
}

function inferVanityStorage(style: string): string {
  return style.includes("wall-hung")
    ? "drawer-based floating storage"
    : "grounded cabinet storage";
}

function inferVanityInstallation(style: ConfigurazioneBagno["vanity"]["stile"]): "wall_hung" | "floor_standing" {
  return style.startsWith("sospeso") ? "wall_hung" : "floor_standing";
}

function inferBasinCount(config: ConfigurazioneBagno["vanity"]): 1 | 2 {
  if (config.numero_lavabi === 2) return 2;
  if (config.larghezza_cm >= 120) return 2;
  return 1;
}

function inferSanitaryInstallationRule(config: ConfigurazioneBagno["sanitari"]): string {
  const wcRule =
    config.azione_wc !== "sostituisci"
      ? "keep the existing WC installation logic"
      : config.tipo_wc === "sospeso" || config.tipo_wc === "rimless_sospeso"
        ? "WC must be a true wall-hung rimless-style installation: ceramic bowl visibly floating off the floor, clear shadow gap below, compact projection, believable in-wall carrier support and no floor contact pedestal"
        : "WC must be a real floor-standing model with coherent floor contact and compact modern proportions";

  const bidetRule =
    config.azione_bidet === "mantieni"
      ? "keep existing bidet installation logic"
      : config.azione_bidet === "rimuovi"
        ? "remove bidet completely and rebalance the spacing cleanly"
        : (config.tipo_bidet ?? "sospeso") === "sospeso"
          ? "bidet must be wall-hung with realistic fixing height and spacing"
          : "bidet must be floor-standing with credible floor contact";

  return `${wcRule}; ${bidetRule}; keep realistic spacing, alignment and wall/floor fixing logic.`;
}

function inferSanitaryCisternRule(config: ConfigurazioneBagno["sanitari"]): string {
  if (config.azione_wc !== "sostituisci") {
    return "Keep the current cistern logic unless the selected sanitary replacement explicitly changes it.";
  }

  if (config.tipo_wc === "sospeso" || config.tipo_wc === "rimless_sospeso") {
    return "Use a concealed in-wall cistern hidden behind the finished wall: absolutely NO bulky exposed ceramic tank, no monobloc cistern, no rectangular tank sitting behind/above the WC; only the selected compact wall flush plate may be visible.";
  }

  return "If a floor-standing WC is selected, keep the cistern logic coherent with a floor-standing toilet and do not turn it into a wall-hung concealed-frame system.";
}

function inferFlushPlateRule(config: ConfigurazioneBagno["sanitari"]): { style: string | null; color: string | null; rule: string | null } {
  if (config.azione_wc !== "sostituisci") return { style: null, color: null, rule: null };
  if (config.tipo_wc !== "sospeso" && config.tipo_wc !== "rimless_sospeso") {
    return { style: null, color: null, rule: "Do not add a wall flush plate unless the selected WC typology requires a concealed cistern." };
  }

  const style = FLUSH_PLATE_DESCRIPTIONS[config.piastra_wc ?? "rettangolare_sottile"];
  const color = FLUSH_PLATE_COLOR_DESCRIPTIONS[config.piastra_wc_colore ?? "nero_opaco"];
  return {
    style,
    color,
    rule: `${style}, ${color}. The selected flush plate is mandatory and must be visible: mount it on the wall behind/above the wall-hung WC at realistic height, flush with the finished wall, crisp and proportionate. It replaces any old external tank logic and must not be omitted or turned into an exposed cistern.`,
  };
}

function inferShowerFramePresence(profile: ConfigurazioneBagno["doccia"]["profilo"], type: ConfigurazioneBagno["doccia"]["tipo"]): string {
  if (profile === "senza_profilo" || type === "walk_in") {
    return "minimal visible framing, ideally near-frameless";
  }
  return "visible but proportionate enclosure profiles";
}

function inferShowerTrayThickness(tray: ConfigurazioneBagno["doccia"]["piatto"]): string {
  switch (tray) {
    case "filo_pavimento":
      return "flush-to-floor or almost flush thickness";
    case "rialzato_3cm":
      return "very slim 3 cm tray profile";
    case "rialzato_5cm":
      return "visible but still controlled 5 cm tray profile";
    case "pietra":
      return "slim stone-like tray with tactile thickness";
  }
}

function inferShowerDrainType(tray: ConfigurazioneBagno["doccia"]["piatto"], type: ConfigurazioneBagno["doccia"]["tipo"]): string {
  if (tray === "filo_pavimento" || type === "walk_in") return "linear drain or discreet premium drain solution";
  return "credible standard shower waste aligned with the selected tray";
}

function inferShowerLayoutRule(type: ConfigurazioneBagno["doccia"]["tipo"]): string {
  switch (type) {
    case "walk_in":
      return "The shower must read clearly as a walk-in: open access, fixed glass panel, no generic closed box, no unnecessary frames.";
    case "nicchia_box":
      return "The shower must read as a niche enclosure between walls, not as a freestanding generic box.";
    case "frontale_box":
      return "The shower must read as a frontal enclosure with front access, not as a corner box.";
    case "angolare":
      return "The shower must read as a corner enclosure with coherent 90-degree geometry.";
    case "semicircolare":
      return "The shower must read as a semicircular corner box with credible curved glass and tray geometry.";
  }
}

function inferTubLayoutRule(type: ConfigurazioneBagno["vasca"]["tipo"]): string {
  switch (type) {
    case "freestanding_ovale":
    case "freestanding_rettangolare":
      return "The bathtub must look clearly freestanding, detached from walls with believable floor contact, visible air gap / floor shadow around the body, and coherent plumbing logic.";
    case "back_to_wall":
      return "The bathtub must read clearly as back-to-wall: clean contact to the wall, but still recognizably a bathtub and not a built-in masonry tub.";
    case "incassata":
      return "The bathtub must integrate into the existing bathroom geometry with credible apron/ledge treatment.";
    case "angolare":
      return "The bathtub must fit coherently into the corner geometry without distorting room proportions.";
  }
}

function inferTubScaleRule(config: ConfigurazioneBagno["vasca"]): string {
  const nominalSize = config.dimensione_cm ?? "170x75";
  const [lengthCmRaw, widthCmRaw] = nominalSize.split("x");
  const lengthCm = Number(lengthCmRaw) || 170;
  const widthCm = Number(widthCmRaw) || 75;
  const isFreestanding = config.tipo === "freestanding_ovale" || config.tipo === "freestanding_rettangolare";

  return [
    `Use a full adult bathtub footprint around ${lengthCm}x${widthCm} cm, with realistic height around 55-60 cm.`,
    "The tub must be large enough for a reclining adult and visually larger than a WC or bidet; it must not become a small decorative bowl, mini tub, basin-like object or undersized prop.",
    isFreestanding
      ? "For freestanding type, preserve a real tub body with thick rim, plausible basin depth, floor contact shadow and enough visual length along the camera perspective."
      : "Respect the selected tub typology with a believable full-size footprint.",
    "If the photographed room is compact, adapt placement along the available wall or shower/tub zone instead of shrinking the bathtub unrealistically.",
  ].join(" ");
}

function inferTubPlacementRule(config: ConfigurazioneBagno["vasca"], scenePosition: string): string {
  const isFreestanding = config.tipo === "freestanding_ovale" || config.tipo === "freestanding_rettangolare";
  if (isFreestanding) {
    return `Place the tub in the selected bathtub zone or the most plausible former shower/tub zone (${scenePosition}), keeping walking clearances believable and without moving non-target fixtures.`;
  }
  return `Install the tub coherently in the existing bathtub/shower wall zone (${scenePosition}) without distorting room proportions.`;
}

export function buildBathroomRenderConfig(
  legacyConfig: ConfigurazioneBagno,
  options: BathroomRenderBuildOptions = {},
): BathroomRenderConfig {
  const sceneAnalysis = normalizeBathroomSceneAnalysis(options.sceneAnalysis, options.photoMeta);
  const flushPlate = inferFlushPlateRule(legacyConfig.sanitari);

  const faucetsFinish =
    legacyConfig.sostituzione.rubinetteria && legacyConfig.rubinetteria.attivo
      ? FAUCET_FINISH_DESCRIPTIONS[legacyConfig.rubinetteria.finitura]
      : sceneAnalysis.legacy.rubinetteria_attuale || "existing faucet finish";

  const wallTiles = {
    replace: legacyConfig.sostituzione.piastrelle_parete && legacyConfig.piastrelle_parete.attivo,
    effectId: legacyConfig.piastrelle_parete.effetto,
    effectDescription: TILE_EFFECT_DESCRIPTIONS[legacyConfig.piastrelle_parete.effetto] || legacyConfig.piastrelle_parete.effetto,
    format: legacyConfig.piastrelle_parete.formato,
    ...inferTileScaleRules(legacyConfig.piastrelle_parete.formato, legacyConfig.piastrelle_parete.effetto),
    layingPattern: POSA_DESCRIPTIONS[legacyConfig.piastrelle_parete.posa] || legacyConfig.piastrelle_parete.posa,
    groutColor: legacyConfig.piastrelle_parete.fuga_colore,
    coverage: legacyConfig.piastrelle_parete.altezza_rivestimento || "full height",
  };

  const floor = {
    replace: legacyConfig.sostituzione.pavimento && legacyConfig.pavimento.attivo,
    effectId: legacyConfig.pavimento.effetto,
    effectDescription: TILE_EFFECT_DESCRIPTIONS[legacyConfig.pavimento.effetto] || legacyConfig.pavimento.effetto,
    format: legacyConfig.pavimento.formato,
    ...inferTileScaleRules(legacyConfig.pavimento.formato, legacyConfig.pavimento.effetto),
    layingPattern: POSA_DESCRIPTIONS[legacyConfig.pavimento.posa] || legacyConfig.pavimento.posa,
    groutColor: legacyConfig.pavimento.fuga_colore,
    reflectivityRule: legacyConfig.pavimento.effetto.startsWith("marmo")
      ? "subtle polished reflections consistent with the photographed light"
      : legacyConfig.pavimento.effetto.startsWith("cemento") || legacyConfig.pavimento.effetto === "resina_spatolata"
        ? "soft matte reflection with realistic diffuse light response"
        : "material reflectivity coherent with the selected floor surface",
  };

  const shower = {
    replace: legacyConfig.sostituzione.doccia && legacyConfig.doccia.attivo,
    type: legacyConfig.doccia.tipo,
    showerTypeLabel: SHOWER_TYPE_LABELS[legacyConfig.doccia.tipo],
    enclosureType: SHOWER_TYPE_DESCRIPTIONS[legacyConfig.doccia.tipo],
    glassType: SHOWER_GLASS_DESCRIPTIONS[legacyConfig.doccia.box_vetro],
    framePresence: inferShowerFramePresence(legacyConfig.doccia.profilo, legacyConfig.doccia.tipo),
    frameFinish: SHOWER_PROFILE_DESCRIPTIONS[legacyConfig.doccia.profilo],
    trayType: SHOWER_TRAY_DESCRIPTIONS[legacyConfig.doccia.piatto],
    trayThickness: inferShowerTrayThickness(legacyConfig.doccia.piatto),
    drainType: inferShowerDrainType(legacyConfig.doccia.piatto, legacyConfig.doccia.tipo),
    showerHeadType: SHOWER_HEAD_DESCRIPTIONS[legacyConfig.doccia.soffione],
    handShowerType: legacyConfig.doccia.soffione === "pioggia_soffitto" ? "matching hand shower where plausibly visible" : "hand shower coherent with the selected system",
    mixerFinish: faucetsFinish,
    wallNiche: legacyConfig.doccia.tipo === "walk_in" || legacyConfig.doccia.tipo === "nicchia_box",
    layoutRule: inferShowerLayoutRule(legacyConfig.doccia.tipo),
  };

  const bathtub = {
    replace: legacyConfig.sostituzione.vasca && legacyConfig.vasca.attivo,
    type: legacyConfig.vasca.tipo,
    bathtubTypeLabel: BATHTUB_TYPE_DESCRIPTIONS[legacyConfig.vasca.tipo],
    materialDescription: BATHTUB_MATERIAL_DESCRIPTIONS[legacyConfig.vasca.materiale],
    faucetPosition: BATHTUB_FAUCET_DESCRIPTIONS[legacyConfig.vasca.rubinetteria_vasca],
    nominalSize: `${legacyConfig.vasca.dimensione_cm ?? "170x75"} cm`,
    layoutRule: inferTubLayoutRule(legacyConfig.vasca.tipo),
    scaleRule: inferTubScaleRule(legacyConfig.vasca),
    placementRule: inferTubPlacementRule(legacyConfig.vasca, sceneAnalysis.bathtub.position || sceneAnalysis.shower.position || "unknown"),
  };

  const mirrorType = VANITY_MIRROR_DESCRIPTIONS[legacyConfig.vanity.specchio || "retroilluminato"];
  const vanity = {
    replace: legacyConfig.sostituzione.mobile_bagno && legacyConfig.vanity.attivo,
    installation: inferVanityInstallation(legacyConfig.vanity.stile),
    styleLabel: VANITY_STYLE_DESCRIPTIONS[legacyConfig.vanity.stile],
    colorLabel: normalizeColorLabel(legacyConfig.vanity.colore),
    topDescription: VANITY_TOP_DESCRIPTIONS[legacyConfig.vanity.piano],
    basinType: BASIN_DESCRIPTIONS[legacyConfig.vanity.lavabo],
    basinCount: inferBasinCount(legacyConfig.vanity),
    mirrorType,
    mirrorLighting: inferMirrorLighting(mirrorType),
    storageType: inferVanityStorage(VANITY_STYLE_DESCRIPTIONS[legacyConfig.vanity.stile]),
  };

  const sanitaryWare = {
    replace: legacyConfig.sostituzione.sanitari && legacyConfig.sanitari.attivo,
    toiletAction: legacyConfig.sanitari.azione_wc,
    toiletType: legacyConfig.sanitari.azione_wc === "sostituisci"
      ? SANITARY_TYPE_DESCRIPTIONS[legacyConfig.sanitari.tipo_wc]
      : "keep existing toilet",
    bidetAction: legacyConfig.sanitari.azione_bidet,
    bidetType: legacyConfig.sanitari.azione_bidet === "sostituisci"
      ? SANITARY_TYPE_DESCRIPTIONS[legacyConfig.sanitari.tipo_bidet || "sospeso"]
      : legacyConfig.sanitari.azione_bidet === "rimuovi"
        ? null
        : "keep existing bidet",
    installationRule: inferSanitaryInstallationRule(legacyConfig.sanitari),
    ceramicFinish: SANITARY_COLOR_DESCRIPTIONS[legacyConfig.sanitari.colore],
    cisternRule: inferSanitaryCisternRule(legacyConfig.sanitari),
    flushPlateStyle: flushPlate.style,
    flushPlateColor: flushPlate.color,
    flushPlateRule: flushPlate.rule,
    scaleRule:
      legacyConfig.sanitari.tipo_wc === "sospeso" || legacyConfig.sanitari.tipo_wc === "rimless_sospeso"
        ? "Sanitary ware must keep compact contemporary proportions; the wall-hung WC must float cleanly with no floor pedestal, no exposed tank and no oversized old-fashioned monobloc WC."
        : "Sanitary ware proportions must stay compact and contemporary, with realistic spacing and no oversized ceramic volumes.",
  };

  const faucets = {
    replace: legacyConfig.sostituzione.rubinetteria && legacyConfig.rubinetteria.attivo,
    finish: FAUCET_FINISH_DESCRIPTIONS[legacyConfig.rubinetteria.finitura],
    style: FAUCET_STYLE_DESCRIPTIONS[legacyConfig.rubinetteria.stile],
    reflectivityRule: "All visible faucets, shower trims and tub fittings must share the same finish family and react coherently to the bathroom lighting.",
  };

  const wallPaint = {
    replace: legacyConfig.sostituzione.parete_colore && legacyConfig.parete.attivo && legacyConfig.parete.azione !== "mantieni",
    action: describeWallPaintAction(legacyConfig.parete.azione, legacyConfig.parete.colore_hex || null),
    colorHex: legacyConfig.parete.colore_hex || null,
  };

  const lighting = {
    replace: legacyConfig.sostituzione.illuminazione && Boolean(legacyConfig.illuminazione_tipo?.trim()),
    target: legacyConfig.illuminazione_tipo?.trim() || "coherent upgraded bathroom lighting",
  };

  const provisional: BathroomRenderConfig = {
    schema_version: "bathroom_render_v2",
    notes: options.notes?.trim() ?? legacyConfig.note_libere?.trim() ?? "",
    photo_meta: options.photoMeta ?? null,
    intervention_type: legacyConfig.tipo_intervento,
    scene_analysis: sceneAnalysis,
    technical_specification: {
      wallTiles,
      floor,
      shower,
      bathtub,
      vanity,
      sanitaryWare,
      faucets,
      wallPaint,
      lighting,
    },
    replacement_manifest: {} as BathroomRenderConfig["replacement_manifest"],
    removal_rules: [],
    integrity_constraints: [],
    quality_directives: [
      INTERVENTION_DESCRIPTIONS[legacyConfig.tipo_intervento],
      "Surgical bathroom replacement only: same room, same perspective, same geometry.",
      "No generic fantasy spa redesign; preserve the source bathroom identity.",
      "Photorealistic renovation output with exact selected fixture types.",
    ],
    legacy_config: legacyConfig,
  };

  const replacementManifest = buildBathroomReplacementManifest(provisional);

  return {
    ...provisional,
    replacement_manifest: replacementManifest,
    removal_rules: replacementManifest.removals.map((rule) => rule.summary),
    integrity_constraints: replacementManifest.integrityConstraints,
  };
}

export function ensureBathroomRenderConfig(
  rawConfig: Record<string, unknown>,
  rawAnalysis?: unknown,
  photoMeta?: BathroomPhotoMeta | null,
): BathroomRenderConfig {
  if (
    rawConfig?.schema_version === "bathroom_render_v2" &&
    rawConfig.scene_analysis &&
    rawConfig.technical_specification
  ) {
    const normalizedSceneAnalysis = normalizeBathroomSceneAnalysis(
      rawConfig.scene_analysis,
      (rawConfig.photo_meta as BathroomPhotoMeta | null | undefined) ?? photoMeta ?? null,
    );

    const normalizedLegacy = (rawConfig.legacy_config as ConfigurazioneBagno | undefined) ?? (rawConfig as unknown as ConfigurazioneBagno);
    const provisional: BathroomRenderConfig = {
      ...(rawConfig as BathroomRenderConfig),
      photo_meta: (rawConfig.photo_meta as BathroomPhotoMeta | null | undefined) ?? photoMeta ?? null,
      scene_analysis: normalizedSceneAnalysis,
      legacy_config: normalizedLegacy,
    };

    const replacementManifest = buildBathroomReplacementManifest(provisional);
    return {
      ...provisional,
      replacement_manifest: replacementManifest,
      removal_rules: replacementManifest.removals.map((rule) => rule.summary),
      integrity_constraints: replacementManifest.integrityConstraints,
    };
  }

  return buildBathroomRenderConfig(rawConfig as unknown as ConfigurazioneBagno, {
    sceneAnalysis: rawAnalysis,
    photoMeta,
    notes:
      typeof rawConfig.note_libere === "string"
        ? rawConfig.note_libere
        : typeof rawConfig.notes === "string"
          ? rawConfig.notes
          : "",
  });
}
