import { ensureGardenRenderConfig } from "./gardenRenderConfig.ts";
import {
  bullets,
  DEFAULT_GARDEN_NEGATIVE_CONSTRAINTS,
  FURNITURE_DESCRIPTIONS,
  LIGHTING_DESCRIPTIONS,
} from "./promptFragments.ts";
import { describeTargetZones } from "./gardenZoningRules.ts";
import { validateGardenPromptConfig } from "./gardenValidation.ts";
import type { GardenPromptBuildResult, GardenRenderConfig } from "./types.ts";

function photoMetaLine(config: GardenRenderConfig): string {
  const meta = config.photo_meta;
  if (!meta?.width || !meta.height) return "preserve original image dimensions, crop and outdoor perspective";
  const orientation = meta.orientation ?? (meta.width > meta.height ? "landscape" : meta.width < meta.height ? "portrait" : "square");
  return `preserve exact output dimensions ${meta.width}x${meta.height}, ${orientation} orientation`;
}

function describeManifest(config: GardenRenderConfig): string {
  const manifest = config.replacement_manifest;
  return [
    `Interventions: ${manifest.interventions.join(", ")}`,
    `Additions:\n${bullets(manifest.additions.length ? manifest.additions : ["no additions unless explicitly selected"])}`,
    `Removals:\n${bullets(manifest.removals.length ? manifest.removals : ["remove only selected clutter or incompatible weak garden elements"])}`,
    `Replacements:\n${bullets(manifest.replacements.length ? manifest.replacements : ["no replacement unless selected"])}`,
    `Refreshes:\n${bullets(manifest.refreshes.length ? manifest.refreshes : ["no refresh-only work unless selected"])}`,
    `Planting rules:\n${bullets(manifest.plantingRules)}`,
    `Conversion rules:\n${bullets(manifest.conversionRules)}`,
    `Preserve geometry:\n${bullets(manifest.preserveGeometry)}`,
    `Preserve exactly:\n${bullets(manifest.preserveExactly)}`,
  ].join("\n");
}

export function buildGardenPrompt(
  rawConfig: Record<string, unknown>,
  rawAnalysis?: unknown,
  photoMeta?: GardenRenderConfig["photo_meta"],
): GardenPromptBuildResult {
  const normalizedConfig = ensureGardenRenderConfig(rawConfig, rawAnalysis, photoMeta ?? null);
  const validation = validateGardenPromptConfig(normalizedConfig);
  const scene = normalizedConfig.scene_analysis;
  const target = normalizedConfig.target_zones_map;
  const envelope = normalizedConfig.planting_envelope;
  const style = normalizedConfig.style_specification;
  const legacy = normalizedConfig.legacy_config;
  const bedsActive = legacy.aiuole.attivo || legacy.interventi.includes("aggiunta_aiuole");
  const hedgesActive = legacy.siepi.attivo || legacy.interventi.includes("aggiunta_siepi");
  const treesActive = legacy.alberi.attivo || legacy.interventi.includes("aggiunta_alberi");
  const pathsActive = legacy.camminamenti.attivo || legacy.interventi.includes("aggiunta_camminamenti");
  const blocks: Record<string, string> = {};

  blocks.A = `[BLOCK A - MISSION]
You are a SURGICAL PHOTOREALISTIC GARDEN REDESIGN IMAGE EDITOR.
Apply exactly the selected softscape / hardscape / garden cleanup interventions on the same photographed property.
Mandatory: same house, same garden / outdoor space, same camera angle, same perspective, same context, same hardscape unless targeted, same architectural shell, same image dimensions, no artistic reinterpretation and no different-property generation.`;

  blocks.B = `[BLOCK B - EXISTING GARDEN INVENTORY]
Outdoor space type: ${scene.outdoorSpaceType}
Apparent size: ${scene.apparentSize}
House relation: ${scene.houseRelation}
Existing lawn: ${scene.existingLawn}
Bare soil / mineral surfaces: ${scene.bareSoilOrMineralSurfaces}
Patio / deck / hardscape: ${scene.patioDeckHardscape}
Pool: ${scene.pool}
Pergola: ${scene.pergola}
Fences / walls / borders: ${scene.fencesWallsBorders}
Existing trees: ${scene.existingTrees}
Existing shrubs / hedges / beds: ${scene.existingShrubsHedgesBeds}
Existing paths: ${scene.existingPaths}
Outdoor furniture: ${scene.outdoorFurniture}
Light and shadows: ${scene.lightAndShadows}
Circulation flows: ${scene.circulationFlows}
Main view corridors: ${scene.mainViewCorridors}
Empty / weak zones:
${bullets(scene.emptyZones)}
Untouchable elements:
${bullets(scene.untouchableElements)}`;

  blocks.C = `[BLOCK C - TARGET ZONES MAP]
Target zones: ${describeTargetZones(target)}
Main lawn zone: ${target.mainLawnZone}
Perimeter zones:
${bullets(target.perimeterZones)}
House-border zones:
${bullets(target.houseBorderZones)}
Poolside green zones:
${bullets(target.poolsideZones)}
Path zones:
${bullets(target.pathZones)}
Relax zones:
${bullets(target.relaxZones)}
Untouched zones:
${bullets(target.untouchedZones)}
No-plant / no-block zones:
${bullets(target.noPlantNoBlockZones)}
View corridors to preserve:
${bullets(target.viewCorridorsToPreserve)}
Breathing-space zones:
${bullets(target.breathingSpaceZones)}`;

  blocks.D = `[BLOCK D - PLANTING ENVELOPE]
Plausible planting heights: ${envelope.plausiblePlantHeights}
Bed width / depth: ${envelope.bedWidthAndDepth}
Density: ${envelope.plantingDensity}
Facade clearance: ${envelope.facadeClearance}
Path / door clearance: ${envelope.pathAndDoorClearance}
Pool / pergola relation: ${envelope.poolPergolaRelation}
Tree scale rules: ${envelope.treeScaleRules}
Hedge scale rules: ${envelope.hedgeScaleRules}
Maintenance logic: ${envelope.maintenanceLogic}
Forbidden planting:
${bullets(envelope.forbiddenPlanting)}
${envelope.warnings.length ? `Warnings:\n${bullets(envelope.warnings)}` : "Warnings: none."}`;

  blocks.E = `[BLOCK E - REPLACEMENT MANIFEST]
${describeManifest(normalizedConfig)}`;

  blocks.F = `[BLOCK F - GARDEN STYLE SPECIFICATION]
Target style: ${style.style}
Visual language: ${style.visualLanguage}
Plant palette direction: ${style.plantPaletteDirection}
Border treatment: ${style.borderTreatment}
Density: ${style.density}
Maintenance intention: ${style.maintenanceIntent}
The mood must support the selected style without changing the property identity.`;

  blocks.G = `[BLOCK G - LAWN / BEDS / HEDGES / TREES RULES]
Lawn active: ${legacy.prato.attivo || legacy.interventi.includes("rifacimento_prato") || legacy.interventi.includes("restyling_completo")}
Beds active: ${bedsActive}
Hedges active: ${hedgesActive}
Trees active: ${treesActive}
Rules:
${bullets([
    legacy.prato.attivo ? "lawn must be continuous, perspective-correct and realistic, never a fake carpet unless synthetic premium is selected" : "do not change lawn unless targeted",
    bedsActive ? "beds must have clean edge clarity, plausible depth, layered vegetation and realistic mature spacing" : "do not add planting beds unless targeted",
    hedgesActive ? "hedges must show plant texture, correct screening logic and clearances, not a flat artificial wall" : "do not add hedges unless targeted",
    treesActive ? "trees must have credible scale, trunk contact, canopy shadow and no conflict with house, fence, pool or pergola" : "do not add trees unless targeted",
    "vegetation must be layered naturally and must not look like a random nursery-catalog collage",
  ])}`;

  blocks.H = `[BLOCK H - PATHS / GROUND COVER / EDGING RULES]
Path active: ${pathsActive}
Ground cover active: ${legacy.ground_cover.attivo}
Rules:
${bullets([
    pathsActive ? "new path must connect logical access points, with usable width, no random curvature and clean integration with lawn/beds/patio" : "do not invent new paths",
    legacy.ground_cover.attivo ? "ground cover must stay in selected support/bed zones with clean borders and realistic material scale" : "do not add gravel, bark, lapillo, stabilized gravel or ground-cover plants unless selected",
    "edges between lawn, beds, paths, gravel, patio, pool coping and facade must be crisp and buildable",
  ])}`;

  blocks.I = `[BLOCK I - FURNITURE / LIGHTING / RELAX AREA RULES]
Furniture mode: ${FURNITURE_DESCRIPTIONS[legacy.arredo.modalita]}
Lighting: ${LIGHTING_DESCRIPTIONS[legacy.illuminazione]}
Rules:
${bullets([
    "keep existing outdoor furniture unless replacement/addition is selected",
    "add sparse coherent furniture only if requested and only in the selected relax zone",
    "lighting must be physically placed and subtle, with realistic glow and no fantasy effects",
    "preserve functional use, circulation and access paths",
  ])}`;

  blocks.J = `[BLOCK J - CLEANUP / DECLUTTER RULES]
${bullets([
    legacy.declutter || legacy.interventi.includes("declutter") ? "remove only selected clutter, dead plant debris, weak scattered objects or messy non-functional items" : "do not perform declutter unless selected",
    "preserve the garden's usable identity and important functional elements",
    "do not create an empty sterile space",
    "do not delete important non-target structures, furniture, pool, pergola, paths or significant trees",
  ])}`;

  blocks.K = `[BLOCK K - PROPERTY INTEGRITY]
${bullets(normalizedConfig.integrity_constraints)}
Image: ${photoMetaLine(normalizedConfig)}`;

  blocks.L = `[BLOCK L - PHOTOREALISM RULES]
${bullets(normalizedConfig.realism_rules)}
${bullets([
    "realistic plant scale, shadows, foliage density and lawn texture",
    "realistic outdoor light behavior and contact shadows",
    "believable material/weathering in paths, gravel, mulch and hardscape",
    "no warped geometry, no fake CGI landscape look, premium residential landscape visualization quality",
  ])}`;

  blocks.M = `[BLOCK M - NEGATIVE CONSTRAINTS]
${bullets(DEFAULT_GARDEN_NEGATIVE_CONSTRAINTS)}`;

  blocks.N = `[BLOCK N - QUALITY BAR]
${bullets([
    ...normalizedConfig.quality_directives,
    validation.isValid
      ? "validation passed: target zones map, planting envelope, manifest, style, planting/path rules and integrity constraints are explicit"
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
    negativePrompt: DEFAULT_GARDEN_NEGATIVE_CONSTRAINTS.join(", "),
    promptVersion: "garden-v1.0.0",
    blocks,
    validation,
    normalizedConfig,
  };
}
