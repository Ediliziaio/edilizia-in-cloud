import { ensureExteriorFloorRenderConfig } from "./exteriorFloorRenderConfig.ts";
import {
  bullets,
  DEFAULT_EXTERIOR_FLOOR_NEGATIVE_CONSTRAINTS,
} from "./promptFragments.ts";
import { validateExteriorFloorPromptConfig } from "./exteriorFloorValidation.ts";
import type { ExteriorFloorPromptBuildResult, ExteriorFloorRenderConfig } from "./types.ts";

function photoMetaLine(config: ExteriorFloorRenderConfig): string {
  const meta = config.photo_meta;
  if (!meta?.width || !meta.height) return "preserve original image dimensions, crop and outdoor perspective";
  const orientation = meta.orientation ?? (meta.width > meta.height ? "landscape" : meta.width < meta.height ? "portrait" : "square");
  return `preserve exact output dimensions ${meta.width}x${meta.height}, ${orientation} orientation`;
}

function describeManifest(config: ExteriorFloorRenderConfig): string {
  const manifest = config.replacement_manifest;
  return [
    `Operation: ${manifest.operation}`,
    `Additions:\n${bullets(manifest.additions.length ? manifest.additions : ["no additions unless explicitly selected"])}`,
    `Removals:\n${bullets(manifest.removals.length ? manifest.removals : ["remove only incompatible old surface traces required by operation"])}`,
    `Replacements:\n${bullets(manifest.replacements.length ? manifest.replacements : ["no full replacement unless selected"])}`,
    `Recolors/refinish:\n${bullets(manifest.recolors.length ? manifest.recolors : ["no recolor-only action unless selected"])}`,
    `Conversion / cleanup rules:\n${bullets(manifest.conversions)}`,
    `Preserve exactly:\n${bullets(manifest.preserveExactly)}`,
  ].join("\n");
}

export function buildExteriorFloorPrompt(
  rawConfig: Record<string, unknown>,
  rawAnalysis?: unknown,
  photoMeta?: ExteriorFloorRenderConfig["photo_meta"],
): ExteriorFloorPromptBuildResult {
  const normalizedConfig = ensureExteriorFloorRenderConfig(rawConfig, rawAnalysis, photoMeta ?? null);
  const validation = validateExteriorFloorPromptConfig(normalizedConfig);
  const scene = normalizedConfig.scene_analysis;
  const target = normalizedConfig.target_surface_map;
  const envelope = normalizedConfig.buildability_envelope;
  const spec = normalizedConfig.technical_specification;
  const legacy = normalizedConfig.legacy_config;
  const blocks: Record<string, string> = {};

  blocks.A = `[BLOCK A - MISSION]
You are a SURGICAL PHOTOREALISTIC EXTERIOR FLOORING / HARDSCAPE REPLACEMENT IMAGE EDITOR.
Replace, refinish or adapt exactly the selected exterior surface on the same photographed property.
Mandatory: same house / same outdoor area, same camera angle, same perspective, same facade and openings, same surrounding context, same landscape, same image dimensions, no artistic reinterpretation and no different-property generation.`;

  blocks.B = `[BLOCK B - EXISTING OUTDOOR SURFACE INVENTORY]
Outdoor area type: ${scene.outdoorAreaType}
Property type: ${scene.propertyType}
House/facade relation: ${scene.houseFacadeRelation}
Current surface: ${scene.currentSurface}
Surrounding lawn / gravel / deck / pool relation: ${scene.surroundingSurfaces}
Steps and levels: ${scene.stepsAndLevels}
Thresholds / house junctions: ${scene.thresholdsAndHouseJunctions}
Pool edge: ${scene.poolEdge}
Walls / parapets / fences: ${scene.wallsParapetsFences}
Circulation flows: ${scene.circulationFlows}
Outdoor furniture / objects: ${scene.outdoorFurniture}
Light and shadows: ${scene.lightAndShadows}
Current wear: ${scene.currentWear}
Apparent slope / levels: ${scene.apparentSlopeAndLevels}
Obstacles:
${bullets(scene.obstacles)}
Untouchable elements:
${bullets(scene.untouchableElements)}`;

  blocks.C = `[BLOCK C - TARGET SURFACE MAP]
Exact target surface: ${target.targetDescription}
Apparent perimeter: ${target.apparentPerimeter}
Front/back limits: ${target.frontBackLimits}
Left/right limits: ${target.leftRightLimits}
Thresholds:
${bullets(target.thresholds)}
Steps:
${bullets(target.steps)}
Pool edge if present:
${bullets(target.poolEdges)}
Occluded zones:
${bullets(target.occludedZones)}
Adjacent surfaces to preserve:
${bullets(target.adjacentSurfacesToPreserve)}
Crisp material transition lines:
${bullets(target.materialTransitionLines)}`;

  blocks.D = `[BLOCK D - BUILDABILITY AND DRAINAGE ENVELOPE]
Plausible final thickness: ${envelope.plausibleThickness}
Final level relation: ${envelope.finalLevelRelation}
Threshold compatibility: ${envelope.thresholdCompatibility}
Slope logic: ${envelope.slopeLogic}
Drainage / runoff logic: ${envelope.drainageLogic}
Pool compatibility: ${envelope.poolCompatibility}
Lawn / deck / facade compatibility: ${envelope.lawnDeckFacadeCompatibility}
Usage compatibility: ${envelope.usageCompatibility}
Forbidden placements:
${bullets(envelope.forbiddenPlacements)}`;

  blocks.E = `[BLOCK E - REPLACEMENT MANIFEST]
${describeManifest(normalizedConfig)}`;

  blocks.F = `[BLOCK F - EXTERIOR FLOOR SPECIFICATION]
Flooring type: ${spec.flooringType}
Material: ${spec.materialDescription}
Finish: ${spec.finishDescription}
Color: ${spec.colorDescription}
Format / scale: ${spec.formatDescription}
Pattern: ${spec.patternDescription}
Usage class: ${spec.usageDescription}
Outdoor realism cues:
${bullets(spec.outdoorRealismCues)}`;

  blocks.G = `[BLOCK G - JOINTS / GROUT / GAP RULES]
Joint type: ${legacy.giunto}
Joint behavior: ${spec.jointDescription}
Joint width: ${legacy.larghezza_giunto_mm ? `${legacy.larghezza_giunto_mm} mm` : "coherent with selected outdoor system"}
Joint color: ${legacy.colore_giunto || "coherent with material"}
Rules:
${bullets([
    spec.isDeck ? "deck requires visible board direction, open gaps and dark reveal lines for drainage" : "",
    spec.isLargeFormat ? "large slabs require sparse joint density, few long joints and broad uninterrupted fields" : "",
    spec.isContinuousLike ? "previous grid traces must disappear completely" : "",
    "all joints/gaps must follow perspective and not become random AI pattern noise",
  ])}`;

  blocks.H = `[BLOCK H - EDGE / BORDER / COPING RULES]
Border/coping type: ${legacy.bordo}
Border behavior: ${spec.borderDescription}
Rules:
${bullets([
    "edges must show plausible thickness and clean material termination",
    "transition to lawn, deck, gravel, facade, parapet or wall must be crisp and buildable",
    spec.isPoolside ? "pool coping must preserve pool basin geometry, waterline and adjacent non-target deck/lawn unless selected" : "",
    "no smudged AI transitions or fake paper-thin edge",
  ])}`;

  blocks.I = `[BLOCK I - STEPS / THRESHOLDS / LEVEL-CHANGE RULES]
Step type: ${legacy.gradino}
Step behavior: ${spec.stepDescription}
Rules:
${bullets([
    "threshold alignment must remain plausible and must not block doors or door-windows",
    "tread/riser continuity must be explicit when steps are targeted",
    "preserve non-target level changes and step geometry unless selected",
    "no impossible step geometry, warped risers or floating slabs",
  ])}`;

  blocks.J = `[BLOCK J - OUTDOOR SURFACE REALISM RULES]
${bullets(normalizedConfig.outdoor_realism_rules)}`;

  blocks.K = `[BLOCK K - FLOOR-OBJECT AND CONTEXT INTERACTION]
${bullets([
    "preserve furniture, pots, outdoor lights and non-target objects in place",
    "adapt only contact shadows and surface continuity under visible objects",
    "no floating furniture, duplicated legs, object deformation or object movement",
    "do not move the house, pool, pergola, garden structures, parapets or walls",
  ])}`;

  blocks.L = `[BLOCK L - REMOVAL / CONVERSION RULES]
${bullets([
    ...normalizedConfig.replacement_manifest.removals,
    ...normalizedConfig.replacement_manifest.conversions,
    "remove previous grout grid completely when replacing with deck or continuous exterior system",
    "if recolor-only, do not alter pattern, geometry, module size or border logic",
    "if steps are untouched, preserve them exactly",
    "do not leave hybrid old/new paving states",
  ])}`;

  blocks.M = `[BLOCK M - PROPERTY INTEGRITY]
${bullets(normalizedConfig.integrity_constraints)}
Image: ${photoMetaLine(normalizedConfig)}`;

  blocks.N = `[BLOCK N - PHOTOREALISM RULES]
${bullets([
    "realistic exterior materials, surface roughness and outdoor light response",
    "realistic shadows, contact occlusion, perimeter cuts and drainage impression",
    "correct scale relative to house, thresholds, pool, walls, furniture and garden",
    "no warped geometry, no fake CGI showroom look, premium architectural outdoor visualization quality",
  ])}`;

  blocks.O = `[BLOCK O - NEGATIVE CONSTRAINTS]
${bullets(DEFAULT_EXTERIOR_FLOOR_NEGATIVE_CONSTRAINTS)}`;

  blocks.P = `[BLOCK P - QUALITY BAR]
${bullets([
    ...normalizedConfig.quality_directives,
    validation.isValid
      ? "validation passed: target surface map, buildability/drainage envelope, manifest, joints, border/coping, steps/threshold and integrity rules are present"
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
    negativePrompt: DEFAULT_EXTERIOR_FLOOR_NEGATIVE_CONSTRAINTS.join(", "),
    promptVersion: "exterior-floor-v1.0.0",
    blocks,
    validation,
    normalizedConfig,
  };
}
