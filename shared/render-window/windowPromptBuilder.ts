import { APERTURA_DESCRIPTION, DEFAULT_NEGATIVE_CONSTRAINTS, DEFAULT_QUALITY_DIRECTIVES, FRAME_STYLE_DESCRIPTION, HANDLE_FINISH_DESCRIPTION, HANDLE_STYLE_DESCRIPTION, MATERIAL_PHYSICS } from "./promptFragments.ts";
import type { WindowPromptBuildResult, WindowRenderConfig, WindowSceneOpening, WindowTechnicalSpecification } from "./types.ts";
import { ensureWindowRenderConfig } from "./windowRenderConfig.ts";
import { validateWindowPromptConfig } from "./windowPromptValidation.ts";

function bullets(lines: string[]): string {
  return lines.filter((line) => line.trim().length > 0).map((line) => `- ${line}`).join("\n");
}

function describeOpening(opening: WindowSceneOpening): string {
  const parts = [
    `Opening ${opening.label} (${opening.approximatePlacement})`,
    `${APERTURA_DESCRIPTION[opening.typeCurrent] ?? opening.typeCurrent}`,
    `${opening.sashCount} sash${opening.sashCount > 1 ? "es" : ""}`,
    `${opening.materialPerceived} / ${opening.colorPerceived}`,
    opening.hasCassonetto ? `cassonetto visible (${opening.cassonettoType ?? "roller box"})` : "no visible cassonetto",
    opening.hasCassonetto ? `cassonetto geometry: ${opening.cassonettoGeometryNotes}` : "",
    opening.hasRollerShutter ? `shading system visible` : "no visible roller shutter",
    opening.hasBelt ? "manual belt visible" : "no visible manual belt",
    opening.hasBeltBox ? "manual wall winder plate/box visible" : "",
    opening.hasRollerShutter ? `roller curtain state: ${opening.rollerCurtainState}` : "",
    opening.hasRollerShutter ? `roller curtain placement: ${opening.rollerCurtainPositionNotes}` : "",
    opening.hasPersiane ? "persiane visible" : "",
    opening.hasScuri ? "scuri visible" : "",
    opening.hasGrates ? "grates visible" : "",
    opening.hasCurtains ? "curtains near opening" : "",
    opening.radiatorNearby ? "radiator close to opening" : "",
    opening.hasSill ? "sill visible" : "",
    opening.surroundingElements.length > 0 ? `surrounding elements: ${opening.surroundingElements.join(", ")}` : "",
    opening.lightNotes ? `light: ${opening.lightNotes}` : "",
    opening.reflectionNotes ? `reflections: ${opening.reflectionNotes}` : "",
    opening.shadowNotes ? `shadows: ${opening.shadowNotes}` : "",
  ];
  return parts.filter(Boolean).join("; ");
}

function describeSpecification(spec: WindowTechnicalSpecification): string {
  const finishDescription = spec.finish.mode === "legno"
    ? `${spec.finish.name} wood-effect finish with visible grain`
    : `${spec.finish.name}${spec.finish.ral ? ` (RAL ${spec.finish.ral})` : ""}, ${spec.finish.finish}`;

  const lines = [
    `Target opening ${spec.openingLabel}: ${APERTURA_DESCRIPTION[spec.desiredOpeningType] ?? spec.desiredOpeningType}`,
    `Opening family: ${spec.desiredTypeId}, desired sash count: ${spec.desiredSashCount}`,
    `Material: ${MATERIAL_PHYSICS[spec.material] ?? spec.material}`,
    `Profile family: ${spec.profileId}, frame style: ${FRAME_STYLE_DESCRIPTION[spec.frameStyle] ?? spec.frameStyle}`,
    `Frame visual depth: ${spec.frameDepthLabel}, shape: ${spec.frameShape}, slimness: ${spec.slimnessLabel}`,
    `Finish: ${finishDescription}`,
    `Handle: ${HANDLE_STYLE_DESCRIPTION[spec.handleStyle] ?? spec.handleStyle} in ${HANDLE_FINISH_DESCRIPTION[spec.handleColorId] ?? spec.handleFinish}`,
    `Visible hinge rule: exactly ${spec.hingeCountVisible} visible hinge group${spec.hingeCountVisible > 1 ? "s" : ""} on the full opening composition`,
    `Hinge style: ${spec.hingeStyle}`,
    `Hinge consistency: ${spec.hingeConsistencyRule}`,
    `Glass: ${spec.glassSpec}`,
    spec.cassonetto.replace
      ? `Cassonetto: replace with ${spec.cassonetto.materialLabel}${spec.cassonetto.colorLabel ? ` in ${spec.cassonetto.colorLabel}` : ""}. Dimension rule: ${spec.cassonetto.dimensionRule}`
      : "Cassonetto: keep existing if present",
    spec.shutter.replace
      ? `Shading system: replace with ${spec.shutter.mode === "motorizzate" ? "motorized roller shutter" : "new shutter system"}${spec.shutter.colorLabel ? ` in ${spec.shutter.colorLabel}` : ""}. Visibility state: ${spec.shutter.visibilityState}. Placement rule: ${spec.shutter.placementRule}`
      : "Shading system: keep existing if present",
    spec.compatibilityNotes.length > 0 ? `Compatibility rules: ${spec.compatibilityNotes.join(" | ")}` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export function buildWindowPrompt(
  rawConfig: Record<string, unknown>,
  rawAnalysis?: unknown,
): WindowPromptBuildResult {
  const normalizedConfig: WindowRenderConfig = ensureWindowRenderConfig(
    rawConfig,
    rawAnalysis,
    (rawConfig.photo_meta as WindowRenderConfig["photo_meta"] | undefined) ?? null,
  );

  const validation = validateWindowPromptConfig(normalizedConfig);

  const untouchedOpenings = normalizedConfig.scene_analysis.openings.filter((opening) =>
    normalizedConfig.target_selection.preservedOpeningIds.includes(opening.id),
  );

  const blocks: Record<string, string> = {};

  blocks.A = `[BLOCK A – MISSION]
You are a SURGICAL PHOTOREALISTIC IMAGE EDITOR specialized in premium window and door replacement renders.
Your task is NOT to redesign the room. Your task is to keep the exact same photographed environment and replace ONLY the requested target openings and explicitly requested accessories.

MANDATORY CORE CONSTRAINTS:
- same room / same house
- same photograph
- same camera angle
- same geometry
- same perspective
- same lighting direction
- same environment
- same furniture
- same outdoor view unless optical realism requires only minimal glass-consistent treatment
- same image orientation and same image dimensions
- no redesign of the room`;

  blocks.B = `[BLOCK B – EXISTING SCENE INVENTORY]
Environment: ${normalizedConfig.scene_analysis.environmentType}
View mode: ${normalizedConfig.scene_analysis.viewMode}
Environment summary: ${normalizedConfig.scene_analysis.environmentSummary}
Camera angle: ${normalizedConfig.scene_analysis.cameraAngle}
Lighting direction: ${normalizedConfig.scene_analysis.lightingDirection}
Lighting quality: ${normalizedConfig.scene_analysis.lightingQuality}
Wall: ${normalizedConfig.scene_analysis.wallMaterial} / ${normalizedConfig.scene_analysis.wallColor}
Outdoor view: ${normalizedConfig.scene_analysis.outdoorViewSummary}
Untouched context anchors: ${normalizedConfig.scene_analysis.untouchedElements.join(", ")}

Visible openings inventory:
${bullets(normalizedConfig.scene_analysis.openings.map(describeOpening).filter(Boolean))}`;

  const replacementLines = [
    `Target openings to modify: ${normalizedConfig.target_selection.targetLabels.join(", ") || "none"}`,
    ...normalizedConfig.replacement_manifest.targetOpenings.map((item) => item.summary),
    ...untouchedOpenings.map((opening) => `Opening ${opening.label} must remain untouched in every visible detail.`),
    ...normalizedConfig.replacement_manifest.additions,
  ];

  blocks.C = `[BLOCK C – REPLACEMENT MANIFEST]
${bullets(replacementLines)}

Critical keep/preserve directives:
${bullets(normalizedConfig.replacement_manifest.keepExactly)}`;

  blocks.D = `[BLOCK D – NEW WINDOW SPECIFICATION]
${normalizedConfig.technical_specification.map(describeSpecification).join("\n\n")}`;

  blocks.E = `[BLOCK E – REMOVAL RULES]
${bullets(
    normalizedConfig.replacement_manifest.removals.length > 0
      ? normalizedConfig.replacement_manifest.removals.flatMap((rule) => [
          `${rule.summary}`,
          rule.repairInstruction ? `Repair rule: ${rule.repairInstruction}` : "",
          rule.preserveInstruction ? `Preserve rule: ${rule.preserveInstruction}` : "",
        ])
      : ["No destructive removals beyond the direct replacement scope. Keep every existing compatible accessory unchanged."],
  )}`;

  blocks.F = `[BLOCK F – PHOTOREALISTIC INSTALLATION RULES]
- accurate join between frame and wall reveal
- believable installation depth, gasket lines and frame-to-sash contact
- realistic glazing reflections, consistent with the photographed room and outdoor light
- correct shadow casting and local ambient occlusion around frame edges, handles, hinges and cassonetto
- physically plausible materials and finishes
- no warped geometry, no floating elements, no fake showroom look
- if the source photo is a lived-in home, keep it lived-in; do not sanitize or restage the space
- for slim/minimal profiles, widen glass area only within physically plausible frame geometry
- for sliding systems, use coherent sliding overlaps and tracks with no battente hardware
- for two-sash compositions, keep the hinge logic coherent and do not invent extra hinges or mixed hinge colors
- all visible hinges must match the selected hardware finish exactly, with realistic compact top/bottom geometry
- if a new cassonetto is specified over an existing one, keep its visible width, height, depth and bottom edge very close to the source photo unless explicitly redesigned
- if the shutter is fully open, keep the curtain hidden inside the cassonetto and do not invent a colored strip above the glazing
- any visible shutter curtain must stay recessed within its guides behind the frame/glass plane, never floating on the wall or in front of the cassonetto`;

  blocks.G = `[BLOCK G – SURROUNDINGS INTEGRITY]
${bullets(normalizedConfig.integrity_constraints)}

Image preservation:
- keep the same orientation: ${normalizedConfig.photo_meta?.orientation ?? normalizedConfig.scene_analysis.imageOrientation}
- keep the same framing and crop
- keep the same image dimensions
- do not shrink, pad or recompose the shot`;

  blocks.H = `[BLOCK H – NEGATIVE CONSTRAINTS]
${bullets(DEFAULT_NEGATIVE_CONSTRAINTS)}`;

  blocks.I = `[BLOCK I – QUALITY BAR]
${bullets(
    [
      ...DEFAULT_QUALITY_DIRECTIVES,
      ...normalizedConfig.quality_directives,
      validation.isValid
        ? "Prompt validation passed: target openings, replacement manifest, removal rules and integrity constraints are all present."
        : `Prompt validation warnings: missing sections = ${validation.missingSections.join(", ") || "none"}; missing business rules = ${validation.missingBusinessRules.join(", ") || "none"}.`,
    ],
  )}`;

  blocks.J = `[BLOCK J – EXECUTION CHECKLIST]
Before final output, verify all of these:
${bullets([
    `Only target openings ${normalizedConfig.target_selection.targetLabels.join(", ")} are edited.`,
    untouchedOpenings.length > 0
      ? `Openings ${untouchedOpenings.map((opening) => opening.label).join(", ")} remain untouched.`
      : "There are no preserved openings outside the target scope.",
    "The room, furniture, walls, floor, curtains, radiators and outdoor view remain identical.",
    "No accessory incompatible with the new configuration is left behind.",
    "The output still looks like the same source photograph after a real installation.",
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
    normalizedConfig.notes ? `[ADDITIONAL USER NOTES]\n${normalizedConfig.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    systemPrompt: blocks.A,
    userPrompt,
    negativePrompt:
      "cartoon, illustration, painterly, staged showroom, room redesign, changed perspective, changed crop, changed wall color, changed furniture, extra windows, distorted geometry, fake CGI, glossy fake plastic, warped lines, floating frame, wrong shadows, mixed hinge colors, oversized cassonetto, visible manual belt on motorized shutter, floating shutter band above the glass, shutter rendered in front of the wall",
    promptVersion: "7.0.0",
    blocks,
    validation,
    normalizedConfig,
  };
}
