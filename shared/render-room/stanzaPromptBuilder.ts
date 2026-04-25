import { buildRoomRenderConfig } from "./roomRenderConfig.ts";
import { ROOM_STYLE_GUIDE, ROOM_TYPE_LABELS } from "./promptFragments.ts";
import { validateRoomPromptConfig } from "./roomPromptValidation.ts";
import type { RoomPhotoMeta, RoomPromptBuildResult, RoomRenderConfig } from "./types.ts";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function bullets(lines: Array<string | null | undefined>): string {
  return lines
    .filter((line): line is string => Boolean(line && line.trim()))
    .map((line) => `- ${line}`)
    .join("\n");
}

function photoMetaLine(config: RoomRenderConfig): string {
  const meta = config.photo_meta;
  if (!meta?.width || !meta.height) return "preserve the original image dimensions, crop and orientation";
  const orientation = meta.orientation ?? (meta.width > meta.height ? "landscape" : meta.width < meta.height ? "portrait" : "square");
  return `preserve exact output dimensions ${meta.width}x${meta.height}, ${orientation} orientation, no crop`;
}

function interventionBullets(config: RoomRenderConfig): string {
  return config.replacement_manifest.activeInterventions
    .map((item) => [
      `### ${item.label}`,
      `Specification: ${item.specification}`,
      "Replacement rules:",
      bullets(item.replacementRules),
      "Preservation rules:",
      bullets(item.preservationRules),
    ].join("\n"))
    .join("\n\n");
}

function interventionsByKey(config: RoomRenderConfig, keys: string[]): string {
  const selected = config.replacement_manifest.activeInterventions.filter((item) => keys.includes(item.key));
  return selected.length ? interventionBullets({ ...config, replacement_manifest: { ...config.replacement_manifest, activeInterventions: selected } }) : "No intervention active for this system; preserve it exactly.";
}

function targetZoneLines(config: RoomRenderConfig): string[] {
  const map = config.target_zones_map;
  return [
    `main wall: ${map.mainWall}`,
    `accent wall: ${map.accentWall}`,
    `secondary walls: ${map.secondaryWalls}`,
    `floor: ${map.floor}`,
    `ceiling: ${map.ceiling}`,
    `window treatment zones: ${map.windowTreatmentZones}`,
    `furniture groups: ${map.furnitureGroups}`,
    `kitchen block: ${map.kitchenBlock}`,
    `strict preservation areas: ${map.strictPreservationAreas.join(", ")}`,
  ];
}

export function buildRoomPrompt(
  rawConfig?: unknown,
  rawAnalysis?: unknown,
  photoMeta?: RoomPhotoMeta | null,
): RoomPromptBuildResult {
  const normalizedConfig = buildRoomRenderConfig(rawConfig, rawAnalysis, photoMeta ?? null);
  const validation = validateRoomPromptConfig(normalizedConfig);
  const legacy = asRecord(rawConfig);
  const roomKey = String(legacy.tipo_stanza ?? "altro");
  const roomLabel = ROOM_TYPE_LABELS[roomKey] ?? "interior room";
  const styleKey = String(legacy.stile_target ?? "moderno");
  const styleGuide = ROOM_STYLE_GUIDE[styleKey] ?? ROOM_STYLE_GUIDE.moderno;
  const blocks: Record<string, string> = {};

  blocks.A = `[BLOCK A - MISSION]
You are a SURGICAL PHOTOREALISTIC INTERIOR RENOVATION IMAGE EDITOR.
Transform exactly the selected finishes, lights, furniture and details in the uploaded ${roomLabel} while preserving the same photographed room.
Mandatory constraints: same room, same architecture, same camera angle, same perspective, same lighting direction, same image dimensions, no generic AI reinterpretation.`;

  blocks.B = `[BLOCK B - EXISTING ROOM INVENTORY]
Room type: ${normalizedConfig.scene_analysis.roomType}
Perceived layout: ${normalizedConfig.scene_analysis.perceivedLayout}
Camera / perspective: ${normalizedConfig.scene_analysis.cameraPerspective}
Lighting: ${normalizedConfig.scene_analysis.lighting}
Visible surfaces: ${normalizedConfig.scene_analysis.visibleSurfaces.join(", ")}
Fixed architecture: ${normalizedConfig.scene_analysis.fixedArchitecture.join(", ")}
Movable objects: ${normalizedConfig.scene_analysis.movableObjects.join(", ")}
Windows / doors: ${normalizedConfig.scene_analysis.windowsAndDoors}
Kitchen anchors: ${normalizedConfig.scene_analysis.kitchenElements.length ? normalizedConfig.scene_analysis.kitchenElements.join(", ") : "not a kitchen-specific intervention unless selected"}
Functional anchors to preserve: ${normalizedConfig.scene_analysis.functionalAnchors.join(", ")}
Current floor logic: ${normalizedConfig.scene_analysis.floorDescription}
Current wall logic: ${normalizedConfig.scene_analysis.wallDescription}
Current ceiling logic: ${normalizedConfig.scene_analysis.ceilingDescription}
Scene constraints: ${normalizedConfig.scene_analysis.constraints.join(", ")}`;

  blocks.C = `[BLOCK C - TARGET STYLE AND INTERVENTION TYPE]
Target style: ${styleKey.replace(/_/g, " ")}
Style direction: ${styleGuide}
Intervention type: ${normalizedConfig.replacement_manifest.interventionType}
Important: even with a strong redesign level, preserve the photographed architectural shell, camera angle, proportions and non-target elements.`;

  blocks.D = `[BLOCK D - TARGET ZONES MAP]
${bullets(targetZoneLines(normalizedConfig))}`;

  blocks.E = `[BLOCK E - REPLACEMENT MANIFEST]
Active interventions:
${interventionBullets(normalizedConfig)}

Explicit removals / cleanup:
${bullets(normalizedConfig.replacement_manifest.removals.length ? normalizedConfig.replacement_manifest.removals : ["remove only elements made incompatible by selected interventions"])}

Strict preservation:
${bullets(normalizedConfig.replacement_manifest.strictPreservation)}`;

  blocks.F = `[BLOCK F - WALL / WALLPAPER / CLADDING RULES]
${interventionsByKey(normalizedConfig, ["wall_paint", "wallpaper", "wall_cladding"])}

Mandatory wall-plane behavior:
${bullets([
    "Apply paint, wallpaper or cladding only to the selected wall planes in the target map.",
    "No spillover onto ceiling, floor, windows, doors, trims, baseboards, switches, outlets or furniture.",
    "Accent wall means one single wall plane only; all other wall planes remain untouched.",
    "Wallpaper scale, cladding seams and paint edges must follow the photographed perspective and corners.",
  ])}`;

  blocks.G = `[BLOCK G - FLOOR RULES]
${normalizedConfig.replacement_manifest.floorPromptExcerpt || "No floor replacement is active; preserve the photographed floor exactly."}

Global geometry rules:
${bullets(normalizedConfig.replacement_manifest.geometryRules)}`;

  blocks.H = `[BLOCK H - FURNITURE RULES]
${interventionsByKey(normalizedConfig, ["furniture"])}

Furniture behavior lock:
${bullets([
    "Color-only mode changes only surface finish/material appearance; geometry, size, number of pieces and position stay identical.",
    "Style-refresh mode preserves footprint, circulation and main object positions while updating visual language.",
    "Full replacement still must respect the same room function, scale, photographed architecture and plausible circulation.",
    "No random luxury staging unrelated to the source room.",
  ])}`;

  blocks.I = `[BLOCK I - CEILING AND LIGHTING RULES]
${interventionsByKey(normalizedConfig, ["ceiling", "lighting"])}

Lighting / ceiling behavior:
${bullets([
    "new lights must have plausible mounting positions and physically believable falloff",
    "do not invent unrelated chandeliers, pendant clusters or decorative fixtures outside the selected lighting type",
    "ceiling interventions must keep room height, wall junctions and planes physically plausible",
    "light spill, shadows and reflections must remain coherent with the original photo",
  ])}`;

  blocks.J = `[BLOCK J - CURTAINS / WINDOWS RULES]
${interventionsByKey(normalizedConfig, ["curtains"])}

Window behavior:
${bullets([
    "Preserve windows, glazing, frames and exterior view unless curtains/window treatment is explicitly active.",
    "If curtains are removed, remove rods/rails/brackets and restore the reveal/wall area cleanly.",
    "If curtains are installed, fabric folds, gravity, fullness and scale must be realistic.",
  ])}`;

  blocks.K = `[BLOCK K - KITCHEN RULES]
${interventionsByKey(normalizedConfig, ["kitchen_restyling"])}

Kitchen behavior:
${bullets([
    "If kitchen restyling is inactive, preserve all kitchen elements exactly.",
    "If active, preserve cabinet layout, module rhythm, sink, hob, hood, appliance positions and technical clearances unless explicitly changed.",
    "Preserve exactly one refrigerator when one refrigerator is visible; do not duplicate fridges, ovens, sinks, hobs or columns.",
    "Keep appliance count realistic for a normal residential kitchen: no second fridge or extra appliance tower unless explicitly requested and visible space supports it.",
    "Do not move the refrigerator, sink, hob, oven, hood or tall cabinet anchors unless the user explicitly asks for a layout change.",
    "Update only the selected fronts, countertop, handles and finish systems.",
  ])}`;

  blocks.L = `[BLOCK L - SPACE PLANNING / DECLUTTER RULES]
${interventionsByKey(normalizedConfig, ["space_details"])}

Space behavior:
${bullets([
    "Declutter removes only loose visual clutter and redundant small items, never functional anchors or main furniture.",
    "Any added decor must be sparse, realistic, physically placed and coherent with the target style.",
    "Do not empty the room unnaturally and do not change architecture to optimize space.",
  ])}`;

  blocks.M = `[BLOCK M - SAME ROOM INTEGRITY]
${bullets(normalizedConfig.integrity_constraints)}
Image: ${photoMetaLine(normalizedConfig)}`;

  blocks.N = `[BLOCK N - NEGATIVE CONSTRAINTS]
${bullets(normalizedConfig.negative_constraints)}`;

  blocks.O = `[BLOCK O - QUALITY BAR]
${bullets([
    ...normalizedConfig.quality_directives,
    validation.isValid
      ? "Prompt validation passed: scene inventory, target zones, replacement manifest, floor/surface rules, integrity and negative constraints are present."
      : `Prompt validation warnings: missing sections = ${validation.missingSections.join(", ") || "none"}; missing rules = ${validation.missingBusinessRules.join(", ") || "none"}.`,
  ])}`;

  const userNotes = typeof legacy.note_libere === "string" && legacy.note_libere.trim()
    ? `[ADDITIONAL USER NOTES]\n${legacy.note_libere.trim()}`
    : "";

  return {
    systemPrompt: blocks.A,
    userPrompt: [blocks.B, blocks.C, blocks.D, blocks.E, blocks.F, blocks.G, blocks.H, blocks.I, blocks.J, blocks.K, blocks.L, blocks.M, blocks.N, blocks.O, userNotes]
      .filter(Boolean)
      .join("\n\n"),
    negativePrompt:
      "different room, changed architecture, moved windows, moved doors, changed camera angle, changed image dimensions, random furniture, generic showroom, CGI, cartoon, warped perspective, object deformation, hybrid old/new surfaces",
    promptVersion: "stanza-v2.1.0",
    blocks,
    normalizedConfig,
    validation,
  };
}

export const buildStanzaPrompt = buildRoomPrompt;
