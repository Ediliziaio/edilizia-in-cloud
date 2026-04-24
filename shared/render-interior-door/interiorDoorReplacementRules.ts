import {
  DEFAULT_INTERIOR_DOOR_INTEGRITY_CONSTRAINTS,
  DEFAULT_INTERIOR_DOOR_QUALITY_DIRECTIVES,
  DOOR_TYPE_DESCRIPTIONS,
  FINISH_DESCRIPTIONS,
  FRAME_DESCRIPTIONS,
  HARDWARE_DESCRIPTIONS,
  LEAF_DESCRIPTIONS,
} from "./promptFragments.ts";
import type {
  ConfigurazionePortaInterna,
  InteriorDoorCompatibilityEnvelope,
  InteriorDoorReplacementManifest,
  InteriorDoorSceneAnalysis,
  InteriorDoorTargetOpeningMap,
  InteriorDoorTechnicalSpecification,
} from "./types.ts";

function uniq(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function hardwareText(config: ConfigurazionePortaInterna): string {
  return config.hardware.elementi.map((item) => HARDWARE_DESCRIPTIONS[item]).join("; ");
}

function isPocket(config: ConfigurazionePortaInterna): boolean {
  return config.door_type === "scorrevole_interno_muro" || config.interventi.includes("convert_to_pocket_sliding");
}

function isWallSliding(config: ConfigurazionePortaInterna): boolean {
  return config.door_type === "scorrevole_esterno_muro" || config.interventi.includes("convert_to_wall_sliding");
}

function isFlush(config: ConfigurazionePortaInterna): boolean {
  return config.door_type === "rasomuro" || config.frame.tipo === "rasomuro" || config.interventi.includes("convert_to_flush_door");
}

export function buildInteriorDoorTechnicalSpecification(config: ConfigurazionePortaInterna): InteriorDoorTechnicalSpecification {
  const glassActive = config.glass.enabled || config.interventi.includes("add_glazing") || config.door_type === "vetrata";
  const pocket = isPocket(config);
  const wallSliding = isWallSliding(config);
  const folding = config.door_type === "a_libro" || config.leaf_config === "libro_doppia";

  return {
    doorTypology: DOOR_TYPE_DESCRIPTIONS[config.door_type],
    leafConfiguration: LEAF_DESCRIPTIONS[config.leaf_config],
    finishSpecification: `${FINISH_DESCRIPTIONS[config.finish]} in ${config.colore}`,
    frameSpecification: `${FRAME_DESCRIPTIONS[config.frame.tipo]}${config.frame.colore ? `, color ${config.frame.colore}` : ""}; coprifilo ${config.frame.coprifilo ?? "coherent with frame type"}`,
    glassSpecification: glassActive
      ? `${FINISH_DESCRIPTIONS[config.finish].includes("glass") ? FINISH_DESCRIPTIONS[config.finish] : "selected glass insert/panel"}; glass type ${config.glass.type ?? "coherent with selected model"}, privacy ${config.glass.privacy_level ?? "medio"}`
      : "solid/blind door configuration; no glass panels, no inglesine and no window-like inserts",
    hardwareSpecification: `${hardwareText(config) || "selected interior-door hardware"}; finish ${config.hardware.finitura}; correctly scaled and mounted`,
    heightSpecification: config.height === "tutta_altezza"
      ? "full-height door relation, vertically continuous and believable against the ceiling/upper wall"
      : "standard interior-door height, no ceiling stretch",
    mechanismSpecification: pocket
      ? "pocket sliding mechanism: panel disappears into wall, no external rail visible"
      : wallSliding
        ? "external wall sliding mechanism: visible rail/brackets only if selected, with free wall travel"
        : folding
          ? "folding/book mechanism: visible fold line, compact leaf stack and coherent hinge rhythm"
          : "hinged mechanism: coherent swing-door frame, hinge side and handle side",
    premiumRealismCues: [
      "clean frame-to-wall junction",
      "correct relation to skirting/baseboard",
      "realistic handle/hinge/rail scale",
      "door material responds to the original room light",
    ],
  };
}

export function buildInteriorDoorReplacementManifest(
  config: ConfigurazionePortaInterna,
  scene: InteriorDoorSceneAnalysis,
  target: InteriorDoorTargetOpeningMap,
  envelope: InteriorDoorCompatibilityEnvelope,
): InteriorDoorReplacementManifest {
  const additions: string[] = [];
  const removals: string[] = [];
  const replacements: string[] = [];
  const recolors: string[] = [];
  const conversionRules: string[] = [
    "All modifications must stay inside the target opening map and preserve adjacent wall/floor/ceiling zones.",
    "The final doorway must be one coherent interior-door system, not a hybrid of old and new parts.",
    envelope.hardwareScaleLogic,
  ];
  const compatibilityAdjustments: string[] = [
    envelope.plausibleOpeningProportions,
    envelope.swingCompatibility,
  ];
  const recolorOnly = config.interventi.length === 1 && config.interventi[0] === "recolor_or_restyle_only";
  const pocket = isPocket(config);
  const wallSliding = isWallSliding(config);
  const flush = isFlush(config);
  const glassActive = config.glass.enabled || config.interventi.includes("add_glazing") || config.door_type === "vetrata";
  const doubleLeaf = config.door_type === "doppia_anta" || config.leaf_config.startsWith("doppia");
  const fullHeight = config.door_type === "tutta_altezza" || config.height === "tutta_altezza";

  if (config.interventi.includes("replace_existing_door") && !recolorOnly) {
    removals.push("Remove the old interior door completely, including old leaf, old glass, old hinges, old handle and incompatible casing details.");
    removals.push("Remove old swing/battuta/trim traces that conflict with the selected new system; no ghost outlines or double frames.");
    replacements.push(`Install the new ${DOOR_TYPE_DESCRIPTIONS[config.door_type]} inside the exact same target doorway.`);
    conversionRules.push("Rebuild frame-wall, casing-skirting and threshold/floor junctions cleanly after removing the old door.");
  }

  if (recolorOnly) {
    recolors.push(`Change only the visible door finish to ${FINISH_DESCRIPTIONS[config.finish]} in ${config.colore}.`);
    conversionRules.push("Finish-only mode: preserve exact doorway geometry, opening mechanism, frame/casing, threshold, hardware positions and leaf split.");
    conversionRules.push("Do not change from hinged to sliding, do not add glass, do not add rails, do not alter the opening.");
  }

  if (!recolorOnly && pocket) {
    replacements.push("Convert the doorway to a clean pocket sliding / interno muro door system.");
    removals.push("Remove old hinged-door traces, hinge marks, battuta reading and any obsolete swing hardware.");
    conversionRules.push("Pocket sliding rule: no visible external rail, clean wall-pocket reading, plausible passage and no old swing traces.");
    compatibilityAdjustments.push(envelope.pocketSlidingCompatibility);
  }

  if (!recolorOnly && wallSliding) {
    additions.push("Add an external wall sliding rail/bracket system only where selected and visually feasible.");
    replacements.push("Convert the doorway to a wall-mounted sliding door with a clear travel direction.");
    conversionRules.push("Wall sliding rule: use the available wall travel area and do not collide with furniture, switches, pictures or radiators.");
    compatibilityAdjustments.push(envelope.wallSlidingFeasibility);
  }

  if (!recolorOnly && flush) {
    replacements.push("Convert the doorway to a flush-wall / rasomuro interior-door composition.");
    removals.push("Remove traditional coprifili/old trim remnants where the flush system takes over.");
    conversionRules.push("Rasomuro rule: minimal or no casing, precise perimeter shadow line and clean wall-plane integration.");
    compatibilityAdjustments.push(envelope.flushWallCompatibility);
  }

  if (!recolorOnly && glassActive) {
    additions.push("Add selected glass/glazed door configuration only within the door leaf/frame system.");
    conversionRules.push("Glass rule: transparency/frosting/privacy must be coherent with room function and adjacent-room visibility.");
    compatibilityAdjustments.push(envelope.glassContextCompatibility);
  }

  if (!recolorOnly && doubleLeaf) {
    conversionRules.push("Double-leaf rule: centered/asymmetric split must be coherent, with realistic leaf widths and aligned hardware.");
    compatibilityAdjustments.push(envelope.doubleLeafWidthPlausibility);
  }

  if (!recolorOnly && fullHeight) {
    conversionRules.push("Full-height rule: vertical continuity must be believable against ceiling/upper wall, without stretching the room.");
    compatibilityAdjustments.push(envelope.fullHeightCeilingRelation);
  }

  if (!recolorOnly && config.interventi.includes("change_frame_only")) {
    replacements.push(`Change only frame/casing to ${config.frame.tipo}; keep the door leaf if not otherwise targeted.`);
  }

  if (!recolorOnly && config.interventi.includes("change_hardware_only")) {
    replacements.push(`Change only selected hardware: ${hardwareText(config)} in ${config.hardware.finitura}.`);
  }

  for (const item of config.elementi_da_rimuovere ?? []) {
    removals.push(`Remove user-listed incompatible item only if visible inside the target doorway zone: ${item}.`);
  }

  return {
    interventions: config.interventi,
    additions: uniq(additions),
    removals: uniq(removals),
    replacements: uniq(replacements),
    recolors: uniq(recolors),
    preserveExactly: uniq([
      ...DEFAULT_INTERIOR_DOOR_INTEGRITY_CONSTRAINTS,
      ...scene.untouchableElements,
      ...scene.contextToPreserve,
      ...(config.elementi_da_preservare ?? []),
      ...target.adjacentWallPreserveZones,
      ...target.adjacentFloorPreserveZones,
    ]),
    preserveGeometry: uniq([
      "same doorway position and room perspective",
      "same wall planes outside direct frame/casing junction",
      "same floor perspective and baseboard alignment outside threshold/passage zone",
      "same nearby furniture and fixtures unless targeted",
      "same ceiling geometry unless full-height relation is explicitly selected",
      "same camera crop and image dimensions",
    ]),
    preserveContext: uniq(scene.contextToPreserve),
    conversionRules: uniq(conversionRules),
    compatibilityAdjustments: uniq(compatibilityAdjustments),
  };
}

export function buildInteriorDoorRealismRules(config: ConfigurazionePortaInterna): string[] {
  return uniq([
    "door leaf/panel must sit inside the photographed doorway with believable depth and contact shadows",
    "frame, casing, skirting cuts and threshold/passage must form one installable interior-door system",
    "hardware must be physically mounted, correctly scaled and aligned to the selected opening mechanism",
    "door material, glass and frame must respond to the original room light and shadows",
    config.door_type === "scorrevole_esterno_muro" ? "external sliding rail must have realistic brackets, wall clearance and travel direction" : "",
    config.door_type === "scorrevole_interno_muro" ? "pocket sliding door must avoid any visible external rail and old swing traces" : "",
    config.door_type === "rasomuro" ? "flush-wall door must show clean minimal perimeter gap and no traditional trim" : "",
    config.glass.enabled || config.door_type === "vetrata" ? "glass must show realistic transparency/frosting, reflections and adjacent-room behavior" : "",
  ]);
}

export function buildInteriorDoorQualityDirectives(): string[] {
  return DEFAULT_INTERIOR_DOOR_QUALITY_DIRECTIVES;
}
