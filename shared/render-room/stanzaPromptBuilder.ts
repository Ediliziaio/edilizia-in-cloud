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

  blocks.D = `[BLOCK D - REPLACEMENT MANIFEST]
Active interventions:
${interventionBullets(normalizedConfig)}

Explicit removals / cleanup:
${bullets(normalizedConfig.replacement_manifest.removals.length ? normalizedConfig.replacement_manifest.removals : ["remove only elements made incompatible by selected interventions"])}

Strict preservation:
${bullets(normalizedConfig.replacement_manifest.strictPreservation)}`;

  blocks.E = `[BLOCK E - FLOOR / SURFACE GEOMETRY RULES]
${normalizedConfig.replacement_manifest.floorPromptExcerpt || "No floor replacement is active; preserve the photographed floor exactly."}

Global geometry rules:
${bullets(normalizedConfig.replacement_manifest.geometryRules)}`;

  blocks.F = `[BLOCK F - LIGHTING AND MATERIAL REALISM]
${bullets([
    "materials must respond to the original photo lighting with realistic roughness, reflection and shadow",
    "new lights must have plausible mounting positions and physically believable falloff",
    "wallpaper, cladding, paint and furniture finishes must follow the correct surface planes",
    "floor, furniture and object contact shadows must be recomputed locally without moving objects",
  ])}`;

  blocks.G = `[BLOCK G - SAME ROOM INTEGRITY]
${bullets(normalizedConfig.integrity_constraints)}
Image: ${photoMetaLine(normalizedConfig)}`;

  blocks.H = `[BLOCK H - NEGATIVE CONSTRAINTS]
${bullets(normalizedConfig.negative_constraints)}`;

  blocks.I = `[BLOCK I - QUALITY BAR]
${bullets([
    ...normalizedConfig.quality_directives,
    validation.isValid
      ? "Prompt validation passed: scene inventory, replacement manifest, floor/surface rules, integrity and negative constraints are present."
      : `Prompt validation warnings: missing sections = ${validation.missingSections.join(", ") || "none"}; missing rules = ${validation.missingBusinessRules.join(", ") || "none"}.`,
  ])}`;

  const userNotes = typeof legacy.note_libere === "string" && legacy.note_libere.trim()
    ? `[ADDITIONAL USER NOTES]\n${legacy.note_libere.trim()}`
    : "";

  return {
    systemPrompt: blocks.A,
    userPrompt: [blocks.B, blocks.C, blocks.D, blocks.E, blocks.F, blocks.G, blocks.H, blocks.I, userNotes]
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
