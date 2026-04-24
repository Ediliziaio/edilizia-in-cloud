import {
  bullets,
  DEFAULT_INTERIOR_DOOR_NEGATIVE_CONSTRAINTS,
} from "./promptFragments.ts";
import { describeInteriorDoorTargetOpeningMap } from "./interiorDoorOpeningRules.ts";
import { ensureInteriorDoorRenderConfig } from "./interiorDoorRenderConfig.ts";
import { validateInteriorDoorPromptConfig } from "./interiorDoorValidation.ts";
import type { InteriorDoorPromptBuildResult, InteriorDoorRenderConfig } from "./types.ts";

function photoMetaLine(config: InteriorDoorRenderConfig): string {
  const meta = config.photo_meta;
  if (!meta?.width || !meta.height) return "preserve original image dimensions, crop, orientation and interior perspective";
  const orientation = meta.orientation ?? (meta.width > meta.height ? "landscape" : meta.width < meta.height ? "portrait" : "square");
  return `preserve exact output dimensions ${meta.width}x${meta.height}, ${orientation} orientation`;
}

function describeManifest(config: InteriorDoorRenderConfig): string {
  const manifest = config.replacement_manifest;
  return [
    `Interventions: ${manifest.interventions.join(", ")}`,
    `Additions:\n${bullets(manifest.additions.length ? manifest.additions : ["no additions unless explicitly selected"])}`,
    `Removals:\n${bullets(manifest.removals.length ? manifest.removals : ["no removal beyond selected direct scope"])}`,
    `Replacements:\n${bullets(manifest.replacements.length ? manifest.replacements : ["no replacement unless selected"])}`,
    `Recolors/refinishes:\n${bullets(manifest.recolors.length ? manifest.recolors : ["no recolor-only work unless selected"])}`,
    `Conversion rules:\n${bullets(manifest.conversionRules)}`,
    `Compatibility adjustments:\n${bullets(manifest.compatibilityAdjustments)}`,
    `Preserve geometry:\n${bullets(manifest.preserveGeometry)}`,
    `Preserve exactly:\n${bullets(manifest.preserveExactly)}`,
  ].join("\n");
}

export function buildInteriorDoorPrompt(
  rawConfig: Record<string, unknown>,
  rawAnalysis?: unknown,
  photoMeta?: InteriorDoorRenderConfig["photo_meta"],
): InteriorDoorPromptBuildResult {
  const normalizedConfig = ensureInteriorDoorRenderConfig(rawConfig, rawAnalysis, photoMeta ?? null);
  const validation = validateInteriorDoorPromptConfig(normalizedConfig);
  const scene = normalizedConfig.scene_analysis;
  const target = normalizedConfig.target_opening_map;
  const envelope = normalizedConfig.compatibility_envelope;
  const spec = normalizedConfig.technical_specification;
  const blocks: Record<string, string> = {};

  blocks.A = `[BLOCK A - MISSION]
You are a SURGICAL PHOTOREALISTIC INTERIOR DOOR REPLACEMENT IMAGE EDITOR.
Apply exactly the selected interior door system to the same photographed room/interior.
Mandatory: same room, same property, same camera angle, same perspective, same walls, floor and skirting, same visible context, no artistic reinterpretation and no different-room generation.`;

  blocks.B = `[BLOCK B - EXISTING INTERIOR INVENTORY]
Room type: ${scene.roomType}
Doorway position: ${scene.doorwayPosition}
Existing door presence: ${scene.existingDoorPresence}
Existing door type: ${scene.existingDoorType}
Wall context: ${scene.wallMaterialAndColor}
Floor context: ${scene.floorMaterial}
Skirting/baseboard: ${scene.skirtingBaseboard}
Ceiling relation: ${scene.ceilingRelation}
Nearby furniture:
${bullets(scene.nearbyFurniture)}
Nearby fixtures:
${bullets(scene.nearbyFixtures)}
Lighting and shadows: ${scene.lightingAndShadows}
Doorway proportions: width ${scene.apparentOpeningWidth}, height ${scene.apparentOpeningHeight}
Wall sliding available area: ${scene.wallSlidingAvailableArea}
Adjacent room visibility: ${scene.adjacentRoomVisibility}
Untouchable elements:
${bullets(scene.untouchableElements)}`;

  blocks.C = `[BLOCK C - TARGET OPENING MAP]
${describeInteriorDoorTargetOpeningMap(target)}
Opening limits:
${bullets(target.openingLimits)}
Hardware area:
${bullets(target.hardwareArea)}
Preserved adjacent wall areas:
${bullets(target.adjacentWallPreserveZones)}
Preserved floor areas:
${bullets(target.adjacentFloorPreserveZones)}
Non-modifiable elements:
${bullets(target.nonModifiableElements)}`;

  blocks.D = `[BLOCK D - COMPATIBILITY ENVELOPE]
Plausible opening proportions: ${envelope.plausibleOpeningProportions}
Swing compatibility: ${envelope.swingCompatibility}
Pocket sliding compatibility: ${envelope.pocketSlidingCompatibility}
Wall sliding feasibility: ${envelope.wallSlidingFeasibility}
Double-leaf width plausibility: ${envelope.doubleLeafWidthPlausibility}
Full-height ceiling relation: ${envelope.fullHeightCeilingRelation}
Glass context compatibility: ${envelope.glassContextCompatibility}
Flush-wall compatibility: ${envelope.flushWallCompatibility}
Hardware scale logic: ${envelope.hardwareScaleLogic}
Forbidden conditions:
${bullets(envelope.forbiddenConditions)}
${envelope.warnings.length ? `Warnings:\n${bullets(envelope.warnings)}` : "Warnings: none."}`;

  blocks.E = `[BLOCK E - REPLACEMENT MANIFEST]
${describeManifest(normalizedConfig)}`;

  blocks.F = `[BLOCK F - INTERIOR DOOR SPECIFICATION]
Door typology: ${spec.doorTypology}
Leaf configuration: ${spec.leafConfiguration}
Finish: ${spec.finishSpecification}
Frame type: ${spec.frameSpecification}
Glass configuration: ${spec.glassSpecification}
Hardware: ${spec.hardwareSpecification}
Height: ${spec.heightSpecification}
Opening mechanism: ${spec.mechanismSpecification}
Premium realism cues:
${bullets(spec.premiumRealismCues)}`;

  blocks.G = `[BLOCK G - FRAME / CASING / SKIRTING / THRESHOLD RULES]
${bullets([
    "frame must integrate into the photographed doorway depth with realistic shadow lines",
    "casing/coprifili must match the selected frame type and must not float over the wall",
    "flush-wall logic if selected: minimal or no casing, clean perimeter gap and restored wall junctions",
    "skirting/baseboard relation must be clean: no broken random cuts, no smudged AI trim",
    "threshold/pass-through detail must align with the original floor perspective",
    "no smudged AI transitions at jambs, head frame, casing, skirting or floor junction",
  ])}`;

  blocks.H = `[BLOCK H - OPENING-MECHANISM RULES]
${bullets([
    envelope.swingCompatibility,
    envelope.pocketSlidingCompatibility,
    envelope.wallSlidingFeasibility,
    spec.mechanismSpecification,
    "folding/book systems must show clear fold line, compact stack and coherent hinge rhythm",
    "do not mix mechanisms: no old hinged traces on sliding doors, no rail on pocket doors, no double-leaf split unless selected",
    "no collisions with visible furniture, switches, radiators, pictures or fixtures",
  ])}`;

  blocks.I = `[BLOCK I - GLASS / HARDWARE RULES]
${bullets([
    spec.glassSpecification,
    spec.hardwareSpecification,
    "glass transparency/frosting must match selected privacy and room function",
    "handle/knob must be correctly scaled and mounted at believable hand height",
    "hinges appear only if selected/coherent; concealed hinges must remain subtle",
    "privacy lock appears only when selected or contextually relevant",
    "no oversized rails, handles, hinges or unrealistic hardware details",
  ])}`;

  blocks.J = `[BLOCK J - REMOVAL / CONVERSION RULES]
${bullets([
    "remove old swing-door traces when converting to sliding",
    "remove old trim when converting to flush-wall / rasomuro",
    "patch surrounding junctions cleanly while preserving adjacent walls, floor, skirting and ceiling",
    "if finish-only change, preserve exact geometry and opening system",
    "do not leave hybrid old/new door states, old hinge ghosts, old frame ghosts or incompatible glass remnants",
  ])}`;

  blocks.K = `[BLOCK K - PROPERTY INTEGRITY]
${bullets(normalizedConfig.integrity_constraints)}
Image: ${photoMetaLine(normalizedConfig)}`;

  blocks.L = `[BLOCK L - PHOTOREALISM RULES]
${bullets(normalizedConfig.realism_rules)}
${bullets([
    "realistic materials, reflections, glass behavior, shadowing and local ambient occlusion",
    "realistic hardware scale, frame depth and wall/floor contact",
    "believable installation look with correct contact shadows",
    "no warped geometry, no fake CGI showroom look, premium interior sales visualization quality",
  ])}`;

  blocks.M = `[BLOCK M - NEGATIVE CONSTRAINTS]
${bullets(DEFAULT_INTERIOR_DOOR_NEGATIVE_CONSTRAINTS)}`;

  blocks.N = `[BLOCK N - QUALITY BAR]
${bullets([
    ...normalizedConfig.quality_directives,
    validation.isValid
      ? "validation passed: target opening map, compatibility envelope, manifest, frame/casing rules, mechanism rules and integrity constraints are explicit"
      : `validation warnings: missing sections ${validation.missingSections.join(", ") || "none"}; missing business rules ${validation.missingBusinessRules.join(", ") || "none"}; warnings ${validation.warnings.join(", ") || "none"}`,
  ])}`;

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
    normalizedConfig.notes ? `[ADDITIONAL USER NOTES]\n${normalizedConfig.notes}` : "",
  ].filter(Boolean).join("\n\n");

  return {
    systemPrompt: blocks.A,
    userPrompt,
    negativePrompt: DEFAULT_INTERIOR_DOOR_NEGATIVE_CONSTRAINTS.join(", "),
    promptVersion: "interior-door-v1.0.0",
    blocks,
    validation,
    normalizedConfig,
  };
}
