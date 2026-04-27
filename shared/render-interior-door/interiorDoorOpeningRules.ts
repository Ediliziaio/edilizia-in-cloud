import type {
  ConfigurazionePortaInterna,
  InteriorDoorCompatibilityEnvelope,
  InteriorDoorSceneAnalysis,
  InteriorDoorTargetOpeningMap,
} from "./types.ts";

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function isRecolorOnly(config: ConfigurazionePortaInterna): boolean {
  return config.interventi.length === 1 && config.interventi[0] === "recolor_or_restyle_only";
}

function isWallSliding(config: ConfigurazionePortaInterna): boolean {
  return !isRecolorOnly(config) && (config.door_type === "scorrevole_esterno_muro" || config.interventi.includes("convert_to_wall_sliding"));
}

function isPocket(config: ConfigurazionePortaInterna): boolean {
  return !isRecolorOnly(config) && (config.door_type === "scorrevole_interno_muro" || config.interventi.includes("convert_to_pocket_sliding"));
}

function isFlush(config: ConfigurazionePortaInterna): boolean {
  return !isRecolorOnly(config) && (config.door_type === "rasomuro" || config.frame.tipo === "rasomuro" || config.interventi.includes("convert_to_flush_door"));
}

export function buildInteriorDoorTargetOpeningMap(
  config: ConfigurazionePortaInterna,
  scene: InteriorDoorSceneAnalysis,
): InteriorDoorTargetOpeningMap {
  const wallSliding = isWallSliding(config);
  const wallSpace = config.apertura.spazio_scorrimento_parete;
  const wallSlidingFeasible = wallSliding && (wallSpace === "sufficiente" || wallSpace === "ampio");
  const wallSlidingNotFeasible = wallSliding && (wallSpace === "assente" || wallSpace === "ridotto");
  return {
    targetDoorway: `${config.apertura.vano_target}: visible internal doorway in ${scene.doorwayPosition}`,
    openingLimits: [
      "left/right limits follow the existing visible doorway jambs or selected casing limits",
      "top limit follows existing head frame or selected full-height relation",
      "bottom limit follows the threshold/passage line at the floor",
      "no edits beyond target doorway system except clean junction patching",
    ],
    leafArea: "replace/refinish only the door leaf or visible sliding/folding panel inside the selected doorway system",
    frameCasingArea: "frame/casing/coprifili zone around the opening; keep adjacent wall outside this zone untouched",
    thresholdPassageArea: "threshold/pass-through strip at floor level; preserve surrounding floor continuity",
    wallSlidingArea: wallSlidingFeasible
      ? "wall-sliding travel area beside the opening, including rail zone and clear wall strip"
      : wallSlidingNotFeasible
        ? `external wall-sliding selected but available wall travel area is ${wallSpace}: do NOT render an external rail or wall-mounted sliding panel; treat as not-buildable and fall back to the closest plausible system`
        : "no external wall-sliding travel area unless explicitly selected",
    hardwareArea: [
      "handle/pomolo/privacy lock zone at realistic hand height",
      "hinge zone only for hinged/folding systems if visible",
      "sliding rail/brackets zone only for external-wall sliding systems",
    ],
    adjacentWallPreserveZones: [
      scene.wallMaterialAndColor,
      "wall areas left/right of casing outside direct system boundary",
      "upper wall/ceiling outside selected full-height relation",
    ],
    adjacentFloorPreserveZones: [
      scene.floorMaterial,
      "floor outside the immediate threshold/passage strip",
    ],
    nonModifiableElements: uniq([
      ...scene.nearbyFurniture,
      ...scene.nearbyFixtures,
      "non-target walls, ceiling, floor, skirting and adjacent room context",
    ]),
  };
}

export function buildInteriorDoorCompatibilityEnvelope(
  config: ConfigurazionePortaInterna,
  scene: InteriorDoorSceneAnalysis,
  target: InteriorDoorTargetOpeningMap,
): InteriorDoorCompatibilityEnvelope {
  const warnings: string[] = [];
  const wallSliding = isWallSliding(config);
  const pocket = isPocket(config);
  const flush = isFlush(config);
  const structuralChange = !isRecolorOnly(config);
  const doubleLeaf = structuralChange && (config.door_type === "doppia_anta" || config.leaf_config.startsWith("doppia"));
  const fullHeight = structuralChange && (config.door_type === "tutta_altezza" || config.height === "tutta_altezza" || config.apertura.altezza_apparente === "tutta_altezza");
  const glass = structuralChange && (config.door_type === "vetrata" || config.glass.enabled || config.interventi.includes("add_glazing"));

  if (wallSliding && !["sufficiente", "ampio"].includes(config.apertura.spazio_scorrimento_parete)) {
    warnings.push(`External wall sliding selected but available wall travel area is ${config.apertura.spazio_scorrimento_parete}: not buildable, fall back to a hinged or pocket system.`);
  }
  if (doubleLeaf && !["ampia", "molto_ampia"].includes(config.apertura.larghezza_apparente)) {
    warnings.push("Double-leaf door requires a wide apparent doorway.");
  }
  if (fullHeight && scene.ceilingRelation.toLowerCase().includes("basso")) {
    warnings.push("Full-height door selected in a low ceiling relation; keep proportions conservative.");
  }
  if (config.context === "bagno" && glass && (config.glass.privacy_level ?? "medio") === "basso") {
    warnings.push("Bathroom glass door should use privacy glass/frosting unless explicitly decorative.");
  }

  return {
    plausibleOpeningProportions: "new door must keep the photographed doorway proportions and perspective unless full-height is explicitly plausible",
    swingCompatibility: config.door_type.startsWith("battente")
      ? "hinged swing system must show coherent frame, hinges/handle side and no sliding rail"
      : "if not hinged, remove old swing-door reading and do not leave old hinge/battuta traces",
    pocketSlidingCompatibility: pocket
      ? "pocket sliding logic mandatory: no visible external rail, clean wall-pocket reading, no old swing traces and a plausible sliding passage"
      : "no pocket sliding system unless selected",
    wallSlidingFeasibility: wallSliding
      ? (["sufficiente", "ampio"].includes(config.apertura.spazio_scorrimento_parete)
        ? "wall sliding feasibility mandatory: free wall area beside the opening, visible rail only if selected, no collision with furniture, switches, pictures or radiators"
        : `wall sliding NOT FEASIBLE: available wall travel area is ${config.apertura.spazio_scorrimento_parete}; do not render an external rail/panel and treat the request as not-buildable`)
      : "no external wall rail or wall-mounted sliding panel unless selected",
    doubleLeafWidthPlausibility: doubleLeaf
      ? "double-leaf width plausibility mandatory: doorway must read wide enough, with coherent central split and realistic hardware scale"
      : "single-leaf composition: no double split lines unless selected",
    fullHeightCeilingRelation: fullHeight
      ? "full-height ceiling relation mandatory: vertical door height must meet the ceiling/upper wall plausibly without stretching the room"
      : "standard-height relation: do not stretch the door to ceiling",
    glassContextCompatibility: glass
      ? "glass configuration must match selected privacy/transparency, with believable frame mullions and adjacent-room view behavior"
      : "solid/blind door: do not invent glazing, inglesine or window-like panels",
    flushWallCompatibility: flush
      ? "flush-wall logic mandatory: minimal or no casing, precise perimeter shadow line, clean integration with wall plane and skirting"
      : "non-flush systems may use casing/coprifili but must not look pasted over old trim",
    hardwareScaleLogic: "handles, hinges, knobs, rails and privacy locks must be correctly scaled and mounted in believable positions",
    forbiddenConditions: uniq([
      "no door panel pasted over the photo",
      "no sliding door without pocket or free wall area",
      "no double-leaf door in a narrow doorway",
      "no full-height door that deforms ceiling or wall proportions",
      "no rail colliding with switches, pictures, radiators, cabinets or furniture",
      "no hybrid old/new frame, old hinges, old battuta or old glass traces",
      ...target.openingLimits,
    ]),
    warnings,
  };
}

export function describeInteriorDoorTargetOpeningMap(map: InteriorDoorTargetOpeningMap): string {
  return [
    map.targetDoorway,
    map.leafArea,
    map.frameCasingArea,
    map.thresholdPassageArea,
    map.wallSlidingArea,
  ].join(" | ");
}
