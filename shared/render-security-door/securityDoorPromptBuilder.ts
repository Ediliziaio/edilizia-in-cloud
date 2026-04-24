import {
  bullets,
  DEFAULT_SECURITY_DOOR_NEGATIVE_CONSTRAINTS,
} from "./promptFragments.ts";
import { describeSecurityDoorTargetOpeningMap } from "./securityDoorOpeningRules.ts";
import { ensureSecurityDoorRenderConfig } from "./securityDoorRenderConfig.ts";
import { validateSecurityDoorPromptConfig } from "./securityDoorValidation.ts";
import type { SecurityDoorPromptBuildResult, SecurityDoorRenderConfig } from "./types.ts";

function photoMetaLine(config: SecurityDoorRenderConfig): string {
  const meta = config.photo_meta;
  if (!meta?.width || !meta.height) return "preserve original image dimensions, crop, orientation and entrance perspective";
  const orientation = meta.orientation ?? (meta.width > meta.height ? "landscape" : meta.width < meta.height ? "portrait" : "square");
  return `preserve exact output dimensions ${meta.width}x${meta.height}, ${orientation} orientation`;
}

function describeManifest(config: SecurityDoorRenderConfig): string {
  const manifest = config.replacement_manifest;
  return [
    `Interventions: ${manifest.interventions.join(", ")}`,
    `Additions:\n${bullets(manifest.additions.length ? manifest.additions : ["no additions unless explicitly selected"])}`,
    `Removals:\n${bullets(manifest.removals.length ? manifest.removals : ["no removal beyond direct selected scope"])}`,
    `Replacements:\n${bullets(manifest.replacements.length ? manifest.replacements : ["no replacement unless selected"])}`,
    `Recolors/refinishes:\n${bullets(manifest.recolors.length ? manifest.recolors : ["no recolor-only work unless selected"])}`,
    `Conversion rules:\n${bullets(manifest.conversionRules)}`,
    `Compatibility adjustments:\n${bullets(manifest.compatibilityAdjustments)}`,
    `Preserve geometry:\n${bullets(manifest.preserveGeometry)}`,
    `Preserve exactly:\n${bullets(manifest.preserveExactly)}`,
  ].join("\n");
}

export function buildSecurityDoorPrompt(
  rawConfig: Record<string, unknown>,
  rawAnalysis?: unknown,
  photoMeta?: SecurityDoorRenderConfig["photo_meta"],
): SecurityDoorPromptBuildResult {
  const normalizedConfig = ensureSecurityDoorRenderConfig(rawConfig, rawAnalysis, photoMeta ?? null);
  const validation = validateSecurityDoorPromptConfig(normalizedConfig);
  const scene = normalizedConfig.scene_analysis;
  const target = normalizedConfig.target_opening_map;
  const envelope = normalizedConfig.buildability_envelope;
  const spec = normalizedConfig.technical_specification;
  const blocks: Record<string, string> = {};

  blocks.A = `[BLOCK A - MISSION]
You are a SURGICAL PHOTOREALISTIC SECURITY DOOR REPLACEMENT IMAGE EDITOR.
Apply exactly the selected security door system to the same photographed property/entrance.
Mandatory: same property, same entrance, same camera angle, same perspective, same surrounding walls and floor, same visible context, same image dimensions, no artistic reinterpretation and no different-property generation.`;

  blocks.B = `[BLOCK B - EXISTING ENTRANCE INVENTORY]
Entrance type: ${scene.environmentType}
Visible side / context: ${scene.visibleSide} - ${scene.entranceContext}
Existing door presence: ${scene.existingDoorPresence}
Existing door style: ${scene.existingDoorStyle}
Existing frame/casing: ${scene.existingFrameAndCasing}
Surrounding walls: ${scene.surroundingWalls}
Floor and threshold: ${scene.floorAndThreshold}
Skirting/baseboards: ${scene.skirtingOrBaseboards}
Apparent opening width: ${scene.apparentOpeningWidth}
Apparent opening height: ${scene.apparentOpeningHeight}
Reveal depth: ${scene.revealDepth}
Adjacent fixtures:
${bullets(scene.adjacentFixtures)}
Lighting and shadows: ${scene.lightingAndShadows}
Untouchable elements:
${bullets(scene.untouchableElements)}`;

  blocks.C = `[BLOCK C - TARGET OPENING MAP]
${describeSecurityDoorTargetOpeningMap(target)}
Hardware zones:
${bullets(target.hardwareZones)}
Preserved adjacent wall zones:
${bullets(target.preservedAdjacentWallZones)}
Preserved floor zones:
${bullets(target.preservedFloorZones)}
Exact intervention limits:
${bullets(target.interventionLimits)}`;

  blocks.D = `[BLOCK D - BUILDABILITY ENVELOPE]
Plausible door proportions: ${envelope.plausibleDoorProportions}
Frame thickness logic: ${envelope.frameThicknessLogic}
Casing compatibility: ${envelope.casingCompatibility}
Sidelight width plausibility: ${envelope.sidelightWidthPlausibility}
Transom height plausibility: ${envelope.transomHeightPlausibility}
Double-leaf width plausibility: ${envelope.doubleLeafWidthPlausibility}
Flush-wall compatibility: ${envelope.flushWallCompatibility}
Threshold logic: ${envelope.thresholdLogic}
Hardware scale logic: ${envelope.hardwareScaleLogic}
Forbidden placements:
${bullets(envelope.forbiddenPlacements)}
${envelope.warnings.length ? `Warnings:\n${bullets(envelope.warnings)}` : "Warnings: none."}`;

  blocks.E = `[BLOCK E - REPLACEMENT MANIFEST]
${describeManifest(normalizedConfig)}`;

  blocks.F = `[BLOCK F - SECURITY DOOR SPECIFICATION]
Door typology: ${spec.doorTypology}
Leaf configuration: ${spec.leafConfiguration}
Visible-side finish: ${spec.visibleSideFinish}
Internal/external finish logic: ${spec.internalExternalFinishLogic}
Frame specification: ${spec.frameSpecification}
Panel detailing: ${spec.panelDetailing}
Hardware specification: ${spec.hardwareSpecification}
Glass specification: ${spec.glassSpecification}
Threshold specification: ${spec.thresholdSpecification}
Security-grade visual cues:
${bullets(spec.securityGradeVisualCues)}`;

  blocks.G = `[BLOCK G - FRAME / CASING / THRESHOLD RULES]
${bullets([
    "frame must be integrated into the existing doorway depth with realistic shadow lines and gasket/contact details",
    "clean frame integration is mandatory: jambs, head frame, casing and leaf shadow gaps must read as one installed security-door system",
    "casing/coprifili must match the selected frame type and must not float over the wall",
    "flush-wall / rasomuro systems must use minimal casing logic, clean perimeter gap and no old trim remnants",
    "threshold must align with the photographed floor plane, with clean wall/floor/door junctions",
    "no smudged AI transitions at jambs, head frame, casing or threshold",
  ])}`;

  blocks.H = `[BLOCK H - HARDWARE AND SECURITY DETAIL RULES]
${bullets([
    spec.hardwareSpecification,
    "handle / knob / pull bar must be correctly scaled and mounted at believable height",
    "peephole or smart viewer appears only if selected, at credible eye height",
    "defender lock detail must be subtle and realistic, not a technical diagram",
    "visible hinges appear only if coherent with the selected system and side context",
    "all hardware must look premium but buildable and must match the selected finish",
  ])}`;

  blocks.I = `[BLOCK I - SIDE-LIGHT / TRANSOM RULES]
${bullets([
    envelope.sidelightWidthPlausibility,
    envelope.transomHeightPlausibility,
    spec.glassSpecification,
    "side-light and transom modules must be proportional, integrated in the frame and never pasted onto the wall",
    "do not invent side-light, transom or glass modules if not selected",
  ])}`;

  blocks.J = `[BLOCK J - REMOVAL / CONVERSION RULES]
${bullets([
    "remove old door completely when replacing",
    "remove previous frame traces when converting to a minimal or flush system",
    "patch surrounding junctions cleanly, preserving adjacent walls and floor outside the direct system boundary",
    "if finish-only change, preserve exact opening geometry, frame geometry, threshold and hardware positions",
    "do not leave hybrid old/new door states, old trim ghosts or incompatible glass/panel leftovers",
  ])}`;

  blocks.K = `[BLOCK K - PROPERTY INTEGRITY]
${bullets(normalizedConfig.integrity_constraints)}
Image: ${photoMetaLine(normalizedConfig)}`;

  blocks.L = `[BLOCK L - PHOTOREALISM RULES]
${bullets(normalizedConfig.realism_rules)}
${bullets([
    "realistic materials, reflections, shadowing and local ambient occlusion",
    "realistic hardware scale and frame depth",
    "believable installation look with correct contact shadows",
    "no warped geometry, no fake CGI showroom look, premium architectural sales visualization quality",
  ])}`;

  blocks.M = `[BLOCK M - NEGATIVE CONSTRAINTS]
${bullets(DEFAULT_SECURITY_DOOR_NEGATIVE_CONSTRAINTS)}`;

  blocks.N = `[BLOCK N - QUALITY BAR]
${bullets([
    ...normalizedConfig.quality_directives,
    validation.isValid
      ? "validation passed: target opening map, buildability envelope, manifest, frame/casing rules, hardware rules and integrity constraints are explicit"
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
    negativePrompt: DEFAULT_SECURITY_DOOR_NEGATIVE_CONSTRAINTS.join(", "),
    promptVersion: "security-door-v1.0.0",
    blocks,
    validation,
    normalizedConfig,
  };
}
