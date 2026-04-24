import {
  EXTERIOR_BORDER_DESCRIPTIONS,
  EXTERIOR_FLOOR_FINISH_DESCRIPTIONS,
  EXTERIOR_FLOOR_MATERIAL_DESCRIPTIONS,
  EXTERIOR_JOINT_DESCRIPTIONS,
  EXTERIOR_PATTERN_DESCRIPTIONS,
  EXTERIOR_STEP_DESCRIPTIONS,
  EXTERIOR_USAGE_DESCRIPTIONS,
} from "./promptFragments.ts";
import type {
  ConfigurazionePavimentoEsterno,
  ExteriorFloorBuildabilityEnvelope,
  ExteriorFloorReplacementManifest,
  ExteriorFloorSceneAnalysis,
  ExteriorFloorTargetSurfaceMap,
  ExteriorFloorTechnicalSpecification,
} from "./types.ts";

function colorDescription(config: ConfigurazionePavimentoEsterno): string {
  const color = [config.colore_nome, config.colore_hex].filter(Boolean).join(" / ");
  return color || "selected exterior color/tone coherent with the material";
}

function isDeck(config: ConfigurazionePavimentoEsterno): boolean {
  return config.materiale === "deck_wpc" || config.materiale === "deck_legno" || config.operazione === "convert_to_deck";
}

function isLargeFormat(config: ConfigurazionePavimentoEsterno): boolean {
  const supportsLargeFormat = config.materiale === "lastre_grande_formato" || config.materiale === "gres_outdoor";
  return supportsLargeFormat && /120|100|90|large|grande/i.test(config.formato ?? "");
}

function isPoolside(config: ConfigurazionePavimentoEsterno): boolean {
  return config.uso === "bordo_piscina" || config.inserimento.area_target === "bordo_piscina" || config.materiale === "coping_bordo_piscina";
}

function isVehicular(config: ConfigurazionePavimentoEsterno): boolean {
  return config.uso === "carrabile_leggera" || config.uso === "carrabile_intensa";
}

function isContinuousLike(config: ConfigurazionePavimentoEsterno): boolean {
  return config.materiale === "cemento_architettonico" || config.materiale === "cemento_drenante" || config.giunto === "nessuno_visibile";
}

export function buildExteriorFloorTechnicalSpecification(config: ConfigurazionePavimentoEsterno): ExteriorFloorTechnicalSpecification {
  const deck = isDeck(config);
  const large = isLargeFormat(config);
  const poolside = isPoolside(config);
  const vehicular = isVehicular(config);
  const continuous = isContinuousLike(config);
  const format = config.formato?.trim() ||
    (large ? "large exterior slabs, sparse joint rhythm" : deck ? "deck boards with visible board width" : "format coherent with selected material");

  return {
    flooringType: config.materiale,
    materialDescription: EXTERIOR_FLOOR_MATERIAL_DESCRIPTIONS[config.materiale],
    finishDescription: EXTERIOR_FLOOR_FINISH_DESCRIPTIONS[config.finitura],
    colorDescription: colorDescription(config),
    formatDescription: format,
    patternDescription: EXTERIOR_PATTERN_DESCRIPTIONS[config.pattern_posa],
    usageDescription: EXTERIOR_USAGE_DESCRIPTIONS[config.uso],
    jointDescription: EXTERIOR_JOINT_DESCRIPTIONS[config.giunto],
    borderDescription: EXTERIOR_BORDER_DESCRIPTIONS[config.bordo],
    stepDescription: EXTERIOR_STEP_DESCRIPTIONS[config.gradino],
    outdoorRealismCues: [
      deck ? "deck boards must show clear direction, open gaps and exterior decking behavior" : "",
      large ? "large-format slabs must show sparse joint density and broad uninterrupted fields" : "",
      poolside ? "poolside surface must be anti-slip, water-compatible and preserve pool basin geometry" : "",
      vehicular ? "vehicular use requires robust module thickness, stable pattern and driveway-grade bedding logic" : "",
      continuous ? "continuous-looking systems must eliminate old grout/grid ghosts completely" : "",
      "surface roughness, exterior light response, perimeter cuts and contact shadows must be realistic",
    ].filter(Boolean),
    isDeck: deck,
    isLargeFormat: large,
    isPoolside: poolside,
    isVehicular: vehicular,
    isContinuousLike: continuous,
  };
}

export function buildExteriorFloorReplacementManifest(
  config: ConfigurazionePavimentoEsterno,
  scene: ExteriorFloorSceneAnalysis,
  target: ExteriorFloorTargetSurfaceMap,
  envelope: ExteriorFloorBuildabilityEnvelope,
  spec: ExteriorFloorTechnicalSpecification,
): ExteriorFloorReplacementManifest {
  const oldPatternRemoval = "remove old surface pattern, old grout grid, old texture and incompatible previous paving traces completely";
  const commonPreserve = [
    "house facade, windows and doors",
    "non-target lawn/garden/deck/hardscape",
    "non-target pool basin and waterline",
    "outdoor furniture/pots/objects position and shape",
    "same perspective, shadows, image dimensions and context",
    ...config.elementi_da_preservare ?? [],
  ];

  const additions: string[] = [];
  const removals: string[] = [];
  const replacements: string[] = [];
  const recolors: string[] = [];
  const conversions: string[] = [
    envelope.slopeLogic,
    envelope.drainageLogic,
    "rebuild all visible edges, thresholds, steps and material transitions cleanly",
    "clean transitions must be visible at every adjacent material edge",
  ];

  switch (config.operazione) {
    case "recolor_or_refinish_only":
      recolors.push(`recolor/refinish only the existing exterior surface to ${spec.colorDescription}; preserve exact pattern, geometry, joints, borders and levels`);
      conversions.push("no replacement of pattern, shape, module size or border logic");
      break;
    case "change_coping_only":
      replacements.push(`change only pool coping/border to ${config.coping_materiale || spec.borderDescription}; preserve pool basin, waterline and adjacent deck/lawn`);
      conversions.push("coping-only: no basin geometry change, no water plane change, clean transition to adjacent deck");
      break;
    case "change_steps_only":
      replacements.push(`change only exterior steps: ${spec.stepDescription}; preserve adjacent flat surface unless selected`);
      conversions.push("step-specific tread/riser continuity is mandatory; flat surface preserved outside step target");
      break;
    case "add_border_band":
      additions.push(`add border/perimeter band: ${spec.borderDescription}; do not alter main field unless selected`);
      break;
    case "add_drainage_logic":
      additions.push(`integrate visible/plausible drainage logic: ${envelope.drainageLogic}; avoid unnecessary decorative channels`);
      break;
    case "convert_to_deck":
      removals.push(oldPatternRemoval);
      replacements.push(`convert target surface to exterior deck: ${spec.materialDescription}; ${spec.patternDescription}; ${spec.jointDescription}`);
      conversions.push("deck conversion: no old tile grid or grout ghost may remain; boards, open gaps and direction must be readable");
      break;
    case "convert_to_gravel_or_stepping_stones":
      removals.push(oldPatternRemoval);
      replacements.push(`convert target surface to gravel/stepping-stone landscape surface: ${spec.materialDescription}; ${spec.patternDescription}`);
      conversions.push("gravel/stepping conversion must blend with landscape using crisp intentional edges, never random patching");
      break;
    default:
      removals.push(oldPatternRemoval);
      replacements.push(`replace target exterior surface with ${spec.materialDescription}; ${spec.finishDescription}; ${spec.patternDescription}`);
      break;
  }

  if (spec.isLargeFormat) {
    conversions.push("large-format exterior slabs: sparse joint density, few broad modules, plausible perimeter cuts, no small-tile grid drift");
  }
  if (spec.isDeck) {
    conversions.push("deck board direction and open-gap rules are mandatory; do not render as gres effetto legno");
  }
  if (spec.isPoolside) {
    conversions.push("poolside/coping rules: preserve basin geometry, waterline and pool surface unless explicitly selected");
  }
  if (spec.isVehicular) {
    conversions.push("vehicular use: pattern, bedding and module robustness must read as driveway-capable");
  }
  if (config.elementi_da_rimuovere?.length) {
    removals.push(...config.elementi_da_rimuovere.map((item) => `remove ${item} from target surface only and restore surrounding transition`));
  }

  return {
    operation: config.operazione,
    additions,
    removals,
    replacements,
    recolors,
    conversions: [
      ...conversions,
      `target perimeter: ${target.apparentPerimeter}`,
      `buildability: ${envelope.finalLevelRelation}`,
      `scene relation: ${scene.houseFacadeRelation}`,
    ],
    preserveExactly: commonPreserve,
  };
}

export function buildExteriorFloorRealismRules(config: ConfigurazionePavimentoEsterno, spec: ExteriorFloorTechnicalSpecification): string[] {
  return [
    "outdoor surface must look installed, not overlaid as a texture",
    "plausible perimeter cuts, thresholds, steps, joints and drainage must follow perspective",
    "contact shadows under outdoor objects must remain realistic",
    spec.isDeck ? "deck boards show visible direction, spacing, open gaps and exterior-grade material behavior" : "",
    spec.isLargeFormat ? "large slabs show sparse joints and broad uninterrupted fields" : "",
    config.materiale === "pietra_naturale" ? "natural stone shows mineral variation, believable thickness and non-repeating surface character" : "",
    config.materiale === "masselli_autobloccanti" ? "interlocking pavers show stable modular repetition and realistic joint sand" : "",
    config.materiale === "cemento_drenante" ? "draining concrete shows granular outdoor texture and water-permeable logic" : "",
    spec.isPoolside ? "pool coping looks dense, refined, water-compatible and does not change basin geometry" : "",
  ].filter(Boolean);
}

export function buildExteriorFloorQualityDirectives(): string[] {
  return [
    "professional exterior flooring sales visualization",
    "same-property realism",
    "technically plausible installation",
    "selected paving system must be clearly recognizable",
    "commercially trustworthy output for preventivi",
  ];
}
