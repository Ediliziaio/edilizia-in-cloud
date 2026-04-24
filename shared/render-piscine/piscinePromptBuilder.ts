import { DEFAULT_NEGATIVE_CONSTRAINTS } from "./promptFragments.ts";
import { ensurePiscineRenderConfig } from "./piscineRenderConfig.ts";
import { validatePiscinePromptConfig } from "./piscineValidation.ts";
import type { PiscinaPromptBuildResult, PiscinaRenderConfig } from "./types.ts";

function bullets(lines: Array<string | null | undefined>): string {
  return lines
    .filter((line): line is string => Boolean(line && line.trim()))
    .map((line) => `- ${line}`)
    .join("\n");
}

function describeManifest(config: PiscinaRenderConfig): string {
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

export function buildPiscinePrompt(
  rawConfig: Record<string, unknown>,
  rawAnalysis?: unknown,
  photoMeta?: PiscinaRenderConfig["photo_meta"],
): PiscinaPromptBuildResult {
  const normalizedConfig = ensurePiscineRenderConfig(rawConfig, rawAnalysis, photoMeta ?? null);
  const validation = validatePiscinePromptConfig(normalizedConfig);
  const scene = normalizedConfig.scene_analysis;
  const target = normalizedConfig.target_pool_insertion_map;
  const envelope = normalizedConfig.buildability_envelope;
  const technical = normalizedConfig.technical_specification;
  const blocks: Record<string, string> = {};
  const operation = normalizedConfig.replacement_manifest.operation;
  const strictSurfaceOnly = operation === "change_coping_only" || operation === "recolor_waterlook_or_liner_only";
  const removePool = operation === "remove_existing_pool";
  const accessLine = strictSurfaceOnly
    ? "Preserve existing access features exactly; do not add or modify ladders, steps, beach shelf or lounge shelf."
    : removePool
      ? "Remove pool access features with the pool and restore the ground/hardscape coherently."
      : technical.accessDescription;
  const accessoriesLine = strictSurfaceOnly || removePool
    ? ["no extra water features, spa, shower, cover, lighting or resort furniture in this operation scope"]
    : technical.accessoryDescriptions.length
      ? technical.accessoryDescriptions
      : ["no extra water features, spa, shower or cover unless explicitly selected"];
  const lightingLine = strictSurfaceOnly
    ? "Preserve existing lighting exactly; do not add pool lights in this operation scope."
    : technical.lightingDescription;

  blocks.A = `[BLOCK A - MISSION]
You are a SURGICAL PHOTOREALISTIC POOL INSERTION / REPLACEMENT IMAGE EDITOR.
Add, replace, remove or refine exactly the requested swimming pool system on the same photographed property.
Mandatory: same house, same garden / patio / outdoor space, same camera angle, same perspective, same surrounding structures, same openings, same context, same image dimensions, no artistic reinterpretation and no different-property generation.`;

  blocks.B = `[BLOCK B - EXISTING OUTDOOR SCENE INVENTORY]
Outdoor area type: ${scene.outdoorAreaType}
Property type: ${scene.propertyType}
House/facade: ${scene.houseAndFacade}
Existing lawn / hardscape: ${scene.existingLawnAndHardscape}
Topography / levels: ${scene.topographyAndLevels}
Existing pool / water: ${scene.existingPoolOrWater}
Outdoor furniture: ${scene.outdoorFurniture}
Boundaries / walls: ${scene.boundariesAndWalls}
Vegetation / trees: ${scene.vegetationAndTrees}
Paths / circulation: ${scene.pathsAndCirculation}
Light and shadows: ${scene.lightAndShadows}
Available insertion space: ${scene.availableInsertionSpace}
Obstacles:
${bullets(scene.obstacles)}
Untouchable elements:
${bullets(scene.untouchableElements)}`;

  blocks.C = `[BLOCK C - TARGET POOL INSERTION MAP]
Insertion zone: ${target.zone}
Target description: ${target.targetDescription}
Pool footprint: ${target.footprint}
Orientation: ${target.orientation}
Left/right limits: ${target.leftRightLimits}
Front/back limits: ${target.frontBackLimits}
Main view axis: ${target.mainViewAxis}
Circulation margins:
${bullets(target.circulationMargins)}
Preserved adjacent areas:
${bullets(target.preservedAdjacentAreas)}
No-excavation / no-occupy zones:
${bullets(target.noExcavationZones)}`;

  blocks.D = `[BLOCK D - BUILDABILITY ENVELOPE]
Plausible size: ${envelope.plausibleSize}
Plausible depth: ${envelope.plausibleDepth}
Coping thickness: ${envelope.copingThickness}
Deck / perimeter margins: ${envelope.deckMargins}
Ground-plane relation: ${envelope.groundPlaneRelation}
House/path relation: ${envelope.houseAndPathRelation}
Infinity feasibility: ${envelope.infinityFeasibility}
Rooftop feasibility: ${envelope.rooftopFeasibility}
Forbidden placements:
${bullets(envelope.forbiddenPlacements)}`;

  blocks.E = `[BLOCK E - REPLACEMENT MANIFEST]
${describeManifest(normalizedConfig)}`;

  blocks.F = `[BLOCK F - POOL GEOMETRY SPECIFICATION]
Pool typology: ${technical.poolTypology}
Geometry: ${technical.poolGeometry}
Installation type: ${technical.installationType}
Scale rule: the pool must look proportionate to the photographed outdoor space, with readable basin walls/floor and no pasted-on footprint.`;

  blocks.G = `[BLOCK G - WATER SYSTEM SPECIFICATION]
Water system: ${technical.waterSystem}
Rules: ${technical.waterSystemDescription}
No hybrid ambiguity: skimmer, overflow and infinity-edge behavior must not be mixed unless explicitly selected.`;

  blocks.H = `[BLOCK H - INTERIOR FINISH AND WATER LOOK]
Interior finish: ${technical.interiorFinish}
Finish behavior: ${technical.interiorFinishDescription}
Water look: ${technical.waterLookDescription}
Water must not be a flat blue fill; it must respond to finish, depth, sky, facade, vegetation, shadows and camera angle.`;

  blocks.I = `[BLOCK I - ACCESS AND COMFORT FEATURES]
Access system: ${accessLine}
Accessories:
${bullets(accessoriesLine)}
Lighting: ${lightingLine}
If not selected, do not invent ladders, stairs, beach entry, jets, waterfalls, covers or resort furniture.`;

  blocks.J = `[BLOCK J - COPING AND SURROUNDING DECK RULES]
Coping: ${technical.copingDescription}
Surrounding area: ${technical.deckDescription}
Rules:
${bullets([
    "coping must be visible with plausible thickness and clean continuous perimeter",
    "deck/lawn/patio transitions must have crisp material junctions, not AI-smudged edges",
    "cut lines, joints, slab/plank direction and grass cuts must follow perspective",
    "surrounding deck/paving must not randomly expand into non-target garden areas",
  ])}`;

  blocks.K = `[BLOCK K - WATER REALISM RULES]
${bullets(normalizedConfig.water_realism_rules)}`;

  blocks.L = `[BLOCK L - INSTALLATION AND LANDSCAPE INTEGRATION RULES]
${bullets([
    envelope.groundPlaneRelation,
    envelope.houseAndPathRelation,
    "no floating shell, no impossible excavation lines, no pool crossing non-target structures",
    "preserve trees and non-target landscape; adapt only pool footprint and immediate junctions",
    "poolside shadows, contact occlusion and water reflections must match original sun direction",
  ])}`;

  blocks.M = `[BLOCK M - REMOVAL / CONVERSION RULES]
${bullets([
    ...normalizedConfig.replacement_manifest.removals,
    ...normalizedConfig.replacement_manifest.conversions,
    "if replacing an existing pool, remove old water plane, coping, deck scars, ladders, skimmers and incompatible details completely",
    "if recolor-only, do not alter pool geometry, footprint, coping or surrounding deck",
    "if changing coping only, do not alter basin geometry or water-system behavior",
    "do not leave hybrid old/new pool states",
  ])}`;

  blocks.N = `[BLOCK N - PROPERTY INTEGRITY]
${bullets(normalizedConfig.integrity_constraints)}`;

  blocks.O = `[BLOCK O - PHOTOREALISM RULES]
${bullets([
    "realistic pool materials, coping, deck, lawn and hardscape junctions",
    "realistic water behavior, reflections, transparency, depth gradient and shadowing",
    "realistic scale relative to house, paths, furniture and vegetation",
    "no warped geometry, no fake CGI resort look, premium residential architectural outdoor visualization quality",
  ])}`;

  blocks.P = `[BLOCK P - NEGATIVE CONSTRAINTS]
${bullets(DEFAULT_NEGATIVE_CONSTRAINTS)}`;

  blocks.Q = `[BLOCK Q - QUALITY BAR]
${bullets([
    ...normalizedConfig.quality_directives,
    validation.isValid
      ? "validation passed: target map, buildability envelope, manifest, water system, water realism and integrity constraints are explicit"
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
    blocks.Q,
    normalizedConfig.notes ? `[ADDITIONAL USER NOTES]\n${normalizedConfig.notes}` : "",
  ].filter(Boolean).join("\n\n");

  return {
    systemPrompt: blocks.A,
    userPrompt,
    negativePrompt:
      "different property, redesigned house, moved windows, changed facade, altered garden outside target, floating pool, pasted blue rectangle, fake neon water, impossible infinity edge, old pool remnants, hybrid old new pool, random resort furniture, CGI, illustration, stylized image",
    promptVersion: "pool-v1.0.0",
    blocks,
    validation,
    normalizedConfig,
  };
}
