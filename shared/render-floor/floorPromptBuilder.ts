import {
  DEFAULT_NEGATIVE_CONSTRAINTS,
  FINISH_DESCRIPTIONS,
} from "./promptFragments.ts";
import { ensureFloorRenderConfig } from "./floorRenderConfig.ts";
import { validateFloorPromptConfig } from "./floorPromptValidation.ts";
import type { FloorPromptBuildResult, FloorRenderConfig } from "./types.ts";

function bullets(lines: Array<string | null | undefined>): string {
  return lines
    .filter((line): line is string => Boolean(line && line.trim().length > 0))
    .map((line) => `- ${line}`)
    .join("\n");
}

function photoMetaLine(config: FloorRenderConfig): string {
  const meta = config.photo_meta;
  if (!meta?.width || !meta.height) return "preserve original image dimensions and orientation";
  const orientation = meta.orientation ?? (meta.width > meta.height ? "landscape" : meta.width < meta.height ? "portrait" : "square");
  return `preserve exact output dimensions ${meta.width}x${meta.height}, ${orientation} orientation`;
}

export function buildFloorPrompt(
  rawConfig?: unknown,
  rawAnalysis?: unknown,
  photoMeta?: FloorRenderConfig["photo_meta"],
): FloorPromptBuildResult {
  const normalizedConfig = ensureFloorRenderConfig(rawConfig, rawAnalysis, photoMeta ?? null);
  const validation = validateFloorPromptConfig(normalizedConfig);
  const { scene_analysis: scene, coverage_map: coverage, replacement_manifest: manifest, technical_specification: spec } = normalizedConfig;
  const legacy = normalizedConfig.legacy_config;

  const blocks: Record<string, string> = {};

  blocks.A = `[BLOCK A - MISSION]
You are a SURGICAL PHOTOREALISTIC FLOOR REPLACEMENT IMAGE EDITOR.
Replace exactly the visible floor in the photographed room and preserve everything else.
Mandatory constraints: same room, same camera angle, same geometry, same walls, same furniture, same openings, same lighting, same image dimensions, no artistic reinterpretation.`;

  blocks.B = `[BLOCK B - EXISTING ROOM INVENTORY]
Room: ${scene.roomType}
Estimated size: ${scene.estimatedSize}
Camera / perspective: ${scene.cameraPerspective}
Visible floor: ${scene.visibleFloorArea}
Current floor: ${scene.currentFloor.material}, ${scene.currentFloor.color}, format ${scene.currentFloor.format}, joints ${scene.currentFloor.hasVisibleJoints ? "visible" : "not obvious"}, condition ${scene.currentFloor.condition}
Skirting/baseboard: ${scene.skirting.present ? `present, ${scene.skirting.material}, ${scene.skirting.color}, ${scene.skirting.height}` : "not clearly present"}
Objects on floor: ${scene.obstacles.join(", ")}
Rugs present: ${scene.rugsPresent ? "yes" : "no"}
Thresholds: ${scene.doorsAndThresholds}
Steps/raised areas: ${scene.stepsOrRaisedAreas}
Lighting/reflections: ${scene.lighting.quality}; ${scene.lighting.direction}; ${scene.lighting.reflections}
Preserve anchors: ${scene.untouchedElements.join(", ")}
Notes: ${scene.analysisNotes}`;

  blocks.C = `[BLOCK C - FLOOR COVERAGE MAP]
Main visible area: ${coverage.mainVisibleArea}
Perimeter boundaries:
${bullets(coverage.perimeterBoundaries)}
Thresholds/transitions:
${bullets(coverage.thresholds.length ? coverage.thresholds : ["no active threshold transformation unless visible in the photo"])}
Raised areas:
${bullets(coverage.raisedAreas.length ? coverage.raisedAreas : ["no raised area transformation unless visible in the photo"])}
Covered/occluded zones:
${bullets(coverage.coveredOrOccludedZones)}
Crisp edges:
${bullets(coverage.crispEdges)}`;

  blocks.D = `[BLOCK D - REPLACEMENT MANIFEST]
Replacements:
${bullets(manifest.replacements)}
Removals / cleanup:
${bullets(manifest.removals)}
Additions / continuity:
${bullets(manifest.additions)}
Preservation:
${bullets(manifest.preservation)}`;

  blocks.E = `[BLOCK E - NEW FLOOR SPECIFICATION]
Material category: ${legacy.tipo}
Material behavior: ${spec.materialDescription}
Visual effect: ${legacy.effetto_visivo ?? spec.visualEffect}
Finish: ${FINISH_DESCRIPTIONS[legacy.finitura]}
Color: ${spec.colorDescription}
${spec.woodEssenceDescription ? `Wood essence: ${spec.woodEssenceDescription}` : ""}
Tone variation: ${spec.toneVariationRule}
Format / module size: ${spec.formatRule}
Edge / bevel: ${spec.bevelRule}
Surface realism: ${spec.realismRule || "material must remain physically credible"}
Seamless material: ${spec.isSeamless ? "yes" : "no"}`;

  blocks.F = `[BLOCK F - LAYING PATTERN GEOMETRY]
${bullets(manifest.patternRules)}
Pattern must be readable in the final render: if a large slab, show few large modules; if herringbone, show true herringbone; if Hungarian point, show true chevron-cut ends.`;

  blocks.G = `[BLOCK G - JOINTS / GROUT / SEAMS RULES]
${bullets(manifest.jointRules)}`;

  blocks.H = `[BLOCK H - SKIRTING / PERIMETER RULES]
${bullets(manifest.skirtingRules)}`;

  blocks.I = `[BLOCK I - FLOOR-OBJECT INTERACTION]
${bullets(manifest.objectInteractionRules)}`;

  blocks.J = `[BLOCK J - SURFACE REALISM RULES]
${bullets([
    "parquet must show believable grain, board identity, scale and tone variation",
    "laminate and LVT must look more controlled/repetitive than real wood, never like random natural parquet",
    "porcelain/ceramic must show ceramic edge behavior and grout logic when configured",
    "large-format slabs must keep sparse joint density and plausible perimeter cuts",
    "marble must show natural veining, polished depth and non-repeating slab/tile variation",
    "stone must show mineral micro-irregularity and natural tones",
    "resin/microcement must be continuous with subtle trowel movement and no old floor ghosts",
    "cotto must show warm handmade irregularity, not perfect flat ceramic",
    "carpet must be continuous textile pile with soft light absorption and no modules",
  ])}`;

  blocks.K = `[BLOCK K - PRESERVATION CONSTRAINTS]
${bullets(normalizedConfig.integrity_constraints)}
Image: ${photoMetaLine(normalizedConfig)}`;

  blocks.L = `[BLOCK L - NEGATIVE CONSTRAINTS]
${bullets(DEFAULT_NEGATIVE_CONSTRAINTS)}`;

  blocks.M = `[BLOCK M - QUALITY BAR]
${bullets([
    ...normalizedConfig.quality_directives,
    validation.isValid
      ? "Prompt validation passed: coverage map, manifest, pattern rules, seam rules, skirting rules and integrity constraints are present."
      : `Prompt validation warnings: missing sections = ${validation.missingSections.join(", ") || "none"}; missing business rules = ${validation.missingBusinessRules.join(", ") || "none"}.`,
    "final result must look like a real photograph of the same room after professional floor installation",
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
    normalizedConfig.notes ? `[ADDITIONAL USER NOTES]\n${normalizedConfig.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    systemPrompt: blocks.A,
    userPrompt,
    negativePrompt:
      "room redesign, changed walls, changed furniture, moved objects, changed doors, changed windows, distorted perspective, random pattern, fake floor grid, old floor visible, ghost grout, CGI, cartoon, painterly, showroom staging, wrong image dimensions",
    promptVersion: "2.0.0",
    blocks,
    normalizedConfig,
    validation,
  };
}
