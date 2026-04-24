import {
  DEFAULT_SECURITY_DOOR_INTEGRITY_CONSTRAINTS,
  DEFAULT_SECURITY_DOOR_QUALITY_DIRECTIVES,
  DOOR_TYPE_DESCRIPTIONS,
  FINISH_DESCRIPTIONS,
  FRAME_DESCRIPTIONS,
  HARDWARE_DESCRIPTIONS,
  LEAF_DESCRIPTIONS,
} from "./promptFragments.ts";
import type {
  ConfigurazionePortaBlindata,
  SecurityDoorBuildabilityEnvelope,
  SecurityDoorReplacementManifest,
  SecurityDoorSceneAnalysis,
  SecurityDoorTargetOpeningMap,
  SecurityDoorTechnicalSpecification,
} from "./types.ts";

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function selectedHardware(config: ConfigurazionePortaBlindata): string {
  return config.hardware.elementi.map((item) => HARDWARE_DESCRIPTIONS[item]).join("; ");
}

function visibleSideLabel(config: ConfigurazionePortaBlindata): string {
  return config.visible_side === "interno" ? "INTERIOR" : "EXTERIOR";
}

export function buildSecurityDoorTechnicalSpecification(config: ConfigurazionePortaBlindata): SecurityDoorTechnicalSpecification {
  const visibleSideFinish = `${FINISH_DESCRIPTIONS[config.finitura_lato_visibile]} in ${config.colore_lato_visibile}`;
  const internalFinish = `${FINISH_DESCRIPTIONS[config.finitura_interna]}${config.colore_interno ? `, ${config.colore_interno}` : ""}`;
  const externalFinish = `${FINISH_DESCRIPTIONS[config.finitura_esterna]}${config.colore_esterno ? `, ${config.colore_esterno}` : ""}`;
  const flush = config.frame.tipo === "rasomuro" || config.door_type === "rasomuro";

  return {
    doorTypology: DOOR_TYPE_DESCRIPTIONS[config.door_type],
    leafConfiguration: LEAF_DESCRIPTIONS[config.leaf_type],
    visibleSideFinish,
    internalExternalFinishLogic: config.visible_side === "interno"
      ? `Visible side is INTERIOR: render the visible-side selected finish (${visibleSideFinish}) as the internal panel face. Internal reference: ${internalFinish}. Non-visible exterior reference: ${externalFinish}; do not leak exterior finish onto the visible interior side.`
      : `Visible side is EXTERIOR: render the visible-side selected finish (${visibleSideFinish}) as the exterior panel face. Exterior reference: ${externalFinish}. Non-visible interior reference: ${internalFinish}; do not leak interior finish onto the visible exterior side.`,
    frameSpecification: `${FRAME_DESCRIPTIONS[config.frame.tipo]}${config.frame.colore ? `, color ${config.frame.colore}` : ""}; coprifilo ${config.frame.coprifilo ?? (flush ? "assente/minimale" : "standard")}`,
    panelDetailing: config.finitura_lato_visibile === "pantografato"
      ? "panel must show crisp classic pantographed reliefs, controlled symmetry and no modern minimal leakage"
      : config.finitura_lato_visibile === "effetto_legno"
        ? "panel must show realistic vertical or horizontal wood grain consistent with door scale"
        : "panel detailing must follow the selected style without adding unrequested decorative grooves",
    hardwareSpecification: `${selectedHardware(config) || "selected handle and security hardware"}; finish ${config.hardware.finitura}; position ${config.hardware.posizione ?? "standard"}`,
    glassSpecification: config.vetri.fiancoluce || config.vetri.sopraluce
      ? `integrated security-door glazing modules, ${config.vetri.finitura_vetro ?? "transparent/satin coherent"} glass, same frame family, no pasted glass strips`
      : "no glass modules; do not invent sidelight, transom or decorative glazing",
    thresholdSpecification: config.soglia.attiva
      ? `${config.soglia.materiale} threshold, ${config.soglia.finitura ?? "coherent finish"}, slim and aligned to floor`
      : "preserve existing threshold unless direct replacement is required by frame integration",
    securityGradeVisualCues: [
      `visible photographed side is ${visibleSideLabel(config)} and must use the visible-side selected finish only`,
      "solid reinforced leaf impression",
      "credible security frame depth",
      "premium handle/lock hardware at correct scale",
      "clean gasket/shadow lines around the leaf",
    ],
  };
}

export function buildSecurityDoorReplacementManifest(
  config: ConfigurazionePortaBlindata,
  scene: SecurityDoorSceneAnalysis,
  target: SecurityDoorTargetOpeningMap,
  envelope: SecurityDoorBuildabilityEnvelope,
): SecurityDoorReplacementManifest {
  const additions: string[] = [];
  const removals: string[] = [];
  const replacements: string[] = [];
  const recolors: string[] = [];
  const conversionRules: string[] = [
    "All modifications must stay inside the target opening map and respect preserved adjacent wall/floor zones.",
    "The final door system must be a single coherent security-door installation, not a collage of old and new parts.",
    envelope.frameThicknessLogic,
    envelope.thresholdLogic,
  ];
  const compatibilityAdjustments: string[] = [
    envelope.plausibleDoorProportions,
    envelope.hardwareScaleLogic,
    envelope.casingCompatibility,
  ];

  const replaceExisting = config.interventi.includes("replace_existing_door");
  const recolorOnly = config.interventi.length === 1 && config.interventi[0] === "recolor_or_restyle_only";
  const flush = config.frame.tipo === "rasomuro" || config.door_type === "rasomuro" || config.interventi.includes("convert_to_flush_or_minimal");
  const addSidelight = config.interventi.includes("add_sidelight") || config.vetri.fiancoluce || config.leaf_type === "anta_singola_con_fianco";
  const addTransom = config.interventi.includes("add_transom") || config.vetri.sopraluce || config.leaf_type === "anta_singola_con_sopraluce";
  const doubleLeaf = config.door_type === "doppia_anta" || config.leaf_type.startsWith("doppia_anta");

  if (replaceExisting && !recolorOnly) {
    removals.push("Remove the old door leaf completely, including old panel grooves, old glass if incompatible, old hardware and old lock details.");
    removals.push("Remove old frame/casing traces that conflict with the new security-door system; no ghost outlines or double frames.");
    replacements.push(`Install the new ${DOOR_TYPE_DESCRIPTIONS[config.door_type]} in the exact same target opening.`);
    conversionRules.push("Rebuild all frame-wall and threshold-floor junctions cleanly after removing the old door.");
  }

  if (recolorOnly) {
    recolors.push(`Recolor/refinish only the visible door panel as ${FINISH_DESCRIPTIONS[config.finitura_lato_visibile]} in ${config.colore_lato_visibile}.`);
    conversionRules.push("Finish-only mode: preserve exact opening geometry, leaf split, frame/casing proportions, threshold and hardware positions.");
    conversionRules.push("Do not replace the door type, do not add sidelight/transom, do not change hardware scale or frame geometry.");
  }

  if (!recolorOnly && config.interventi.includes("change_frame_only")) {
    replacements.push(`Change only frame/casing to ${FRAME_DESCRIPTIONS[config.frame.tipo]}; keep the door panel if not otherwise targeted.`);
  }

  if (!recolorOnly && flush) {
    replacements.push("Convert the visible junction to a flush-wall/minimal security-door composition.");
    removals.push("Remove previous bulky trim/cornice remnants where the flush/minimal system takes over.");
    conversionRules.push("Rasomuro rule: minimal casing logic mandatory, clean wall-plane integration, no old trim remnants.");
  }

  if (!recolorOnly && addSidelight) {
    additions.push("Add a proportional integrated sidelight/fiancoluce only within plausible available width.");
    compatibilityAdjustments.push(envelope.sidelightWidthPlausibility);
  }

  if (!recolorOnly && addTransom) {
    additions.push("Add a proportional integrated transom/sopraluce only within plausible head height.");
    compatibilityAdjustments.push(envelope.transomHeightPlausibility);
  }

  if (!recolorOnly && doubleLeaf) {
    compatibilityAdjustments.push(envelope.doubleLeafWidthPlausibility);
    conversionRules.push("Double-leaf rule: visible leaf split must be coherent, with realistic active/passive leaf widths and aligned hardware.");
  }

  if (!recolorOnly && (config.interventi.includes("replace_threshold") || config.soglia.attiva)) {
    replacements.push(`Resolve the threshold zone with ${config.soglia.materiale} threshold and clean floor-door junction.`);
  }

  if (!recolorOnly && config.interventi.includes("add_security_hardware")) {
    additions.push(`Add selected security hardware only: ${selectedHardware(config)}.`);
  }

  for (const item of config.elementi_da_rimuovere ?? []) {
    removals.push(`Remove user-listed incompatible element if visible inside the target doorway zone: ${item}.`);
  }

  return {
    interventions: config.interventi,
    additions: uniq(additions),
    removals: uniq(removals),
    replacements: uniq(replacements),
    recolors: uniq(recolors),
    preserveExactly: uniq([
      ...DEFAULT_SECURITY_DOOR_INTEGRITY_CONSTRAINTS,
      ...scene.untouchableElements,
      ...scene.contextToPreserve,
      ...(config.elementi_da_preservare ?? []),
      ...target.preservedAdjacentWallZones,
      ...target.preservedFloorZones,
    ]),
    preserveGeometry: uniq([
      "same doorway position and perspective",
      "same visible wall planes outside the direct frame/casing junction",
      "same floor perspective and baseboard alignment outside the threshold zone",
      "same adjacent fixtures and furniture unless listed as target removals",
      "same camera crop and image dimensions",
    ]),
    preserveContext: uniq(scene.contextToPreserve),
    conversionRules: uniq(conversionRules),
    compatibilityAdjustments: uniq(compatibilityAdjustments),
  };
}

export function buildSecurityDoorRealismRules(config: ConfigurazionePortaBlindata): string[] {
  return uniq([
    "door leaf must sit inside the existing photographed opening with believable depth and contact shadows",
    "frame, casing, gaskets and threshold must form one installable security-door system",
    "hardware must be physically mounted, correctly scaled and aligned to the panel style",
    "materials must respond to the original entrance light and never look like a pasted showroom product",
    config.frame.tipo === "rasomuro" || config.door_type === "rasomuro"
      ? "flush-wall security door must show a clean minimal perimeter shadow gap and no traditional trim"
      : "",
    config.finitura_lato_visibile === "effetto_legno"
      ? "wood-effect finish must show believable grain direction and panel scale"
      : "",
    config.finitura_lato_visibile === "pantografato"
      ? "classic pantographed finish must show crisp routed relief, proportioned panels and coherent shadows"
      : "",
  ]);
}

export function buildSecurityDoorQualityDirectives(): string[] {
  return DEFAULT_SECURITY_DOOR_QUALITY_DIRECTIVES;
}
