import {
  DEFAULT_NEGATIVE_CONSTRAINTS,
  DEFAULT_QUALITY_DIRECTIVES,
  ZONE_LABELS,
} from "./promptFragments.ts";
import { ensureFacciataRenderConfig } from "./facciataRenderConfig.ts";
import { validateFacciataPromptConfig } from "./facciataPromptValidation.ts";
import type { FacciataPromptBuildResult, FacciataRenderConfig, FacciataSceneOpening } from "./types.ts";

function bullets(lines: Array<string | null | undefined>): string {
  return lines
    .filter((line): line is string => Boolean(line && line.trim().length > 0))
    .map((line) => `- ${line}`)
    .join("\n");
}

function describeOpening(opening: FacciataSceneOpening): string {
  return [
    `${opening.label}: ${opening.openingKind} at ${opening.position}, ${opening.floorHint}, apparent size ${opening.apparentSize}.`,
    opening.hasCornice ? "existing window cornice visible." : "no visible cornice.",
    opening.hasSill ? `existing sill visible (${opening.sillMaterial}).` : "no sill clearly visible.",
    opening.hasBalcony ? "opening is related to a balcony." : "",
    opening.hasRailing ? "railing visible in this opening context." : "",
    opening.hasShutter ? `existing shutter visible (${opening.shutterType}).` : "no shutter clearly visible.",
    `Reveal depth: ${opening.revealDepth}.`,
    `Lighting/shadow notes: ${opening.lightingNotes}; ${opening.shadowNotes}.`,
    `Preserve note: ${opening.preserveNotes}`,
  ]
    .filter(Boolean)
    .join(" ");
}

function activeOrKeep(active: boolean, whenActive: string, whenInactive: string): string {
  return active ? whenActive : whenInactive;
}

export function buildFacciataPrompt(
  rawConfig: Record<string, unknown>,
  rawAnalysis?: unknown,
  photoMeta?: FacciataRenderConfig["photo_meta"],
): FacciataPromptBuildResult {
  const normalizedConfig = ensureFacciataRenderConfig(rawConfig, rawAnalysis, photoMeta ?? null);
  const validation = validateFacciataPromptConfig(normalizedConfig);
  const blocks: Record<string, string> = {};

  const plaster = normalizedConfig.technical_specification.plaster;
  const cladding = normalizedConfig.technical_specification.cladding;
  const insulation = normalizedConfig.technical_specification.insulation;
  const elements = normalizedConfig.technical_specification.elements;

  blocks.A = `[BLOCK A - MISSION]
You are a SURGICAL PHOTOREALISTIC FACADE RENOVATION IMAGE EDITOR.
Apply exactly the requested renovation intervention to the photographed building facade while preserving everything else.

MANDATORY CORE CONSTRAINTS:
- same building
- same facade
- same camera angle
- same geometry
- same context
- same lighting
- no artistic reinterpretation
- no redesign beyond requested intervention`;

  blocks.B = `[BLOCK B - EXISTING BUILDING INVENTORY]
Building type: ${normalizedConfig.scene_analysis.buildingType}
Perceived style: ${normalizedConfig.scene_analysis.buildingStyle}
Floors: ${normalizedConfig.scene_analysis.floorsCount}
Visible openings: ${normalizedConfig.scene_analysis.openingsVisible}
Current plaster/finish: ${normalizedConfig.scene_analysis.currentPlasterFinish}
Current facade color: ${normalizedConfig.scene_analysis.currentFacadeColor}
Current condition: ${normalizedConfig.scene_analysis.currentCondition}
Wall texture: ${normalizedConfig.scene_analysis.wallTexture}
Camera angle: ${normalizedConfig.scene_analysis.cameraAngle}
Lighting: ${normalizedConfig.scene_analysis.lightingCondition}
Detected architectural details: ${[
  normalizedConfig.scene_analysis.features.corniciFinestre ? "window cornices" : "",
  normalizedConfig.scene_analysis.features.marcapiani ? "string courses" : "",
  normalizedConfig.scene_analysis.features.davanzali ? "sills" : "",
  normalizedConfig.scene_analysis.features.zoccolatura ? "base course" : "",
  normalizedConfig.scene_analysis.features.gronde ? "gutters/eaves" : "",
  normalizedConfig.scene_analysis.features.pluviali ? "downpipes" : "",
  normalizedConfig.scene_analysis.features.balconi ? "balconies" : "",
  normalizedConfig.scene_analysis.features.ringhiere ? "railings" : "",
  normalizedConfig.scene_analysis.features.persiane ? "shutters" : "",
  normalizedConfig.scene_analysis.features.portone ? "entrance door" : "",
  normalizedConfig.scene_analysis.features.garage ? "garage" : "",
  normalizedConfig.scene_analysis.features.corpiIlluminanti ? "lights" : "",
  normalizedConfig.scene_analysis.features.citofoniCassette ? "intercom/mailboxes" : "",
  normalizedConfig.scene_analysis.features.caviCanaline ? "cables/conduits" : "",
  normalizedConfig.scene_analysis.features.climatizzatori ? "air conditioners" : "",
].filter(Boolean).join(", ") || "none explicitly detected"}
Preserved context: ${normalizedConfig.scene_analysis.preservedContext.join(", ")}

${bullets(normalizedConfig.scene_analysis.openings.map(describeOpening))}`;

  blocks.C = `[BLOCK C - RENOVATION MANIFEST]
Intervention type: ${normalizedConfig.legacy_config.tipo_intervento.replace(/_/g, " ")}
Active systems: ${normalizedConfig.replacement_manifest.activeSystems.join(", ") || "none"}
Inactive systems: ${normalizedConfig.replacement_manifest.inactiveSystems.join(", ") || "none"}
Zones affected: ${normalizedConfig.replacement_manifest.targetedZones.join(", ") || "none"}
Zones untouched: ${normalizedConfig.replacement_manifest.untouchedZones.join(", ") || "none"}

${bullets([
  ...normalizedConfig.replacement_manifest.replacements,
  ...normalizedConfig.replacement_manifest.repaintActions,
])}`;

  blocks.D = `[BLOCK D - PLASTER / PAINT SPECIFICATION]
${activeOrKeep(
    plaster.active,
    [
      `Apply plaster/paint only to ${ZONE_LABELS[plaster.zone ?? "tutta"]}.`,
      `Color: ${plaster.colorLabel ?? plaster.colorHex ?? "selected color"}.`,
      `Finish type: ${plaster.finishDescription}.`,
      `Surface behavior: ${plaster.surfaceBehavior}.`,
      `Texture visibility: ${plaster.textureVisibility}.`,
      "The selected plaster finish must stay visually exact: do not drift from smooth to rusticated, from rasato to bugnato, or from fine scratched to a generic rough texture.",
      "Fresh professional application, no random degradation or fake beautification.",
    ].join("\n"),
    "Keep existing plaster exactly as photographed; no new paint or plaster transformation.",
  )}`;

  blocks.E = `[BLOCK E - CLADDING SPECIFICATION]
${activeOrKeep(
    cladding.active,
    [
      `Apply cladding only to ${ZONE_LABELS[cladding.zone ?? "tutta"]}.`,
      `Material: ${cladding.materialDescription}.`,
      `Coursing pattern: ${cladding.coursingPattern}.`,
      `Joint logic: ${cladding.jointLogic}.`,
      `Thickness visibility: ${cladding.thicknessVisibility}.`,
      `Transition edges: ${cladding.transitionEdges}.`,
      "The selected cladding material must be physically recognizable and confined to the requested zones only, with no bleed into untouched facade areas.",
    ].join("\n"),
    "No cladding must be introduced; facade surfaces stay without added cladding.",
  )}`;

  blocks.F = `[BLOCK F - THERMAL INSULATION SPECIFICATION]
${activeOrKeep(
    insulation.active,
    [
      `Apply thermal insulation only to ${ZONE_LABELS[insulation.zone ?? "tutta"]}.`,
      `System: ${insulation.systemDescription}.`,
      `Thickness: ${insulation.thicknessCm} cm.`,
      `Facade plane rule: ${insulation.newFacadePlaneRule}.`,
      `Reveal depth logic: ${insulation.revealDepthRule}.`,
      `Sill extension logic: ${insulation.sillAdaptationRule}.`,
      `Edge profile logic: ${insulation.edgeProfileRule}.`,
      `Flashing / drip logic: ${insulation.flashingRule}.`,
    ].join("\n"),
    "Thermal insulation inactive: facade depth must remain unchanged.",
  )}`;

  blocks.G = `[BLOCK G - ARCHITECTURAL ELEMENTS SPECIFICATION]
${bullets([
    `Window cornices: ${elements.windowCornices.description}. ${elements.windowCornices.profileRule ?? ""}`.trim(),
    `String courses: ${elements.stringCourses.description}. ${elements.stringCourses.profileRule ?? ""}`.trim(),
    `Window sills: ${elements.sills.description}. ${elements.sills.profileRule ?? ""}`.trim(),
    `Base course: ${elements.baseCourse.description}. ${elements.baseCourse.profileRule ?? ""}`.trim(),
    `Gutters/eaves: ${elements.gutters.description}. ${elements.gutters.profileRule ?? ""}`.trim(),
    `Balcony railings: ${elements.railings.description}. ${elements.railings.profileRule ?? ""}`.trim(),
  ])}`;

  blocks.H = `[BLOCK H - SURFACE PREPARATION / REMOVAL RULES]
${bullets(
    normalizedConfig.replacement_manifest.removals.flatMap((rule) => [
      rule.summary,
      rule.patchRule ? `Patch rule: ${rule.patchRule}` : "",
      rule.technicalNote ? `Technical note: ${rule.technicalNote}` : "",
      rule.preserveRule ? `Preserve rule: ${rule.preserveRule}` : "",
    ]),
  )}`;

  blocks.I = `[BLOCK I - ZONE TRANSITION RULES]
${bullets(normalizedConfig.replacement_manifest.transitionRules.length > 0
    ? normalizedConfig.replacement_manifest.transitionRules
    : ["No special multi-material transition required beyond preserving the same facade cleanly."])}`;

  blocks.J = `[BLOCK J - FACADE INTEGRITY]
${bullets(normalizedConfig.integrity_constraints)}`;

  blocks.K = `[BLOCK K - PHOTOREALISM RULES]
- realistic materials
- physically plausible shadows
- correct ambient occlusion
- believable contact lines
- no warped geometry
- no CGI look
- no over-smoothing
- no fake luxury reinterpretation
- premium architectural renovation photography-grade output
- selected plaster finish must read exactly as chosen, with the right texture scale and relief instead of a generic AI wall texture
- selected cladding must show believable physicality, joint rhythm and depth exactly where requested, with crisp clean transitions to untouched zones
- paint-only or railing-only actions must never introduce new facade geometry, reliefs or construction changes`;

  blocks.L = `[BLOCK L - NEGATIVE CONSTRAINTS]
${bullets(DEFAULT_NEGATIVE_CONSTRAINTS)}`;

  blocks.M = `[BLOCK M - QUALITY BAR]
${bullets([
    ...DEFAULT_QUALITY_DIRECTIVES,
    ...normalizedConfig.quality_directives,
    validation.isValid
      ? "validation passed: targeted zones, replacement manifest, removal rules and active/inactive systems are explicit"
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
    normalizedConfig.notes ? `[ADDITIONAL USER NOTES]\n${normalizedConfig.notes}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    systemPrompt: blocks.A,
    userPrompt,
    negativePrompt:
      "different building, altered facade geometry, changed sky, changed vegetation, fake CGI facade, wrong window positions, invented decorative elements, smudged material transitions, hybrid old/new facade state, wrong plaster texture, generic wall finish instead of selected finish, cladding bleeding into untouched floors, insulation without deeper reveals, altered railing design during repaint",
    promptVersion: "2.0.0",
    blocks,
    validation,
    normalizedConfig,
  };
}
