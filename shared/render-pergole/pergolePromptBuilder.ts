import {
  DEFAULT_NEGATIVE_CONSTRAINTS,
} from "./promptFragments.ts";
import { ensurePergoleRenderConfig } from "./pergoleRenderConfig.ts";
import { validatePergolePromptConfig } from "./pergoleValidation.ts";
import type { PergolaPromptBuildResult, PergolaRenderConfig } from "./types.ts";

function bullets(lines: Array<string | null | undefined>): string {
  return lines
    .filter((line): line is string => Boolean(line && line.trim()))
    .map((line) => `- ${line}`)
    .join("\n");
}

function describeManifest(config: PergolaRenderConfig): string {
  const manifest = config.replacement_manifest;
  return [
    `Operation: ${manifest.operation}`,
    `Additions:\n${bullets(manifest.additions.length ? manifest.additions : ["no additions unless explicitly selected"])}`,
    `Replacements:\n${bullets(manifest.replacements.length ? manifest.replacements : ["no replacement unless explicitly selected"])}`,
    `Recolors:\n${bullets(manifest.recolors.length ? manifest.recolors : ["no recolor unless explicitly selected"])}`,
    `Removals:\n${bullets(manifest.removals.length ? manifest.removals : ["remove only incompatible elements if required by selected operation"])}`,
    `Conversion rules:\n${bullets(manifest.conversions)}`,
    `Preserve exactly:\n${bullets(manifest.preserveExactly)}`,
  ].join("\n");
}

export function buildPergolePrompt(
  rawConfig: Record<string, unknown>,
  rawAnalysis?: unknown,
  photoMeta?: PergolaRenderConfig["photo_meta"],
): PergolaPromptBuildResult {
  const normalizedConfig = ensurePergoleRenderConfig(rawConfig, rawAnalysis, photoMeta ?? null);
  const validation = validatePergolePromptConfig(normalizedConfig);
  const scene = normalizedConfig.scene_analysis;
  const target = normalizedConfig.target_installation_map;
  const envelope = normalizedConfig.installability_envelope;
  const technical = normalizedConfig.technical_specification;
  const blocks: Record<string, string> = {};
  const operation = normalizedConfig.replacement_manifest.operation;
  const sideClosureInScope = operation === "add_new_pergola" ||
    operation === "replace_existing_awning_with_pergola" ||
    operation === "replace_existing_pergola" ||
    operation === "add_side_closures" ||
    operation === "remove_side_closures";
  const sideClosureBehavior = sideClosureInScope
    ? technical.sideClosureDescription
    : "preserve existing side closure condition exactly; do not add, remove or change ZIP screens, curtains, glass panels or tracks in this operation scope";

  blocks.A = `[BLOCK A - MISSION]
You are a SURGICAL PHOTOREALISTIC PERGOLA INSTALLATION IMAGE EDITOR.
Insert, replace, recolor or update exactly the requested pergola / outdoor shading system on the same photographed property.
Mandatory: same house, same facade, same patio / terrace / garden, same camera angle, same perspective, same openings, same paving, same surrounding context, same image dimensions, no artistic reinterpretation and no different-property generation.`;

  blocks.B = `[BLOCK B - EXISTING OUTDOOR SCENE INVENTORY]
Outdoor area type: ${scene.outdoorAreaType}
Property type: ${scene.propertyType}
Facade visible: ${scene.facadeVisible}
Doors and windows: ${scene.doorsAndWindows}
Existing paving: ${scene.existingPaving}
Existing shading systems: ${scene.existingShadingSystems}
Parapets / boundaries: ${scene.parapetsAndBoundaries}
Outdoor furniture: ${scene.outdoorFurniture}
Pool / water: ${scene.poolOrWater}
Light and shadows: ${scene.lightAndShadows}
Available installation space: ${scene.availableInstallationSpace}
Obstacles / constraints:
${bullets(scene.obstacles)}
Untouchable elements:
${bullets(scene.untouchableElements)}`;

  blocks.C = `[BLOCK C - TARGET INSTALLATION MAP]
Installation zone: ${target.zone}
Target description: ${target.targetDescription}
Footprint: ${target.footprint}
Rear attachment line: ${target.rearAttachmentLine}
Front edge: ${target.frontEdge}
Left/right limits: ${target.leftRightLimits}
Clearances:
${bullets(target.clearances)}
No-occupy zones:
${bullets(target.noOccupyZones)}`;

  blocks.D = `[BLOCK D - INSTALLABILITY ENVELOPE]
Structural height: ${envelope.structuralHeight}
Beam/profile depth: ${envelope.beamDepth}
Post count: ${envelope.postCount}
Post positions:
${bullets(envelope.postPositions)}
Anchoring logic: ${envelope.anchoringLogic}
Facade relation: ${envelope.facadeRelation}
Opening clearance: ${envelope.openingClearance}
Drainage / water management: ${envelope.drainageLogic}
Forbidden placements:
${bullets(envelope.forbiddenPlacements)}`;

  blocks.E = `[BLOCK E - REPLACEMENT MANIFEST]
${describeManifest(normalizedConfig)}`;

  blocks.F = `[BLOCK F - PERGOLA STRUCTURE SPECIFICATION]
Typology: ${technical.typology}
Wall-mounted: ${technical.wallMounted ? "yes" : "no, freestanding / independent"}
Structure material: ${technical.material}
Material behavior: ${technical.materialDescription}
Color / finish: ${technical.colorDescription}
Structural language: ${technical.structureLanguage}
Post and beam logic: posts must be grounded, beams proportional to span, joints believable, no floating or impossible structure.`;

  blocks.G = `[BLOCK G - ROOF / COVER SYSTEM SPECIFICATION]
Cover type: ${technical.coverType}
Cover behavior: ${technical.coverDescription}
Open state: ${technical.coverStateRule}
Visual behavior: cover must read as the selected system, not as a generic canopy; align its modules/blades/fabric/glass panels to the same perspective and light.`;

  blocks.H = `[BLOCK H - SIDE CLOSURES SPECIFICATION]
Side closure type: ${technical.sideClosureType}
Side closure behavior: ${sideClosureBehavior}
Side closure state must be physically attached to posts/beams with tracks, guides or panels where relevant; no random decorative curtains unless selected.`;

  blocks.I = `[BLOCK I - DRAINAGE / WATER MANAGEMENT RULES]
${bullets([
    envelope.drainageLogic,
    "wall-mounted pergolas need a plausible rear waterproof junction and front/side runoff logic",
    "glass, polycarbonate and opaque covers need visible edge profiles, seals and drainage-compatible slope",
    "bioclimatic louvers need integrated perimeter water channel logic; do not render an impossible flat undrained slab",
    "fabric covers need a believable tension/collection profile, not water-heavy sagging textile unless explicitly requested",
  ])}`;

  blocks.J = `[BLOCK J - INSTALLATION REALISM RULES]
${bullets([
    envelope.anchoringLogic,
    envelope.openingClearance,
    "wall attachments, post foot plates, profile transitions and contact shadows must be credible",
    "no blocked door/window operation unless explicitly accepted by the user",
    "no collision with shutters, windows, eaves, gutters, parapets, pool edge or furniture",
    "new shadows and reflected light must match original sun direction and outdoor context",
  ])}`;

  blocks.K = `[BLOCK K - UNDER-PERGOLA AREA RULES]
${bullets([
    "preserve existing outdoor furniture unless replacement/addition/declutter is explicitly selected",
    "if furniture is below the pergola, keep it in place and adapt only shadows/light interaction",
    "preserve paving geometry, pool edge, terrace parapet and garden boundaries",
    "do not create random luxury staging unless sparse furniture addition is selected",
    normalizedConfig.legacy_config.arredo.note || "",
  ])}`;

  blocks.L = `[BLOCK L - REMOVAL / CONVERSION RULES]
${bullets([
    ...normalizedConfig.replacement_manifest.removals,
    ...normalizedConfig.replacement_manifest.conversions,
    "if replacing an existing awning or pergola, remove old brackets, cassettes, arms, posts, rails and incompatible supports completely",
    "patch facade and floor contact points cleanly where old supports were removed",
    "do not leave hybrid old/new outdoor shading systems",
    "if recolor-only, do not alter geometry, cover type, footprint or post positions",
  ])}`;

  blocks.M = `[BLOCK M - PROPERTY INTEGRITY]
${bullets(normalizedConfig.integrity_constraints)}`;

  blocks.N = `[BLOCK N - PHOTOREALISM RULES]
${bullets([
    "realistic aluminum/wood/steel/glass/fabric/polycarbonate materials",
    "realistic shadows, contact occlusion and reflected light",
    "realistic scale and profile thickness",
    "believable installation details, brackets, foot plates, seals, tracks and drainage",
    "no warped geometry, no fake CGI showroom look, premium architectural outdoor visualization quality",
  ])}`;

  blocks.O = `[BLOCK O - NEGATIVE CONSTRAINTS]
${bullets(DEFAULT_NEGATIVE_CONSTRAINTS)}`;

  blocks.P = `[BLOCK P - QUALITY BAR]
${bullets([
    ...normalizedConfig.quality_directives,
    validation.isValid
      ? "validation passed: target map, installability envelope, manifest, drainage, realism and integrity constraints are explicit"
      : `validation warnings: missing sections ${validation.missingSections.join(", ") || "none"}; missing business rules ${validation.missingBusinessRules.join(", ") || "none"}`,
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
    blocks.O,
    blocks.P,
    normalizedConfig.notes ? `[ADDITIONAL USER NOTES]\n${normalizedConfig.notes}` : "",
  ].filter(Boolean).join("\n\n");

  return {
    systemPrompt: blocks.A,
    userPrompt,
    negativePrompt:
      "different property, redesigned house, moved windows, changed facade, changed paving, blocked door, floating posts, impossible span, generic canopy, fake tent, wrong cover system, no drainage, old awning remnants, hybrid old new pergola, invented pool, invented furniture, CGI, illustration, stylized image",
    promptVersion: "pergola-v1.0.0",
    blocks,
    validation,
    normalizedConfig,
  };
}
