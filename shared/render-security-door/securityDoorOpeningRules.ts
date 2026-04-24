import type {
  ConfigurazionePortaBlindata,
  SecurityDoorBuildabilityEnvelope,
  SecurityDoorSceneAnalysis,
  SecurityDoorTargetOpeningMap,
} from "./types.ts";

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function isRecolorOnly(config: ConfigurazionePortaBlindata): boolean {
  return config.interventi.length === 1 && config.interventi[0] === "recolor_or_restyle_only";
}

export function buildSecurityDoorTargetOpeningMap(
  config: ConfigurazionePortaBlindata,
  scene: SecurityDoorSceneAnalysis,
): SecurityDoorTargetOpeningMap {
  const structuralChange = !isRecolorOnly(config);
  const hasSidelight = structuralChange && (config.vetri.fiancoluce || config.apertura.presenza_fiancoluce || config.interventi.includes("add_sidelight"));
  const hasTransom = structuralChange && (config.vetri.sopraluce || config.apertura.presenza_sopraluce || config.interventi.includes("add_transom"));
  return {
    targetOpening: `${config.apertura.vano_target}: existing entrance doorway visible in ${scene.environmentType}`,
    openingPerimeter: "use the exact visible doorway perimeter as the installation boundary; do not move the opening",
    leafArea: "replace/refinish only the visible door leaf plane inside the existing opening",
    frameArea: "frame zone around the leaf, including visible jambs and head frame",
    casingArea: "casing/coprifili area immediately around the frame; keep adjacent wall outside this zone untouched",
    sidelightArea: hasSidelight
      ? "sidelight module area integrated laterally within a plausible available width"
      : "no sidelight area; do not invent lateral glass or panels",
    transomArea: hasTransom
      ? "transom/sopraluce module above the leaf only if the visible opening height supports it"
      : "no transom area; do not invent glass above the door",
    thresholdZone: "base threshold and floor-door junction only, with clean relation to existing floor",
    hardwareZones: [
      "handle/knob/pull bar zone at realistic hand height",
      "lock/defender zone aligned with handle hardware",
      "peephole/smart viewer zone at credible eye height if selected",
      "hinge side only if visible and selected",
    ],
    preservedAdjacentWallZones: [
      scene.surroundingWalls,
      "wall planes left and right of casing outside the direct junction",
      "upper wall area outside selected transom/casing zone",
    ],
    preservedFloorZones: [
      "floor outside the immediate threshold strip",
      scene.floorAndThreshold,
    ],
    interventionLimits: [
      "left/right limits are the current doorway trim or explicitly selected sidelight module",
      "top limit is the current head frame or selected transom module",
      "bottom limit is the threshold/floor contact line",
      "no edits beyond visible target doorway system except clean junction patching",
    ],
  };
}

export function buildSecurityDoorBuildabilityEnvelope(
  config: ConfigurazionePortaBlindata,
  scene: SecurityDoorSceneAnalysis,
  target: SecurityDoorTargetOpeningMap,
): SecurityDoorBuildabilityEnvelope {
  const warnings: string[] = [];
  const structuralChange = !isRecolorOnly(config);
  const addSidelight = structuralChange && (config.vetri.fiancoluce || config.interventi.includes("add_sidelight") || config.leaf_type === "anta_singola_con_fianco");
  const addTransom = structuralChange && (config.vetri.sopraluce || config.interventi.includes("add_transom") || config.leaf_type === "anta_singola_con_sopraluce");
  const doubleLeaf = structuralChange && (config.leaf_type.startsWith("doppia_anta") || config.door_type === "doppia_anta");
  const flush = structuralChange && (config.frame.tipo === "rasomuro" || config.door_type === "rasomuro" || config.interventi.includes("convert_to_flush_or_minimal"));

  if (addSidelight && config.apertura.larghezza_apparente === "stretta") {
    warnings.push("Selected sidelight on a narrow apparent opening: keep sidelight very slim or validator may flag low plausibility.");
  }
  if (doubleLeaf && !["ampia", "molto_ampia"].includes(config.apertura.larghezza_apparente)) {
    warnings.push("Double leaf requires wide apparent opening; keep active/passive split subtle if the source doorway is not wide.");
  }
  if (addTransom && config.apertura.altezza_apparente === "bassa") {
    warnings.push("Selected transom on a low opening: transom must be avoided or extremely shallow.");
  }

  return {
    plausibleDoorProportions: "door leaf must keep the photographed doorway proportions and read as installed inside the same opening",
    frameThicknessLogic: "security frame depth must be visible enough to imply a reinforced door, without inflating the wall or changing the opening geometry",
    casingCompatibility: flush
      ? "minimal casing logic mandatory: no traditional bulky coprifili, clean flush-wall shadow gap and restored wall junctions"
      : "casing must match selected frame type, proportioned to the visible opening and surrounding wall scale",
    sidelightWidthPlausibility: addSidelight
      ? "sidelight width plausibility mandatory: keep a narrow, proportional glass/panel module integrated in the frame without warping the doorway"
      : "no sidelight: preserve solid opening edges and do not create lateral glass",
    transomHeightPlausibility: addTransom
      ? "transom height plausibility mandatory: only a shallow, proportional upper module if the existing opening/head zone supports it"
      : "no transom: keep head frame clean and do not invent an upper glass module",
    doubleLeafWidthPlausibility: doubleLeaf
      ? "double-leaf width plausibility mandatory: show a coherent vertical leaf split and realistic active/passive proportions for the visible width"
      : "single leaf system: no double-leaf meeting line",
    flushWallCompatibility: flush
      ? "flush-wall appearance must be integrated into the wall plane with minimal casing, no old trim remnants and precise shadow lines"
      : "traditional/non-flush system may use visible casing but must not look pasted over the old frame",
    thresholdLogic: config.soglia.attiva
      ? "threshold must be visible, slim, aligned with the existing floor plane and compatible with a security-door system"
      : "preserve existing threshold/floor junction unless direct replacement is selected",
    hardwareScaleLogic: "hardware scale must be realistic for the visible camera distance: no oversized handles, no decorative fake lock graphics",
    forbiddenPlacements: uniq([
      "no floating door panel",
      "no door wider or taller than the visible opening unless sidelight/transom is selected and plausible",
      "no sidelight cutting into switches, intercoms, walls or furniture",
      "no transom colliding with ceiling, upper trim or low head height",
      "no hybrid old/new frame remnants",
      ...target.interventionLimits,
    ]),
    warnings,
  };
}

export function describeSecurityDoorTargetOpeningMap(map: SecurityDoorTargetOpeningMap): string {
  return [
    map.targetOpening,
    map.openingPerimeter,
    map.leafArea,
    map.frameArea,
    map.casingArea,
    map.sidelightArea,
    map.transomArea,
    map.thresholdZone,
  ].join(" | ");
}
